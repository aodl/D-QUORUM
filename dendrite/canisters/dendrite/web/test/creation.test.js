import test from "node:test";
import digestVectors from "./fixtures/creation-plan-digest.json" with {type:"json"};
import assert from "node:assert/strict";
import {Principal} from "@icp-sdk/core/principal";
import {IDL} from "@icp-sdk/core/candid";
import {Ed25519KeyIdentity} from "@icp-sdk/core/identity";
import {createCreationPlan,verifySealedControllerChanges,bootstrapReadinessMarker,creationVotingMinimum,createCreationRevision,validateCreationRevision,parseCreationPlan,planJson,creationPlanDigest,creationPreflight,CREATION_PROTOCOL_PINS} from "../src/creation-plan.js";
import {newCreationReceipt,exportCreationReceipt,importCreationReceipt,addCreationIntent,settleCreationIntent,checkpointCreation,receiptContentDigest,MAX_CREATION_RECEIPT_BYTES,applyCreationRevision} from "../src/creation-receipt.js";
import {legacyAccount,validateLegacyAccount,bytesHex,hexBytes,stakingSubaccount,principalSubaccount,fundingSubaccount} from "../src/creation-accounts.js";
import {creationArgumentTypes,decodeBootstrapPlan,encodeBootstrapPlan,witnessRequestContent,verifyCreationWitness,verifyOriginalCreationBurn} from "../src/creation-protocol.js";
import {OMEGA_REJECT_NEURON_ID} from "../src/preliminary-evidence.js";
import {buildDirectManagerOperation,buildManageNeuronProposal} from "../src/transaction.js";
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
  const i=addCreationIntent(r,{attemptVersion:1,kind:"CreateCanister",destination:"um5iw-rqaaa-aaaaq-qaaba-cai",argument:args,createdAtTime:1n});
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
  const intent=addCreationIntent(r,{attemptVersion:1,kind:"CreateCanister",destination:"um5iw-rqaaa-aaaaq-qaaba-cai",argument:IDL.encode([creationArgumentTypes.create],[creationArgs(p)]),createdAtTime:1n});
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
  const before=exportCreationReceipt(r);assert.throws(()=>addCreationIntent(r,{attemptVersion:1,kind:'CreateCanister',destination:'um5iw-rqaaa-aaaaq-qaaba-cai',argument:IDL.encode([creationArgumentTypes.create],[args]),createdAtTime:1n}),/provisioning/);
  assert.equal(exportCreationReceipt(r),before);
  assert.throws(()=>addCreationIntent(r,{attemptVersion:1,kind:'PayStake',destination:'ryjl3-tyaaa-aaaaa-aaaba-cai',argument:Uint8Array.of(1),createdAtTime:1n}),/decode/);assert.equal(r.intents.length,0);
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
 const i=addCreationIntent(r,{attemptVersion:1,kind:'CreateCanister',destination:'um5iw-rqaaa-aaaaq-qaaba-cai',argument:IDL.encode([creationArgumentTypes.create],[args]),createdAtTime:p.nonce});
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

