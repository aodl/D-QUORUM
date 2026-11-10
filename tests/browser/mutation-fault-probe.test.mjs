// Transport-harness regression only: no replica, II or financial permission proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../dendrite/node_modules/esbuild/lib/main.js';
import {HttpAgent} from '../../dendrite/node_modules/@icp-sdk/core/lib/esm/agent/index.js';
import {Principal} from '../../dendrite/node_modules/@icp-sdk/core/lib/esm/principal/index.js';

test('management fault interception must precede actual HttpAgent transport capture',async()=>{
 const previousFetch=globalThis.fetch,previousLocation=globalThis.location;
 let sent=0;
 try{
  globalThis.location={href:'http://localhost:4944/'};
  globalThis.fetch=async()=>{sent++;return new Response(null,{status:202});};
  const options={host:'http://localhost:4944',shouldFetchRootKey:false,retryTimes:0};
  const oldAgent=await HttpAgent.create(options);
  const compiled=await build({entryPoints:['tests/browser/mutation-fault-probe.js'],bundle:true,write:false,format:'esm',platform:'browser',nodePaths:['dendrite/node_modules']});
  const probe=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
  const send=agent=>agent.call(Principal.managementCanister(),{methodName:'update_settings',arg:new Uint8Array(),effectiveCanisterId:Principal.fromText('pp254-cl777-77776-aaaaq-cai')});
  probe.arm('holdController');await send(oldAgent);
  assert.equal(probe.state().held,false,'late installation cannot intercept an existing agent');assert.equal(sent,1);
  const observedAgent=await HttpAgent.create(options);probe.arm('holdController');const pending=send(observedAgent);
  for(let i=0;i<300&&!probe.state().held;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(probe.state().held,true,'early installation must hold the actual management call');assert.equal(sent,1,'held request must not reach transport');
  probe.release();await pending;assert.equal(sent,2);assert.equal(probe.state().held,false);
 }finally{globalThis.fetch=previousFetch;if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;}
});
