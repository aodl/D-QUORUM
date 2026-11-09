import test from "node:test";
import assert from "node:assert/strict";
import {Ed25519KeyIdentity} from "@icp-sdk/core/identity";
import {Principal} from "@icp-sdk/core/principal";
import {IDL} from "@icp-sdk/core/candid";
import {Actor,HttpAgent,Certificate,LookupPathStatus,requestIdOf} from "@icp-sdk/core/agent";
import {createCreationController} from "../src/creation-controller.js";
import {CREATION_PROTOCOL_PINS,parseCreationPlan,planJson} from "../src/creation-plan.js";
import {hexBytes,legacyAccount,sha256Hex,bytesHex,stakingSubaccount} from "../src/creation-accounts.js";
import {fundingSubaccount} from "../src/creation-accounts.js";
import {creationArgumentTypes,witnessRequestContent} from "../src/creation-protocol.js";
import {idlFactory as bootstrapFactory} from "../../../../src/declarations/bootstrap/bootstrap.did.js";
import {buildManageNeuronProposal} from "../src/transaction.js";
import {addCreationIntent,settleCreationIntent,newCreationReceipt,exportCreationReceipt} from "../src/creation-receipt.js";

// Recording faults verify browser coordination only. Replica permission and
// money/provisioning evidence comes from the separate real-artifact lanes.
const owner=Ed25519KeyIdentity.generate().getPrincipal(),other=Ed25519KeyIdentity.generate().getPrincipal();
const cId="pi33i-pt777-77776-aaaaa-cai",bindings={origin:`http://${cId}.localhost:4943`,host:"http://127.0.0.1:4943",canisterId:cId,local:true};
const input={profile:"RecoverableTest",managers:["11"],stakeIcp:"2",provisionIcp:"1",provisionCycles:"2000000000000"};
const recordingWasm=Uint8Array.of(0,97,115,109,1,0,0,0);
function fixture(){
 globalThis.__DENDRITE_BOOTSTRAP_MANIFEST__={version:1,sha256:sha256Hex(recordingWasm),bytes:8,wasm_path:"/generated/bootstrap.test.wasm"};
 const state={principal:owner,expired:false,fee:10000n,balance:500000000n,transfers:[],mintCalls:[],mintEffects:0,rate:50000n,rateTimestamp:null,economicsReads:0,barrierAt:null,lostPayment:false,lostMint:false,blocks:new Map(),barrier:null};
 const gov={get_network_economics_parameters:async()=>{state.economicsReads++;if(state.barrier&&(state.barrierAt===null||state.economicsReads===state.barrierAt))await state.barrier;return {voting_power_economics:[],neuron_minimum_stake_e8s:100000000n,transaction_fee_e8s:state.fee,reject_cost_e8s:100000000n,neuron_management_fee_per_proposal_e8s:1000000n};},
  list_neurons:async()=>({full_neurons:[{id:[{id:11n}],controller:[owner],hot_keys:[],visibility:[2],followees:[]}],total_pages_available:[1n]}),
  get_neuron_info:async id=>({Ok:{id:[{id}],visibility:[2],retrieved_at_timestamp_seconds:BigInt(Math.floor(Date.now()/1000)),known_neuron_data:[{name:"Existing genuine manager"}]}})};
 const ledger={icrc1_fee:async()=>state.fee,icrc1_balance_of:async()=>state.balance,query_blocks:async()=>({chain_length:7n+BigInt(state.blocks.size)}),
  transfer:async args=>{state.transfers.push(args);state.balance-=args.amount.e8s+args.fee.e8s;state.blocks.set(7n,{transaction:{created_at_time:args.created_at_time[0],memo:args.memo,icrc1_memo:[],operation:[{Transfer:{from:legacyAccount(owner,args.from_subaccount[0]),to:args.to,amount:args.amount,fee:args.fee}}]}});if(state.lostPayment)throw Error("recording fault: return committed and reply lost");return {Ok:7n};},
  icrc1_transfer:async args=>{state.transfers.push(args);state.balance-=args.amount+args.fee[0];const block=7n;
   state.blocks.set(block,{transaction:{created_at_time:{timestamp_nanos:args.created_at_time[0]},icrc1_memo:args.memo,memo:0n,operation:[{Transfer:{from:legacyAccount(owner,args.from_subaccount[0]),to:legacyAccount(args.to.owner,args.to.subaccount[0]),amount:{e8s:args.amount},fee:{e8s:args.fee[0]}}}]}});
   if(state.lostPayment)throw Error("recording fault: transfer committed and reply lost");return {Ok:block};}};
 const actors={ledger,cmc:{get_icp_xdr_conversion_rate:async()=>({data:{timestamp_seconds:state.rateTimestamp??BigInt(Math.floor(Date.now()/1000)),xdr_permyriad_per_icp:state.rate}}),
  notify_mint_cycles:async args=>{state.mintCalls.push(args);if(state.mintEffects===0)state.mintEffects++;if(state.lostMint)throw Error("recording fault: mint committed and reply lost");return {Ok:{block_index:8n,minted:4999500000000n,balance:4999500000000n}};}},
  cycles:{icrc1_fee:async()=>100000000n,icrc1_balance_of:async()=>4999500000000n}};
 const controller=createCreationController({bindings,getSession:()=>({principal:state.principal,validate(){if(state.expired)throw Error("expired identity");}}),getNnsActor:async()=>gov,getService:async()=>({controller_observation:async()=>({Err:{InvalidNeuronId:"neuron ID must be non-zero"}})}),
  transport:{readSystem:async id=>(typeof id==='string'?id:id.toText())===state.bootstrapId?state.bootstrapSystem:{moduleHash:hexBytes(CREATION_PROTOCOL_PINS.modules[id])},readLedgerBlock:async id=>{if(!state.blocks.has(id))throw Error("recording block unavailable");return state.blocks.get(id);},
   authFactory:(profile,bootstrapCanisterId)=>{let valid=true;return {signIn:async()=>({principal:state.principal,profile,bootstrapCanisterId,validate(){if(!valid)throw Error("revoked child");}}),signOut:async()=>{if(state.signOutFailure)throw Error("recording fault: SDK cleanup failed");valid=false;}};},actorsFactory:async()=>actors}});
 return {controller,state,actors,gov};
}
async function prepare(f){await f.controller.review(input);await f.controller.connect("FundProvisioning");await f.controller.prepareProvisioning();}
test("money dispatch requires exact saved intent plus explicit confirmation",async()=>{
 const f=fixture();await prepare(f);await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/Save/);assert.equal(f.state.transfers.length,0);
 f.controller.export();await assert.rejects(()=>f.controller.dispatch({saved:false,confirmed:true}),/Save/);assert.equal(f.state.transfers.length,0);
 await f.controller.dispatch({saved:true,confirmed:true});assert.equal(f.state.transfers.length,1);assert.equal(f.controller.receipt.intents[0].state,"Confirmed");assert.equal(f.controller.receipt.intents[0].references.block_id,"7");
});
test("lost transfer reply retains one original payment identity until independent block reconciliation",async()=>{
 const f=fixture();await prepare(f);f.state.lostPayment=true;const original=f.controller.prepared.intent.argument,identity=f.controller.prepared.intent.id;f.controller.export();
 await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/reply lost/);assert.equal(f.state.transfers.length,1);assert.equal(f.controller.receipt.intents[0].state,"Unknown");
 await assert.rejects(()=>f.controller.prepareProvisioning(),/unresolved/);assert.equal(f.state.transfers.length,1);
 await f.controller.reconcileLedger(7n);assert.equal(f.controller.receipt.intents[0].argument,original);assert.equal(f.controller.receipt.intents[0].id,identity);
 await f.controller.prepareProvisioning();assert.equal(f.controller.prepared.intent.kind,"ConvertCycles");assert.equal(f.state.transfers.length,1);
});
test("lost conversion reuses the verified original ICP block rather than sending ICP again",async()=>{
 const f=fixture();await prepare(f);f.controller.export();await f.controller.dispatch({saved:true,confirmed:true});await f.controller.prepareProvisioning();f.controller.export();f.state.lostMint=true;
 await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/reply lost/);await assert.rejects(()=>f.controller.prepareProvisioning(),/unresolved/);
 f.state.lostMint=false;await f.controller.reconcileConversion();assert.equal(f.state.transfers.length,1);assert.equal(f.state.mintEffects,1);assert.equal(f.state.mintCalls.length,2);assert.equal(f.state.mintCalls[0].block_index,f.state.mintCalls[1].block_index);
});
test("wrong creator expired session changed fee and mutated arguments block before payment",async()=>{
 for(const mutate of [f=>f.state.principal=other,f=>f.state.expired=true,f=>f.state.fee=20000n,f=>f.controller.prepared.args.amount++]){
  const f=fixture();await prepare(f);f.controller.export();mutate(f);await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}));assert.equal(f.state.transfers.length,0);
 }
});
test("route cancellation during preflight cannot dispatch after the await completes",async()=>{
 const f=fixture();await prepare(f);f.controller.export();let release;f.state.barrier=new Promise(r=>release=r);
 const sending=f.controller.dispatch({saved:true,confirmed:true});await Promise.resolve();await f.controller.deactivate();release();await assert.rejects(()=>sending,/interrupted|route|cancel|revoked/i);assert.equal(f.state.transfers.length,0);assert.equal(f.controller.receipt.intents[0].state,"Rejected");
});
test("two browser plans restored from the same receipt preserve the same monetary timestamp and explicit fee",async()=>{
 const f=fixture();await f.controller.review(input);const json=f.controller.export(),second=fixture();await second.controller.import(json);
 for(const c of [f.controller,second.controller]){await c.connect("FundProvisioning");await c.prepareProvisioning();}
 assert.equal(f.controller.prepared.intent.argument,second.controller.prepared.intent.argument);assert.equal(f.controller.prepared.args.created_at_time[0],f.controller.plan.nonce);assert.equal(f.controller.prepared.args.fee[0],f.controller.plan.icp_fee_e8s);
});
test("unused ICP return reconciles the original fixed-account block after losing its reply",async()=>{
 const f=fixture();await f.controller.review(input);await f.controller.connect("FundProvisioning");await f.controller.prepareReturnIcp();const original=f.controller.prepared.intent.argument;
 f.controller.export();f.state.lostPayment=true;await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/reply lost/);assert.equal(f.state.transfers.length,1);
 const block=f.state.blocks.get(7n),destination=block.transaction.operation[0].Transfer.to;block.transaction.operation[0].Transfer.to=legacyAccount(other);
 await assert.rejects(()=>f.controller.reconcileLedger(7n),/exact recovery/);assert.equal(f.controller.receipt.intents[0].state,"Unknown");
 block.transaction.operation[0].Transfer.to=destination;await f.controller.searchOriginalPayment();assert.equal(f.controller.receipt.intents[0].state,"Confirmed");assert.equal(f.controller.receipt.intents[0].argument,original);assert.equal(f.state.transfers.length,1);
});