test("every recovery receipt operation rejects substituted money authority or teardown arguments",()=>{
 const p=plan(),r=newCreationReceipt(p);r.canister_id=C;r.neuron_id='600';const bucket=fundingSubaccount(P,p.creation_id),gov=Principal.fromText('rrkah-fqaaa-aaaaa-aaaaq-cai');
 const operations=[
  ['ConvertCycles','rkp4c-7iaaa-aaaaa-aaaca-cai','mint',{block_index:7n,to_subaccount:[bucket],deposit_memo:[p.creation_id]},a=>a.to_subaccount=[]],
  ['PayStake','ryjl3-tyaaa-aaaaa-aaaba-cai','transfer',{from_subaccount:[bucket],to:{owner:gov,subaccount:[stakingSubaccount(C,p.nonce)]},amount:p.stake_e8s,fee:[p.icp_fee_e8s],memo:[p.creation_id],created_at_time:[p.nonce]},a=>a.to.subaccount=[new Uint8Array(32)]],
  ['ReturnIcp','ryjl3-tyaaa-aaaaa-aaaba-cai','legacyTransfer',{from_subaccount:[bucket],to:p.return_account,amount:{e8s:1n},fee:{e8s:10000n},memo:p.nonce,created_at_time:[{timestamp_nanos:1n}]},a=>a.to=new Uint8Array(32)],
  ['DisburseStake',C,'bootstrapAdvance',{revision:1n,step:{Disburse:{expected_amount_e8s:199990000n,expected_fee_e8s:10000n}}},a=>a.step={Refresh:null}],
  ['Uninstall','aaaaa-aa','uninstall',{canister_id:Principal.fromText(C),sender_canister_version:[]},a=>a.canister_id=Principal.fromText('um5iw-rqaaa-aaaaq-qaaba-cai')],
  ['ClearControllers','aaaaa-aa','updateSettings',{canister_id:Principal.fromText(C),settings:{controllers:[[]],compute_allocation:[],memory_allocation:[],freezing_threshold:[]},sender_canister_version:[]},a=>a.settings.controllers=[[P]]],
  ['CreationVote','rrkah-fqaaa-aaaaa-aaaaq-cai','nns',buildDirectManagerOperation(11n,{RegisterVote:{vote:1,proposal:[{id:9n}]}}),a=>a.command[0].RegisterVote.vote=2],
  ['Rehearsal','rrkah-fqaaa-aaaaa-aaaaq-cai','nns',buildManageNeuronProposal(11n,600n,{RefreshVotingPower:{}},'Reviewed benign rehearsal'),a=>a.neuron_id_or_subaccount[0].NeuronId.id=12n],
 ];
 for(const [kind,destination,type,args,mutate]of operations){const argument=IDL.encode([creationArgumentTypes[type]],[args]);const i=addCreationIntent(r,{attemptVersion:1,kind,destination,argument,createdAtTime:1n});settleCreationIntent(r,i.id,'Confirmed',{block_id:'7'});assert.equal(importCreationReceipt(exportCreationReceipt(r),bindings).receipt.intents.at(-1).kind,kind);
  const bad=IDL.decode([creationArgumentTypes[type]],argument)[0];mutate(bad);const before=exportCreationReceipt(r);assert.throws(()=>addCreationIntent(r,{attemptVersion:1,kind,destination,argument:IDL.encode([creationArgumentTypes[type]],[bad]),createdAtTime:1n}),/Receipt/);assert.equal(exportCreationReceipt(r),before);
  assert.throws(()=>addCreationIntent(r,{attemptVersion:1,kind,destination:P.toText(),argument,createdAtTime:1n}),/destination/);
 }
 const wrongSettings=operations.find(o=>o[0]==='ClearControllers')[3];wrongSettings.settings.memory_allocation=[1n];assert.throws(()=>addCreationIntent(r,{attemptVersion:1,kind:'ClearControllers',destination:'aaaaa-aa',argument:IDL.encode([creationArgumentTypes.updateSettings],[wrongSettings]),createdAtTime:1n}),/unrelated/);
});
test("receipt history limits and malformed provenance cannot damage an existing exportable checkpoint",()=>{
 const p=plan(),r=newCreationReceipt(p);checkpointCreation(r,'Plan',{review:true});const valid=exportCreationReceipt(r);
 for(const change of [v=>v.version=3,v=>v.plan_history={},v=>v.plan_history=Array(17).fill(v.plan),v=>v.proposed_plan={...v.plan,revision:'3'},v=>v.intents=Array(129).fill({}),v=>v.checkpoints=Array(129).fill(v.checkpoints[0]),v=>v.canister_id=P.toText(),v=>v.neuron_id='0',v=>v.neuron_id='600',v=>v.creation_witness={request:{},request_id:'00'.repeat(32),certificate:'00'}]){
  const bad=JSON.parse(valid);change(bad);assert.throws(()=>exportCreationReceipt(bad));
 }
 const old=r.checkpoints[0];r.checkpoints=Array(128).fill(old);const full=exportCreationReceipt(r);assert.throws(()=>checkpointCreation(r,'Plan',{overflow:true}),/history/);assert.equal(exportCreationReceipt(r),full);
 assert.equal(JSON.parse(valid).checkpoints.length,1);
});
test("production preflight distinguishes missing malformed private unready and externally owned managers",async()=>{
 const p=createCreationPlan({...basic,profile:'ProductionCandidate',managers:['11','12','13','14','15'],committedTopics:[4],delegates:{4:['11','12','13']},defaultNeuronId:'18422777432977120264',metadata:{name:'Provisional',description:'P still controls C',links:[]}},P,bindings,{sha256:'ab'.repeat(32)}),now=1800000000n;
 const economics={voting_power_economics:[],neuron_minimum_stake_e8s:1n,reject_cost_e8s:1n,transaction_fee_e8s:1n,neuron_management_fee_per_proposal_e8s:1n};
 const make=()=>({full_neurons:p.managers.map(id=>({id:[{id}],visibility:[2],controller:[P],hot_keys:[],followees:[[4,{followees:[{id:OMEGA_REJECT_NEURON_ID}]}]]})),total_pages_available:[1n]});
 let response=make(),catalog={known_neurons:[]},scalarError=false,scalarPrivate=false;const actor={get_network_economics_parameters:async()=>economics,list_known_neurons:async()=>catalog,list_neurons:async()=>response,get_neuron_info:async id=>scalarError?{Err:{}}:{Ok:{id:[{id}],visibility:[scalarPrivate?1:2],retrieved_at_timestamp_seconds:now,known_neuron_data:[{name:`Manager ${id}`}]}}};
 // Obtain the approved omega-reject ID from the same reviewed policy already
 // used by the production plan rather than treating the fixture literal as policy.
 const omega=OMEGA_REJECT_NEURON_ID;for(const n of response.full_neurons)n.followees[0][1].followees=[{id:omega}];
 const readSystem=async id=>({moduleHash:hexBytes(CREATION_PROTOCOL_PINS.modules[id])});
 assert.equal((await creationPreflight(p,{actor,readSystem,now})).managers.length,5);
 for(const mutate of [v=>v.full_neurons.pop(),v=>v.total_pages_available=[2n],v=>v.full_neurons[1]=v.full_neurons[0],v=>v.full_neurons[0].visibility=[1],v=>v.full_neurons[0].followees.push(v.full_neurons[0].followees[0]),v=>v.full_neurons[0].followees[0][1].followees=[],v=>v.full_neurons[0].id=[{id:99n}]]){response=make();for(const n of response.full_neurons)n.followees[0][1].followees=[{id:omega}];mutate(response);await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}));}
 response=make();for(const n of response.full_neurons)n.followees[0][1].followees=[{id:omega}];scalarError=true;await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}),/metadata/);scalarError=false;scalarPrivate=true;await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}),/public known/);scalarPrivate=false;
 response.full_neurons[1].controller=[];assert.equal((await creationPreflight(p,{actor,readSystem,now})).managers[1].role,'No authority');
 catalog={known_neurons:[{id:[{id:99n}],known_neuron_data:[{name:'Provisional'}]}]};await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}),/name already/);catalog.known_neurons.push(catalog.known_neurons[0]);await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}),/catalogue/);
});


