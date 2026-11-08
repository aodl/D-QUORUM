import {Principal} from "@icp-sdk/core/principal";
import policy from "../../../../src/declarations/bootstrap/policy.json" with {type:"json"};
import protocolPins from "../../../../src/declarations/bootstrap/protocol-pins.json" with {type:"json"};
import {parseNeuronId} from "./ids.js";
import {parseIcpToE8s} from "./transaction.js";
import {RECOGNISED_TOPICS, SOURCE_REVISION, OMEGA_REJECT_NEURON_ID} from "./preliminary-evidence.js";
import {MAX_DISSOLVE_DELAY_SECONDS, STANDARD_VERSION} from "./preliminary-evaluator.js";
import {encodeBootstrapPlan} from "./creation-protocol.js";
import {bytesHex,hexBytes,sha256Hex,legacyAccount,validateLegacyAccount} from "./creation-accounts.js";

export const CREATION_POLICY=Object.freeze(policy);
export const CREATION_PROTOCOL_PINS=Object.freeze(protocolPins);
const fields=["version","profile","owner","network","dendrite_service","origin","api_host","funding_budget_e8s","provision_cycles","policy_version","creation_id","nonce","revision","policy_revision","bootstrap_sha256","managers","committed_topics","following","stake_e8s","lock_seconds","cycle_reserve","return_account","metadata"];
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
  out.managers=plan.managers.map(String);out.following=plan.following.map(f=>({topic:f.topic,followees:f.followees.map(String)}));out.metadata=plan.metadata[0]??null;
  return out;
}
export function parseCreationPlan(value,bindings) {
  exactKeys(value,fields,"creation plan");
  if(value.version!==policy.version||value.policy_version!==STANDARD_VERSION||value.policy_revision!==SOURCE_REVISION||policy.source_revision!==SOURCE_REVISION||policy.production_lock_seconds!==MAX_DISSOLVE_DELAY_SECONDS.toString()||JSON.stringify(policy.recognised_topics)!==JSON.stringify(RECOGNISED_TOPICS))throw Error("Unsupported creation policy or bootstrap version.");
  if(!["ProductionCandidate","RecoverableTest"].includes(value.profile)||!["Ic","Local"].includes(value.network))throw Error("Unsupported creation profile/network.");
  const plan={...value,profile:{[value.profile]:null},network:{[value.network]:null},owner:Principal.fromText(value.owner),dendrite_service:Principal.fromText(value.dendrite_service)};
  if(plan.owner.isAnonymous()||plan.owner.toUint8Array().at(-1)!==2)throw Error("Creation requires the stable authenticated II principal P.");
  for(const name of ["funding_budget_e8s","provision_cycles","nonce","revision","stake_e8s","lock_seconds","cycle_reserve"])plan[name]=natString(value[name],{nonzero:!["nonce","lock_seconds"].includes(name)});
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
export const creationPlanDigest=plan=>sha256Hex(encodeBootstrapPlan(plan));
export function createCreationPlan(input,owner,bindings,bootstrap) {
  const creationId=crypto.getRandomValues(new Uint8Array(32)),nonceBytes=crypto.getRandomValues(new Uint8Array(8));
  const managers=input.managers.map(String),production=input.profile==="ProductionCandidate",committed=production?input.committedTopics:[];
  const following=production?RECOGNISED_TOPICS.map(topic=>({topic,followees:topic===1?managers:committed.includes(topic)?input.delegates[String(topic)].map(String):[input.defaultNeuronId]})):[{topic:1,followees:managers}];
  return parseCreationPlan({version:policy.version,profile:input.profile,owner:owner.toText(),network:bindings.local?"Local":"Ic",dendrite_service:bindings.canisterId,origin:bindings.origin,api_host:bindings.host,
    funding_budget_e8s:parseIcpToE8s(input.provisionIcp).toString(),provision_cycles:String(input.provisionCycles),policy_version:STANDARD_VERSION,creation_id:bytesHex(creationId),nonce:new DataView(nonceBytes.buffer).getBigUint64(0).toString(),revision:"1",policy_revision:SOURCE_REVISION,bootstrap_sha256:bootstrap.sha256,
    managers,committed_topics:committed,following,stake_e8s:parseIcpToE8s(input.stakeIcp).toString(),lock_seconds:production?policy.production_lock_seconds:policy.initial_claim_lock_seconds,cycle_reserve:policy.minimum_cycle_reserve,
    return_account:input.returnAccount?bytesHex(validateLegacyAccount(input.returnAccount)):bytesHex(legacyAccount(owner)),metadata:input.metadata??null},bindings);
}

export async function creationPreflight(plan,{actor,readSystem,now=BigInt(Math.floor(Date.now()/1000))}) {
  const economics=await actor.get_network_economics_parameters();
  for(const field of ["neuron_minimum_stake_e8s","reject_cost_e8s","transaction_fee_e8s","neuron_management_fee_per_proposal_e8s"])if(typeof economics?.[field]!=="bigint"||economics[field]<0n)throw Error("Current network economics are unavailable.");
  if(plan.stake_e8s<economics.neuron_minimum_stake_e8s)throw Error("Reviewed stake is below the current network minimum; funding is blocked.");
  for(const [canister,hash] of Object.entries(protocolPins.modules)){const state=await readSystem(canister);if(!state.moduleHash||bytesHex(state.moduleHash)!==hash)throw Error(`Unreviewed deployed protocol module ${canister}; creation is blocked before spending.`);}
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
  return {economics,managers,observedAt:now};
}
