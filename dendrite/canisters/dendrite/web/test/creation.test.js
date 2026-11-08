import test from "node:test";
import digestVectors from "./fixtures/creation-plan-digest.json" with {type:"json"};
import assert from "node:assert/strict";
import {Principal} from "@icp-sdk/core/principal";
import {IDL} from "@icp-sdk/core/candid";
import {Ed25519KeyIdentity} from "@icp-sdk/core/identity";
import {createCreationPlan,bootstrapReadinessMarker,creationVotingMinimum,createCreationRevision,validateCreationRevision,parseCreationPlan,planJson,creationPlanDigest,creationPreflight,CREATION_PROTOCOL_PINS} from "../src/creation-plan.js";
import {newCreationReceipt,exportCreationReceipt,importCreationReceipt,addCreationIntent,settleCreationIntent,checkpointCreation,receiptContentDigest,MAX_CREATION_RECEIPT_BYTES,applyCreationRevision} from "../src/creation-receipt.js";
import {legacyAccount,validateLegacyAccount,bytesHex,hexBytes,stakingSubaccount,principalSubaccount,fundingSubaccount} from "../src/creation-accounts.js";
import {creationArgumentTypes,decodeBootstrapPlan,encodeBootstrapPlan,witnessRequestContent,verifyCreationWitness,verifyOriginalCreationBurn} from "../src/creation-protocol.js";
const P=Ed25519KeyIdentity.generate().getPrincipal(),C="pi33i-pt777-77776-aaaaa-cai";
const bindings={origin:`http://${C}.localhost:4943`,host:"http://127.0.0.1:4943",canisterId:C,local:true};
const basic={profile:"RecoverableTest",managers:["11"],stakeIcp:"2",provisionIcp:"1",provisionCycles:"2000000000000",ledgerFeeE8s:"10000"};
const plan=()=>createCreationPlan(basic,P,bindings,{sha256:"ab".repeat(32)});
const clone=v=>JSON.parse(JSON.stringify(v));
const creationArgs=p=>({from_subaccount:[fundingSubaccount(P,p.creation_id)],created_at_time:[p.nonce],amount:p.provision_cycles,creation_args:[{settings:[{controllers:[[P]],compute_allocation:[0n],memory_allocation:[0n],freezing_threshold:[2_592_000n]}],subnet_selection:[{Filter:{subnet_type:[]}}]}]});

