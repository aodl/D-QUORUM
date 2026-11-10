import {recordingCertificate} from "./support/recording-certificate.js";
import test from "node:test";
import assert from "node:assert/strict";
import {Ed25519KeyIdentity} from "@icp-sdk/core/identity";
import {Principal} from "@icp-sdk/core/principal";
import {IDL} from "@icp-sdk/core/candid";
import {Actor,HttpAgent,Certificate,Cbor,LookupPathStatus,requestIdOf} from "@icp-sdk/core/agent";
import {createCreationController} from "../src/creation-controller.js";
import {CREATION_PROTOCOL_PINS,parseCreationPlan,planJson} from "../src/creation-plan.js";
import {hexBytes,legacyAccount,sha256Hex,bytesHex,stakingSubaccount} from "../src/creation-accounts.js";
import {fundingSubaccount} from "../src/creation-accounts.js";
import {creationArgumentTypes,witnessRequestContent,creationRequestBinding} from "../src/creation-protocol.js";
import {idlFactory as nnsFactory} from "../../../../src/declarations/nns-governance/nns-governance.did.js";
import {idlFactory as bootstrapFactory} from "../../../../src/declarations/bootstrap/bootstrap.did.js";
import {buildManageNeuronProposal} from "../src/transaction.js";
import {addCreationIntent,settleCreationIntent,newCreationReceipt,exportCreationReceipt} from "../src/creation-receipt.js";