test("stopped and removed-code readiness require the sealed management history and reject an old seal after upgrade",()=>{
 const s={phase:{Sealed:null},pending:[],sealed_controller_changes:[1n]};assert.equal(verifySealedControllerChanges(s,{total_num_changes:1n}),1n);assert.equal(verifySealedControllerChanges(s,{total_num_changes:2n},{codeRemoved:true}),1n);
 for(const [state,status,opts]of [[{...s,phase:{Rehearsing:null}},{total_num_changes:1n}], [{...s,pending:[{}]},{total_num_changes:1n}], [{...s,sealed_controller_changes:[]},{total_num_changes:1n}], [{...s,sealed_controller_changes:[0n]},{total_num_changes:0n}], [{...s,sealed_controller_changes:[1n<<64n]},{total_num_changes:1n<<64n}], [s,{total_num_changes:2n}], [s,{total_num_changes:1n},{codeRemoved:true}], [s,{total_num_changes:3n},{codeRemoved:true}]])assert.throws(()=>verifySealedControllerChanges(state,status,opts),/history changed/);
});
test("public witness JSON is strictly bounded and cannot carry credentials executable URLs or arbitrary methods",()=>{
 const r=newCreationReceipt(plan());r.canister_id=C;
 // Schema fixture only: its certificate is deliberately not cryptographic
 // evidence. Controller import separately verifies the actual IC certificate.
 const witness={request:{request_type:'call',canister_id:C,method_name:'create_canister',arg:'4449444c0000',sender:P.toText(),ingress_expiry:'1',nonce:null},request_id:'01'.repeat(32),certificate:'00'};
 r.creation_witness=witness;assert.equal(importCreationReceipt(exportCreationReceipt(r),bindings).receipt.creation_witness.request.method_name,'create_canister');
 r.creation_witness.request.nonce='01';assert.equal(JSON.parse(exportCreationReceipt(r)).creation_witness.request.nonce,'01');
 const valid=exportCreationReceipt(r);
 for(const change of [v=>v.creation_witness.request.request_type='query',v=>v.creation_witness.request.method_name='arbitrary_proxy',v=>v.creation_witness.request.canister_id='https://attacker.example',v=>v.creation_witness.request.sender='not-a-principal',v=>v.creation_witness.request.ingress_expiry='0',v=>v.creation_witness.request.arg='00'.repeat(16385),v=>v.creation_witness.request.nonce='00'.repeat(65),v=>v.creation_witness.certificate='00'.repeat(65537),v=>v.creation_witness.url='https://attacker.example',v=>v.creation_witness.request.delegation='forbidden']){const bad=JSON.parse(valid);change(bad);assert.throws(()=>exportCreationReceipt(bad));}
});
test("unavailable or malformed current voting economics never fall through to a guessed minimum",()=>{
 const module=CREATION_PROTOCOL_PINS.modules['rrkah-fqaaa-aaaaa-aaaaq-cai'];
 for(const voting_power_economics of [null,[{},{}],[{}],[{neuron_minimum_dissolve_delay_to_vote_seconds:[1n,2n]}],[{neuron_minimum_dissolve_delay_to_vote_seconds:['1']}],[{neuron_minimum_dissolve_delay_to_vote_seconds:[-1n]}]])assert.throws(()=>creationVotingMinimum({voting_power_economics},module));
 assert.equal(creationVotingMinimum({voting_power_economics:[{neuron_minimum_dissolve_delay_to_vote_seconds:[604800n]}]},module),604800n);
});
test("preflight rejects malformed bounded responses and future or substituted scalar manager observations",async()=>{
 const p=plan(),now=1800000000n,economics={voting_power_economics:[],neuron_minimum_stake_e8s:1n,reject_cost_e8s:1n,transaction_fee_e8s:1n,neuron_management_fee_per_proposal_e8s:1n};
 let response,scalar;const actor={get_network_economics_parameters:async()=>economics,list_neurons:async()=>response,get_neuron_info:async()=>({Ok:scalar})},readSystem=async id=>({moduleHash:hexBytes(CREATION_PROTOCOL_PINS.modules[id])});
 for(const bad of [null,{full_neurons:{}},{full_neurons:[],total_pages_available:[]},{full_neurons:[{}],total_pages_available:[1n]}]){response=bad;await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}));}
 response={full_neurons:[{id:[{id:11n}],controller:[P],hot_keys:[],visibility:[2],followees:[]}],total_pages_available:[1n]};
 for(const fields of [{id:[{id:12n}]},{retrieved_at_timestamp_seconds:now+301n},{retrieved_at_timestamp_seconds:0},{visibility:[]},{known_neuron_data:[]}]){scalar={id:[{id:11n}],visibility:[2],retrieved_at_timestamp_seconds:now,known_neuron_data:[{name:'Manager'}],...fields};await assert.rejects(()=>creationPreflight(p,{actor,readSystem,now}));}
 await assert.rejects(()=>creationPreflight(p,{actor,readSystem:async()=>{throw Error('recorded certificate refusal');},now}),/Required certified protocol state/);
});
