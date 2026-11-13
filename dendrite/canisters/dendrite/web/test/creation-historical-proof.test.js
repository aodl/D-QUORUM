// Real archived IC certificates, not a mocked decoder. This proves durable
// historical authenticity; current authority and fresh II require separate live gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Cbor,requestIdOf} from '@icp-sdk/core/agent';
import {Principal} from '@icp-sdk/core/principal';
import {importCreationReceipt} from '../src/creation-receipt.js';
import {verifyCreationWitness,witnessRequestContent} from '../src/creation-protocol.js';
import {bytesHex,hexBytes,sha256Hex,stakingSubaccount} from '../src/creation-accounts.js';
import {creationPlanDigest} from '../src/creation-plan.js';
const json=await readFile(new URL('./fixtures/creation-v1-code-removed.json',import.meta.url),'utf8'),provenance=JSON.parse(await readFile(new URL('./fixtures/creation-v1-code-removed.provenance.json',import.meta.url),'utf8'));
const rootKey=new Uint8Array(await readFile(new URL('../../../bootstrap/compat/pocketic-15-root-public.der',import.meta.url)));
const agent={rootKey,getTimeDiffMsecs:()=>0,hasSyncedTime:()=>true,syncTime:async()=>{throw Error('historical fixture must not sync current authority');},syncTimeWithSubnet:async()=>{throw Error('historical fixture must not sync current authority');}};
const {receipt:r,plan:p}=importCreationReceipt(json),config={agent,canisterId:r.canister_id,owner:p.owner,methodName:'status',includeSystemState:true};
const epoch=Number(BigInt(r.sealed_witness.request.ingress_expiry)/1000000n);
test('genuine reviewed V1 receipt is preserved byte-for-byte and imports without inventing new financial identities',()=>{
 assert.equal(sha256Hex(new TextEncoder().encode(json)),provenance.receipt_sha256);assert.equal(JSON.parse(json).version,1);assert.equal(r.version,2);assert.equal(bytesHex(p.bootstrap_sha256),provenance.bootstrap_sha256);
 const original=JSON.parse(json);for(let index=0;index<r.intents.length;index++){assert.equal(r.intents[index].argument,original.intents[index].argument);assert.equal(r.intents[index].created_at_time,original.intents[index].created_at_time);assert.equal(r.intents[index].attempt_version,1);assert.equal(r.intents[index].request_binding,null);}
});
test('real BLS-certified V1 creation and seal remain authentic after 31 and 90 days while fresh mode rejects stale evidence',async t=>{
 for(const days of [31,90])await t.test(`${days} days`,async t=>{t.mock.timers.enable({apis:['Date'],now:epoch+days*86400000});
  const created=await verifyCreationWitness(r.creation_witness,{agent,canisterId:'um5iw-rqaaa-aaaaq-qaaba-cai',owner:p.owner,methodName:'create_canister',includeSystemState:false});
  const c=created.value.Ok?.canister_id??created.value.Err?.Duplicate?.canister_id?.[0];assert.equal(c.toText(),r.canister_id);
  const sealed=await verifyCreationWitness(r.sealed_witness,config),s=sealed.value.Ok;
  assert.equal(s.version,1,'actual signed V1 state, not a newer record relabelled V1');assert.deepEqual(Object.keys(s.phase),['Sealed']);assert.equal(s.neuron_id[0].toString(),r.neuron_id);assert.equal(creationPlanDigest(s.plan),r.plan_digest);assert.equal(bytesHex(s.staking_subaccount),bytesHex(stakingSubaccount(c,p.nonce)));assert.equal(bytesHex(sealed.system.moduleHash),provenance.bootstrap_sha256);assert.deepEqual(sealed.system.controllers.map(x=>x.toText()),[p.owner.toText()]);
  await assert.rejects(()=>verifyCreationWitness(r.sealed_witness,{...config,historical:false}),/past|expired/i);
 });
});
test('real certificates reject forged signatures, changed subnet, request or canister binding and wrong P',async()=>{
 await verifyCreationWitness(r.sealed_witness,config);
 const forged=structuredClone(r.sealed_witness),cert=Cbor.decode(hexBytes(forged.certificate));cert.signature[0]^=1;forged.certificate=bytesHex(Cbor.encode(cert));await assert.rejects(()=>verifyCreationWitness(forged,config),/signature/i);
 const wrongSubnet=structuredClone(r.sealed_witness),delegated=Cbor.decode(hexBytes(wrongSubnet.certificate));assert.ok(delegated.delegation,'application-subnet delegation is genuinely exercised');delegated.delegation.subnet_id[0]^=1;wrongSubnet.certificate=bytesHex(Cbor.encode(delegated));await assert.rejects(()=>verifyCreationWitness(wrongSubnet,config));
 const request=structuredClone(r.sealed_witness);request.request.nonce='00'.repeat(32);request.request_id=bytesHex(requestIdOf(witnessRequestContent(request.request)));await assert.rejects(()=>verifyCreationWitness(request,config),/absent|history/);
 await assert.rejects(()=>verifyCreationWitness(r.sealed_witness,{...config,owner:Principal.anonymous()}),/binding/);
 await assert.rejects(()=>verifyCreationWitness(r.sealed_witness,{...config,canisterId:'rrkah-fqaaa-aaaaa-aaaaq-cai'}),/binding/);
});