test("no funding plan is published before the full asynchronous preflight succeeds",async()=>{
 const f=fixture();let release;f.state.barrierAt=2;f.state.barrier=new Promise(resolve=>release=resolve);const reviewing=f.controller.review(input);
 for(let i=0;i<100&&f.state.economicsReads<2;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.state.economicsReads,2);assert.equal(f.controller.plan,undefined);assert.equal(f.controller.receipt,undefined);release();await reviewing;assert.ok(f.controller.plan&&f.controller.receipt);
});
test("changed rate and stale quotes block the original unsent payment without replacing its deduplication identity",async()=>{
 for(const change of [f=>f.state.rate=40000n,f=>f.state.rateTimestamp=BigInt(Math.floor(Date.now()/1000))-301n]){
  const f=fixture();await prepare(f);const argument=f.controller.prepared.intent.argument;f.controller.export();change(f);await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/rate|quote/);assert.equal(f.state.transfers.length,0);assert.equal(f.controller.prepared.intent.argument,argument);assert.equal(f.controller.prepared.intent.state,'Prepared');
 }
});

test("a different II principal cannot use any resumed creation mutation or reconciliation control",async()=>{
 const f=fixture();await f.controller.review(input);f.state.principal=other;const reads=f.state.economicsReads;
 const actions=[['newPlan',{confirmed:true}],['recoverUpgrade',{confirmed:true}],['connect','FundProvisioning'],['review',input],['import',f.controller.export()],['reviewRevision',input],['commitRevision',{confirmed:true}],['reconcileRevision'],['cancelRevision'],['refresh'],['prepareProvisioning'],['dispatch',{saved:true,confirmed:true}],['install'],['prepareStakePayment'],['prepareReturnIcp'],['prepareStakeDisbursement'],['advance',{Claim:null}],['prepareNnsProposal','Registration',11n],['exportRegistration'],['prepareCreationVote',11n,1n],['searchOriginalProposal'],['inspectProposal',1n],['reconcileNnsProposal',1n],['cancelUnsentProposalReservation',{confirmed:true}],['seal',1n],['prepareUninstall',{confirmed:true}],['prepareControllerRemoval',{confirmed:true}],['reconcileLedger',7n],['reconcileDisbursement',7n],['searchOriginalPayment'],['reconcileConversion'],['reconcileCreation',7n],['reconcileTeardown'],['unseal',{confirmed:true}],['startInstalled']];
 for(const [method,...args]of actions)await assert.rejects(()=>f.controller[method](...args),/Wrong II identity/,method);
 assert.throws(()=>f.controller.discardPrepared(),/Wrong II identity/);assert.equal(f.state.economicsReads,reads);assert.equal(f.state.transfers.length,0);assert.equal(f.state.mintCalls.length,0);
});
test("ordinary pre-provisioning views reveal no staking address or unconsented authority",async()=>{
 const f=fixture();assert.equal(f.controller.fundingAccount(),undefined);assert.equal(f.controller.stakingAccount(),undefined);
 await f.controller.review(input);assert.equal(f.controller.fundingAccount().owner,owner.toText());assert.equal(f.controller.stakingAccount(),undefined);
 await assert.rejects(()=>f.controller.prepareProvisioning(),/Consent to FundProvisioning/);
 await assert.rejects(()=>f.controller.prepareStakePayment(),/exact creation canister/);
 await assert.rejects(()=>f.controller.prepareUninstall(),/exact C and T/);
 await assert.rejects(()=>f.controller.prepareControllerRemoval(),/exact C and T/);
 await assert.rejects(()=>f.controller.advance({CommitLock:null}),/separate explicit consent/);
 await assert.rejects(()=>f.controller.advance({StartDissolving:null}),/separate explicit consent/);
 await assert.rejects(()=>f.controller.advance({Disburse:{expected_amount_e8s:1n,expected_fee_e8s:1n}}),/exact disbursement/);
 await assert.rejects(()=>f.controller.unseal(),/Explicitly confirm/);
 await assert.rejects(()=>f.controller.cancelUnsentProposalReservation(),/Explicitly review/);
 await assert.rejects(()=>f.controller.readiness(),/test neurons cannot finalise/);
 await assert.rejects(()=>f.controller.stop(),/test neurons cannot finalise/);
 for(const [method,arg]of [['reconcileLedger',7n],['reconcileDisbursement',7n],['searchOriginalPayment'],['reconcileConversion'],['reconcileCreation',7n],['reconcileTeardown'],['reconcileNnsProposal',1n]])await assert.rejects(()=>f.controller[method](arg),/No original/);
 await assert.rejects(()=>f.controller.exportRegistration(),/production metadata/);
 await f.controller.deactivate();await assert.rejects(()=>f.controller.refresh(),/route changed/);f.controller.activate();await f.controller.refresh();
 assert.equal(f.state.transfers.length,0);
});
test("local cancellation revokes unsent financial reviews but cannot erase an unknown payment",async()=>{
 const f=fixture();await prepare(f);const first=f.controller.prepared.intent.id;f.controller.discardPrepared();assert.equal(f.controller.receipt.intents.find(i=>i.id===first).state,'Rejected');assert.equal(f.controller.prepared,undefined);
 await f.controller.prepareProvisioning();await f.controller.cancelCapabilities();assert.equal(f.controller.prepared,undefined);assert.equal(f.controller.hasCapability('FundProvisioning'),false);assert.equal(f.state.transfers.length,0);
 await f.controller.connect('FundProvisioning');await f.controller.prepareProvisioning();f.controller.export();f.state.lostPayment=true;await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/reply lost/);
 await f.controller.cancelCapabilities();assert.equal(f.controller.receipt.intents.at(-1).state,'Unknown');assert.throws(()=>f.controller.discardPrepared(),/proven unsent/);
});
test("an unresolved cycles-only creation cannot strand independent unused ICP or permit another creation",async()=>{
 const f=fixture();await f.controller.review(input);await f.controller.connect('FundProvisioning');const p=f.controller.plan;
 const args={from_subaccount:[fundingSubaccount(owner,p.creation_id)],created_at_time:[p.nonce],amount:p.provision_cycles,creation_args:[{settings:[{controllers:[[owner]],compute_allocation:[0n],memory_allocation:[0n],freezing_threshold:[2592000n]}],subnet_selection:[{Filter:{subnet_type:[]}}]}]};
 const original=addCreationIntent(f.controller.receipt,{kind:'CreateCanister',destination:'um5iw-rqaaa-aaaaq-qaaba-cai',argument:IDL.encode([creationArgumentTypes.create],[args]),createdAtTime:p.nonce});settleCreationIntent(f.controller.receipt,original.id,'Unknown');
 await assert.rejects(()=>f.controller.prepareProvisioning(),/unresolved/);await f.controller.prepareReturnIcp();f.controller.export();f.state.lostPayment=true;
 await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/reply lost/);assert.equal(f.state.transfers.length,1);assert.equal(original.state,'Unknown');
 await f.controller.reconcileLedger(7n);assert.equal(f.controller.receipt.intents.at(-1).state,'Confirmed');assert.equal(original.state,'Unknown');assert.equal(f.controller.receipt.canister_id,null);
 await assert.rejects(()=>f.controller.prepareProvisioning(),/unresolved/);
});
test("changing profile requires a separately reviewed fresh plan and cannot erase an unsaved or unknown creation",async()=>{
 const f=fixture();await f.controller.review(input);await f.controller.connect('FundProvisioning');const original=f.controller.plan;
 await assert.rejects(()=>f.controller.newPlan({confirmed:true}),/Save this creation/);f.controller.export();await assert.rejects(()=>f.controller.newPlan(),/Save this creation/);
 await f.controller.newPlan({confirmed:true});assert.equal(f.controller.plan,undefined);assert.equal(f.controller.receipt,undefined);assert.equal(f.controller.hasCapability('FundProvisioning'),false);
 await f.controller.review(input);assert.notDeepEqual(f.controller.plan.creation_id,original.creation_id);await f.controller.connect('FundProvisioning');await f.controller.prepareProvisioning();f.controller.export();await assert.rejects(()=>f.controller.newPlan({confirmed:true}),/unresolved/);assert.ok(f.controller.receipt);
});
test("bounded proposal-history search retains an unknown request and never treats a matching marker as authority",async()=>{
 const f=fixture();await f.controller.review(input);await assert.rejects(()=>f.controller.searchOriginalProposal(),/No original/);f.controller.receipt.canister_id=cId;f.controller.receipt.neuron_id='600';
 const request=buildManageNeuronProposal(11n,600n,{RefreshVotingPower:{}},'Unique original creation operation'),args=IDL.encode([creationArgumentTypes.nns],[request]);
 const original=addCreationIntent(f.controller.receipt,{kind:'Rehearsal',destination:'rrkah-fqaaa-aaaaa-aaaaq-cai',argument:args,createdAtTime:f.controller.plan.nonce});settleCreationIntent(f.controller.receipt,original.id,'Unknown');
 const seen=[];let rows=[{id:[{id:9n}],proposer:[{id:11n}],proposal:[request.command[0].MakeProposal]},{id:[{id:8n}],proposer:[{id:12n}],proposal:[request.command[0].MakeProposal]}];f.gov.list_proposals=async value=>{seen.push(value);return {proposal_info:rows};};
 const found=await f.controller.searchOriginalProposal();assert.deepEqual(found.possible_matches,['9']);assert.equal(seen[0].limit,32);assert.deepEqual(seen[0].include_all_manage_neuron_proposals,[true]);assert.equal(original.state,'Unknown');assert.equal(original.argument,Array.from(args,b=>b.toString(16).padStart(2,'0')).join(''));assert.equal(original.references.history_cursor,'8');
 rows=[{id:[{id:7n}]},{id:[{id:7n}]}];await assert.rejects(()=>f.controller.searchOriginalProposal(),/duplicated/);assert.equal(original.references.history_cursor,'8');
 rows=[];await f.controller.searchOriginalProposal();assert.deepEqual(seen.at(-1).before_proposal,[{id:8n}]);await f.controller.searchOriginalProposal({restart:true});assert.deepEqual(seen.at(-1).before_proposal,[]);assert.equal(original.state,'Unknown');assert.equal(f.state.transfers.length,0);assert.match(f.controller.observed.proposalSearch.warning,/does not prove non-execution/);
});
test("creation cancellation and route departure discard signing handles even when SDK cleanup rejects",async()=>{
 for(const method of ['cancelCapabilities','deactivate']){
  const f=fixture();await prepare(f);f.state.signOutFailure=true;
  await f.controller[method]();f.controller.activate();
  assert.equal(f.controller.hasCapability('FundProvisioning'),false);
  assert.equal(f.controller.prepared,undefined);assert.equal(f.controller.receipt.intents.at(-1).state,'Rejected');
  assert.equal(f.controller.observed.capabilityCleanupFailed,true);
  assert.equal(f.state.transfers.length,0);assert.equal(f.state.mintCalls.length,0);
 }
});

