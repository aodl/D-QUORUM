import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {advanceCreationBrowserClocks,installCreationClockBeforeResume,installCreationPageClock} from './creation-virtual-clock.mjs';
import {retainedWindowTransportSource} from './native-channel-lifetime.mjs';
import {reviewedHeartbeatSource} from '../../dendrite/canisters/dendrite/web/sdk-heartbeat-policy.mjs';

test('actual SDK heartbeat ends with its channel when the native passkey window is retained',async()=>{
 const sdk=new URL('../../dendrite/node_modules/@icp-sdk/signer/lib/esm/',import.meta.url);
 const [heartbeat,transport,channel,rpc]=await Promise.all(['web/heartbeat/client.js','web/postMessageTransport.js','web/postMessageChannel.js','transport.js'].map(path=>readFile(new URL(path,sdk),'utf8')));
 const withoutImports=source=>source.replace(/^import .*?;\n/gm,'').replace(/\bexport /g,'');
 async function exercise(cleanup,heartbeatSource){
  let now=0,next=0,polls=0,windowCloses=0,respond=true;
  const timers=new Map(),listeners=new Set(),unrelated=()=>{};
  listeners.add(unrelated);
  const schedule=(fn,delay,interval=false)=>{const id=++next;timers.set(id,{fn,at:now+delay,delay,interval});return id;};
  const dispatch=event=>{for(const listener of [...listeners])listener(event);};
  const signerWindow={focus(){},close(){windowCloses++;},postMessage(request){
   if(request.method!=='icrc29_status')return;
   polls++;if(respond)schedule(()=>dispatch({source:signerWindow,origin:'http://ii.localhost',data:{jsonrpc:'2.0',id:request.id,result:'ready'}}),1);
  }};
  const window={open:()=>signerWindow,focus(){},addEventListener:(type,listener)=>{assert.equal(type,'message');listeners.add(listener);},removeEventListener:(type,listener)=>{assert.equal(type,'message');listeners.delete(listener);}};
  const context=vm.createContext({URL,Date:{now:()=>now},crypto:{randomUUID:()=>String(++next)},setTimeout:(fn,delay)=>schedule(fn,delay),setInterval:(fn,delay)=>schedule(fn,delay,true),clearTimeout:id=>timers.delete(id),clearInterval:id=>timers.delete(id)});
  vm.runInContext([rpc,heartbeatSource,cleanup?retainedWindowTransportSource(transport):transport,channel.replace('this.#options.signerWindow.close();','/* Retain actual native-device target, as in the browser fixture. */')].map(withoutImports).join('\n')+'\nglobalThis.Transport=PostMessageTransport;',context);
  const transportInstance=new context.Transport({url:'http://ii.localhost',window,detectNonClickEstablishment:false});
  const advance=milliseconds=>{
   const end=now+milliseconds;
   for(;;){
    const due=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
    if(!due)break;
    const [id,timer]=due;now=timer.at;
    if(timer.interval)timer.at+=timer.delay;else timers.delete(id);
    timer.fn();
   }
   now=end;
  };
  const pending=transportInstance.establishChannel();advance(350);const first=await pending;
  assert.equal(first.closed,false);assert.equal(listeners.size,2);
  await first.close();assert.equal(first.closed,true);
  const closedPolls=polls;advance(10000);
  assert.equal(windowCloses,0,'virtual passkey target remains alive');
  assert.ok(listeners.has(unrelated),'unrelated application listener remains registered');
  if(!cleanup){assert.ok(polls>closedPolls+20,'negative control proves the retained closed channel keeps polling');return;}
  assert.ok(polls<=closedPolls+1,'only the already scheduled final poll may drain');
  assert.equal(listeners.size,1,'only this heartbeat subscription is removed');
  const secondPending=transportInstance.establishChannel();advance(350);const second=await secondPending;
  let response;const detach=second.addEventListener('response',value=>response=value);
  dispatch({source:signerWindow,origin:'http://ii.localhost',data:{jsonrpc:'2.0',id:'rpc',result:'unaltered response'}});
  assert.equal(response.result,'unaltered response','actual SDK response filtering remains active');
  detach();advance(10000);assert.equal(second.closed,false,'old timers cannot close or detach the replacement channel');
  assert.equal(listeners.size,2);await second.close();advance(10000);assert.equal(listeners.size,1);
  const thirdPending=transportInstance.establishChannel();advance(350);const third=await thirdPending;
  respond=false;advance(2500);
  assert.equal(third.closed,true,'a real active-channel heartbeat disconnect still closes the channel at the SDK deadline');
  assert.equal(listeners.size,1);
 }
 for(const heartbeatSource of [heartbeat,reviewedHeartbeatSource(heartbeat)]){
  await exercise(false,heartbeatSource);
  await exercise(true,heartbeatSource);
 }
});