test("creation derivations are deterministic distinct and validate account checksums",()=>{
  const p=plan();assert.equal(p.lock_seconds,604800n);assert.equal(p.owner.toText(),P.toText());
  assert.deepEqual(validateLegacyAccount(bytesHex(legacyAccount(P))),legacyAccount(P));
  assert.throws(()=>validateLegacyAccount("00".repeat(32)),/checksum/);
  assert.equal(principalSubaccount(P)[0],P.toUint8Array().length);
  assert.equal(bytesHex(stakingSubaccount(C,1n)).length,64);
  assert.notDeepEqual(stakingSubaccount(C,1n),stakingSubaccount(C,2n));
  assert.notDeepEqual(fundingSubaccount(P,p.creation_id),stakingSubaccount(C,p.nonce));
  assert.equal(creationPlanDigest(p),creationPlanDigest(parseCreationPlan(planJson(p),bindings)));
  assert.throws(()=>hexBytes("AB"));assert.throws(()=>stakingSubaccount(C,-1));
});
test("plans bind network policy profile accounts and distinct complete configurations",()=>{
  const raw=planJson(plan());
  for(const mutate of [v=>v.managers.push("11"),v=>v.following[0].followees=["12"],v=>v.lock_seconds="0",v=>v.extra="untrusted",
    v=>v.origin="https://attacker.example",v=>v.api_host="https://attacker.example",v=>v.policy_revision="00".repeat(20),v=>v.policy_version="new",
    v=>v.profile="ProductionCandidate",v=>v.return_account="00".repeat(32),v=>v.stake_e8s="01",v=>v.cycle_reserve="1",v=>v.provision_cycles="1",
    v=>v.owner=Principal.anonymous().toText(),v=>v.committed_topics=[4],v=>v.following.push({topic:999,followees:[]})]){
    const bad=clone(raw);mutate(bad);assert.throws(()=>parseCreationPlan(bad,bindings));
  }
  const production=createCreationPlan({...basic,profile:"ProductionCandidate",managers:["11","12","13","14","15"],committedTopics:[4],delegates:{4:["11","12","13"]},defaultNeuronId:"18422777432977120264"},P,bindings,{sha256:"ab".repeat(32)});
  assert.equal(production.lock_seconds,63115200n);assert.equal(production.following.length,18);
  const bad=planJson(production);bad.following.find(f=>f.topic===4).followees=["11","11","12"];assert.throws(()=>parseCreationPlan(bad));
});
test("receipt restart preserves original identities and imports prepared calls as unknown",()=>{
  const p=plan(),r=newCreationReceipt(p),args=IDL.encode([creationArgumentTypes.create],[creationArgs(p)]);
  const i=addCreationIntent(r,{kind:"CreateCanister",destination:"um5iw-rqaaa-aaaaq-qaaba-cai",argument:args,createdAtTime:1n});
  const json=exportCreationReceipt(r);assert.ok(!/private|delegation|signature|seed/.test(json));
  const imported=importCreationReceipt(json,bindings);assert.equal(imported.receipt.intents[0].state,"Unknown");assert.equal(imported.receipt.intents[0].id,i.id);
  assert.equal(imported.receipt.intents[0].argument,i.argument);
  assert.throws(()=>addCreationIntent(imported.receipt,{kind:"CreateCanister"}),/Resolve/);
  settleCreationIntent(imported.receipt,i.id,"Confirmed",{block_id:"1",canister_id:C});
  imported.receipt.canister_id=C;checkpointCreation(imported.receipt,"ControllerCreated",{canister:C});
  assert.equal(importCreationReceipt(exportCreationReceipt(imported.receipt),bindings).receipt.canister_id,C);
  assert.throws(()=>settleCreationIntent(imported.receipt,i.id,"Confirmed"),/Stale/);
});
test("receipt checksum never grants authority and rejects tampering oversized data or secrets",()=>{
  const p=plan(),r=newCreationReceipt(p),json=exportCreationReceipt(r);
  for(const mutate of [v=>v.canister_id=C,v=>v.plan.managers=["12"],v=>v.private_key="secret",v=>v.plan.profile="ProductionCandidate",v=>v.funding_subaccount="00".repeat(32),v=>v.creation_witness={delegation:"secret"}]){
    const bad=JSON.parse(json);mutate(bad);assert.throws(()=>importCreationReceipt(JSON.stringify(bad),bindings));
  }
  assert.throws(()=>importCreationReceipt(" ".repeat(MAX_CREATION_RECEIPT_BYTES+1)),/bound/);
  assert.throws(()=>importCreationReceipt("{"),/JSON/);
  assert.throws(()=>importCreationReceipt(json,{...bindings,canisterId:"aaaaa-aa"}),/another/);
  const intent=addCreationIntent(r,{kind:"CreateCanister",destination:"um5iw-rqaaa-aaaaq-qaaba-cai",argument:IDL.encode([creationArgumentTypes.create],[creationArgs(p)]),createdAtTime:1n});
  assert.throws(()=>settleCreationIntent(r,intent.id,"Confirmed",{arbitrary:"1"}),/reference/);
  assert.equal(intent.state,"Prepared");settleCreationIntent(r,intent.id,"Rejected");
  assert.equal(receiptContentDigest(r),JSON.parse(exportCreationReceipt(r)).checksum);
});
test("witness verification rejects substituted caller target method and reply before trusting a receipt",async()=>{
  const request={request_type:"call",canister_id:C,method_name:"status",arg:"4449444c0001780100000000000000",sender:P.toText(),ingress_expiry:"1",nonce:null};
  assert.equal(witnessRequestContent(request).sender.toText(),P.toText());
  await assert.rejects(()=>verifyCreationWitness({request,request_id:"00".repeat(32),certificate:"00"},{agent:{},canisterId:C,owner:P,methodName:"status",includeSystemState:true}),/binding/);
});
test("preflight pauses on unavailable economics unknown executable or missing known metadata",async()=>{
  const p=plan(),economics={voting_power_economics:[],neuron_minimum_stake_e8s:100000000n,reject_cost_e8s:10000n,transaction_fee_e8s:10000n,neuron_management_fee_per_proposal_e8s:10000n};
  await assert.rejects(()=>creationPreflight(p,{actor:{get_network_economics_parameters:async()=>({})}}),/unavailable/);
  await assert.rejects(()=>creationPreflight(p,{actor:{get_network_economics_parameters:async()=>economics},readSystem:async()=>({moduleHash:new Uint8Array(32)})}),/Unreviewed/);
  await assert.rejects(()=>creationPreflight({...p,stake_e8s:1n},{actor:{get_network_economics_parameters:async()=>economics}}),/minimum/);
});
test("replicated scalar known metadata and actual creator role are required before spending",async()=>{
  const p=plan(),now=1794000000n,economics={voting_power_economics:[],neuron_minimum_stake_e8s:100000000n,reject_cost_e8s:10000n,transaction_fee_e8s:10000n,neuron_management_fee_per_proposal_e8s:10000n};
  const full={id:[{id:11n}],visibility:[2],controller:[P],hot_keys:[],followees:[],known_neuron_data:[]};
  const scalar={id:[{id:11n}],visibility:[2],retrieved_at_timestamp_seconds:now,known_neuron_data:[{name:'Public manager',description:[],links:[],committed_topics:[]}]};
  const actor={get_network_economics_parameters:async()=>economics,list_neurons:async()=>({full_neurons:[full],total_pages_available:[1n]}),get_neuron_info:async()=>({Ok:scalar})};
  const readSystem=async id=>({moduleHash:hexBytes(CREATION_PROTOCOL_PINS.modules[id])});
  const evidence=await creationPreflight(p,{actor,readSystem,now});assert.equal(evidence.managers[0].role,'Controller');
  full.controller=[];full.hot_keys=[P];assert.equal((await creationPreflight(p,{actor,readSystem,now})).managers[0].role,'Hotkey');
  full.hot_keys=[];await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}),/no observed authority/);
  full.controller=[P];scalar.known_neuron_data=[];await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}),/not a public known/);
  scalar.known_neuron_data=[{name:'Public manager'}];scalar.retrieved_at_timestamp_seconds=now-301n;await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}),/Stale/);
});
test("unknown imported financial argument types and substituted controllers fail without damaging the current receipt",()=>{
  const p=plan(),r=newCreationReceipt(p),args=creationArgs(p);args.creation_args[0].settings[0].controllers=[[Principal.anonymous()]];
  const before=exportCreationReceipt(r);assert.throws(()=>addCreationIntent(r,{kind:'CreateCanister',destination:'um5iw-rqaaa-aaaaq-qaaba-cai',argument:IDL.encode([creationArgumentTypes.create],[args]),createdAtTime:1n}),/provisioning/);
  assert.equal(exportCreationReceipt(r),before);
  assert.throws(()=>addCreationIntent(r,{kind:'PayStake',destination:'ryjl3-tyaaa-aaaaa-aaaba-cai',argument:Uint8Array.of(1),createdAtTime:1n}),/decode/);assert.equal(r.intents.length,0);
});
test("creation recovery proves the original permanent burn before issuing its exact deduplication request",async()=>{
  const p=plan(),args=creationArgs(p),tx={Map:[['op',{Text:'burn'}],['amt',{Nat:args.amount}],['ts',{Nat:p.nonce}],['from',{Array:[{Blob:P.toUint8Array()},{Blob:args.from_subaccount[0]}]}],['memo',{Blob:hexBytes('fe'.repeat(32))}]]};
  const block={Map:[['tx',tx]]},cycles={icrc3_get_blocks:async()=>({archived_blocks:[],blocks:[{id:7n,block}]})};
  await verifyOriginalCreationBurn(cycles,7n,args,P);
  tx.Map[1][1].Nat++;await assert.rejects(()=>verifyOriginalCreationBurn(cycles,7n,args,P),/exact original/);tx.Map[1][1].Nat--;
  tx.Map.push(['spender',{Array:[]}]);await assert.rejects(()=>verifyOriginalCreationBurn(cycles,7n,args,P),/exact original/);tx.Map.pop();
  tx.Map.push(tx.Map[0]);await assert.rejects(()=>verifyOriginalCreationBurn(cycles,7n,args,P),/Malformed/);
});

