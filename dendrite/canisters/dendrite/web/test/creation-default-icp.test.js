import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgedDefaultIcp,defaultIcpAcknowledgement,defaultIcpDisclosure} from '../src/creation-default-icp.js';
import {sha256Hex} from '../src/creation-accounts.js';
const receipt=()=>({canister_id:'C',neuron_id:'T',plan_digest:'plan',checkpoints:[]});
test('explicit scoped consent covers dust and meaningful later deposits without a sweep',()=>{
 const r=receipt();assert.equal(acknowledgedDefaultIcp(r),false);
 r.checkpoints.push({kind:'DefaultIcpAcknowledged',evidence_digest:sha256Hex(new TextEncoder().encode(JSON.stringify(defaultIcpAcknowledgement(r))))});
 for(const balance of [0n,1n,9999n,1000000000n]){assert.equal(acknowledgedDefaultIcp(r),true);assert.match(defaultIcpDisclosure(balance),new RegExp(`${balance} e8s`));assert.match(defaultIcpDisclosure(balance),/No sweep or refund/);}
 for(const field of ['canister_id','neuron_id','plan_digest'])assert.equal(acknowledgedDefaultIcp({...r,[field]:'changed'}),false);
});