// Recording faults verify browser coordination only. Replica permission and
// money/provisioning evidence comes from the separate real-artifact lanes.
const owner=Ed25519KeyIdentity.generate().getPrincipal(),other=Ed25519KeyIdentity.generate().getPrincipal();
const cId="pi33i-pt777-77776-aaaaa-cai",bindings={origin:`http://${cId}.localhost:4943`,host:"http://127.0.0.1:4943",canisterId:cId,local:true};
const input={profile:"RecoverableTest",managers:["11"],stakeIcp:"2",provisionIcp:"1",provisionCycles:"2000000000000"};
const recordingWasm=Uint8Array.of(0,97,115,109,1,0,0,0);
function fixture(shared){
 globalThis.__DENDRITE_BOOTSTRAP_MANIFEST__={version:1,sha256:sha256Hex(recordingWasm),bytes:8,wasm_path:"/generated/bootstrap.test.wasm"};
 const state=shared??{certificates:new Map(),reservations:new Map(),approvalHashes:new Map(),principal:owner,expired:false,fee:10000n,balance:500000000n,transfers:[],mintCalls:[],mintEffects:0,rate:50000n,rateTimestamp:null,economicsReads:0,barrierAt:null,lostPayment:false,lostMint:false,blocks:new Map(),barrier:null};
 const gov={get_network_economics_parameters:async()=>{state.economicsReads++;if(state.barrier&&(state.barrierAt===null||state.economicsReads===state.barrierAt))await state.barrier;return {voting_power_economics:[],neuron_minimum_stake_e8s:100000000n,transaction_fee_e8s:state.fee,reject_cost_e8s:100000000n,neuron_management_fee_per_proposal_e8s:1000000n};},
  list_neurons:async()=>({full_neurons:[{id:[{id:11n}],controller:[owner],hot_keys:[],visibility:[2],followees:[]}],total_pages_available:[1n]}),
  get_neuron_info:async id=>({Ok:{id:[{id}],visibility:[2],retrieved_at_timestamp_seconds:BigInt(Math.floor(Date.now()/1000)),known_neuron_data:[{name:"Existing genuine manager"}]}})};
 const ledger={icrc2_allowance:async args=>({allowance:state.reservations.get(bytesHex(args.spender.subaccount[0]))??0n,expires_at:[]}),
  icrc2_approve:async args=>{const key=bytesHex(args.spender.subaccount[0]),hash=sha256Hex(IDL.encode([creationArgumentTypes.approve],[args]));if(state.approvalHashes.has(hash))return {Err:{Duplicate:{duplicate_of:state.approvalHashes.get(hash)}}};const current=state.reservations.get(key)??0n;if(current!==args.expected_allowance[0])return {Err:{AllowanceChanged:{current_allowance:current}}};const block=100n+BigInt(state.approvalHashes.size);state.reservations.set(key,args.amount);state.approvalHashes.set(hash,block);state.balance-=args.fee[0];if(state.lostApproval)throw Error("recording fault: reservation committed and reply lost");return {Ok:block};},
 icrc1_fee:async()=>state.fee,icrc1_balance_of:async()=>state.balance,query_blocks:async()=>({chain_length:7n+BigInt(state.blocks.size)}),
  transfer:async args=>{state.transfers.push(args);state.balance-=args.amount.e8s+args.fee.e8s;state.blocks.set(7n,{transaction:{created_at_time:args.created_at_time[0],memo:args.memo,icrc1_memo:[],operation:[{Transfer:{from:legacyAccount(owner,args.from_subaccount[0]),to:args.to,amount:args.amount,fee:args.fee}}]}});if(state.lostPayment)throw Error("recording fault: return committed and reply lost");return {Ok:7n};},
  icrc1_transfer:async args=>{if(state.paymentRefusal){if(state.paymentRefusal.BadFee)state.fee=state.paymentRefusal.BadFee.expected_fee;return {Err:state.paymentRefusal};}state.transfers.push(args);state.balance-=args.amount+args.fee[0];const block=7n;
   state.blocks.set(block,{transaction:{created_at_time:{timestamp_nanos:args.created_at_time[0]},icrc1_memo:args.memo,memo:0n,operation:[{Transfer:{from:legacyAccount(owner,args.from_subaccount[0]),to:legacyAccount(args.to.owner,args.to.subaccount[0]),amount:{e8s:args.amount},fee:{e8s:args.fee[0]}}}]}});
   if(state.lostPayment)throw Error("recording fault: transfer committed and reply lost");return {Ok:block};}};
 const actors={ledger,cmc:{get_icp_xdr_conversion_rate:async()=>({data:{timestamp_seconds:state.rateTimestamp??BigInt(Math.floor(Date.now()/1000)),xdr_permyriad_per_icp:state.rate}}),
  notify_mint_cycles:async args=>{state.mintCalls.push(args);if(state.mintEffects===0)state.mintEffects++;if(state.lostMint)throw Error("recording fault: mint committed and reply lost");return {Ok:{block_index:8n,minted:4999500000000n,balance:4999500000000n}};}},
  cycles:{icrc1_fee:async()=>100000000n,icrc1_balance_of:async()=>4999500000000n}};
 const controller=createCreationController({bindings,getSession:()=>({principal:state.principal,validate(){if(state.expired)throw Error("expired identity");}}),getNnsActor:async()=>gov,getService:async()=>({controller_observation:async()=>({Err:{InvalidNeuronId:"neuron ID must be non-zero"}})}),
  transport:{financialWithWitness:async(actor,method,args,binding)=>{
    const type=method==='icrc2_approve'?creationArgumentTypes.approve:creationArgumentTypes.transfer,value=await actor[method](args),request=binding?.request??{request_type:'call',canister_id:'ryjl3-tyaaa-aaaaa-aaaba-cai',method_name:method,arg:bytesHex(IDL.encode([type],[args])),sender:owner.toText(),ingress_expiry:String(BigInt(Date.now()+300000)*1000000n),nonce:null};
    const errors={BadFee:IDL.Record({expected_fee:IDL.Nat}),InsufficientFunds:IDL.Record({balance:IDL.Nat}),TooOld:IDL.Null,CreatedInFuture:IDL.Record({ledger_time:IDL.Nat64}),Duplicate:IDL.Record({duplicate_of:IDL.Nat}),AllowanceChanged:IDL.Record({current_allowance:IDL.Nat}),Expired:IDL.Record({ledger_time:IDL.Nat64}),GenericError:IDL.Record({error_code:IDL.Nat,message:IDL.Text}),TemporarilyUnavailable:IDL.Null};
    const reply=IDL.encode([IDL.Variant({Ok:IDL.Nat,Err:IDL.Variant(errors)})],[value]),certificate=bytesHex(recordingCertificate(undefined,state.certificates.size+1));state.certificates.set(certificate,reply);
    return {system:{moduleHash:hexBytes(state.wrongFinancialModule?'00'.repeat(32):CREATION_PROTOCOL_PINS.modules['ryjl3-tyaaa-aaaaa-aaaba-cai'])},value,witness:{request,request_id:binding?.request_id??bytesHex(requestIdOf(witnessRequestContent(request))),certificate}};
   },readControllerIcpBalance:async()=>state.defaultIcpBalance??0n,readSystem:async id=>(typeof id==='string'?id:id.toText())===state.bootstrapId?state.bootstrapSystem:{moduleHash:hexBytes(CREATION_PROTOCOL_PINS.modules[id])},readLedgerBlock:async id=>{if(!state.blocks.has(id))throw Error("recording block unavailable");return state.blocks.get(id);},
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
test("two tabs with different fresh timestamps can dispatch only one financial request through the shared reservation",async()=>{
 const f=fixture();await f.controller.review(input);const json=f.controller.export(),second=fixture(f.state);await second.controller.import(json);
 for(const c of [f.controller,second.controller]){await c.connect("FundProvisioning");await c.prepareProvisioning();c.export();}
 const results=await Promise.allSettled([f.controller.dispatch({saved:true,confirmed:true}),second.controller.dispatch({saved:true,confirmed:true})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state.transfers.length,1);assert.equal(f.state.approvalHashes.size,1);
 assert.equal(second.controller.receipt.intents[0].state==='Unknown'||second.controller.receipt.intents[0].state==='Rejected',true);
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
 const actions=[['prepareBootstrapUpgrade',{confirmed:true}],['applyBootstrapUpgrade',{confirmed:true}],['newPlan',{confirmed:true}],['recoverUpgrade',{confirmed:true}],['connect','FundProvisioning'],['review',input],['import',f.controller.export()],['reviewRevision',input],['commitRevision',{confirmed:true}],['reconcileRevision'],['cancelRevision'],['refresh'],['prepareProvisioning'],['dispatch',{saved:true,confirmed:true}],['install'],['prepareStakePayment'],['prepareReturnIcp'],['prepareStakeDisbursement'],['advance',{Claim:null}],['prepareNnsProposal','Registration',11n],['exportRegistration'],['prepareCreationVote',11n,1n],['searchOriginalProposal'],['inspectProposal',1n],['reconcileNnsProposal',1n],['readOriginalProposalReply'],['reconcileProposalRefusal'],['reviewDefaultIcp'],['acknowledgeDefaultIcp',{confirmed:true}],['cancelUnsentProposalReservation',{confirmed:true}],['seal',1n],['prepareUninstall',{confirmed:true}],['prepareControllerRemoval',{confirmed:true}],['readOriginalFinancialReply'],['reconcileLedger',7n],['reconcileDisbursement',7n],['searchOriginalPayment'],['reconcileConversion'],['reconcileCreation',7n],['reconcileTeardown'],['unseal',{confirmed:true}],['startInstalled']];
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
 const original=addCreationIntent(f.controller.receipt,{attemptVersion:1,kind:'CreateCanister',destination:'um5iw-rqaaa-aaaaq-qaaba-cai',argument:IDL.encode([creationArgumentTypes.create],[args]),createdAtTime:p.nonce});settleCreationIntent(f.controller.receipt,original.id,'Unknown');
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
 const original=addCreationIntent(f.controller.receipt,{attemptVersion:1,kind:'Rehearsal',destination:'rrkah-fqaaa-aaaaa-aaaaq-cai',argument:args,createdAtTime:f.controller.plan.nonce});settleCreationIntent(f.controller.receipt,original.id,'Unknown');
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
async function recoveryFixture(t,mode,reviewedInput=input){
 const f=fixture();
 if(reviewedInput.profile==='ProductionCandidate'){
  f.gov.list_known_neurons=async()=>({known_neurons:reviewedInput.managers.map(id=>({id:[{id:BigInt(id)}],known_neuron_data:[{name:`Test ${id}`}]}))});
  f.gov.list_neurons=async args=>({full_neurons:args.neuron_ids.map(id=>({id:[{id}],controller:[owner],hot_keys:[],visibility:[2],followees:[[4,{followees:[{id:18422777432977120264n}]}]]})),total_pages_available:[1n]});
 }
 await f.controller.review(reviewedInput);const p=f.controller.plan,c=Principal.fromUint8Array(Uint8Array.of(0,0,0,0,0,0,0,42,1,1));
 const args={from_subaccount:[fundingSubaccount(owner,p.creation_id)],created_at_time:[p.nonce],amount:p.provision_cycles,creation_args:[{settings:[{controllers:[[owner]],compute_allocation:[0n],memory_allocation:[0n],freezing_threshold:[2592000n]}],subnet_selection:[{Filter:{subnet_type:[]}}]}]};
 const argument=IDL.encode([creationArgumentTypes.create],[args]),request={request_type:'call',canister_id:'um5iw-rqaaa-aaaaq-qaaba-cai',method_name:'create_canister',arg:bytesHex(argument),sender:owner.toText(),ingress_expiry:String(p.nonce+300000000000n),nonce:null};
 f.controller.receipt.canister_id=c.toText();const intent=addCreationIntent(f.controller.receipt,{attemptVersion:1,kind:'CreateCanister',destination:request.canister_id,argument,createdAtTime:p.nonce});settleCreationIntent(f.controller.receipt,intent.id,'Confirmed',{block_id:'7',canister_id:c.toText()});
 f.controller.receipt.creation_witness={request,request_id:bytesHex(requestIdOf(witnessRequestContent(request))),certificate:bytesHex(recordingCertificate())};
 const reply=IDL.encode([IDL.Variant({Ok:IDL.Record({block_id:IDL.Nat,canister_id:IDL.Principal})})],[{Ok:{block_id:7n,canister_id:c}}]);
 t.mock.method(HttpAgent,'create',async()=>({rootKey:new Uint8Array(96)}));
 t.mock.method(Certificate,'create',async()=>({lookup_path:path=>({status:LookupPathStatus.Found,value:new TextDecoder().decode(path.at(-1))==='reply'?reply:new TextEncoder().encode('replied')})}));
 t.mock.method(globalThis,'fetch',async()=>({ok:true,arrayBuffer:async()=>recordingWasm.buffer}));
 t.mock.method(Actor,'interfaceOf',()=>bootstrapFactory({IDL}));
 f.state.bootstrapId=c.toText();f.state.bootstrapSystem={moduleHash:p.bootstrap_sha256,controllers:[owner]};
 const state={version:2,proposal_refusals:[],module_binding:[],plan:p,plan_digest:hexBytes(f.controller.receipt.plan_digest),controller:c,neuron_id:[],staking_subaccount:stakingSubaccount(c,p.nonce),phase:{AwaitingStake:null},sequence:1n,
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

test('a first payment after a 48-hour planning pause gets a fresh attempt timestamp and keeps the staking nonce',async t=>{
 const f=fixture();await f.controller.review(input);const nonce=f.controller.plan.nonce,original=Date.now();
 t.mock.method(Date,'now',()=>original+48*3600*1000);
 await f.controller.connect('FundProvisioning');await f.controller.prepareProvisioning();
 assert.equal(f.controller.plan.nonce,nonce);assert.equal(f.controller.prepared.args.created_at_time[0],BigInt(Date.now())*1000000n);
 assert.notEqual(f.controller.prepared.args.created_at_time[0],nonce);assert.ok(f.controller.prepared.intent.dispatch_reservation);
 f.controller.export();await f.controller.dispatch({saved:true,confirmed:true});assert.equal(f.state.transfers.length,1);
});
test('a lost reservation reply never dispatches money and cannot be replaced after 90 days',async t=>{
 const f=fixture();await prepare(f);const argument=f.controller.prepared.intent.argument;f.controller.export();f.state.lostApproval=true;
 await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/reservation committed and reply lost/);
 assert.equal(f.state.transfers.length,0);assert.equal(f.controller.receipt.intents[0].state,'Unknown');
 const at=Date.now();t.mock.method(Date,'now',()=>at+90*86400000);
 await assert.rejects(()=>f.controller.prepareProvisioning(),/unresolved/);assert.equal(f.controller.receipt.intents[0].argument,argument);
 assert.equal(f.state.approvalHashes.size,1);
});

function recordingFinancialCertificates(t,state){
 t.mock.method(HttpAgent,'create',async()=>({rootKey:new Uint8Array(96)}));
 t.mock.method(Certificate,'create',async options=>({lookup_path(path){const field=new TextDecoder().decode(path.at(-1));let value;if(field==='reply')value=state.certificates.get(bytesHex(options.certificate));else if(field==='status')value=new TextEncoder().encode('replied');else if(field==='module_hash')value=hexBytes(CREATION_PROTOCOL_PINS.modules['ryjl3-tyaaa-aaaaa-aaaba-cai']);else if(field==='controllers')value=Cbor.encode([]);else {let n=BigInt(Date.now())*1000000n,out=[];do{const b=Number(n&127n);n>>=7n;out.push(b|(n?128:0));}while(n);value=Uint8Array.from(out);}return {status:LookupPathStatus.Found,value};}}));
}
test('a certified first-dispatch BadFee refusal survives receipt reload and permits one fresh reviewed fee-bounded attempt',async t=>{
 const f=fixture();await prepare(f);const nonce=f.controller.plan.nonce,original=f.controller.prepared.intent.argument;f.controller.export();f.state.paymentRefusal={BadFee:{expected_fee:20000n}};
 await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/conclusively refused/);assert.equal(f.controller.receipt.intents[0].state,'Rejected');assert.equal(f.state.transfers.length,0);assert.equal(f.state.balance,499990000n);
 const json=f.controller.export(),resumed=fixture(f.state);await resumed.controller.import(json);recordingFinancialCertificates(t,f.state);
 const at=Date.now();t.mock.method(Date,'now',()=>at+48*3600000);f.state.paymentRefusal=undefined;
 await resumed.controller.connect('FundProvisioning');await resumed.controller.prepareProvisioning();assert.equal(resumed.controller.plan.nonce,nonce);assert.equal(resumed.controller.plan.icp_fee_e8s,10000n);assert.equal(resumed.controller.prepared.args.fee[0],20000n);assert.equal(resumed.controller.prepared.args.amount,99950000n);assert.equal(resumed.controller.prepared.intent.reviewed_prior_dispatch_fees,'10000');
 resumed.controller.export();await resumed.controller.dispatch({saved:true,confirmed:true});assert.equal(f.state.transfers.length,1);assert.equal(f.state.balance,400000000n);assert.equal(resumed.controller.receipt.intents[0].argument,original);assert.equal(resumed.controller.receipt.intents[0].state,'Rejected');assert.equal(resumed.controller.receipt.intents[1].state,'Confirmed');
});
test('a certified-looking reply from an unreviewed financial module cannot grant a payment or a fresh attempt',async()=>{
 const f=fixture();await prepare(f);f.state.wrongFinancialModule=true;f.controller.export();await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/not from the pinned executable/);assert.equal(f.state.transfers.length,0);assert.equal(f.controller.receipt.intents[0].state,'Unknown');await assert.rejects(()=>f.controller.prepareProvisioning(),/unresolved/);
});

test('already converted cycles permit a first create after 48 hours without demanding another ICP conversion quote',async t=>{
 const f=fixture();await prepare(f);f.controller.export();await f.controller.dispatch({saved:true,confirmed:true});await f.controller.prepareProvisioning();f.controller.export();await f.controller.dispatch({saved:true,confirmed:true});
 const nonce=f.controller.plan.nonce,at=Date.now();t.mock.method(Date,'now',()=>at+48*3600000);f.state.rateTimestamp=BigInt(Math.floor(at/1000));
 f.actors.cycles.icrc2_allowance=async()=>({allowance:0n,expires_at:[]});await f.controller.prepareProvisioning();
 assert.equal(f.controller.prepared.intent.kind,'CreateCanister');assert.equal(f.controller.plan.nonce,nonce);assert.equal(f.controller.prepared.args.created_at_time[0],BigInt(Date.now())*1000000n);assert.equal(f.controller.observed.quote.cyclesOnly,true);assert.equal(f.state.transfers.length,1);assert.equal(f.state.mintEffects,1);
});

// Recording-only read_state orchestration: these certificates are deliberately
// unsigned. The real certificate/protocol/browser lanes remain separate gates.
function recordedOriginalReplies(t,f,results){
 const reads=[];recordingFinancialCertificates(t,f.state);
 const agent={rootKey:new Uint8Array(96),getPrincipal:async()=>owner,readState:async(_target,{paths})=>{
  const id=bytesHex(paths[0][1]);reads.push(id);const result=results.get(id);
  if(!result)throw Error('original reply pruned or unavailable');
  const error=IDL.Variant({BadFee:IDL.Record({expected_fee:IDL.Nat}),InsufficientFunds:IDL.Record({balance:IDL.Nat}),TooOld:IDL.Null,CreatedInFuture:IDL.Record({ledger_time:IDL.Nat64}),Duplicate:IDL.Record({duplicate_of:IDL.Nat}),AllowanceChanged:IDL.Record({current_allowance:IDL.Nat}),Expired:IDL.Record({ledger_time:IDL.Nat64}),GenericError:IDL.Record({error_code:IDL.Nat,message:IDL.Text}),TemporarilyUnavailable:IDL.Null});
  const certificate=recordingCertificate(undefined,70+reads.length);
  f.state.certificates.set(bytesHex(certificate),IDL.encode([IDL.Variant({Ok:IDL.Nat,Err:error})],[result]));return {certificate};
 }};
 t.mock.method(Actor,'agentOf',()=>agent);t.mock.method(Actor,'canisterIdOf',()=>Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'));
 return reads;
}
test('original accepted payment readback resolves Ok or Duplicate after a long pause without another financial dispatch',async t=>{
 for(const duplicate of [false,true])await t.test(duplicate?'duplicate block':'successful block',async t=>{
  const f=fixture();await prepare(f);f.controller.export();f.state.lostPayment=true;
  await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/reply lost/);
  const intent=f.controller.receipt.intents[0],binding=structuredClone(intent.request_binding),argument=intent.argument;
  const reads=recordedOriginalReplies(t,f,new Map([[intent.reservation_binding.request_id,{Ok:100n}],[intent.request_binding.request_id,duplicate?{Err:{Duplicate:{duplicate_of:7n}}}:{Ok:7n}]]));
  const at=Date.now();t.mock.method(Date,'now',()=>at+90*86400000);
  await f.controller.readOriginalFinancialReply();assert.equal(intent.state,'Confirmed');assert.equal(intent.references.block_id,'7');assert.equal(intent.argument,argument);assert.deepEqual(intent.request_binding,binding);
  assert.deepEqual(reads,[intent.reservation_binding.request_id,intent.request_binding.request_id]);assert.equal(f.state.transfers.length,1);assert.equal(f.state.approvalHashes.size,1);
 });
});
test('only an original typed no-execution reply releases an unknown payment; pruned and generic outcomes keep it',async t=>{
 for(const outcome of ['BadFee','GenericError','pruned'])await t.test(outcome,async t=>{
  const f=fixture();await prepare(f);f.controller.export();f.actors.ledger.icrc1_transfer=async()=>{throw Error('recording response lost before its result was observed');};
  await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/response lost/);
  const intent=f.controller.receipt.intents[0],results=new Map([[intent.reservation_binding.request_id,{Ok:100n}]]);
  if(outcome!=='pruned')results.set(intent.request_binding.request_id,{Err:outcome==='BadFee'?{BadFee:{expected_fee:20000n}}:{GenericError:{error_code:99n,message:'not an authoritative no-execution proof'}}});
  recordedOriginalReplies(t,f,results);
  if(outcome==='BadFee'){await f.controller.readOriginalFinancialReply();assert.equal(intent.state,'Rejected');assert.ok(intent.reply_witness);}
  else {await assert.rejects(()=>f.controller.readOriginalFinancialReply(),/unavailable|unresolved/);assert.equal(intent.state,'Unknown');}
  assert.equal(f.state.transfers.length,0);assert.equal(f.state.approvalHashes.size,1);
 });
});
test('an original rejected dispatch reservation releases no money and an ambiguous duplicate grants no dispatch',async t=>{
 for(const ambiguous of [false,true])await t.test(ambiguous?'duplicate reservation':'definite reservation refusal',async t=>{
  const f=fixture();await prepare(f);f.controller.export();f.actors.ledger.icrc2_approve=async()=>{throw Error('recording reservation response lost');};
  await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/reservation response lost/);
  const intent=f.controller.receipt.intents[0],reads=recordedOriginalReplies(t,f,new Map([[intent.reservation_binding.request_id,{Err:ambiguous?{Duplicate:{duplicate_of:100n}}:{AllowanceChanged:{current_allowance:1n}}}]]));
  if(ambiguous){await assert.rejects(()=>f.controller.readOriginalFinancialReply(),/ambiguous/);assert.equal(intent.state,'Unknown');}
  else {await f.controller.readOriginalFinancialReply();assert.equal(intent.state,'Rejected');}
  assert.deepEqual(reads,[intent.reservation_binding.request_id]);assert.equal(f.state.transfers.length,0);assert.equal(f.state.approvalHashes.size,0);
 });
});

const productionInput={...input,profile:'ProductionCandidate',defaultNeuronId:'18422777432977120264',managers:['11','12','13','14','15'],committedTopics:[4],delegates:{4:['11','12','13']},metadata:{name:'Recording provisional candidate',description:'P retains replaceable code and authority',links:[]}};
async function recordedProposalFixture(t,outcome,production=false){
 const f=await recoveryFixture(t,'pending',production?productionInput:input),s=f.bootstrapState,p=f.controller.plan,govId=Principal.fromText('rrkah-fqaaa-aaaaa-aaaaq-cai');
 s.pending=[];s.neuron_id=[600n];s.public_visibility_confirmed=true;s.phase=production?{AwaitingRegistration:null}:{RecoverableTestReady:null};f.controller.receipt.neuron_id='600';
 const manager={id:[{id:11n}],controller:[owner],hot_keys:[],visibility:[2],followees:[],cached_neuron_stake_e8s:10000000000n,neuron_fees_e8s:0n,dissolve_state:[{DissolveDelaySeconds:63115200n}],deciding_voting_power:[500n]};
 const neuron={...manager,id:[{id:600n}],controller:[f.c],account:stakingSubaccount(f.c,p.nonce),followees:p.following.map(row=>[row.topic,{followees:row.followees.map(id=>({id}))}])};
 f.gov.list_neurons=async args=>({full_neurons:args.neuron_ids.map(id=>id===600n?neuron:{...manager,id:[{id}],followees:[[4,{followees:[{id:18422777432977120264n}]}]]}),total_pages_available:[1n]});
 const createReply=IDL.encode([IDL.Variant({Ok:IDL.Record({block_id:IDL.Nat,canister_id:IDL.Principal})})],[{Ok:{block_id:7n,canister_id:f.c}}]);
 const nnsSignature=nnsFactory({IDL})._fields.find(([name])=>name==='manage_neuron')[1],statusSignature=bootstrapFactory({IDL})._fields.find(([name])=>name==='status')[1];
 let calls=0,lastTarget;const returned=outcome==='refused'||outcome==='ambiguous'?{command:[{Error:{error_type:outcome==='refused'?5:12,error_message:'recorded typed Governance outcome'}}]}:{command:[{MakeProposal:{message:[],proposal_id:outcome==='missing-id'?[]:[{id:9n}]}}]};
 const govReply=IDL.encode(nnsSignature.retTypes,[returned]);
 const agent={rootKey:new Uint8Array(96),getPrincipal:async()=>owner,addTransform(){},update:async(target,options)=>{
  lastTarget=target;const isGov=target.toText()===govId.toText();if(isGov){calls++;if(f.state.cancelAfterGov)await f.controller.cancelCapabilities();}
  const details=isGov?witnessRequestContent(f.controller.receipt.intents.at(-1).request_binding.request):{request_type:'call',canister_id:target,sender:owner,method_name:options.methodName,arg:options.arg,ingress_expiry:BigInt(Date.now()+240000)*1000000n,nonce:Uint8Array.of(9)};
  return {requestDetails:details,reply:isGov?govReply:IDL.encode(statusSignature.retTypes,[{Ok:s}]),rawCertificate:recordingCertificate(undefined,isGov?2:3)};
 },readState:async()=>({certificate:recordingCertificate(undefined,lastTarget?.toText()===govId.toText()?2:3)})};
 t.mock.method(HttpAgent,'from',async()=>agent);t.mock.method(HttpAgent,'create',async()=>agent);
 t.mock.method(Actor,'agentOf',()=>agent);t.mock.method(Actor,'canisterIdOf',actor=>actor===f.gov?govId:f.c);t.mock.method(Actor,'interfaceOf',actor=>actor===f.gov?nnsFactory({IDL}):bootstrapFactory({IDL}));
 t.mock.method(Certificate,'create',async options=>{const tag=Cbor.decode(options.certificate).signature[0];return {lookup_path(path){const field=new TextDecoder().decode(path.at(-1));let value;
  if(field==='reply')value=tag===1?createReply:tag===2?govReply:IDL.encode(statusSignature.retTypes,[{Ok:s}]);else if(field==='status')value=new TextEncoder().encode('replied');else if(field==='module_hash')value=tag===2?hexBytes(CREATION_PROTOCOL_PINS.modules[govId.toText()]):p.bootstrap_sha256;else if(field==='controllers')value=Cbor.encode([owner.toUint8Array()]);else{let n=BigInt(Date.now())*1000000n,a=[];do{const b=Number(n&127n);n>>=7n;a.push(b|(n?128:0));}while(n);value=Uint8Array.from(a);}return {status:LookupPathStatus.Found,value};}};});
 f.actors.bootstrap.advance=async({step})=>{
  (f.state.bootstrapSteps??=[]).push(Object.keys(step)[0]);
  if(step.ReserveProposal&&outcome==='reserve-refused')return {Err:'recorded bootstrap reservation refused'};
  if(step.ReserveProposal)s.external_proposal=[{...step.ReserveProposal,created_at:BigInt(Math.floor(Date.now()/1000))}];
  if(step.MarkProposalDispatched){s.external_proposal[0].dispatched=true;if(outcome==='mark-lost')throw Error('recorded dispatch grant reply lost');}
  if(step.ResolveProposal){if(outcome==='resolve-lost'&&!f.state.repairResolution)throw Error('recorded bootstrap resolution reply lost');s.external_proposal[0].proposal_id=[step.ResolveProposal];}
  if(step.ResolveProposalRefusal){if(f.state.loseRefusal)throw Error('recorded refusal audit unavailable');assert.equal(outcome,'refused');const reservation=s.external_proposal[0];assert.deepEqual(reservation.request_id[0],hexBytes(f.controller.receipt.intents.at(-1).request_binding.request_id));s.proposal_refusals=[[{reservation,request_id:reservation.request_id[0],certificate_digest:new Uint8Array(32),reply_digest:new Uint8Array(32),error_type:5}]];s.external_proposal=[];}
  return {Ok:s};
 };
 return {...f,manager,neuron,calls:()=>calls};
}
test('proposal adapter retains exact created, definitively refused and ambiguous reservation outcomes',async t=>{
 for(const outcome of ['created','refused','ambiguous','missing-id','resolve-lost'])await t.test(outcome,async t=>{
  const f=await recordedProposalFixture(t,outcome);await f.controller.prepareNnsProposal('Rehearsal',11n);const intent=f.controller.prepared.intent;f.controller.export();
  if(outcome==='created'){await f.controller.dispatch({saved:true,confirmed:true});assert.equal(intent.state,'Confirmed');assert.equal(intent.references.proposal_id,'9');assert.ok(f.controller.receipt.bootstrap_witness);}
  else {await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/recorded|ambiguous|omitted/);assert.equal(intent.state,outcome==='refused'?'Rejected':'Unknown');}
  assert.equal(f.calls(),1);assert.ok(intent.reply_witness);assert.equal(intent.request_binding.request_id,intent.reply_witness.request_id);
  if(outcome==='refused'){assert.equal(f.bootstrapState.external_proposal.length,0);assert.equal(f.bootstrapState.proposal_refusals[0][0].error_type,5);await f.controller.prepareNnsProposal('Rehearsal',11n);assert.notEqual(f.controller.prepared.intent.id,intent.id);}
  if(['ambiguous','missing-id','resolve-lost'].includes(outcome)){assert.equal(f.bootstrapState.external_proposal[0].dispatched,true);await assert.rejects(()=>f.controller.prepareNnsProposal('Rehearsal',11n),/unresolved|Reconcile/);assert.equal(f.calls(),1);}
 });
});
test('replicated refusal audit settles only the original full ingress, including after a lost local checkpoint',async t=>{
 for(const changed of [false,true])await t.test(changed?'same arguments with another ingress stay unknown':'original replicated audit survives lost local proof',async t=>{
  const f=await recordedProposalFixture(t,'refused');await f.controller.prepareNnsProposal('Rehearsal',11n);f.controller.export();await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/recorded typed/);
  const intent=f.controller.receipt.intents.at(-1);intent.state='Unknown';intent.reply_witness=null;
  if(changed)intent.request_binding=creationRequestBinding({owner,destination:intent.destination,methodName:'manage_neuron',argument:hexBytes(intent.argument),nonce:new Uint8Array(32).fill(99)});
  if(changed){await assert.rejects(()=>f.controller.reconcileProposalRefusal(),/No certified refusal/);assert.equal(intent.state,'Unknown');}
  else {await f.controller.reconcileProposalRefusal();assert.equal(intent.state,'Rejected');}
  assert.equal(f.calls(),1,'audit reconciliation never resubmits Governance');
 });
});
test('a lost successful proposal resolution reads only its original accepted request and binds the same proposal',async t=>{
 const f=await recordedProposalFixture(t,'resolve-lost');await f.controller.prepareNnsProposal('Rehearsal',11n);f.controller.export();await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/resolution reply lost/);
 const intent=f.controller.receipt.intents.at(-1),id=intent.request_binding.request_id;assert.equal(intent.state,'Unknown');f.state.repairResolution=true;
 await f.controller.readOriginalProposalReply();assert.equal(intent.state,'Confirmed');assert.equal(intent.references.proposal_id,'9');assert.equal(intent.request_binding.request_id,id);assert.equal(f.calls(),1);
});

test('an original no-creation reply can be read again after its bootstrap audit submission was interrupted',async t=>{
 const f=await recordedProposalFixture(t,'refused');f.state.loseRefusal=true;await f.controller.prepareNnsProposal('Rehearsal',11n);f.controller.export();await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/audit unavailable/);
 const intent=f.controller.receipt.intents.at(-1);assert.equal(intent.state,'Unknown');assert.equal(f.bootstrapState.external_proposal[0].dispatched,true);f.state.loseRefusal=false;
 await f.controller.readOriginalProposalReply();assert.equal(intent.state,'Rejected');assert.equal(f.bootstrapState.external_proposal.length,0);assert.equal(f.calls(),1);
});
test('proposal review blocks unsupported actions, missing proposer authority and insufficient current stake before a reservation',async t=>{
 for(const [label,change,kind,manager,expected]of [
  ['unsupported action',()=>{},'ArbitraryCommand',11n,/Unsupported/],
  ['registration from a test profile',()=>{},'Registration',11n,/production candidate/],
  ['unselected rehearsal proposer',()=>{},'Rehearsal',12n,/select an existing target manager/],
  ['no proposer authority',f=>f.manager.controller=[other],'Rehearsal',11n,/authority/],
  ['insufficient minted stake',f=>f.manager.cached_neuron_stake_e8s=1n,'Rehearsal',11n,/current proposal fee/],
  ['zero stake with zero proposal fee',f=>{f.manager.cached_neuron_stake_e8s=0n;const original=f.gov.get_network_economics_parameters;f.gov.get_network_economics_parameters=async()=>({...await original(),neuron_management_fee_per_proposal_e8s:0n});},'Rehearsal',11n,/current proposal fee/],
  ['changed target controller',f=>f.neuron.controller=[other],'Rehearsal',11n,/controller|binding/],
 ])await t.test(label,async t=>{const f=await recordedProposalFixture(t,'created');change(f);await assert.rejects(()=>f.controller.prepareNnsProposal(kind,manager),expected);assert.equal(f.calls(),0);assert.equal(f.bootstrapState.external_proposal.length,0);});
});
test('a rejected reservation and a lost granted reservation cannot be mistaken for a submitted Governance proposal',async t=>{
 for(const outcome of ['reserve-refused','mark-lost'])await t.test(outcome,async t=>{
  const f=await recordedProposalFixture(t,outcome);await f.controller.prepareNnsProposal('Rehearsal',11n);f.controller.export();
  await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/recorded/);const intent=f.controller.receipt.intents.at(-1);assert.equal(f.calls(),0);
  if(outcome==='reserve-refused'){assert.equal(intent.state,'Rejected');assert.equal(f.bootstrapState.external_proposal.length,0);}
  else{assert.equal(intent.state,'Unknown');assert.equal(f.bootstrapState.external_proposal[0].dispatched,true);assert.equal(f.bootstrapState.external_proposal[0].proposal_id.length,0);}
 });
});
test('an expired but locally proven-unsent review remains cancellable and gets a new reviewed attempt without changing account nonce',async t=>{
 const f=fixture();await prepare(f);const original=f.controller.prepared.intent,nonce=f.controller.plan.nonce;f.controller.export();
 const before=Date.now();t.mock.method(Date,'now',()=>before+5*60000);
 await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/proven-unsent review/);
 assert.equal(original.state,'Prepared');assert.equal(f.state.transfers.length,0);assert.equal(f.state.approvalHashes.size,0);
 f.controller.discardPrepared();assert.equal(original.state,'Rejected');await f.controller.prepareProvisioning();
 assert.notEqual(f.controller.prepared.intent.id,original.id);assert.notEqual(f.controller.prepared.intent.created_at_time,original.created_at_time);assert.equal(f.controller.plan.nonce,nonce);assert.equal(f.state.approvalHashes.size,0);
});
test('production registration uses its separately reviewed global proposal fee and truthful provisional payload',async t=>{
 const f=await recordedProposalFixture(t,'created',true);await f.controller.prepareNnsProposal('Registration',11n);
 const reviewed=f.controller.prepared;assert.equal(reviewed.nnsReview.reviewedFeeE8s,100000000n);
 const proposal=reviewed.args.command[0].MakeProposal;assert.ok(proposal.action[0].RegisterKnownNeuron);assert.match(proposal.summary,/retains replaceable bootstrap code/);assert.equal(proposal.action[0].RegisterKnownNeuron.id[0].id,600n);
 f.controller.export();await f.controller.dispatch({saved:true,confirmed:true});assert.equal(f.controller.receipt.intents.at(-1).state,'Confirmed');assert.equal(f.calls(),1);
});
test('production proposer eligibility and changed fees remain independent of creator controller authority',async t=>{
 for(const [label,change,expected]of [
  ['short lock',f=>f.manager.dissolve_state=[{DissolveDelaySeconds:1n}],/voting eligibility/],
  ['zero voting power',f=>f.manager.deciding_voting_power=[0n],/voting eligibility/],
  ['absent lock',f=>f.manager.dissolve_state=[],/voting eligibility/],
  ['dissolved timestamp',f=>f.manager.dissolve_state=[{WhenDissolvedTimestampSeconds:1n}],/voting eligibility/],
 ])await t.test(label,async t=>{const f=await recordedProposalFixture(t,'created',true);change(f);await assert.rejects(()=>f.controller.prepareNnsProposal('Registration',11n),expected);assert.equal(f.calls(),0);});
 const f=await recordedProposalFixture(t,'created',true);await f.controller.prepareNnsProposal('Registration',11n);f.controller.export();const economics=f.gov.get_network_economics_parameters;f.gov.get_network_economics_parameters=async()=>({...await economics(),reject_cost_e8s:200000000n});
 await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/Proposal fee changed/);assert.equal(f.calls(),0);assert.equal(f.controller.prepared.intent.state,'Prepared');assert.equal(f.bootstrapState.external_proposal.length,0);
});
test('production default-account acknowledgement discloses observed and later ICP without sweeping or settling other obligations',async t=>{
 const f=await recordedProposalFixture(t,'created',true);
 await assert.rejects(()=>f.controller.acknowledgeDefaultIcp({confirmed:true}),/Explicitly acknowledge/);
 f.state.defaultIcpBalance=100000000n;await f.controller.reviewDefaultIcp();assert.equal(f.controller.observed.controllerIcpBalance,100000000n);
 await f.controller.acknowledgeDefaultIcp({confirmed:true});const count=f.controller.receipt.checkpoints.filter(row=>row.kind==='DefaultIcpAcknowledged').length;
 f.state.defaultIcpBalance=100000001n;await f.controller.acknowledgeDefaultIcp({confirmed:true});assert.equal(f.controller.observed.controllerIcpBalance,100000001n);assert.equal(f.controller.receipt.checkpoints.filter(row=>row.kind==='DefaultIcpAcknowledged').length,count);
 assert.equal(f.state.transfers.length,0);assert.equal(f.calls(),0);
 await f.controller.prepareNnsProposal('Registration',11n);f.controller.receipt.intents.at(-1).state='Unknown';
 await assert.rejects(()=>f.controller.acknowledgeDefaultIcp({confirmed:true}),/unresolved/);assert.equal(f.state.transfers.length,0);
});

test('cancellation while a proposal reply arrives preserves its proof without dispatching a new bootstrap mutation',async t=>{
 for(const outcome of ['created','refused'])await t.test(outcome,async t=>{
  const f=await recordedProposalFixture(t,outcome);await f.controller.prepareNnsProposal('Rehearsal',11n);f.controller.export();f.state.cancelAfterGov=true;
  await assert.rejects(()=>f.controller.dispatch({saved:true,confirmed:true}),/interrupted|revoked/);const intent=f.controller.receipt.intents.at(-1);
  assert.equal(intent.state,'Unknown');assert.ok(intent.reply_witness);assert.equal(f.calls(),1);assert.deepEqual(f.state.bootstrapSteps,['ReserveProposal','MarkProposalDispatched']);
  assert.equal(f.bootstrapState.external_proposal[0].dispatched,true);assert.equal(f.controller.hasCapability('CallBootstrap'),false);
 });
});