test("reviewed revisions preserve financial provenance and cannot upgrade a test profile",()=>{
 const p=plan(),r=newCreationReceipt(p),args=creationArgs(p);
 const i=addCreationIntent(r,{kind:'CreateCanister',destination:'um5iw-rqaaa-aaaaq-qaaba-cai',argument:IDL.encode([creationArgumentTypes.create],[args]),createdAtTime:p.nonce});
 settleCreationIntent(r,i.id,'Confirmed',{canister_id:C,block_id:'7'});
 const next=createCreationRevision(p,{...basic,managers:['12'],stakeIcp:'3'},bindings,{sha256:'ab'.repeat(32)});
 applyCreationRevision(r,next);const restored=importCreationReceipt(exportCreationReceipt(r),bindings);
 assert.equal(restored.plan.revision,2n);assert.equal(restored.receipt.plan_history.length,1);assert.equal(restored.receipt.intents[0].plan_digest,creationPlanDigest(p));assert.equal(next.nonce,p.nonce);assert.deepEqual(next.creation_id,p.creation_id);
 for(const key of ['profile','owner','nonce','return_account','bootstrap_sha256']){const bad={...next,[key]:p[key]};bad[key]=key==='profile'?{ProductionCandidate:null}:key==='owner'?Ed25519KeyIdentity.generate().getPrincipal():key==='nonce'?p.nonce+1n:new Uint8Array(32);assert.throws(()=>validateCreationRevision(p,bad),/cannot/);}
 assert.throws(()=>createCreationRevision(p,{...basic,profile:'ProductionCandidate',managers:['11','12','13','14','15'],committedTopics:[4],delegates:{4:['11','12','13']},defaultNeuronId:'18422777432977120264'},bindings,{sha256:'ab'.repeat(32)}),/profile change/);
});

