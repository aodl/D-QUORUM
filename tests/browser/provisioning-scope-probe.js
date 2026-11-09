// Test-only real-II/replica probe, excluded from production assets.
import {Actor,HttpAgent} from '@icp-sdk/core/agent';
import {IDL} from '@icp-sdk/core/candid';
import {Principal} from '@icp-sdk/core/principal';
import {deriveProvisioningSession} from '@dendrite-auth';
import {createProvisioningActors,encodeBootstrapPlan,createCanisterWithWitness,bootstrapStatusWithWitness,verifyCreationWitness,verifyOriginalCreationBurn} from '@dendrite-creation-protocol';
import {legacyAccount,principalSubaccount,fundingSubaccount,sha256Hex,hexBytes} from '@dendrite-creation-accounts';
import {createCertifiedCanisterStateReader} from '@dendrite-system-state';
const pause=()=>new Promise(r=>setTimeout(r,100));
async function consent(label){const b=document.createElement('button');b.textContent=label;document.body.append(b);await new Promise(r=>b.onclick=r);b.remove();}
const arg=c=>({canister_id:Principal.fromText(c)});
export async function provisioningScopeProbe(parent,key){
 const owner=parent.getPrincipal(),creationId=crypto.getRandomValues(new Uint8Array(32)),subaccount=fundingSubaccount(owner,creationId);globalThis.scopeProvisioningPhase={principal:owner.toText()};
 while(!globalThis.scopeProvisioningFunded)await pause();
 await consent('Approve local funding capability probe');
 const funding=await deriveProvisioningSession(parent,key,'FundProvisioning');
 const {ledger,cmc,cycles}=await createProvisioningActors(funding);
 const fee=await ledger.icrc1_fee();
 const paid=await ledger.icrc1_transfer({from_subaccount:[],to:{owner:Principal.fromText('rkp4c-7iaaa-aaaaa-aaaca-cai'),subaccount:[principalSubaccount(owner)]},fee:[fee],amount:200_000_000n,memo:[new Uint8Array([77,73,78,84,0,0,0,0])],created_at_time:[BigInt(Date.now())*1_000_000n]});
 if(paid.Err)throw Error('signed payment failed');
 const minted=await cmc.notify_mint_cycles({block_index:paid.Ok,to_subaccount:[subaccount],deposit_memo:[]});if(minted.Err)throw Error('signed conversion failed');
 const creation={from_subaccount:[subaccount],created_at_time:[BigInt(Date.now())*1_000_000n],amount:2_000_000_000_000n,creation_args:[{settings:[{controllers:[[owner]],compute_allocation:[0n],memory_allocation:[0n],freezing_threshold:[2_592_000n]}],subnet_selection:[{Filter:{subnet_type:[]}}]}]};
 const creationProof=await createCanisterWithWitness(cycles,creation);const created=creationProof.value;if(created.Err)throw Error('signed creation failed');const c=created.Ok.canister_id.toText();
 await verifyOriginalCreationBurn(cycles,created.Ok.block_id,creation,owner);
 const repeated=await cycles.create_canister(creation);if(repeated.Err?.Duplicate?.canister_id?.[0]?.toText()!==c)throw Error('duplicate did not recover C');
 const rawManagement=async(identity,target)=>Actor.createActor(()=>IDL.Service({canister_status:IDL.Func([IDL.Record({canister_id:IDL.Principal})],[IDL.Reserved],[])}),{agent:await HttpAgent.create({host:__DENDRITE_API_HOST__,shouldFetchRootKey:__DENDRITE_FETCH_ROOT_KEY__,identity,retryTimes:0}),canisterId:'aaaaa-aa',effectiveCanisterId:target});
 let fundingManagementDenied=false;try{await(await rawManagement(funding.signingIdentity,c)).canister_status(arg(c));}catch(e){fundingManagementDenied=/delegation|target/i.test(String(e.message));}
 if(!fundingManagementDenied)throw Error('replica did not deny funding child management call');
 await consent('Approve local management capability probe');
 const manage=await deriveProvisioningSession(parent,key,'ManageBootstrap',c);const {management}=await createProvisioningActors(manage);
 const before=await management.canister_status(arg(c));if(before.module_hash.length||before.settings.controllers.map(p=>p.toText()).join(',')!==owner.toText()||before.version!==0n)throw Error('wrong created controller/module/initial version');
 const bytes=new Uint8Array(await(await fetch('/generated/provisioning-bootstrap.wasm')).arrayBuffer());if(sha256Hex(bytes)!==__SCOPE_BOOTSTRAP_SHA256__)throw Error('bootstrap checksum mismatch');
 const plan={version:1,profile:{RecoverableTest:null},owner,network:{Local:null},dendrite_service:Principal.fromText(__DENDRITE_CANISTER_ID__),origin:__DENDRITE_DERIVATION_ORIGIN__,api_host:__DENDRITE_API_HOST__,funding_budget_e8s:200_010_000n,icp_fee_e8s:fee,provision_cycles:2_000_000_000_000n,policy_version:"nns-dendrite/1.1-draft",creation_id:creationId,nonce:9042n,revision:1n,policy_revision:'d55a0f4d4edfabe49d8fd543aff473084cb741f2',bootstrap_sha256:hexBytes(__SCOPE_BOOTSTRAP_SHA256__,32),managers:[100n],committed_topics:[],following:[{topic:1,followees:[100n]}],stake_e8s:100_000_000n,lock_seconds:604_800n,cycle_reserve:100_000_000_000n,return_account:legacyAccount(owner),metadata:[]};
 const install={...arg(c),mode:{install:null},wasm_module:bytes,arg:encodeBootstrapPlan(plan),sender_canister_version:[]};
 await management.install_code(install);const installed=await management.canister_status(arg(c));
 if(Array.from(installed.module_hash[0],n=>n.toString(16).padStart(2,'0')).join('')!==__SCOPE_BOOTSTRAP_SHA256__)throw Error('installed hash mismatch');
 const call=await deriveProvisioningSession(parent,key,'CallBootstrap',c);const {bootstrap}=await createProvisioningActors(call);const stateProof=await bootstrapStatusWithWitness(bootstrap,1n);const state=stateProof.value;
 if(state.Ok?.controller.toText()!==c||state.Ok?.plan.owner.toText()!==owner.toText())throw Error('scoped bootstrap call failed');
 let exactBootstrapManagementDenied=false;try{await(await rawManagement(call.signingIdentity,c)).canister_status(arg(c));}catch(e){exactBootstrapManagementDenied=/delegation|target/i.test(String(e.message));}
 const second=await cycles.create_canister({...creation,created_at_time:[creation.created_at_time[0]+1n]});if(second.Err)throw Error('second owned control creation failed');
 let sameManagementScopeCanReadOtherOwnedCanister=false;
 try{await(await rawManagement(manage.signingIdentity,second.Ok.canister_id)).canister_status({canister_id:second.Ok.canister_id});sameManagementScopeCanReadOtherOwnedCanister=true;}catch(e){if(!/delegation|target/i.test(String(e.message)))throw e;}
 await management.stop_canister(arg(c));if(!Object.hasOwn((await management.canister_status(arg(c))).status,'stopped'))throw Error('stop not confirmed');
 await management.uninstall_code({...arg(c),sender_canister_version:[]});let observed=await createCertifiedCanisterStateReader().read(c);
 if((await management.canister_status(arg(c))).version<=before.version)throw Error('uninstalled canister version cannot be mistaken for an untouched creation');
 if(observed.moduleHash||observed.controllers.map(p=>p.toText()).join(',')!==owner.toText())throw Error('uninstall failed or removed P prematurely');
 await management.update_settings({...arg(c),settings:{controllers:[[]],compute_allocation:[],memory_allocation:[],freezing_threshold:[]},sender_canister_version:[]});observed=await createCertifiedCanisterStateReader().read(c);
 if(observed.moduleHash||observed.controllers.length)throw Error('certified final controller/module state mismatch');
 const historicalCreation=await verifyCreationWitness(creationProof.witness,{agent:Actor.agentOf(cycles),canisterId:'um5iw-rqaaa-aaaaq-qaaba-cai',owner,methodName:'create_canister',includeSystemState:false});
 const historicalState=await verifyCreationWitness(stateProof.witness,{agent:Actor.agentOf(bootstrap),canisterId:c,owner,methodName:'status',includeSystemState:true});
 if(historicalCreation.value.Ok?.canister_id.toText()!==c||historicalState.value.Ok?.controller.toText()!==c||Array.from(historicalState.system.moduleHash,n=>n.toString(16).padStart(2,'0')).join('')!==__SCOPE_BOOTSTRAP_SHA256__)throw Error('historical provenance failed after uninstall');
 let reinstallDenied=false;try{await management.install_code(install);}catch(e){reinstallDenied=/controller|not authorized|not authorised/i.test(String(e.message));}if(!reinstallDenied)throw Error('creator retained reinstall authority');
 return {principal:owner.toText(),canister:c,otherOwnedCanister:second.Ok.canister_id.toText(),paymentBlock:paid.Ok.toString(),minted:minted.Ok.minted.toString(),creationBlock:created.Ok.block_id.toString(),bootstrapHash:__SCOPE_BOOTSTRAP_SHA256__,historicalProvenanceVerifiedAfterUninstall:true,principalPreserved:manage.principal.toText()===owner.toText()&&call.principal.toText()===owner.toText(),fundingManagementDenied,exactBootstrapManagementDenied,sameManagementScopeCanReadOtherOwnedCanister,soleControllerVerified:true,installedHashVerified:true,bootstrapCallSucceeded:true,stopVerified:true,uninstallBeforeControllerRemoval:true,certifiedModuleAbsent:true,certifiedControllersEmpty:true,reinstallDenied};
}
