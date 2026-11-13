import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewedHeartbeatSource,heartbeatPolicy,annotateHeartbeatSbom} from '../sdk-heartbeat-policy.mjs';
const sourceUrl=new URL('./web/heartbeat/client.js',import.meta.resolve('@icp-sdk/signer'));
const original=await readFile(sourceUrl,'utf8'),reviewed=reviewedHeartbeatSource(original);
async function load(source){const resolved=source.replace("'../../transport.js'",JSON.stringify(new URL('../../transport.js',sourceUrl).href));return (await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`)).HeartbeatClient;}
const Original=await load(original),Reviewed=await load(reviewed);
function observe(t,Client,foreign){
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:0});
 const listeners=new Set(),sent=[];let id=0,disconnects=0;
 const signer={postMessage:request=>sent.push(request.id)},window={addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
 new Client({signerWindow:signer,window,crypto:{randomUUID:()=>String(++id)},onEstablish(){},onStatusChange(){},onDisconnect(){disconnects++;},onEstablishTimeout(){throw Error('establishment unexpectedly timed out');}});
 const reply=(requestId,source=signer)=>{for(const fn of [...listeners])fn({source,origin:'https://ii.example',data:{jsonrpc:'2.0',id:requestId,result:'ready'}});};
 t.mock.timers.tick(300);reply(sent[0]);const first=sent.at(-1);
 reply('unmatched',foreign?{}:signer);t.mock.timers.tick(300);const afterNoise=sent.length;
 reply(first);t.mock.timers.tick(4750);const beforeFreshExpiry=disconnects;
 t.mock.timers.tick(251);const afterFreshExpiry=disconnects;
 t.mock.timers.reset();return {afterNoise,beforeFreshExpiry,afterFreshExpiry};
}
test('reviewed pinned SDK source rejects drift and retains all original heartbeat timeout constants',()=>{
 assert.equal(heartbeatPolicy.package_version,'5.4.0');assert.throws(()=>reviewedHeartbeatSource(original+'\n'),/source changed/);
 for(const value of ['establishTimeout: 10000','pendingTimeout: 300000','disconnectTimeout: 5000','statusPollingRate: 300'])assert.ok(reviewed.includes(value));
});
test('foreign ready messages cannot schedule heartbeat amplification; actual SDK negative control fails',t=>{
 const healthy=observe(t,Reviewed,true),faulty=observe(t,Original,true);
 assert.equal(healthy.afterNoise,2);assert.equal(faulty.afterNoise,3);assert.equal(healthy.beforeFreshExpiry,0);assert.equal(faulty.beforeFreshExpiry,1);
 assert.equal(healthy.afterFreshExpiry,1,'normal disconnection still occurs at the unchanged deadline');
});
test('delayed matching responses survive stale same-window replies without disabling freshness',t=>{
 const healthy=observe(t,Reviewed,false),faulty=observe(t,Original,false);
 assert.equal(healthy.afterNoise,2);assert.equal(faulty.afterNoise,3);assert.equal(healthy.beforeFreshExpiry,0);assert.equal(faulty.beforeFreshExpiry,1);assert.equal(healthy.afterFreshExpiry,1);
});

test('runtime SBOM records the exact build transform without relabelling the upstream package',()=>{
 const input={components:[{group:'@icp-sdk',name:'signer',version:'5.4.0',properties:[{name:'upstream',value:'retained'}]}]},result=annotateHeartbeatSbom(input);
 assert.equal(input.components[0].properties.length,1);assert.equal(result.components[0].version,'5.4.0');assert.equal(result.components[0].properties[1].value,JSON.stringify(heartbeatPolicy));assert.deepEqual(annotateHeartbeatSbom(result),result);
 for(const bad of [{components:[]},{components:[...input.components,...input.components]},{components:[{...input.components[0],version:'5.4.1'}]}])assert.throws(()=>annotateHeartbeatSbom(bad),/reviewed signer/);
});
