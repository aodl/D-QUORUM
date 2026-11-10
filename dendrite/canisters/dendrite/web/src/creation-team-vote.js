import {HttpAgent} from '@icp-sdk/core/agent';
import {Principal} from '@icp-sdk/core/principal';
import {IDL} from '@icp-sdk/core/candid';
import {importCreationReceipt} from './creation-receipt.js';
import {creationArtifact} from './creation-compatibility.js';
import {verifyCreationWitness,creationArgumentTypes} from './creation-protocol.js';
import {bytesHex,hexBytes,fundingSubaccount,stakingSubaccount,sha256Hex} from './creation-accounts.js';
import {creationPlanDigest,CREATION_PROTOCOL_PINS} from './creation-plan.js';
import {buildDirectManagerOperation} from './transaction.js';
import {CYCLES_LEDGER_CANISTER_ID,NNS_GOVERNANCE_CANISTER_ID} from './auth.js';
const eq=(a,b)=>bytesHex(a??[])===bytesHex(b??[]);
const list=id=>({neuron_ids:[id],include_neurons_readable_by_caller:false,include_empty_neurons_readable_by_caller:[false],include_public_neurons_in_full_neurons:[true],page_number:[0n],page_size:[1n],neuron_subaccounts:[]});
// This object has no provisioning actor, owner credential, bootstrap mutation,
// transfer, proposal-creation or ordinary-management preflight override.
export function createCreationTeamVote({bindings,getSession,getNnsActor,readSystem,currentManifest,getGeneration,ensureActive}){
 let imported,prepared;
 function session(){ensureActive();const s=getSession();if(!s)throw Error('Sign in with your own Internet Identity.');s.validate();return s;}
 async function evidence(manager){
  const s=session(),generation=getGeneration();
  const check=()=>{session();if(generation!==getGeneration()||s.principal.toText()!==getSession().principal.toText())throw Error('Creation vote cancelled by route or identity change.');};
  const actor=await getNnsActor();check();
  if(!imported)throw Error('Import a proposal receipt first.');
  const {receipt:r,plan:p}=imported;
  if(!p.managers.includes(manager)||!r.canister_id||!r.neuron_id||!r.creation_witness||!r.bootstrap_witness)throw Error('Exact creation and proposal provenance is required.');
  creationArtifact(bytesHex(p.bootstrap_sha256),currentManifest);
  if(r.bootstrap_upgrade&&r.bootstrap_upgrade.state!=="Confirmed")throw Error("Original module migration is unresolved.");
  const activeHash=r.bootstrap_upgrade?hexBytes(creationArtifact(r.bootstrap_upgrade.to_sha256,currentManifest).sha256):p.bootstrap_sha256;
  const agent=await HttpAgent.create({host:bindings.host,shouldFetchRootKey:bindings.local,verifyQuerySignatures:true,retryTimes:0});
  const created=await verifyCreationWitness(r.creation_witness,{agent,canisterId:CYCLES_LEDGER_CANISTER_ID,owner:p.owner,methodName:'create_canister',includeSystemState:false});
  const c=created.value.Ok?.canister_id??created.value.Err?.Duplicate?.canister_id?.[0],a=created.args[0];
  if(c?.toText()!==r.canister_id||a.amount!==p.provision_cycles||!eq(a.from_subaccount[0],fundingSubaccount(p.owner,p.creation_id))||a.creation_args[0]?.settings[0]?.controllers[0]?.map(x=>x.toText()).join(',')!==p.owner.toText()||!r.intents.some(i=>i.kind==='CreateCanister'&&i.argument===r.creation_witness.request.arg))throw Error('Certified creation differs from the exact route.');
  const proof=await verifyCreationWitness(r.bootstrap_witness,{agent,canisterId:c,owner:p.owner,methodName:'status',includeSystemState:true}),state=proof.value.Ok,reservation=state?.external_proposal?.[0];
  if(!eq(proof.system.moduleHash,activeHash)||proof.system.controllers.map(x=>x.toText()).join(",")!==p.owner.toText()||!eq(state?.module_binding?.[0]??p.bootstrap_sha256,activeHash)||!state||creationPlanDigest(state.plan)!==r.plan_digest||!eq(state.plan_digest,new Uint8Array(r.plan_digest.match(/../g).map(x=>parseInt(x,16))))||state.controller.toText()!==r.canister_id||state.neuron_id[0]?.toString()!==r.neuron_id||!eq(state.staking_subaccount,stakingSubaccount(c,p.nonce))||!reservation?.dispatched||!reservation.proposal_id.length)throw Error('Certified proposal reservation is missing or belongs to another creation.');
  const intent=r.intents.find(i=>i.id===bytesHex(reservation.intent_id)&&i.argument_digest===bytesHex(reservation.request_digest)&&['Registration','Rehearsal'].includes(i.kind));
  if(!intent)throw Error('Original proposal request is unavailable.');
  const system=await readSystem(c),gov=await readSystem(NNS_GOVERNANCE_CANISTER_ID);
  if(!eq(system.moduleHash,activeHash)||system.controllers.map(x=>x.toText()).join(',')!==p.owner.toText()||bytesHex(gov.moduleHash??[])!==CREATION_PROTOCOL_PINS.modules[NNS_GOVERNANCE_CANISTER_ID])throw Error('Fresh approved module/controller/protocol evidence changed.');
  const n=(await actor.list_neurons(list(BigInt(r.neuron_id)))).full_neurons?.[0],m=(await actor.list_neurons(list(manager))).full_neurons?.[0];
  if(n?.id[0]?.id!==BigInt(r.neuron_id)||n.controller?.[0]?.toText()!==r.canister_id||!eq(n.account,stakingSubaccount(c,p.nonce))||n.hot_keys.length||n.visibility[0]!==2)throw Error('Fresh target identity or authority changed.');
  for(const f of p.following){const actual=n.followees.find(([t])=>t===f.topic)?.[1]?.followees.map(x=>x.id)??[];if(actual.join(',')!==f.followees.join(','))throw Error('Fresh target following differs from the reviewed managers/delegates.');}
  if(!m||!(m.controller?.[0]?.toText()===s.principal.toText()||m.hot_keys.some(x=>x.toText()===s.principal.toText())))throw Error('This II identity does not control the selected manager.');
  const id=reservation.proposal_id[0],proposal=(await actor.get_proposal_info(id))[0],original=IDL.decode([creationArgumentTypes.nns],new Uint8Array(intent.argument.match(/../g).map(x=>parseInt(x,16))))[0];
  const reconstructed=buildDirectManagerOperation(reservation.proposer,{MakeProposal:proposal?.proposal?.[0]});
  if(proposal?.id?.[0]?.id!==id||proposal.status!==1||proposal.proposer?.[0]?.id!==reservation.proposer||sha256Hex(IDL.encode([creationArgumentTypes.nns],[reconstructed]))!==intent.argument_digest)throw Error('Open proposal is not the exact certified reservation.');
  const action=proposal.proposal[0].action[0],target=action.RegisterKnownNeuron?.id?.[0]?.id??action.ManageNeuron?.neuron_id_or_subaccount?.[0]?.NeuronId?.id;
  if(target!==BigInt(r.neuron_id)||!(intent.kind==='Registration'?!!action.RegisterKnownNeuron:Object.keys(action.ManageNeuron?.command?.[0]??{}).join(',')==='RefreshVotingPower'))throw Error('Only exact creation registration or benign rehearsal votes are supported.');
  check();return {actor,check,id,manager,principal:s.principal.toText(),target:r.neuron_id,request:buildDirectManagerOperation(manager,{RegisterVote:{proposal:[{id}],vote:1}})};
 }
 return {
  get imported(){return imported;},get prepared(){return prepared;},
  import(json){session();imported=importCreationReceipt(json,bindings);prepared=undefined;},
  async prepare(manager){prepared=undefined;prepared=await evidence(BigInt(manager));return prepared;},
  async submit({confirmed=false}={}){if(!confirmed||!prepared)throw Error('Explicitly review the exact manager Yes vote.');const previous=prepared;prepared=undefined;const fresh=await evidence(previous.manager);if(fresh.id!==previous.id||fresh.principal!==previous.principal)throw Error('Reviewed vote changed.');fresh.check();const response=await fresh.actor.manage_neuron(fresh.request);fresh.check();if(!response.command?.[0]?.RegisterVote)throw Error('Vote outcome is unknown or refused; inspect the original proposal before another vote.');return fresh.id;},
  clear(){imported=undefined;prepared=undefined;},
 };
}