test('terminal II authentication failure reaches bounded setup recovery without waiting for an application retry button',async()=>{
 const source=await readFile(new URL('./team-management.mjs',import.meta.url),'utf8');
 const expression=source.match(/const awaitingClientCompletion=(.+);/)[1];
 const evaluate=async(scenario,failureHeading,retryVisible)=>vm.runInNewContext(`(async()=>(${expression}))()`,{
  scenario,failureHeading,page:{$$eval:async()=>retryVisible},
 });
 for(const retryVisible of [false,true]){
  assert.equal(await evaluate('creation-production','Authentication failed',retryVisible),false);
  for(const heading of ['Invalid request','Unverified origin','Unsupported browser','Attribute sharing failed']){
   assert.equal(await evaluate('creation-production',heading,retryVisible),false);
  }
 }
 for(const heading of ['Unable to connect','Connection closed']){
  assert.equal(await evaluate('creation-production',heading,false),true);
  assert.equal(await evaluate('creation-production',heading,true),false);
  assert.equal(await evaluate('team-management',heading,false),false);
 }
});

test('native II window handoff links the new document before releasing its scripts and closes each document channel once',async()=>{
 const source=await readFile(new URL('./creation-journey.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function reloadIdentityDocument(participant){'),end=source.indexOf('\n async function reauthenticate(',start);
 assert.ok(start>=0&&end>start);
 for(const secondary of [false,true]){
  const events=[];
  const document=name=>({evaluate:async fn=>{
   if(String(fn).includes('closeChannel'))await vm.runInNewContext(`(${fn})()`,{
    creationNativeSigner:{closeChannel:async()=>{await Promise.resolve();events.push(`closed ${name}`);}},
   });
  },waitForFunction:async()=>{}});
  const owner=document('owner'),page=secondary?document('secondary'):owner;
  let handler,continued=false,finishNavigation;
  const script={resourceType:()=> 'script',isInterceptResolutionHandled:()=>continued,continue:async()=>{continued=true;events.push('release II script');finishNavigation();}};
  const identity={evaluate:async fn=>{if(String(fn).includes('creationNativeOpenerLinked=false'))events.push('link current II document');},waitForFunction:async()=>{},bringToFront:async()=>{},url:()=> 'http://id.ai.localhost:4944/authorize',setCacheEnabled:async()=>{},setRequestInterception:async()=>assert.fail('the existing network guard must remain enabled'),goto:()=>{events.push('navigate II');assert.equal(typeof handler,'function','owner and secondary II scripts must be held before initialization');const result=new Promise(resolve=>finishNavigation=resolve);handler(script);return result;}};
  const holdIdentityScripts=(target,receive)=>{assert.equal(target,identity);handler=receive;return()=>{handler=undefined;};};
  const reload=vm.runInNewContext(`(${source.slice(start,end)})`,{page,origin:'http://example.localhost:4944',URL,setTimeout,clearTimeout,holdIdentityScripts,directory:'public-evidence',readFile:async()=> '{}',writeEvidence:async()=>{}});
  await reload({page:owner,nativeDevice:{popup:identity}});
  assert.deepEqual(events,secondary?['closed owner','closed secondary','navigate II','link current II document','release II script']:['closed owner','navigate II','link current II document','release II script']);
 }
});

test('coordinated local time changes Date construction and now while preserving explicit timestamps and future popup clocks',async()=>{
 const realm=vm.createContext({}),scripts=[];
 const page={evaluateOnNewDocument:async(fn,offset)=>scripts.push(`(${fn})(${offset})`),evaluate:async(fn,offset)=>vm.runInContext(`(${fn})(${offset})`,realm)};
 const participants=[{context:{pages:async()=>[page]}}];
 for(const days of [31,90]){
  const target=Date.now()+days*86400000;
  await advanceCreationBrowserClocks(participants,target);
  const values=vm.runInContext('[Date.now(),new Date().getTime(),new Date(123).getTime(),Date.parse("2000-01-01T00:00:00Z"),Date.UTC(2000,0,1)]',realm);
  assert.ok(Math.abs(values[0]-target)<1000);assert.ok(Math.abs(values[1]-target)<1000);
  assert.equal(values[2],123);assert.equal(values[3],946684800000);assert.equal(values[4],946684800000);
 }
 const commands=[];await installCreationClockBeforeResume({send:async(name,args)=>commands.push({name,args})},{type:'page'});
 assert.equal(commands[0].name,'Page.addScriptToEvaluateOnNewDocument');
 const popup=vm.createContext({});vm.runInContext(commands[0].args.source,popup);
 assert.ok(Math.abs(vm.runInContext('Date.now()',popup)-(Date.now()+90*86400000))<1000);
 const lateRealm=vm.createContext({}),lateScripts=[];
 await installCreationPageClock({evaluateOnNewDocument:async(fn,offset)=>lateScripts.push(`(${fn})(${offset})`),evaluate:async(fn,offset)=>vm.runInContext(`(${fn})(${offset})`,lateRealm)});
 assert.ok(Math.abs(vm.runInContext('Date.now()',lateRealm)-(Date.now()+90*86400000))<1000);
 const navigated=vm.createContext({});for(const script of lateScripts)vm.runInContext(script,navigated);
 assert.ok(Math.abs(vm.runInContext('new Date().getTime()',navigated)-(Date.now()+90*86400000))<1000);
 assert.equal(vm.runInContext('new Date(123).getTime()',navigated),123,'old explicit operation timestamps are never renewed');
 assert.equal(scripts.length,2);
 await assert.rejects(()=>advanceCreationBrowserClocks(participants,Date.now()-1000));
 await assert.rejects(()=>advanceCreationBrowserClocks(participants,Date.now()+121*86400000));
});

test('actual browser network guard holds only local II scripts with one request owner and keeps nonlocal scripts denied',async()=>{
 const source=await readFile(new URL('./team-management.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function guard(page){'),end=source.indexOf('\nasync function routeToTarget(',start);assert.ok(start>=0&&end>start);
 const listeners=new Map(),page={on:(name,fn)=>listeners.set(name,fn),setRequestInterception:async enabled=>assert.equal(enabled,true)};
 const denied=[],events=[],identityScriptHolds=new WeakMap(),held=[];
 identityScriptHolds.set(page,request=>held.push(request));
 const guard=vm.runInNewContext(`(${source.slice(start,end)})`,{URL,denied,events,identityScriptHolds,preflightHolds:new Map(),origin:'http://app.localhost:4944'});await guard(page);
 const request=(url,type)=>({continued:0,aborted:0,url:()=>url,resourceType:()=>type,continue(){assert.equal(++this.continued,1);},abort(){this.aborted++;}});
 const script=request('http://id.ai.localhost:4944/entry.js','script');listeners.get('request')(script);assert.equal(held.length,1);assert.equal(script.continued,0);held[0].continue();assert.equal(script.continued,1);
 const fetch=request('http://id.ai.localhost:4944/api/status','fetch');listeners.get('request')(fetch);assert.equal(fetch.continued,1);assert.equal(held.length,1);
 const remote=request('https://outside.invalid/entry.js','script');listeners.get('request')(remote);assert.equal(remote.aborted,1);assert.equal(remote.continued,0);assert.equal(held.length,1);assert.deepEqual(denied,['https://outside.invalid']);
});
