// Recording certificates exercise the production voting adapter. They do not
// establish II identity, BLS authenticity or actual Governance permissions.
import {recordingCertificate} from './support/recording-certificate.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Principal} from '@icp-sdk/core/principal';
import {IDL} from '@icp-sdk/core/candid';
import {HttpAgent,Certificate,Cbor,LookupPathStatus} from '@icp-sdk/core/agent';
import {createCreationController} from '../src/creation-controller.js';
import {createCreationTeamVote} from '../src/creation-team-vote.js';
import {createCreationPlan,creationPlanDigest,CREATION_PROTOCOL_PINS} from '../src/creation-plan.js';
import {newCreationReceipt,addCreationIntent,settleCreationIntent,exportCreationReceipt} from '../src/creation-receipt.js';
import {creationArgumentTypes,creationRequestBinding,creationRegistrationMetadata} from '../src/creation-protocol.js';
import {bytesHex,hexBytes,fundingSubaccount,stakingSubaccount,sha256Hex} from '../src/creation-accounts.js';
import {buildManageNeuronProposal,buildDirectManagerOperation} from '../src/transaction.js';
import {idlFactory as bootstrapFactory} from '../../../../src/declarations/bootstrap/bootstrap.did.js';
const P=Principal.selfAuthenticating(Uint8Array.of(1)),participant=Principal.selfAuthenticating(Uint8Array.of(2)),other=Principal.selfAuthenticating(Uint8Array.of(3)),C=Principal.fromText('pi33i-pt777-77776-aaaaa-cai');
const bindings={origin:`http://${C}.localhost:4944`,host:'http://127.0.0.1:4944',canisterId:C.toText(),local:true},manifest={sha256:'ab'.repeat(32),bytes:8,version:1};
function leb(n){const bytes=[];do{const b=Number(n&127n);n>>=7n;bytes.push(b|(n?128:0));}while(n);return Uint8Array.from(bytes);}
function fixture(t,kind='Rehearsal'){
 const p=createCreationPlan({profile:'ProductionCandidate',managers:['11','12','13','14','15'],stakeIcp:'2',provisionIcp:'1',provisionCycles:'2000000000000',ledgerFeeE8s:10000n,committedTopics:[4],delegates:{4:['11','12','13']},defaultNeuronId:'18422777432977120264',metadata:{name:'Provisional creation',description:'P retains authority',links:[]}},P,bindings,manifest),r=newCreationReceipt(p);
 const creationArgs={from_subaccount:[fundingSubaccount(P,p.creation_id)],created_at_time:[p.nonce],amount:p.provision_cycles,creation_args:[{settings:[{controllers:[[P]],compute_allocation:[0n],memory_allocation:[0n],freezing_threshold:[2592000n]}],subnet_selection:[{Filter:{subnet_type:[]}}]}]},creation=IDL.encode([creationArgumentTypes.create],[creationArgs]);
 r.canister_id=C.toText();r.neuron_id='600';const ci=addCreationIntent(r,{attemptVersion:1,kind:'CreateCanister',destination:'um5iw-rqaaa-aaaaq-qaaba-cai',argument:creation,createdAtTime:p.nonce});settleCreationIntent(r,ci.id,'Confirmed',{block_id:'7',canister_id:C.toText()});
 const cw=creationRequestBinding({owner:P,destination:ci.destination,methodName:'create_canister',argument:creation,nonce:new Uint8Array(32).fill(1)});r.creation_witness={...cw,certificate:bytesHex(recordingCertificate(undefined,1))};
 const request=kind==='Registration'?buildDirectManagerOperation(11n,{MakeProposal:{title:['Register provisional creation'],summary:'Creator retains provisional control',url:'',action:[{RegisterKnownNeuron:{id:[{id:600n}],known_neuron_data:[creationRegistrationMetadata(p)]}}]}}):buildManageNeuronProposal(11n,600n,{RefreshVotingPower:{}},'Exact provisional rehearsal'),argument=IDL.encode([creationArgumentTypes.nns],[request]);
 const pi=addCreationIntent(r,{attemptVersion:1,kind,destination:'rrkah-fqaaa-aaaaa-aaaaq-cai',argument,createdAtTime:p.nonce});settleCreationIntent(r,pi.id,'Confirmed',{proposal_id:'9'});
 const state={version:2,module_binding:[],proposal_refusals:[],plan:p,plan_digest:hexBytes(creationPlanDigest(p)),controller:C,neuron_id:[600n],staking_subaccount:stakingSubaccount(C,p.nonce),phase:{Rehearsing:null},pending:[],sequence:1n,rehearsal_started_at:[1n],rehearsal_proposal:[],disbursement_block:[],last_error:[],public_visibility_confirmed:true,sealed_controller_changes:[],external_proposal:[{kind:{[kind]:null},request_id:[],intent_id:hexBytes(pi.id),request_digest:hexBytes(pi.argument_digest),proposer:11n,revision:1n,created_at:1n,proposal_id:[9n],dispatched:true}]};
 const statusType=bootstrapFactory({IDL})._fields.find(([n])=>n==='status')[1],sw=creationRequestBinding({owner:P,destination:C,methodName:'status',argument:IDL.encode(statusType.argTypes,[1n]),nonce:new Uint8Array(32).fill(2)});r.bootstrap_witness={...sw,certificate:bytesHex(recordingCertificate(undefined,2))};
 const f={principal:participant,generation:0,active:true,status:1,module:hexBytes(manifest.sha256),controllers:[P],following:p.following.map(row=>[row.topic,{followees:row.followees.map(id=>({id}))}]),votes:[],certificateError:false,managerOwner:participant};
 t.mock.method(HttpAgent,'create',async()=>({rootKey:new Uint8Array(96)}));
 t.mock.method(Certificate,'create',async options=>{if(f.certificateError)throw Error('recording invalid certificate');const isCreation=Cbor.decode(options.certificate).signature[0]===1;const reply=isCreation?IDL.encode([IDL.Variant({Ok:IDL.Record({block_id:IDL.Nat,canister_id:IDL.Principal})})],[{Ok:{block_id:7n,canister_id:C}}]):IDL.encode(statusType.retTypes,[{Ok:state}]);
  return {lookup_path(path){const field=new TextDecoder().decode(path.at(-1)),value=field==='status'?new TextEncoder().encode('replied'):field==='reply'?reply:field==='module_hash'?hexBytes(manifest.sha256):field==='controllers'?Cbor.encode([P.toUint8Array()]):leb(BigInt(Date.now())*1000000n);return {status:LookupPathStatus.Found,value};}};});
 f.target={id:[{id:600n}],controller:[C],account:stakingSubaccount(C,p.nonce),hot_keys:[],visibility:[2]};f.managerHotkeys=[];f.proposalPayload={...request.command[0].MakeProposal,...(kind==='Rehearsal'?{title:['Manage neuron proposal for neuron: 600']}:{})};
 const actor={list_neurons:async args=>({full_neurons:args.neuron_ids[0]===600n?[{...f.target,followees:f.following}]:[{id:[{id:12n}],controller:[f.managerOwner],hot_keys:f.managerHotkeys}]}),get_proposal_info:async()=>[{id:[{id:9n}],status:f.status,proposer:[{id:11n}],proposal:[f.proposalPayload]}],manage_neuron:async request=>{f.votes.push(request);if(f.afterVote)f.afterVote();return f.voteError?{command:[{Error:{error_type:12,error_message:'recording unknown'}}]}:{command:[{RegisterVote:{}}]};}};
 const readSystem=async id=>(typeof id==='string'?id:id.toText())===C.toText()?{moduleHash:f.module,controllers:f.controllers}:{moduleHash:hexBytes(CREATION_PROTOCOL_PINS.modules['rrkah-fqaaa-aaaaa-aaaaq-cai'])};
 const voting=createCreationTeamVote({bindings,currentManifest:manifest,getSession:()=>({principal:f.principal,validate(){if(f.expired)throw Error('expired actual session');}}),getNnsActor:async()=>{if(f.actorBarrier)await f.actorBarrier;return actor;},readSystem:async id=>(typeof id==='string'?id:id.toText())===C.toText()?{moduleHash:f.module,controllers:f.controllers}:{moduleHash:hexBytes(CREATION_PROTOCOL_PINS.modules['rrkah-fqaaa-aaaaa-aaaaq-cai'])},getGeneration:()=>f.generation,ensureActive(){if(!f.active)throw Error('route departed');}});
 return {...f,readSystem,actor,request,control:f,voting,json:()=>exportCreationReceipt(r),receipt:r,state};
}
test('another creator-independent principal can review and sign only its own exact manager Yes vote',async t=>{
 const f=fixture(t);f.voting.import(f.json());const prepared=await f.voting.prepare(12n);assert.equal(prepared.principal,participant.toText());assert.equal(prepared.id,9n);assert.equal(f.control.votes.length,0);await assert.rejects(()=>f.voting.submit(),/Explicitly/);await f.voting.submit({confirmed:true});assert.equal(f.control.votes.length,1);assert.equal(f.control.votes[0].neuron_id_or_subaccount[0].NeuronId.id,12n);assert.equal(f.control.votes[0].command[0].RegisterVote.proposal[0].id,9n);assert.equal(f.receipt.plan.owner,P.toText());
});
test('changed module, controllers, following, selected manager authority or proposal status prevents signing',async t=>{
 for(const [label,change,expected] of [
  ['module',f=>f.module=new Uint8Array(32),/Fresh approved module/],
  ['controllers',f=>f.controllers=[participant],/Fresh approved module/],
  ['following',f=>f.following=f.following.map(([topic,row])=>[topic,topic===1?{followees:[{id:99n}]}:row]),/Fresh target following/],
  ['manager authority',f=>f.managerOwner=other,/does not control/],
  ['proposal status',f=>f.status=2,/Open proposal/],
  ['certificate',f=>f.certificateError=true,/recording invalid certificate/],
 ])await t.test(label,async t=>{const f=fixture(t);f.voting.import(f.json());change(f.control);await assert.rejects(()=>f.voting.prepare(12n),expected);assert.equal(f.control.votes.length,0);});
});
test('reviewed vote is revalidated and route departure cannot reuse a prepared signing action',async t=>{
 const f=fixture(t);f.voting.import(f.json());await f.voting.prepare(12n);f.control.status=2;await assert.rejects(()=>f.voting.submit({confirmed:true}));assert.equal(f.control.votes.length,0);f.control.status=1;await f.voting.prepare(12n);f.control.active=false;await assert.rejects(()=>f.voting.submit({confirmed:true}),/route departed/);assert.equal(f.control.votes.length,0);
});