// Certificate decoding is deliberately scripted here, as in creation-protocol's
// transport recordings. These are ordering/failure tests, not replica authority
// or cryptographic proof. The real-artifact upgrade lane supplies that evidence.
async function recoveryFixture(t,mode){
 const f=fixture();await f.controller.review(input);const p=f.controller.plan,c=Principal.fromUint8Array(Uint8Array.of(0,0,0,0,0,0,0,42,1,1));
 const args={from_subaccount:[fundingSubaccount(owner,p.creation_id)],created_at_time:[p.nonce],amount:p.provision_cycles,creation_args:[{settings:[{controllers:[[owner]],compute_allocation:[0n],memory_allocation:[0n],freezing_threshold:[2592000n]}],subnet_selection:[{Filter:{subnet_type:[]}}]}]};
 const argument=IDL.encode([creationArgumentTypes.create],[args]),request={request_type:'call',canister_id:'um5iw-rqaaa-aaaaq-qaaba-cai',method_name:'create_canister',arg:bytesHex(argument),sender:owner.toText(),ingress_expiry:String(p.nonce+300000000000n),nonce:null};
 f.controller.receipt.canister_id=c.toText();const intent=addCreationIntent(f.controller.receipt,{kind:'CreateCanister',destination:request.canister_id,argument,createdAtTime:p.nonce});settleCreationIntent(f.controller.receipt,intent.id,'Confirmed',{block_id:'7',canister_id:c.toText()});
 f.controller.receipt.creation_witness={request,request_id:bytesHex(requestIdOf(witnessRequestContent(request))),certificate:'01'};
 const reply=IDL.encode([IDL.Variant({Ok:IDL.Record({block_id:IDL.Nat,canister_id:IDL.Principal})})],[{Ok:{block_id:7n,canister_id:c}}]);
 t.mock.method(HttpAgent,'create',async()=>({rootKey:new Uint8Array(96)}));
 t.mock.method(Certificate,'create',async()=>({lookup_path:path=>({status:LookupPathStatus.Found,value:new TextDecoder().decode(path.at(-1))==='reply'?reply:new TextEncoder().encode('replied')})}));
 t.mock.method(globalThis,'fetch',async()=>({ok:true,arrayBuffer:async()=>recordingWasm.buffer}));
 t.mock.method(Actor,'interfaceOf',()=>bootstrapFactory({IDL}));
 f.state.bootstrapId=c.toText();f.state.bootstrapSystem={moduleHash:p.bootstrap_sha256,controllers:[owner]};
 const state={version:1,plan:p,plan_digest:hexBytes(f.controller.receipt.plan_digest),controller:c,neuron_id:[],staking_subaccount:stakingSubaccount(c,p.nonce),phase:{AwaitingStake:null},sequence:1n,
  pending:[{sequence:1n,revision:p.revision,step:{Claim:null},dispatched_at:p.nonce,effect:[{Claim:null}],expected_return_e8s:[],expected_return_fee_e8s:[]}],
  rehearsal_started_at:[],rehearsal_proposal:[],disbursement_block:[],last_error:[],external_proposal:[],public_visibility_confirmed:false,sealed_controller_changes:[]};
 const calls=[];let status='running',stops=0,version=1n;
 // Keep SDK Principal prototypes in the bound plan/controller; only simulated
 // application fields change, without manufacturing a new plan or destination.
 f.actors.bootstrap={status:async()=>({Ok:{...state,plan:p,controller:c,pending:state.pending.map(row=>({...row}))}})};
 f.actors.management={canister_status:async()=>({status:{[status]:null},settings:{controllers:[owner],compute_allocation:0n,memory_allocation:0n,freezing_threshold:2592000n},cycles:2000000000000n,version}),
  stop_canister:async arg=>{assert.equal(arg.canister_id.toText(),c.toText());calls.push('stop');stops++;status=mode==='never-stopped'||mode==='restart-race'&&stops===2?'running':'stopped';if(mode==='completed'&&stops===1){state.pending=[];state.neuron_id=[600n];state.phase={Configuring:null};state.sequence=2n;}},
  start_canister:async()=>{calls.push('start');status='running';},
  install_code:async arg=>{calls.push('upgrade');assert.deepEqual(arg.mode,{upgrade:[]});assert.equal(bytesHex(arg.wasm_module),bytesHex(recordingWasm));assert.equal(status,'stopped');version++;if(mode==='changed-checkpoint'){state.sequence++;state.pending[0].sequence=state.sequence;}}};
 await f.controller.connect('ManageBootstrap');await f.controller.connect('CallBootstrap');f.controller.export();return {...f,calls,bootstrapState:state,c};
}
test('same-code recovery waits for real quiescence and refuses a controller restart before upgrade',async t=>{
 for(const mode of ['never-stopped','restart-race'])await t.test(mode,async t=>{const f=await recoveryFixture(t,mode);await assert.rejects(()=>f.controller.recoverUpgrade({confirmed:true}),/quiesced|restarted/);assert.ok(!f.calls.includes('upgrade'));assert.equal(f.state.transfers.length,0);});
});
test('quiescence can settle the original callback without a recovery upgrade',async t=>{
 const f=await recoveryFixture(t,'completed');await f.controller.recoverUpgrade({confirmed:true});assert.deepEqual(f.calls,['stop','start']);assert.equal(f.controller.receipt.neuron_id,'600');assert.equal(f.controller.observed.state.pending.length,0);assert.equal(f.state.transfers.length,0);
});
test('a pending recovery checkpoint is drained again upgraded and compared without resending money',async t=>{
 for(const mode of ['pending','changed-checkpoint'])await t.test(mode,async t=>{const f=await recoveryFixture(t,mode);const action=f.controller.recoverUpgrade({confirmed:true});if(mode==='pending')await action;else await assert.rejects(()=>action,/checkpoint\/readback differs/);assert.deepEqual(f.calls,['stop','start','stop','upgrade','start']);assert.equal(f.state.transfers.length,0);assert.equal(f.state.mintEffects,0);});
});