test("Rust and browser hash semantic plans identically despite different Candid type tables",()=>{
 for(const vector of digestVectors){const snapshot={controller:Principal.fromText(vector.controller),plan_digest:hexBytes(vector.sha256),sequence:0n,phase:{AwaitingStake:null},pending:[],neuron_id:[],external_proposal:[]};assert.equal(bootstrapReadinessMarker(snapshot),vector.readiness_marker);snapshot.sequence++;assert.notEqual(bootstrapReadinessMarker(snapshot),vector.readiness_marker);const decoded=decodeBootstrapPlan(hexBytes(vector.candid_hex));assert.equal(creationPlanDigest(decoded),vector.sha256);assert.equal(creationPlanDigest(parseCreationPlan(planJson(decoded))),vector.sha256);
  // These equivalent wire encodings are deliberately not a plan-hash contract.
  assert.notEqual(bytesHex(encodeBootstrapPlan(decoded)),vector.candid_hex);
  const changed={...decoded,stake_e8s:decoded.stake_e8s+1n};assert.notEqual(creationPlanDigest(changed),vector.sha256);
 }
});

test("current voting minimum is resolved only against the qualified executable and cannot change the Standard lock",async()=>{
 const module=CREATION_PROTOCOL_PINS.modules['rrkah-fqaaa-aaaaa-aaaaq-cai'];
 assert.equal(creationVotingMinimum({voting_power_economics:[]},module),15778800n);
 assert.equal(creationVotingMinimum({voting_power_economics:[{neuron_minimum_dissolve_delay_to_vote_seconds:[]}]},module),1209600n);
 assert.throws(()=>creationVotingMinimum({voting_power_economics:[]},'unqualified'),/qualified/);
 assert.throws(()=>creationVotingMinimum({},module),/unavailable/);
 const production=createCreationPlan({...basic,profile:'ProductionCandidate',managers:['11','12','13','14','15'],committedTopics:[4],delegates:{4:['11','12','13']},defaultNeuronId:'18422777432977120264'},P,bindings,{sha256:'ab'.repeat(32)});
 const economics={voting_power_economics:[{neuron_minimum_dissolve_delay_to_vote_seconds:[63115201n]}],neuron_minimum_stake_e8s:1n,reject_cost_e8s:1n,transaction_fee_e8s:1n,neuron_management_fee_per_proposal_e8s:1n};
 await assert.rejects(()=>creationPreflight(production,{actor:{get_network_economics_parameters:async()=>economics},readSystem:async id=>({moduleHash:hexBytes(CREATION_PROTOCOL_PINS.modules[id])})}),/Standard lock/);assert.equal(production.lock_seconds,63115200n);
});
