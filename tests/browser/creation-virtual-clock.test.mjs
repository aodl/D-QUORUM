import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {advanceCreationBrowserClocks,installCreationClockBeforeResume} from './creation-virtual-clock.mjs';

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
 assert.equal(scripts.length,2);
 await assert.rejects(()=>advanceCreationBrowserClocks(participants,Date.now()-1000));
 await assert.rejects(()=>advanceCreationBrowserClocks(participants,Date.now()+121*86400000));
});
