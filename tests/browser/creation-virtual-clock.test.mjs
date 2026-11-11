import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {advanceCreationBrowserClocks,installCreationClockBeforeResume,installCreationPageClock} from './creation-virtual-clock.mjs';

test('actual capability driver observes normal popup closure without repeating authentication and propagates unknown failures',async()=>{
 const source=await readFile(new URL('./team-management.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function reauthenticatePage('),end=source.indexOf('\ntry{',start);assert.ok(start>=0&&end>start);
 for(const message of ['Protocol error (Runtime.callFunctionOn): Target closed','unclassified browser failure']){
  let closed=false,published=false,closing=false,attempts=0,completed=0;
  const popup={isClosed:()=>closed,evaluate:async()=>{if(message.includes('Target closed'))closing=true;throw Error(message);}};
  const page={on(_,listener){this.opened=listener;},off(){},waitForFunction:async()=>{},bringToFront:async()=>{},evaluate:async()=>({ready:published,principal:'public-P'})};
  const keys={begin:async()=>({generation:1}),finish:async(_,value)=>{assert.equal(value.principal,'public-P');completed++;},isActive:()=>completed===0,abort:async()=>{}};
  const authenticate=vm.runInNewContext(`(${source.slice(start,end)})`,{passkeys:keys,click:async()=>{attempts++;page.opened(popup);return true;},pause:async()=>{if(closing){closed=true;published=true;}},console:{error(){}},directory:'public-evidence'});
  const call=()=>authenticate(page,{label:'participant0',index:0,principal:'public-P'},'Governance',{profile:'Governance',probe:true});
  if(message.includes('Target closed')){await call();assert.equal(completed,1);}else{await assert.rejects(call,error=>error.message===message);assert.equal(completed,0);}
  assert.equal(attempts,1,'no authentication restart or replacement identity');
 }
});

test('actual II authentication attempt re-observes a detached control and classifies the current failure without creating a new context',async()=>{
 const source=await readFile(new URL('./team-management.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function authenticateAttempt(index){'),end=source.indexOf('\n// Each authentication',start);
 assert.ok(start>=0&&end>start);
 for(const clickError of ['Node is detached from document','unclassified click failure']){
  let snapshots=0,contexts=0,popupClicks=0;
  const evidence=[],pauses=[],applicationPages=[];
  const popup={waitForFunction:async()=>{},createCDPSession:async()=>({send:async()=>({authenticatorId:'opaque-test-device'})}),bringToFront:async()=>{},on(){},isClosed:()=>false,screenshot:async()=>{},$$eval:async()=>[],evaluate:async()=>{snapshots++;return snapshots===1?{labels:['Continue'],headings:[]}:{labels:[],headings:['Connection closed']};}};
  const page={goto:async()=>{},waitForSelector:async()=>{},once:(_,receive)=>receive(popup),on(){},$eval:async()=>false,$$eval:async()=>true};
  const attempt=vm.runInNewContext(`(${source.slice(start,end)})`,{
   browser:{createBrowserContext:async()=>{contexts++;return {newPage:async()=>page};}},applicationPages,
   guard:async()=>{},scopeProbeMode:false,origin:'http://app.localhost:4944',scenario:'creation-production',directory:'public-evidence',
   passkeys:{registered:()=>false,begin:async()=>({}),isActive:()=>true,abort:async()=>{}},console:{error(){}},pause:async milliseconds=>pauses.push(milliseconds),writeEvidence:async(_,bytes)=>evidence.push(JSON.parse(bytes)),
   click:async target=>{if(target===popup){popupClicks++;throw Error(clickError);}return true;},
  });
  await assert.rejects(()=>attempt(2),error=>{
   assert.equal(contexts,1,'DOM re-observation never replaces an identity or context');assert.equal(popupClicks,1);
   if(clickError==='Node is detached from document'){
    assert.equal(snapshots,2);assert.deepEqual(pauses,[200]);assert.equal(error.iiChannelFailure,'Connection closed');
    assert.equal(evidence.length,1);assert.equal(evidence[0].heading,'Connection closed');
   }else{
    assert.equal(snapshots,1);assert.deepEqual(pauses,[]);assert.equal(error.message,clickError);assert.equal(error.iiChannelFailure,undefined);assert.equal(evidence.length,0);
   }
   return true;
  });
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

test('actual browser network guard continues ordinary local II scripts once and keeps nonlocal scripts denied',async()=>{
 const source=await readFile(new URL('./team-management.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function guard(page){'),end=source.indexOf('\nasync function routeToTarget(',start);assert.ok(start>=0&&end>start);
 const listeners=new Map(),page={on:(name,fn)=>listeners.set(name,fn),setRequestInterception:async enabled=>assert.equal(enabled,true)};
 const denied=[],events=[];
 const guard=vm.runInNewContext(`(${source.slice(start,end)})`,{URL,denied,events,preflightHolds:new Map(),origin:'http://app.localhost:4944'});await guard(page);
 const request=(url,type)=>({continued:0,aborted:0,url:()=>url,resourceType:()=>type,continue(){assert.equal(++this.continued,1);},abort(){this.aborted++;}});
 const script=request('http://id.ai.localhost:4944/entry.js','script');listeners.get('request')(script);assert.equal(script.continued,1);
 const fetch=request('http://id.ai.localhost:4944/api/status','fetch');listeners.get('request')(fetch);assert.equal(fetch.continued,1);
 const remote=request('https://outside.invalid/entry.js','script');listeners.get('request')(remote);assert.equal(remote.aborted,1);assert.equal(remote.continued,0);assert.deepEqual(denied,['https://outside.invalid']);
});
