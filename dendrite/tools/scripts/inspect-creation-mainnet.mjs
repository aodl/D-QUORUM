// Anonymous query/read_state only. Never obtain a signer or dispatch an update.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {HttpAgent,AnonymousIdentity} from '@icp-sdk/core/agent';
import {IDL} from '@icp-sdk/core/candid';
import {createCertifiedCanisterStateReader} from '../../canisters/dendrite/web/src/certified-canister-state.js';
import {inspectCreationProtocols} from '../../canisters/dendrite/web/src/creation-protocol-compatibility.js';
import {creationPreflight,createCreationPlan} from '../../canisters/dendrite/web/src/creation-plan.js';
import {idlFactory} from '../../src/declarations/nns-governance/nns-governance.did.js';
const host='https://icp-api.io',gov='rrkah-fqaaa-aaaaa-aaaaq-cai',canisterId='hp4av-oiaaa-aaaar-qcaha-cai';
const agent=await HttpAgent.create({host,identity:new AnonymousIdentity(),shouldFetchRootKey:false,verifyQuerySignatures:true,retryTimes:0});
const state=createCertifiedCanisterStateReader({host,fetchRootKey:false});
const protocol=await inspectCreationProtocols(state.read,'Ic');
const result={observed_at:new Date().toISOString(),host,certification:'Production IC root key; BLS signature, delegation, canister and timestamp verification enabled',protocol,update_calls:0};
async function query(method,args){const signature=idlFactory({IDL})._fields.find(([name])=>name===method)[1];const response=await agent.query(gov,{methodName:method,arg:IDL.encode(signature.argTypes,args)});if(response.status!=='replied')throw Error(response.reject_message??response.status);return IDL.decode(signature.retTypes,response.reply.arg)[0];}
try{
 const manager=BigInt(process.argv[2]??'2947465672511369');
 const actor=Object.fromEntries(['get_network_economics_parameters','list_neurons','get_neuron_info'].map(method=>[method,(...args)=>query(method,args)]));
 const response=await actor.list_neurons({neuron_ids:[manager],include_neurons_readable_by_caller:false,include_empty_neurons_readable_by_caller:[false],include_public_neurons_in_full_neurons:[true],page_number:[0n],page_size:[15n],neuron_subaccounts:[]});
 const full=response.full_neurons.find(n=>n.id[0]?.id===manager);
 const owner=[...(full?.controller??[]),...(full?.hot_keys??[])].find(p=>!p.isAnonymous()&&p.toUint8Array().at(-1)===2);
 if(!owner)throw Error('Public manager has no observed self-authenticating creator authority for this read-only conditional preflight.');
 const economics=await actor.get_network_economics_parameters();
 const release=process.env.DENDRITE_BOOTSTRAP_RELEASE_DIR??new URL('../../dist/release/bootstrap/',import.meta.url).pathname;
 const manifest=JSON.parse(await readFile(resolve(release,'manifest.json'),'utf8'));
 const bytes=await readFile(resolve(release,'bootstrap.wasm'));
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256||bytes.length!==manifest.bytes)throw Error('Bootstrap manifest/bytes mismatch.');
 const plan=createCreationPlan({profile:'RecoverableTest',managers:[String(manager)],stakeIcp:'2',provisionIcp:'1',provisionCycles:'2000000000000',ledgerFeeE8s:economics.transaction_fee_e8s},owner,{local:false,host,canisterId,origin:`https://${canisterId}.icp0.io`},manifest);
 // The verified release hash is only a planner binding; no bootstrap,
 // delegation, II login or monetary request is created or used.
 const checked=await creationPreflight(plan,{actor,readSystem:state.read});
 result.preflight={ok:true,bootstrap_sha256:manifest.sha256,manager:String(manager),observed_authority:owner.toText(),role:checked.managers[0].role,voting_minimum_seconds:String(checked.votingMinimumSeconds),scope:'Actual anonymous production reads; conditional on signing in as the observed manager authority. Does not prove an II session or qualify writes.'};
}catch(error){result.preflight={ok:false,error:error.message};}
console.log(JSON.stringify(result,null,2));
if(!protocol.ok||!result.preflight.ok)process.exitCode=1;
