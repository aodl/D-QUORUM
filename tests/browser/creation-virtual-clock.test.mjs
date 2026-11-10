import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {advanceCreationBrowserClocks,installCreationClockBeforeResume,installCreationPageClock} from './creation-virtual-clock.mjs';

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

test('native II window handoff closes document channels before navigation and links the new II document after navigation',async()=>{
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
  const identity={evaluate:async fn=>{if(String(fn).includes('creationNativeOpenerLinked=false'))events.push('link current II document');},waitForFunction:async()=>{},bringToFront:async()=>{},url:()=> 'http://id.ai.localhost:4944/authorize',goto:async()=>events.push('navigate II')};
  const reload=vm.runInNewContext(`(${source.slice(start,end)})`,{page,origin:'http://example.localhost:4944',URL});
  await reload({page:owner,nativeDevice:{popup:identity}});
  assert.deepEqual(events,secondary?['closed owner','closed secondary','navigate II','link current II document']:['closed owner','navigate II','link current II document']);
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