test('registration and existing manager hotkey voting retain the same exact proposal review',async t=>{
 const f=fixture(t,'Registration');f.control.managerOwner=other;f.control.managerHotkeys=[participant];
 f.voting.import(f.json());await f.voting.prepare(12n);await f.voting.submit({confirmed:true});
 assert.equal(f.control.votes.length,1);assert.deepEqual(f.control.target.hot_keys,[]);
 assert.equal(f.request.command[0].MakeProposal.action[0].RegisterKnownNeuron.id[0].id,600n);
});
test('certified reservation and fresh target bindings independently reject substitutions before any vote',async t=>{
 for(const [label,mutate,expected]of [
  ['target account',f=>f.control.target.account=new Uint8Array(32),/Fresh target identity/],
  ['target hotkey',f=>f.control.target.hot_keys=[participant],/Fresh target identity/],
  ['target visibility',f=>f.control.target.visibility=[1],/Fresh target identity/],
  ['target controller',f=>f.control.target.controller=[P],/Fresh target identity/],
  ['reservation undispatched',f=>f.state.external_proposal[0].dispatched=false,/Certified proposal reservation/],
  ['reservation no proposal',f=>f.state.external_proposal[0].proposal_id=[],/Certified proposal reservation/],
  ['certified nonce',f=>f.state.staking_subaccount=new Uint8Array(32),/Certified proposal reservation/],
  ['certified plan digest',f=>f.state.plan_digest=new Uint8Array(32),/Certified proposal reservation/],
  ['wrong Governance management title',f=>f.control.proposalPayload.title=['Manage neuron proposal for neuron: 601'],/Governance management title/],
  ['altered proposal payload',f=>f.control.proposalPayload.summary+=' changed',/Open proposal is not the exact/],
 ])await t.test(label,async t=>{const f=fixture(t);f.voting.import(f.json());mutate(f);await assert.rejects(()=>f.voting.prepare(12n),expected);assert.equal(f.control.votes.length,0);});
});
test('route or identity changes during evidence collection cannot publish a prepared vote; uncertain vote reply cannot become success',async t=>{
 for(const identityChange of [false,true])await t.test(identityChange?'identity changed':'route generation changed',async t=>{
  const f=fixture(t);f.voting.import(f.json());let release;f.control.actorBarrier=new Promise(resolve=>release=resolve);
  const preparing=f.voting.prepare(12n);await Promise.resolve();if(identityChange)f.control.principal=other;else f.control.generation++;
  release();await assert.rejects(()=>preparing,/cancelled|does not control/);assert.equal(f.control.votes.length,0);assert.equal(f.voting.prepared,undefined);
 });
 const f=fixture(t);f.voting.import(f.json());await f.voting.prepare(12n);f.control.voteError=true;
 await assert.rejects(()=>f.voting.submit({confirmed:true}),/unknown or refused/);assert.equal(f.control.votes.length,1);assert.equal(f.voting.prepared,undefined);
 await assert.rejects(()=>f.voting.submit({confirmed:true}),/Explicitly review/);assert.equal(f.control.votes.length,1);
});

