import test from "node:test";
import assert from "node:assert/strict";
import {Principal} from "@icp-sdk/core/principal";
import {IDL} from "@icp-sdk/core/candid";
import {Ed25519KeyIdentity} from "@icp-sdk/core/identity";
import {createCreationPlan,parseCreationPlan,planJson,creationPlanDigest,creationPreflight} from "../src/creation-plan.js";
import {newCreationReceipt,exportCreationReceipt,importCreationReceipt,addCreationIntent,settleCreationIntent,checkpointCreation,receiptContentDigest,MAX_CREATION_RECEIPT_BYTES} from "../src/creation-receipt.js";
import {legacyAccount,validateLegacyAccount,bytesHex,hexBytes,stakingSubaccount,principalSubaccount,fundingSubaccount} from "../src/creation-accounts.js";
import {creationArgumentTypes,witnessRequestContent,verifyCreationWitness} from "../src/creation-protocol.js";
const P=Ed25519KeyIdentity.generate().getPrincipal(),C="pi33i-pt777-77776-aaaaa-cai";
const bindings={origin:`http://${C}.localhost:4943`,host:"http://127.0.0.1:4943",canisterId:C,local:true};
const basic={profile:"RecoverableTest",managers:["11"],stakeIcp:"2",provisionIcp:"1",provisionCycles:"2000000000000"};
const plan=()=>createCreationPlan(basic,P,bindings,{sha256:"ab".repeat(32)});
const clone=v=>JSON.parse(JSON.stringify(v));
const creationArgs=p=>({from_subaccount:[fundingSubaccount(P,p.creation_id)],created_at_time:[1n],amount:p.provision_cycles,creation_args:[{settings:[{controllers:[[P]],compute_allocation:[0n],memory_allocation:[0n],freezing_threshold:[2_592_000n]}],subnet_selection:[{Filter:{subnet_type:[]}}]}]});

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
  const p=plan(),economics={neuron_minimum_stake_e8s:100000000n,reject_cost_e8s:10000n,transaction_fee_e8s:10000n,neuron_management_fee_per_proposal_e8s:10000n};
  await assert.rejects(()=>creationPreflight(p,{actor:{get_network_economics_parameters:async()=>({})}}),/unavailable/);
  await assert.rejects(()=>creationPreflight(p,{actor:{get_network_economics_parameters:async()=>economics},readSystem:async()=>({moduleHash:new Uint8Array(32)})}),/Unreviewed/);
  await assert.rejects(()=>creationPreflight({...p,stake_e8s:1n},{actor:{get_network_economics_parameters:async()=>economics}}),/minimum/);
});
