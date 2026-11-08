// Test-only entry: installed only in the isolated local-browser fixture, never production assets.
import { AuthClient } from '@icp-sdk/auth/client';
import { DelegationChain, DelegationIdentity, ECDSAKeyIdentity } from '@icp-sdk/core/identity';
import { Actor, HttpAgent } from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import { deriveGovernanceSession, identityConfiguration, validateGovernanceDelegation } from '@dendrite-auth';
import { createAuthenticatedNnsActor } from '@dendrite-nns';
import { provisioningScopeProbe } from './provisioning-scope-probe.js';
const button = document.createElement('button');button.textContent='Sign in with Internet Identity';document.body.append(button);
button.onclick=async()=>{
 button.disabled=true;
 let client;
 try {
  const config=identityConfiguration(), key=await ECDSAKeyIdentity.generate();
  client=new AuthClient({identity:key,identityProvider:config.identityProvider,storage:{async get(){return null;},async set(){},async remove(){}},idleOptions:{disableIdle:true}});
  const bootstrap=await client.signIn();
  let unrestrictedRejected=false;
  try{await createAuthenticatedNnsActor(bootstrap);}catch(error){unrestrictedRejected=/Unrestricted/.test(String(error.message));}
  if(!unrestrictedRejected)throw Error('raw bootstrap accepted at transaction boundary');
  const session=await deriveGovernanceSession(bootstrap,key.getPublicKey().toDer());
  if(session.principal.toText()!==bootstrap.getPrincipal().toText())throw Error('principal changed');
  await client.signOut();
  if(Object.hasOwn(localStorage,'ic-delegation_expiration'))throw Error('bootstrap SDK expiry marker persisted');
  validateGovernanceDelegation(session.signingIdentity);
  const governance=await createAuthenticatedNnsActor(session.signingIdentity);
  const metadata=await governance.get_neuron_info(100n);
  if(metadata.Ok?.id?.[0]?.id!==100n)throw Error('signed Governance read failed');
  const refused=await governance.manage_neuron({id:[],neuron_id_or_subaccount:[{NeuronId:{id:100n}}],command:[{Follow:{topic:4,followees:[]}}]});
  if(refused.command?.[0]?.Error?.error_type!==3)throw Error('unlisted real II principal was not rejected by Governance');
  const factory=()=>IDL.Service({check_neuron:IDL.Func([IDL.Nat64],[IDL.Variant({Ok:IDL.Reserved,Err:IDL.Reserved})],[])});
  const destination=__DENDRITE_CANISTER_ID__;
  const replicaRejections=[];
  const recordingFetch=async(...args)=>{const response=await fetch(...args);if(!response.ok){const text=await response.clone().text();replicaRejections.push({status:response.status,delegation:/delegation/i.test(text),target:/target/i.test(text),signature:/signature/i.test(text),expired:/expir/i.test(text)});}return response;};
  const make=async identity=>Actor.createActor(factory,{agent:await HttpAgent.create({host:__DENDRITE_API_HOST__,shouldFetchRootKey:__DENDRITE_FETCH_ROOT_KEY__,identity,fetch:recordingFetch,retryTimes:0}),canisterId:destination});
  const control=await make(await ECDSAKeyIdentity.generate());
  await control.check_neuron(100n);
  let scopeDenied=false, denial='';
  try{await (await make(session.signingIdentity)).check_neuron(100n);}catch(error){denial=String(error.message).slice(0,2000);scopeDenied=/delegation|target/i.test(denial)&&replicaRejections.some(result=>result.delegation&&result.target);}
  if(!scopeDenied)throw Error('replica did not reject non-Governance request because of delegation scope: '+JSON.stringify(replicaRejections));
  const govFactory=()=>IDL.Service({get_neuron_info:IDL.Func([IDL.Nat64],[IDL.Reserved],[])});
  const rejects=async identity=>{
   const before=replicaRejections.length;
   try{const agent=await HttpAgent.create({host:__DENDRITE_API_HOST__,shouldFetchRootKey:__DENDRITE_FETCH_ROOT_KEY__,identity,fetch:recordingFetch,retryTimes:0});await Actor.createActor(govFactory,{agent,canisterId:'rrkah-fqaaa-aaaaa-aaaaq-cai'}).get_neuron_info(100n);return false;}
   catch(error){return /expired|signature|delegation|target|public.key|algorithm|DER/i.test(String(error.message))&&replicaRejections.length>before;}
  };
  const malformed={};
  const unrelated=await ECDSAKeyIdentity.generate();
  const malformedKey=await DelegationChain.create(bootstrap,{toDer:()=>new Uint8Array([1,2,3])},new Date(Date.now()+60000),{previous:bootstrap.getDelegation(),targets:session.signingIdentity.getDelegation().delegations.at(-1).delegation.targets});
  malformed.invalidDerKey=await rejects(DelegationIdentity.fromDelegation(unrelated,malformedKey));
  malformed.wrongSigningKey=await rejects(DelegationIdentity.fromDelegation(unrelated,session.signingIdentity.getDelegation()));
  const parent=bootstrap.getDelegation();
  const self=await DelegationChain.create(bootstrap,key.getPublicKey(),new Date(Date.now()+60000),{previous:parent,targets:session.signingIdentity.getDelegation().delegations.at(-1).delegation.targets});
  malformed.selfSignedParent=await rejects(DelegationIdentity.fromDelegation(key,self));
  const expired=await DelegationChain.create(bootstrap,unrelated.getPublicKey(),new Date(Date.now()-60000),{previous:parent,targets:session.signingIdentity.getDelegation().delegations.at(-1).delegation.targets});
  malformed.expiredChild=await rejects(DelegationIdentity.fromDelegation(unrelated,expired));
  const next=await ECDSAKeyIdentity.generate();
  const expiredParent=await DelegationChain.create(DelegationIdentity.fromDelegation(unrelated,expired),next.getPublicKey(),new Date(Date.now()+60000),{previous:expired,targets:session.signingIdentity.getDelegation().delegations.at(-1).delegation.targets});
  malformed.expiredParent=await rejects(DelegationIdentity.fromDelegation(next,expiredParent));
  const wrongParent=await DelegationChain.create(bootstrap,unrelated.getPublicKey(),new Date(Date.now()+60000),{previous:parent,targets:[(await import('@icp-sdk/core/principal')).Principal.fromText(destination)]});
  const forbidden=await DelegationChain.create(DelegationIdentity.fromDelegation(unrelated,wrongParent),next.getPublicKey(),new Date(Date.now()+50000),{previous:wrongParent,targets:session.signingIdentity.getDelegation().delegations.at(-1).delegation.targets});
  malformed.wrongTargetParent=await rejects(DelegationIdentity.fromDelegation(next,forbidden));
  if(Object.values(malformed).some(value=>!value))throw Error('replica accepted an invalid delegation chain');
  // Public summaries only. No keys, signatures, delegation objects or envelopes.
  const provisioning=await provisioningScopeProbe(bootstrap,key.getPublicKey().toDer());
  globalThis.scopeProbeResult={provisioning,principal:session.principal.toText(),principalPreserved:true,parentExpirations:parent.delegations.map(link=>link.delegation.expiration.toString()),childExpiration:session.signingIdentity.getDelegation().delegations.at(-1).delegation.expiration.toString(),invalidChainsRejected:malformed,unrestrictedRejected,allowedGovernanceRead:true,unauthorisedGovernanceError:3,controlDestinationSucceeded:true,nonGovernanceScopeDenied:scopeDenied,denialClassification:'replica HTTP rejection with delegation/target diagnostic; status recorded rather than assumed',replicaRejections,links:session.signingIdentity.getDelegation().delegations.length,finalTargets:['rrkah-fqaaa-aaaaa-aaaaq-cai']};
  document.body.append(document.createTextNode('Scope probe complete'));
 }catch(error){document.body.append(document.createTextNode('Scope probe failed: '+error.message));throw error;}
 finally{if(client)await client.signOut();}
};