test('independent team UI shares the existing controller operation guard and route cancellation',async t=>{
 const f=fixture(t);globalThis.__DENDRITE_BOOTSTRAP_MANIFEST__=manifest;
 const controller=createCreationController({bindings,getSession:()=>({principal:participant,validate(){}}),getNnsActor:async()=>{if(f.control.actorBarrier)await f.control.actorBarrier;return f.actor;},getService:async()=>({}),transport:{readSystem:f.readSystem}});
 await controller.teamVote.import(f.json());assert.ok(controller.teamVote.imported);
 let release;f.control.actorBarrier=new Promise(resolve=>release=resolve);
 const preparing=controller.teamVote.prepare(12n);assert.equal(controller.busy,true);
 await assert.rejects(()=>controller.teamVote.import(f.json()),/Another creation operation/);
 await assert.rejects(()=>controller.teamVote.submit({confirmed:true}),/Another creation operation/);
 release();await preparing;assert.equal(controller.busy,false);assert.equal(controller.teamVote.prepared.manager,12n);
 f.control.actorBarrier=new Promise(resolve=>release=resolve);
 const voting=controller.teamVote.submit({confirmed:true});assert.equal(controller.busy,true);
 await controller.deactivate();release();await assert.rejects(()=>voting,/route changed|cancelled|interrupted/i);
 assert.equal(controller.busy,false);assert.equal(controller.teamVote.imported,undefined);assert.equal(f.control.votes.length,0);
});
test('sign-out capability cancellation drops a prepared team actor and requires a new explicit review',async t=>{
 const f=fixture(t);globalThis.__DENDRITE_BOOTSTRAP_MANIFEST__=manifest;
 const controller=createCreationController({bindings,getSession:()=>({principal:participant,validate(){}}),getNnsActor:async()=>f.actor,getService:async()=>({}),transport:{readSystem:f.readSystem}});
 await controller.teamVote.import(f.json());await controller.teamVote.prepare(12n);assert.ok(controller.teamVote.prepared);
 await controller.cancelCapabilities();assert.equal(controller.teamVote.prepared,undefined);assert.equal(controller.teamVote.imported,undefined);
 await assert.rejects(()=>controller.teamVote.submit({confirmed:true}),/Explicitly review/);assert.equal(f.control.votes.length,0);
});
