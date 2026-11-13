import {Principal} from "@icp-sdk/core/principal";
import policy from "../../../../src/declarations/bootstrap/policy.json" with {type:"json"};
import protocolPins from "../../../../src/declarations/bootstrap/protocol-pins.json" with {type:"json"};
import {inspectCreationProtocols,supportsProtocolModule} from "./creation-protocol-compatibility.js";
import {parseNeuronId} from "./ids.js";
import {parseIcpToE8s} from "./transaction.js";
import {RECOGNISED_TOPICS, SOURCE_REVISION, OMEGA_REJECT_NEURON_ID} from "./preliminary-evidence.js";
import {MAX_DISSOLVE_DELAY_SECONDS, STANDARD_VERSION} from "./preliminary-evaluator.js";
import {bytesHex,hexBytes,sha256Hex,legacyAccount,validateLegacyAccount} from "./creation-accounts.js";

export const CREATION_POLICY=Object.freeze(policy);
export const CREATION_PROTOCOL_PINS=Object.freeze(protocolPins);
export function verifySealedControllerChanges(state,status,{codeRemoved=false}={}){
  const changes=state?.sealed_controller_changes?.[0];
  if(variant(state?.phase)!=="Sealed"||state.pending.length||typeof changes!=="bigint"||changes<1n||changes>0xffffffffffffffffn||status?.total_num_changes!==changes+(codeRemoved?1n:0n))throw Error("The sealed controller history changed or is unavailable. Another upgrade, unseal or controller operation invalidated readiness.");
  return changes;
}
export function creationVotingMinimum(economics,qualifiedModule){
  if(!["Local","Ic"].some(network=>supportsProtocolModule("rrkah-fqaaa-aaaaa-aaaaq-cai",qualifiedModule,network)))throw Error("Voting defaults require the exact qualified Governance executable.");
  const outer=economics.voting_power_economics;if(!Array.isArray(outer)||outer.length>1)throw Error("Current voting economics are unavailable.");
  if(!outer.length)return 15_778_800n;const inner=outer[0]?.neuron_minimum_dissolve_delay_to_vote_seconds;
  if(!Array.isArray(inner)||inner.length>1||(inner.length&&(typeof inner[0]!=="bigint"||inner[0]<0n)))throw Error("Malformed current minimum voting delay.");
  return inner[0]??1_209_600n;
}
const fields=["version","profile","owner","network","dendrite_service","origin","api_host","funding_budget_e8s","icp_fee_e8s","provision_cycles","policy_version","creation_id","nonce","revision","policy_revision","bootstrap_sha256","managers","committed_topics","following","stake_e8s","lock_seconds","cycle_reserve","return_account","metadata"];
const utf8=new TextEncoder();
export function exactKeys(value,keys,label="creation data") {
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw Error(`Invalid ${label} schema.`);
}
export function natString(value,{nonzero=false}={}) {
  if(typeof value!=="string"||!/^(?:0|[1-9][0-9]*)$/.test(value))throw Error("Amounts and identifiers must be canonical decimal strings.");
  const n=BigInt(value);if(n>0xffffffffffffffffn||(nonzero&&n===0n))throw Error("Integer is outside its reviewed bound.");return n;
}
const variant=value=>Object.keys(value??{})[0];
const distinct=(values,min=0,max=15)=>values.length>=min&&values.length<=max&&new Set(values.map(String)).size===values.length;
function metadata(value) {
  if(value===null)return [];
  exactKeys(value,["name","description","links"],"known-neuron metadata");
  if(typeof value.name!=="string"||!value.name||utf8.encode(value.name).length>200||typeof value.description!=="string"||utf8.encode(value.description).length>3000||!Array.isArray(value.links)||value.links.length>10)throw Error("Known-neuron metadata exceeds reviewed bounds.");
  for(const link of value.links){if(typeof link!=="string"||utf8.encode(link).length>100)throw Error("Invalid metadata link.");const url=new URL(link);if(url.protocol!=="https:"||url.username||url.password)throw Error("Metadata links require credential-free HTTPS.");}
  return [{name:value.name,description:value.description,links:[...value.links]}];
}
export function planJson(plan) {
  const out={};
  for(const name of fields){const value=plan[name];out[name]=typeof value==="bigint"?value.toString():value instanceof Uint8Array?bytesHex(value):value;}
  out.profile=variant(plan.profile);out.network=variant(plan.network);out.owner=plan.owner.toText();out.dendrite_service=plan.dendrite_service.toText();
  out.managers=Array.from(plan.managers,String);out.committed_topics=Array.from(plan.committed_topics);out.following=Array.from(plan.following,f=>({topic:f.topic,followees:Array.from(f.followees,String)}));out.metadata=plan.metadata[0]??null;
  return out;
}
export function parseCreationPlan(value,bindings) {
  exactKeys(value,fields,"creation plan");
  if(value.version!==policy.version||value.policy_version!==STANDARD_VERSION||value.policy_revision!==SOURCE_REVISION||policy.source_revision!==SOURCE_REVISION||policy.production_lock_seconds!==MAX_DISSOLVE_DELAY_SECONDS.toString()||JSON.stringify(policy.recognised_topics)!==JSON.stringify(RECOGNISED_TOPICS))throw Error("Unsupported creation policy or bootstrap version.");
  if(!["ProductionCandidate","RecoverableTest"].includes(value.profile)||!["Ic","Local"].includes(value.network))throw Error("Unsupported creation profile/network.");
  const plan={...value,profile:{[value.profile]:null},network:{[value.network]:null},owner:Principal.fromText(value.owner),dendrite_service:Principal.fromText(value.dendrite_service)};
  if(plan.owner.isAnonymous()||plan.owner.toUint8Array().at(-1)!==2)throw Error("Creation requires the stable authenticated II principal P.");
  for(const name of ["funding_budget_e8s","icp_fee_e8s","provision_cycles","nonce","revision","stake_e8s","lock_seconds","cycle_reserve"])plan[name]=natString(value[name],{nonzero:!["nonce","lock_seconds"].includes(name)});
  for(const name of ["creation_id","bootstrap_sha256","return_account"])plan[name]=hexBytes(value[name],32);
  validateLegacyAccount(plan.return_account);
  if(bindings&&(value.origin!==bindings.origin||value.api_host!==bindings.host||value.dendrite_service!==bindings.canisterId||value.network!==(bindings.local?"Local":"Ic")))throw Error("Receipt belongs to another network, API or application origin.");
  if(value.network==="Ic"&&(value.origin!=="https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io"||value.api_host!=="https://icp-api.io"||value.dendrite_service!=="hp4av-oiaaa-aaaar-qcaha-cai"))throw Error("Unsupported production creation binding.");
  if(value.network==="Local"&&![4943,4944].some(port=>value.origin===`http://${value.dendrite_service}.localhost:${port}`&&[`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(value.api_host)))throw Error("Unsupported local creation binding.");
  if(!Array.isArray(value.managers)||!Array.isArray(value.following)||!Array.isArray(value.committed_topics))throw Error("Invalid manager/following vectors.");
  plan.managers=value.managers.map(parseNeuronId);
  const production=value.profile==="ProductionCandidate";
  if(!distinct(plan.managers,production?5:1)||(!production&&plan.managers.length!==1))throw Error("Production requires 5–15 distinct managers; recoverable tests require exactly one.");
  if(plan.lock_seconds!==(production?MAX_DISSOLVE_DELAY_SECONDS:BigInt(policy.initial_claim_lock_seconds)))throw Error("Lock choice is incompatible with the reviewed profile and pinned protocol.");
  if(plan.cycle_reserve<BigInt(policy.minimum_cycle_reserve)||plan.cycle_reserve>1_000_000_000_000n||plan.provision_cycles<1_000_000_000_000n||plan.provision_cycles>10_000_000_000_000n)throw Error("Provisioning budget or cycle reserve is outside the reviewed bound.");
  plan.committed_topics=[...value.committed_topics];
  if(!distinct(plan.committed_topics,production?1:0,16)||plan.committed_topics.some(t=>!Number.isInteger(t)||!RECOGNISED_TOPICS.includes(t)||[0,1].includes(t)))throw Error("Invalid committed-topic selection.");
  plan.following=value.following.map(f=>{exactKeys(f,["topic","followees"],"following row");if(!Number.isInteger(f.topic)||!RECOGNISED_TOPICS.includes(f.topic)||!Array.isArray(f.followees))throw Error("Unsupported following topic.");const followees=f.followees.map(parseNeuronId);if(!distinct(followees))throw Error("Duplicate/oversized delegates.");return {topic:f.topic,followees};});
  const map=new Map(plan.following.map(f=>[f.topic,f.followees]));
  if(map.size!==plan.following.length||!map.has(1)||String(map.get(1))!==String(plan.managers))throw Error("Management following must exactly match the reviewed managers.");
  if(production){if(map.size!==RECOGNISED_TOPICS.length)throw Error("Production following must cover every reviewed topic.");for(const topic of RECOGNISED_TOPICS){if(topic===1)continue;const ids=map.get(topic);if(!ids)throw Error("Missing following topic.");if(plan.committed_topics.includes(topic)){if(ids.length<3||ids.some(id=>!plan.managers.includes(id)))throw Error("Committed delegates require at least three distinct selected managers.");}else if(ids.length!==1||!policy.default_neuron_ids.includes(String(ids[0])))throw Error("Uncommitted topics require one approved singleton default.");}}
  else if(plan.following.length!==1||plan.committed_topics.length)throw Error("Test profile supports only topic-1 following.");
  plan.metadata=metadata(value.metadata);return plan;
}
export function creationPlanDigest(p){const out=[...utf8.encode("dendrite-creation-plan-v1")];
  const number=(value,width)=>{let n=BigInt(value);for(let i=0;i<width;i++){out.push(Number(n&255n));n>>=8n;}if(n!==0n)throw Error("Plan digest integer overflow.");};
  const blob=value=>{number(value.length,4);out.push(...value);},text=value=>blob(utf8.encode(value)),ids=value=>{number(value.length,4);for(const id of value)number(id,8);};
  number(p.version,2);out.push(variant(p.profile)==="ProductionCandidate"?1:0);blob(p.owner.toUint8Array());out.push(variant(p.network)==="Ic"?1:0);blob(p.dendrite_service.toUint8Array());text(p.origin);text(p.api_host);
  for(const n of [p.funding_budget_e8s,p.icp_fee_e8s,p.provision_cycles])number(n,8);text(p.policy_version);blob(p.creation_id);number(p.nonce,8);number(p.revision,8);text(p.policy_revision);blob(p.bootstrap_sha256);ids(p.managers);
  number(p.committed_topics.length,4);for(const topic of p.committed_topics)number(topic,4);number(p.following.length,4);for(const row of p.following){number(row.topic,4);ids(row.followees);}
  for(const n of [p.stake_e8s,p.lock_seconds,p.cycle_reserve])number(n,8);blob(p.return_account);out.push(p.metadata.length?1:0);if(p.metadata.length){const m=p.metadata[0];text(m.name);text(m.description);number(m.links.length,4);for(const link of m.links)text(link);}return sha256Hex(Uint8Array.from(out));
}
export function bootstrapReadinessMarker(s){const id=s.controller.toUint8Array(),phase=["AwaitingStake","Configuring","AwaitingLock","AwaitingRegistration","RecoverableTestReady","Rehearsing","Sealed","Recovering","Recovered"].indexOf(variant(s.phase));
  if(s.plan_digest.length!==32||phase<0||s.sequence<0n||s.sequence>0xffffffffffffffffn)throw Error("Malformed bootstrap readiness marker.");
  const out=[...utf8.encode("dendrite-bootstrap-readiness-v1"),id.length,...id,...s.plan_digest];const number=n=>{for(let i=0;i<8;i++){out.push(Number(n&255n));n>>=8n;}};
  number(s.sequence);out.push(phase,s.pending.length?1:0,s.neuron_id.length?1:0);if(s.neuron_id.length)number(s.neuron_id[0]);out.push(s.external_proposal?.[0]?.proposal_id.length===0?1:0);return sha256Hex(Uint8Array.from(out));
}
const immutableRevisionFields=["version","profile","owner","network","dendrite_service","origin","api_host","funding_budget_e8s","icp_fee_e8s","provision_cycles","policy_version","creation_id","nonce","policy_revision","bootstrap_sha256","lock_seconds","return_account"];
export function validateCreationRevision(previous,next){const before=planJson(previous),after=planJson(next);
  if(next.revision!==previous.revision+1n||immutableRevisionFields.some(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])))throw Error("A plan revision cannot change profile, creator, funding, controller derivation, return account or artifact bindings.");return next;}
export function createCreationRevision(previous,input,bindings,bootstrap){
  const candidate=createCreationPlan({...input,ledgerFeeE8s:previous.icp_fee_e8s},previous.owner,bindings,bootstrap),before=planJson(previous),after=planJson(candidate);
  if(input.profile!==before.profile)throw Error("A profile change requires a fresh creation; it cannot revise this receipt.");
  for(const key of immutableRevisionFields)after[key]=before[key];after.revision=String(previous.revision+1n);
  return validateCreationRevision(previous,parseCreationPlan(after,bindings));
}
export function createCreationPlan(input,owner,bindings,bootstrap) {
  const creationId=crypto.getRandomValues(new Uint8Array(32)),nonce=BigInt(Date.now())*1_000_000n;
  const managers=input.managers.map(String),production=input.profile==="ProductionCandidate",committed=production?input.committedTopics:[];
  const following=production?RECOGNISED_TOPICS.map(topic=>({topic,followees:topic===1?managers:committed.includes(topic)?input.delegates[String(topic)].map(String):[input.defaultNeuronId]})):[{topic:1,followees:managers}];
  return parseCreationPlan({version:policy.version,profile:input.profile,owner:owner.toText(),network:bindings.local?"Local":"Ic",dendrite_service:bindings.canisterId,origin:bindings.origin,api_host:bindings.host,
    funding_budget_e8s:parseIcpToE8s(input.provisionIcp).toString(),icp_fee_e8s:String(input.ledgerFeeE8s),provision_cycles:String(input.provisionCycles),policy_version:STANDARD_VERSION,creation_id:bytesHex(creationId),nonce:nonce.toString(),revision:"1",policy_revision:SOURCE_REVISION,bootstrap_sha256:bootstrap.sha256,
    managers,committed_topics:committed,following,stake_e8s:parseIcpToE8s(input.stakeIcp).toString(),lock_seconds:production?policy.production_lock_seconds:policy.initial_claim_lock_seconds,cycle_reserve:policy.minimum_cycle_reserve,
    return_account:input.returnAccount?bytesHex(validateLegacyAccount(input.returnAccount)):bytesHex(legacyAccount(owner)),metadata:input.metadata??null},bindings);
}

export async function creationPreflight(plan,{actor,readSystem,targetId,onProtocolReport=()=>{},now=BigInt(Math.floor(Date.now()/1000))}) {
  const economics=await actor.get_network_economics_parameters();
  for(const field of ["neuron_minimum_stake_e8s","reject_cost_e8s","transaction_fee_e8s","neuron_management_fee_per_proposal_e8s"])if(typeof economics?.[field]!=="bigint"||economics[field]<0n)throw Error("Current network economics are unavailable.");
  if(plan.stake_e8s<economics.neuron_minimum_stake_e8s)throw Error("Reviewed stake is below the current network minimum; funding is blocked.");
  const protocol=await inspectCreationProtocols(readSystem,plan.network);onProtocolReport(protocol);
  if(!protocol.ok){const error=Error("Required certified protocol state is unavailable or an Unreviewed deployed protocol module was found; creation is blocked before spending.");error.protocol=protocol;throw error;}
  const votingMinimumSeconds=creationVotingMinimum(economics,protocol.rows.find(row=>row.canister==="rrkah-fqaaa-aaaaa-aaaaq-cai").moduleHash);
  if(variant(plan.profile)==="ProductionCandidate"&&plan.lock_seconds<votingMinimumSeconds)throw Error("Current network voting minimum exceeds the pinned Standard lock. Creation is blocked before spending; the Standard lock is unchanged.");
  if(plan.metadata.length){const known=await actor.list_known_neurons();
    if(!Array.isArray(known?.known_neurons)||known.known_neurons.length>5000||new Set(known.known_neurons.map(n=>String(n.id?.[0]?.id))).size!==known.known_neurons.length||known.known_neurons.some(n=>!n.id?.[0]?.id||!n.known_neuron_data?.[0]))throw Error("Known-neuron catalogue is incomplete, malformed or exceeds the reviewed preflight bound.");
    if(known.known_neurons.some(n=>n.known_neuron_data[0].name===plan.metadata[0].name&&n.id[0].id!==targetId))throw Error("Proposed known-neuron name already belongs to another neuron. No funding or proposal submission was made.");}
  const response=await actor.list_neurons({neuron_ids:plan.managers,include_neurons_readable_by_caller:false,include_empty_neurons_readable_by_caller:[false],include_public_neurons_in_full_neurons:[true],page_number:[0n],page_size:[15n],neuron_subaccounts:[]});
  if(!Array.isArray(response?.full_neurons)||response.full_neurons.length!==plan.managers.length||response.total_pages_available?.[0]!==1n)throw Error("Required manager evidence is missing, oversized or unavailable.");
  const seen=new Set(),managers=[];
  for(const full of response.full_neurons){const id=full.id?.[0]?.id;if(typeof id!=="bigint"||!plan.managers.includes(id)||seen.has(String(id)))throw Error("Duplicate, unexpected or malformed manager response.");seen.add(String(id));
    const info=await actor.get_neuron_info(id);if(info.Err)throw Error(`Manager ${id} metadata is unavailable.`);const scalar=info.Ok;
    if(scalar?.id?.[0]?.id!==id||typeof scalar.retrieved_at_timestamp_seconds!=="bigint"||scalar.retrieved_at_timestamp_seconds>now+300n||scalar.retrieved_at_timestamp_seconds<now-300n)throw Error("Stale or wrong-ID manager metadata.");
    if(full.visibility?.[0]!==2||scalar.visibility?.[0]!==2||!scalar.known_neuron_data?.length)throw Error(`Manager ${id} is not a public known neuron.`);
    if(!Array.isArray(full.followees)||full.followees.length>64||new Set(full.followees.map(([topic])=>topic)).size!==full.followees.length)throw Error("Malformed manager following map.");
    for(const f of plan.following){if(f.topic!==1&&f.followees.includes(id)){const actual=full.followees.find(([topic])=>topic===f.topic)?.[1]?.followees;if(actual?.length!==1||actual[0]?.id!==OMEGA_REJECT_NEURON_ID)throw Error(`Manager ${id} is not ready: topic ${f.topic} must follow only omega-reject.`);}}
    const role=full.controller?.[0]?.toText()===plan.owner.toText()?"Controller":full.hot_keys?.some(p=>p.toText()===plan.owner.toText())?"Hotkey":"No authority";
    managers.push({id,full,scalar,role});
  }
  if(!managers.some(m=>m.role!=="No authority"))throw Error("Creator has no observed authority on a proposed manager. Listing a known neuron is not its owner's consent.");
  return {economics,managers,votingMinimumSeconds,protocol,observedAt:now};
}