async function currentRecoveryFixture(t){
 const f=await recoveryFixture(t,'pending'),p=f.controller.plan,s=f.bootstrapState;
 s.pending=[];s.neuron_id=[600n];s.public_visibility_confirmed=true;s.phase={Recovering:null};
 f.controller.receipt.neuron_id='600';
 const receipt=f.controller.receipt;receipt.creation_witness=null;receipt.sealed_witness=null;
 const json=f.controller.export();
 const neuron={id:[{id:600n}],controller:[f.c],account:stakingSubaccount(f.c,p.nonce),visibility:[2],hot_keys:[],not_for_profit:false,cached_neuron_stake_e8s:200000000n,neuron_fees_e8s:0n,dissolve_state:[{DissolveDelaySeconds:0n}]};
 f.gov.list_neurons=async()=>({full_neurons:[neuron],total_pages_available:[1n]});
 f.actors.bootstrap.advance=async args=>{f.calls.push(Object.keys(args.step)[0]);if(args.step.Disburse){s.phase={Recovered:null};s.disbursement_block=[77n];}return {Ok:{...s,plan:p,controller:f.c}};};
 f.state.blocks.set(77n,{transaction:{operation:[{Transfer:{from:legacyAccount(Principal.fromText('rrkah-fqaaa-aaaaa-aaaaq-cai'),stakingSubaccount(f.c,p.nonce)),to:p.return_account,amount:{e8s:199990000n},fee:{e8s:10000n}}}]}});
 return {...f,p,json,neuron};
}
test('current-controller recovery needs explicit consent and fresh C P plan and Governance bindings without historical proof',async t=>{
 const f=await currentRecoveryFixture(t);
 await assert.rejects(()=>f.controller.import(f.json),/provenance is missing/);
 await assert.rejects(()=>f.controller.import(f.json,{recoveryOnly:true}),/Explicitly approve/);
 await f.controller.import(f.json,{recoveryOnly:true,confirmed:true});assert.equal(f.controller.recoveryOnly,true);
 await assert.rejects(()=>f.controller.prepareReturnIcp(),/CallBootstrap/);assert.equal(f.state.transfers.length,0);
 await f.controller.connect('ManageBootstrap');await f.controller.connect('CallBootstrap');await f.controller.connect('FundProvisioning');
 await f.controller.refresh();assert.equal(f.controller.observed.recoveryBound,true);
 await f.controller.prepareStakeDisbursement();f.controller.export();await f.controller.dispatch({saved:true,confirmed:true});
 assert.deepEqual(f.calls,['Disburse']);assert.equal(f.controller.receipt.intents.at(-1).references.block_id,'77');
 assert.equal(f.controller.observed.state.phase.Recovered,null);assert.equal(f.state.transfers.length,0);
});
test('recovery-only import cannot enable full workflow methods or change its on-chain fixed recipient',async t=>{
 const f=await currentRecoveryFixture(t);await f.controller.import(f.json,{recoveryOnly:true,confirmed:true});
 const forbidden=[['prepareProvisioning'],['install'],['prepareStakePayment'],['reviewRevision',input],['commitRevision',{confirmed:true}],['reconcileRevision'],['reconcileConversion'],['reconcileCreation',7n],['prepareNnsProposal','Registration',11n],['seal',1n],['readiness'],['prepareUninstall',{confirmed:true}],['prepareControllerRemoval',{confirmed:true}],['advance',{CommitLock:null},{confirmed:true}],['advance',{Configure:null}],['advance',{Claim:null}]];
 for(const [name,...args]of forbidden)await assert.rejects(()=>f.controller[name](...args),/Recovery-only/);
 const altered=parseCreationPlan({...planJson(f.p),return_account:bytesHex(legacyAccount(other))},bindings),receipt=newCreationReceipt(altered);receipt.canister_id=f.c.toText();receipt.neuron_id='600';
 await f.controller.import(exportCreationReceipt(receipt),{recoveryOnly:true,confirmed:true});await f.controller.connect('ManageBootstrap');await f.controller.connect('CallBootstrap');await f.controller.connect('FundProvisioning');
 await assert.rejects(()=>f.controller.prepareReturnIcp(),/binding mismatch/);assert.equal(f.state.transfers.length,0);assert.deepEqual(f.calls,[]);
});
test('recovery-only resume rejects absent unknown or differently controlled code and a changed target',async t=>{
 const f=await currentRecoveryFixture(t);
 for(const system of [{controllers:[owner]}, {moduleHash:new Uint8Array(32),controllers:[owner]}, {moduleHash:f.p.bootstrap_sha256,controllers:[owner,other]}]){f.state.bootstrapSystem=system;await assert.rejects(()=>f.controller.import(f.json,{recoveryOnly:true,confirmed:true}),/fresh certified/);}
 f.state.bootstrapSystem={moduleHash:f.p.bootstrap_sha256,controllers:[owner]};await f.controller.import(f.json,{recoveryOnly:true,confirmed:true});await f.controller.connect('ManageBootstrap');await f.controller.connect('CallBootstrap');await f.controller.connect('FundProvisioning');f.neuron.controller=[Principal.anonymous()];
 await assert.rejects(()=>f.controller.prepareReturnIcp(),/target\/account\/controller/);assert.equal(f.state.transfers.length,0);assert.equal(f.controller.observed.recoveryBound,false);
});
