import {financialAttemptKinds,validateDispatchReservation} from "./creation-financial-attempt.js";
import {Principal} from "@icp-sdk/core/principal";
import {IDL} from "@icp-sdk/core/candid";
import {parseCreationPlan,planJson,creationPlanDigest,validateCreationRevision,exactKeys,natString} from "./creation-plan.js";
import {bytesHex,hexBytes,sha256Hex,fundingSubaccount,principalSubaccount,stakingSubaccount} from "./creation-accounts.js";
import {creationArgumentTypes,validateCreationRequestBinding} from "./creation-protocol.js";
import {ICP_LEDGER_CANISTER_ID,CMC_CANISTER_ID,CYCLES_LEDGER_CANISTER_ID,NNS_GOVERNANCE_CANISTER_ID} from "./auth.js";

export const MAX_CREATION_RECEIPT_BYTES=524288;
const text=new TextEncoder();
const legacyTopKeys=["version","plan","plan_digest","plan_history","proposed_plan","funding_subaccount","canister_id","neuron_id","intents","creation_witness","sealed_witness","checkpoints","checksum"];
const topKeys=[...legacyTopKeys,"bootstrap_witness","bootstrap_upgrade"];
const legacyIntentKeys=["id","kind","plan_digest","destination","argument","argument_digest","created_at_time","state","references","reviewed_amount_e8s","reviewed_fee_e8s","reviewed_cycles_fee","reviewed_conversion_rate","reviewed_quote_timestamp"];
const intentKeys=[...legacyIntentKeys,"attempt_version","reply_witness","dispatch_reservation","request_binding","reservation_binding","reviewed_prior_dispatch_fees"];
const kinds=new Set(["PayConversion","ConvertCycles","CreateCanister","PayStake","ReturnIcp","DisburseStake","Registration","Rehearsal","CreationVote","Uninstall","ClearControllers"]);
const states=new Set(["Prepared","Unknown","Confirmed","Rejected"]);
const referenceKeys=new Set(["block_id","refund_block","fee_block","proposal_id","canister_id","history_start","history_cursor"]);
const checkpointKinds=new Set(["DefaultIcpAcknowledged","Plan","ControllerCreated","Installed","Claimed","Configured","Registered","Sealed","Stopped","CodeRemoved","Finalised","Recovery"]);
function canonical(value) {
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest=value=>sha256Hex(text.encode(canonical(value)));
function checksum(receipt){const {checksum:_,...content}=receipt;return digest(content);}
function principal(value){if(typeof value!=="string"||Principal.fromText(value).toText()!==value)throw Error("Invalid canonical receipt principal.");return value;}
function canister(value){principal(value);const p=Principal.fromText(value);if(p.isAnonymous()||p.toUint8Array().at(-1)!==1)throw Error("Invalid creation canister identity.");return value;}
function boundedHex(value,max){if(typeof value!=="string"||value.length>max*2)throw Error("Receipt evidence exceeds its bound.");hexBytes(value);}
function witness(value) {
  if(value===null)return;
  exactKeys(value,["request","request_id","certificate"],"public request witness");
  hexBytes(value.request_id,32);boundedHex(value.certificate,65536);
  exactKeys(value.request,["request_type","canister_id","method_name","arg","sender","ingress_expiry","nonce"],"public request content");
  const r=value.request;canister(r.canister_id);principal(r.sender);natString(r.ingress_expiry,{nonzero:true});
  if(r.request_type!=="call"||!["create_canister","status","manage_neuron","icrc1_transfer","icrc2_approve"].includes(r.method_name))throw Error("Unsupported receipt witness method.");
  boundedHex(r.arg,16384);if(r.nonce!==null)boundedHex(r.nonce,64);
}
function validateIntentArgument(intent,plan,receipt){
  const typeName={PayConversion:"transfer",PayStake:"transfer",ReturnIcp:"legacyTransfer",DisburseStake:"bootstrapAdvance",ConvertCycles:"mint",CreateCanister:"create",Registration:"nns",Rehearsal:"nns",CreationVote:"nns",Uninstall:"uninstall",ClearControllers:"updateSettings"}[intent.kind];
  if(!creationArgumentTypes[typeName])throw Error("Unsupported receipt argument type.");
  let args;try{args=IDL.decode([creationArgumentTypes[typeName]],hexBytes(intent.argument))[0];}catch{throw Error("Receipt argument does not decode as its exact operation type.");}
  const eq=(a,b)=>bytesHex(a??[])===bytesHex(b??[]),bucket=fundingSubaccount(plan.owner,plan.creation_id);
  const expectedDestination=["PayConversion","PayStake","ReturnIcp"].includes(intent.kind)?ICP_LEDGER_CANISTER_ID:intent.kind==="DisburseStake"?receipt.canister_id:intent.kind==="ConvertCycles"?CMC_CANISTER_ID:intent.kind==="CreateCanister"?CYCLES_LEDGER_CANISTER_ID:["Uninstall","ClearControllers"].includes(intent.kind)?"aaaaa-aa":NNS_GOVERNANCE_CANISTER_ID;
  if(intent.destination!==expectedDestination)throw Error("Receipt operation has an unsupported destination.");
  if(intent.kind==="DisburseStake"&&(args.revision!==plan.revision||Object.keys(args.step)[0]!=="Disburse"||!receipt.neuron_id))throw Error("Receipt recovery cannot select another step, revision or unbound neuron.");
  if(["PayConversion","PayStake"].includes(intent.kind)){
    if(!eq(args.from_subaccount[0],bucket)||args.fee[0]!==((intent.attempt_version??1)===1?plan.icp_fee_e8s:BigInt(intent.reviewed_fee_e8s??-1))||args.created_at_time[0]!==((intent.attempt_version??1)===1?plan.nonce:BigInt(intent.created_at_time)))throw Error("Receipt payment source/fee/deduplication is not bound.");
    if(intent.kind==="PayConversion"&&(args.to.owner.toText()!==CMC_CANISTER_ID||!eq(args.to.subaccount[0],principalSubaccount(plan.owner))||args.amount+args.fee[0]+((intent.attempt_version??1)===1?0n:args.fee[0]+BigInt(intent.reviewed_prior_dispatch_fees??-1))!==plan.funding_budget_e8s||!eq(args.memo[0],Uint8Array.of(77,73,78,84,0,0,0,0))))throw Error("Receipt conversion payment differs from its reviewed budget/account/memo.");
    if(intent.kind==="PayStake"&&(!receipt.canister_id||args.to.owner.toText()!==NNS_GOVERNANCE_CANISTER_ID||!eq(args.to.subaccount[0],stakingSubaccount(receipt.canister_id,plan.nonce))||args.amount!==plan.stake_e8s||!eq(args.memo[0],plan.creation_id)))throw Error("Receipt stake payment differs from its bound Governance account/amount.");
  }
  if(intent.kind==="ConvertCycles"&&(!eq(args.to_subaccount[0],bucket)||!eq(args.deposit_memo[0],plan.creation_id)))throw Error("Receipt conversion credit destination changed.");
  if(intent.kind==="ReturnIcp"&&(!eq(args.from_subaccount[0],bucket)||!eq(args.to,plan.return_account)||args.created_at_time.length!==1||args.memo!==plan.nonce||args.amount.e8s===0n))throw Error("Receipt return is not bound to the workflow's fixed recovery account.");
  if(intent.kind==="CreateCanister"){const s=args.creation_args[0]?.settings[0];
    if(!eq(args.from_subaccount[0],bucket)||args.amount!==plan.provision_cycles||args.created_at_time[0]!==((intent.attempt_version??1)===1?plan.nonce:BigInt(intent.created_at_time))||s?.controllers?.[0]?.map(p=>p.toText()).join(",")!==plan.owner.toText()||s.compute_allocation[0]!==0n||s.memory_allocation[0]!==0n||s.freezing_threshold[0]!==2_592_000n||args.creation_args[0].subnet_selection[0]?.Filter?.subnet_type?.length!==0)throw Error("Receipt provisioning arguments are not the reviewed route/settings.");}
  if(["Uninstall","ClearControllers"].includes(intent.kind)&&args.canister_id.toText()!==receipt.canister_id)throw Error("Receipt teardown substituted another canister.");
  if(intent.kind==="ClearControllers"&&(args.settings.controllers.length!==1||args.settings.controllers[0].length||args.settings.compute_allocation.length||args.settings.memory_allocation.length||args.settings.freezing_threshold.length))throw Error("Receipt controller removal must explicitly empty every controller without unrelated settings.");
  if(["Registration","Rehearsal","CreationVote"].includes(intent.kind)){
    const command=args.command[0],proposal=command?.MakeProposal,action=proposal?.action[0];
    if(intent.kind==="CreationVote"){if(!command?.RegisterVote||command.RegisterVote.vote!==1||!plan.managers.includes(args.neuron_id_or_subaccount[0]?.NeuronId?.id))throw Error("Receipt vote is not a reviewed manager Yes vote.");}
    else if(intent.kind==="Registration"){const registration=action?.RegisterKnownNeuron;if(!registration||registration.id[0]?.id?.toString()!==receipt.neuron_id||!plan.metadata.length||registration.known_neuron_data[0]?.name!==plan.metadata[0].name)throw Error("Receipt registration has another target/metadata.");}
    else if(action?.ManageNeuron?.neuron_id_or_subaccount[0]?.NeuronId?.id?.toString()!==receipt.neuron_id||Object.keys(action?.ManageNeuron?.command[0]??{})[0]!=="RefreshVotingPower"||!plan.managers.includes(args.neuron_id_or_subaccount[0]?.NeuronId?.id))throw Error("Receipt rehearsal is not the reviewed manager's benign proposal for T.");
  }
}
export function newCreationReceipt(plan) {
  const receipt={version:2,bootstrap_witness:null,bootstrap_upgrade:null,plan:planJson(plan),plan_digest:creationPlanDigest(plan),plan_history:[],proposed_plan:null,funding_subaccount:bytesHex(fundingSubaccount(plan.owner,plan.creation_id)),
    canister_id:null,neuron_id:null,intents:[],creation_witness:null,sealed_witness:null,checkpoints:[],checksum:""};
  receipt.checksum=checksum(receipt);return receipt;
}
export function validateCreationReceipt(receipt,bindings) {
  exactKeys(receipt,receipt.version===1?legacyTopKeys:topKeys,"creation receipt");if(![1,2].includes(receipt.version))throw Error("Unsupported creation receipt version.");
  const plan=parseCreationPlan(receipt.plan,bindings);
  if(!Array.isArray(receipt.plan_history)||receipt.plan_history.length>16)throw Error("Creation revision history exceeds its bound.");
  const history=receipt.plan_history.map(p=>parseCreationPlan(p,bindings)),plans=[...history,plan];
  if(plans[0].revision!==1n)throw Error("Creation provenance requires the first reviewed revision.");
  for(let i=1;i<plans.length;i++)validateCreationRevision(plans[i-1],plans[i]);
  if(receipt.proposed_plan!==null)validateCreationRevision(plan,parseCreationPlan(receipt.proposed_plan,bindings));
  const revisions=new Map(plans.map(p=>[creationPlanDigest(p),p]));
  if(receipt.plan_digest!==creationPlanDigest(plan)||receipt.funding_subaccount!==bytesHex(fundingSubaccount(plan.owner,plan.creation_id)))throw Error("Receipt plan/account derivation mismatch.");
  if(receipt.canister_id!==null)canister(receipt.canister_id);
  if(receipt.neuron_id!==null)natString(receipt.neuron_id,{nonzero:true});
  if(receipt.neuron_id!==null&&receipt.canister_id===null)throw Error("Neuron receipt lacks its creation canister.");
  if(!Array.isArray(receipt.intents)||receipt.intents.length>128||!Array.isArray(receipt.checkpoints)||receipt.checkpoints.length>128)throw Error("Receipt history exceeds its bound.");
  const ids=new Set();
  for(const intent of receipt.intents){exactKeys(intent,receipt.version===1?legacyIntentKeys:intentKeys,"recovery intent");hexBytes(intent.id,32);
    if(ids.has(intent.id)||!kinds.has(intent.kind)||!states.has(intent.state))throw Error("Invalid or duplicate recovery intent.");ids.add(intent.id);
    principal(intent.destination);boundedHex(intent.argument,16384);hexBytes(intent.argument_digest,32);
    if(intent.argument_digest!==sha256Hex(hexBytes(intent.argument)))throw Error("Intent argument checksum mismatch.");
    const originalPlan=revisions.get(intent.plan_digest);if(!originalPlan)throw Error("Intent belongs to an unavailable reviewed plan revision.");validateIntentArgument(intent,originalPlan,receipt);
    natString(intent.created_at_time,{nonzero:true});
    if(receipt.version===2){
      if(intent.request_binding!==null)validateCreationRequestBinding(intent.request_binding,{owner:originalPlan.owner,destination:intent.destination,methodName:intent.kind==="CreateCanister"?"create_canister":["Registration","Rehearsal"].includes(intent.kind)?"manage_neuron":"icrc1_transfer",argument:hexBytes(intent.argument)});
      if(intent.reservation_binding!==null){if(!intent.dispatch_reservation)throw Error("Reservation request has no exact approval.");validateCreationRequestBinding(intent.reservation_binding,{owner:originalPlan.owner,destination:intent.destination,methodName:"icrc2_approve",argument:hexBytes(intent.dispatch_reservation.argument)});}
      if(intent.attempt_version===2&&financialAttemptKinds.has(intent.kind))natString(intent.reviewed_prior_dispatch_fees);
      if(intent.attempt_version===2&&["Registration","Rehearsal"].includes(intent.kind)&&!intent.request_binding)throw Error("New proposal has no original ingress binding.");
      if(![1,2].includes(intent.attempt_version))throw Error("Unsupported financial attempt format.");witness(intent.reply_witness);if(intent.attempt_version===2&&intent.reply_witness&&["PayConversion","PayStake","CreateCanister","Registration","Rehearsal"].includes(intent.kind)&&intent.reply_witness.request_id!==intent.request_binding?.request_id)throw Error("Reply witness belongs to a different original ingress request.");if(intent.dispatch_reservation!==null){if(!financialAttemptKinds.has(intent.kind))throw Error("Unexpected financial reservation.");const a=validateDispatchReservation(intent.dispatch_reservation,intent,originalPlan);if(a.fee[0]!==BigInt((intent.kind==="CreateCanister"?intent.reviewed_cycles_fee:intent.reviewed_fee_e8s)??-1))throw Error("Reservation fee differs from the plan.");witness(intent.dispatch_reservation.reply_witness);if(!intent.reservation_binding||intent.dispatch_reservation.reply_witness&&intent.dispatch_reservation.reply_witness.request_id!==intent.reservation_binding.request_id)throw Error("Approval witness differs from its original reserved ingress request.");if(intent.dispatch_reservation.block_id!==null)natString(intent.dispatch_reservation.block_id);}else if(intent.attempt_version===2&&financialAttemptKinds.has(intent.kind))throw Error("New monetary dispatch lacks its atomic reservation.");}
    for(const field of ["reviewed_amount_e8s","reviewed_fee_e8s","reviewed_cycles_fee","reviewed_conversion_rate","reviewed_quote_timestamp","reviewed_prior_dispatch_fees"])if(intent[field]!==null&&(receipt.version!==1||field!=="reviewed_prior_dispatch_fees"))natString(intent[field]);
    if(!intent.references||typeof intent.references!=="object"||Array.isArray(intent.references)||Object.keys(intent.references).some(k=>!referenceKeys.has(k)))throw Error("Unsupported transaction reference.");
    for(const [key,value] of Object.entries(intent.references))key==="canister_id"?canister(value):natString(value);
  }
  if(receipt.version===2){witness(receipt.bootstrap_witness);if(receipt.bootstrap_upgrade!==null){const u=receipt.bootstrap_upgrade;exactKeys(u,["from_sha256","to_sha256","state"],"approved module migration");hexBytes(u.from_sha256,32);hexBytes(u.to_sha256,32);if(!receipt.canister_id||u.from_sha256!==bytesHex(plan.bootstrap_sha256)||u.from_sha256===u.to_sha256||!["Prepared","Unknown","Confirmed"].includes(u.state))throw Error("Invalid immutable historical module migration binding.");}}
  witness(receipt.creation_witness);witness(receipt.sealed_witness);
  for(const c of receipt.checkpoints){exactKeys(c,["kind","observed_at","evidence_digest"],"creation checkpoint");
    if(!checkpointKinds.has(c.kind))throw Error("Unsupported creation checkpoint.");natString(c.observed_at,{nonzero:true});hexBytes(c.evidence_digest,32);}
  hexBytes(receipt.checksum,32);if(receipt.checksum!==checksum(receipt))throw Error("Receipt checksum mismatch. A checksum is not proof of authority.");
  return plan;
}
export function exportCreationReceipt(receipt) {
  const current={...receipt,checksum:checksum(receipt)};validateCreationReceipt(current);
  const json=JSON.stringify(current,null,2);if(text.encode(json).length>MAX_CREATION_RECEIPT_BYTES)throw Error("Receipt exceeds its export bound.");return json;
}
export function importCreationReceipt(json,bindings) {
  if(typeof json!=="string"||text.encode(json).length>MAX_CREATION_RECEIPT_BYTES)throw Error("Receipt exceeds its import bound.");
  let receipt;try{receipt=JSON.parse(json);}catch{throw Error("Receipt is not valid JSON.");}
  const plan=validateCreationReceipt(receipt,bindings);
  if(receipt.version===1){receipt.version=2;receipt.bootstrap_witness=null;receipt.bootstrap_upgrade=null;for(const i of receipt.intents){i.attempt_version=1;i.reply_witness=null;i.dispatch_reservation=null;i.request_binding=null;i.reservation_binding=null;i.reviewed_prior_dispatch_fees=null;}}
  // A saved Prepared intent may have been sent immediately before a crash.
  // Import never grants permission to repeat a value-moving call. Reconcile
  // both Prepared and Unknown against the original protocol identity first.
  for(const intent of receipt.intents)if(intent.state==="Prepared")intent.state="Unknown";
  if(receipt.bootstrap_upgrade?.state==="Prepared")receipt.bootstrap_upgrade.state="Unknown";
  receipt.checksum=checksum(receipt);return {receipt,plan};
}
export function addCreationIntent(receipt,{kind,destination,argument,createdAtTime,reservation=null,requestBinding=null,reservationBinding=null,reviewedFee=null,reviewedCyclesFee=null,priorDispatchFees=null,attemptVersion=2,id=bytesHex(crypto.getRandomValues(new Uint8Array(32)))}) {
  if(receipt.intents.some(i=>["Prepared","Unknown"].includes(i.state)&&!(kind==="ReturnIcp"&&i.kind==="CreateCanister"&&i.state==="Unknown")))throw Error("Resolve the original outstanding intent before another non-idempotent request.");
  if(!kinds.has(kind))throw Error("Unsupported creation operation.");
  const intent={attempt_version:attemptVersion,reply_witness:null,dispatch_reservation:reservation,request_binding:requestBinding,reservation_binding:reservationBinding,id,kind,plan_digest:receipt.plan_digest,destination:principal(destination),argument:bytesHex(argument),argument_digest:sha256Hex(argument),
    created_at_time:BigInt(createdAtTime).toString(),state:"Prepared",references:{},reviewed_amount_e8s:null,reviewed_fee_e8s:reviewedFee===null?null:String(reviewedFee),reviewed_prior_dispatch_fees:priorDispatchFees===null?null:String(priorDispatchFees),reviewed_cycles_fee:reviewedCyclesFee===null?null:String(reviewedCyclesFee),reviewed_conversion_rate:null,reviewed_quote_timestamp:null};
  receipt.intents.push(intent);receipt.checksum=checksum(receipt);try{exportCreationReceipt(receipt);}catch(error){receipt.intents.pop();receipt.checksum=checksum(receipt);throw error;}return intent;
}
export function settleCreationIntent(receipt,id,state,references={}) {
  const intent=receipt.intents.find(i=>i.id===id);if(!intent||!["Prepared","Unknown"].includes(intent.state)||!["Unknown","Confirmed","Rejected"].includes(state))throw Error("Stale recovery intent settlement.");
  const previous={...intent};intent.state=state;intent.references={...intent.references,...references};receipt.checksum=checksum(receipt);
  try{exportCreationReceipt(receipt);}catch(error){Object.assign(intent,previous);receipt.checksum=checksum(receipt);throw error;}
}
export function checkpointCreation(receipt,kind,evidence,now=BigInt(Date.now())*1_000_000n) {
  receipt.checkpoints.push({kind,observed_at:now.toString(),evidence_digest:digest(evidence)});receipt.checksum=checksum(receipt);
  try{exportCreationReceipt(receipt);}catch(error){receipt.checkpoints.pop();receipt.checksum=checksum(receipt);throw error;}
}
export const receiptContentDigest=receipt=>checksum(receipt);
export function applyCreationRevision(receipt,next){validateCreationRevision(parseCreationPlan(receipt.plan),next);
  if(receipt.plan_history.length>=16)throw Error("Creation revision history is full; preserve its existing recovery provenance.");
  if(receipt.intents.some(i=>["Prepared","Unknown"].includes(i.state)))throw Error("Resolve the original monetary intent before revising the plan.");
  const previous={...receipt,plan_history:[...receipt.plan_history]};receipt.plan_history.push(receipt.plan);receipt.plan=planJson(next);receipt.plan_digest=creationPlanDigest(next);receipt.proposed_plan=null;receipt.sealed_witness=null;receipt.checksum=checksum(receipt);
  try{exportCreationReceipt(receipt);}catch(error){Object.assign(receipt,previous);throw error;}
}
