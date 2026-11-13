import test from 'node:test';
import assert from 'node:assert/strict';
import {Principal} from '@icp-sdk/core/principal';
import {inspectCreationProtocols,supportsProtocolModule,supportedProtocolModules,REVIEWED_MAINNET_PROTOCOL as mainnet} from '../src/creation-protocol-compatibility.js';
import {CREATION_PROTOCOL_PINS as local,creationPreflight,createCreationPlan,creationVotingMinimum} from '../src/creation-plan.js';
import {hexBytes} from '../src/creation-accounts.js';

const ids=Object.keys(mainnet.modules),gov='rrkah-fqaaa-aaaaa-aaaaq-cai';
const readLive=async id=>({moduleHash:hexBytes(mainnet.modules[id].installed_gzip_sha256)});
test('original CMC mismatch reports every dependency; reviewed live encodings are separate from local pins',async()=>{
 const original=await inspectCreationProtocols(readLive,'Local');
 assert.equal(original.ok,false);assert.equal(original.rows.length,4);
 assert.equal(original.rows.filter(row=>row.status==='Blocked').length,4);
 assert.equal(original.rows[0].canister,'rkp4c-7iaaa-aaaaa-aaaca-cai');
 const reviewed=await inspectCreationProtocols(readLive,{Ic:null});assert.equal(reviewed.ok,true);
 for(const row of reviewed.rows){assert.notEqual(row.moduleHash,local.modules[row.canister]);assert.equal(row.status,'Supported');}
 assert.equal((await inspectCreationProtocols(async id=>({moduleHash:hexBytes(local.modules[id])}),'Local')).ok,true);
 assert.equal((await inspectCreationProtocols(async id=>({moduleHash:hexBytes(local.modules[id])}),'Ic')).ok,false);
});
test('unknown modules, malformed and missing certified evidence all fail closed without hiding other changes',async()=>{
 for(const bad of [undefined,[],new Uint8Array(31),new Uint8Array(33),new Uint8Array(32),'aa'.repeat(32)]){
  const report=await inspectCreationProtocols(async id=>id===ids[0]?{moduleHash:bad}:readLive(id),'Ic');
  assert.equal(report.ok,false);assert.equal(report.rows.length,4);assert.equal(report.rows[0].status,'Blocked');assert.equal(report.rows[1].status,'Supported');
 }
 const report=await inspectCreationProtocols(async id=>{if(id===ids[0])throw Error('BLS certificate rejected');return {moduleHash:hexBytes('00'.repeat(32))};},'Ic');
 assert.equal(report.rows.filter(row=>row.status==='Blocked').length,4);assert.match(report.rows[0].reason,/BLS/);
 assert.deepEqual(supportedProtocolModules('aaaaa-aa','Ic'),[]);assert.deepEqual(supportedProtocolModules(ids[0],'Unknown'),[]);
 assert.equal(supportsProtocolModule(ids[0],null,'Ic'),false);
});
test('one-manager RecoverableTest preflight accepts reviewed mainnet executables with observed manager authority',async()=>{
 const owner=Principal.selfAuthenticating(Uint8Array.of(1)),id='hp4av-oiaaa-aaaar-qcaha-cai',now=1794000000n;
 const plan=createCreationPlan({profile:'RecoverableTest',managers:['11'],stakeIcp:'2',provisionIcp:'1',provisionCycles:'2000000000000',ledgerFeeE8s:'10000'},owner,{local:false,canisterId:id,origin:`https://${id}.icp0.io`,host:'https://icp-api.io'},{sha256:'ab'.repeat(32)});
 const economics={neuron_minimum_stake_e8s:100000000n,reject_cost_e8s:100000000n,transaction_fee_e8s:10000n,neuron_management_fee_per_proposal_e8s:10000n,voting_power_economics:[]};
 const actor={get_network_economics_parameters:async()=>economics,list_neurons:async()=>({total_pages_available:[1n],full_neurons:[{id:[{id:11n}],controller:[owner],hot_keys:[],visibility:[2],followees:[]}]}),get_neuron_info:async()=>({Ok:{id:[{id:11n}],retrieved_at_timestamp_seconds:now,visibility:[2],known_neuron_data:[{name:'Known manager'}]}})};
 let report;const evidence=await creationPreflight(plan,{actor,readSystem:readLive,now,onProtocolReport:value=>report=value});
 assert.equal(evidence.protocol,report);assert.equal(report.ok,true);assert.equal(evidence.managers[0].role,'Controller');assert.equal(plan.profile.RecoverableTest,null);assert.equal(plan.managers.length,1);assert.equal(plan.lock_seconds,604800n);
 for(const hash of supportedProtocolModules(gov,'Ic'))assert.equal(creationVotingMinimum(economics,hash),15778800n);
 await assert.rejects(()=>creationPreflight(plan,{actor,now,readSystem:async()=>({moduleHash:new Uint8Array(32)}),onProtocolReport:value=>report=value}),error=>error.protocol===report&&report.rows.length===4&&!report.ok);
});
test('historical proof support is bound to its certified executable, independently of a reviewed current-version change',async()=>{
 for(const id of ids){
  const original=mainnet.modules[id].installed_gzip_sha256,next=mainnet.modules[id].wasm_sha256;
  assert.equal(supportsProtocolModule(id,original,'Ic',{historical:true}),true);
  assert.equal(supportsProtocolModule(id,next,'Ic'),true);
  assert.equal(supportsProtocolModule(id,local.modules[id],'Ic',{historical:true}),true);
  assert.equal(supportsProtocolModule(id,'00'.repeat(32),'Ic',{historical:true}),false);
 }
});
