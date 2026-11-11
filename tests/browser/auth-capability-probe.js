// Isolated test entry. Calls the production factories; private sessions remain
// in this browser closure. Only bounded public outcomes cross to the harness.
import {createBrowserAuthSession,createBrowserProvisioningSession} from '@dendrite-auth';
import {createAuthenticatedNnsActor} from '@dendrite-nns';
import {createProvisioningActors} from '@dendrite-creation-protocol';
import {Actor,HttpAgent} from '@icp-sdk/core/agent';
import {IDL} from '@icp-sdk/core/candid';
import {Principal} from '@icp-sdk/core/principal';
const bootstrap=new URL(location.href).searchParams.get('canister');
const profiles=['Governance','FundProvisioning','ManageBootstrap','CallBootstrap'];
let active,pending,flight,generation=0;
const status=document.createElement('p');document.body.append(status);
const publish=result=>{globalThis.authLifecycleResult=Object.freeze(result);status.textContent=JSON.stringify(result);};
const reset=async()=>{
 generation++;const cancelled=flight;await pending?.signOut();await active?.manager.signOut();active=undefined;pending=undefined;
 publish({busy:false,principal:null,hasSession:false});
 if(cancelled)void cancelled.done.then(async()=>{const restored=await cancelled.manager.restore();globalThis.authLifecycleCancellationResult={factoryRejected:!cancelled.returned,noSession:restored===null};});
};
async function denied(session,canisterId,method,args,factory){
 const rejections=[];
 const agent=await HttpAgent.create({host:__DENDRITE_API_HOST__,shouldFetchRootKey:__DENDRITE_FETCH_ROOT_KEY__,identity:session.signingIdentity,retryTimes:0,fetch:async(...args)=>{const r=await fetch(...args);if(!r.ok){const text=await r.clone().text();rejections.push(/delegation/i.test(text)&&/target/i.test(text));}return r;}});
 try{await Actor.createActor(factory,{agent,canisterId})[method](...args);return false;}
 catch{return rejections.includes(true);}
}
const govFactory=()=>IDL.Service({get_neuron_info:IDL.Func([IDL.Nat64],[IDL.Reserved],[])});
const ledgerFactory=()=>IDL.Service({icrc1_fee:IDL.Func([],[IDL.Nat],[])});
for(const profile of profiles){
 const button=document.createElement('button');button.textContent=profile;document.body.append(button);
 button.onclick=async()=>{
  const token=++generation;const previous=active;active=undefined;await previous?.manager.signOut();
  const manager=profile==='Governance'?createBrowserAuthSession():createBrowserProvisioningSession(profile,profile==='FundProvisioning'?undefined:bootstrap);
  let settled;const request={manager,returned:false,done:new Promise(resolve=>settled=resolve)};flight=request;
  pending=manager;publish({profile,busy:true,principal:null,hasSession:false});
  try{
   const session=await manager.signIn();request.returned=true;session.validate();
   if(token!==generation)throw Error('Stale authentication generation');
   const proof={};
   if(profile==='Governance'){
    const gov=await createAuthenticatedNnsActor(session.signingIdentity);
    proof.allowed=(await gov.get_neuron_info(100n)).Ok?.id?.[0]?.id===100n;
    proof.denied=await denied(session,'ryjl3-tyaaa-aaaaa-aaaba-cai','icrc1_fee',[],ledgerFactory);
   }else{
    const actors=await createProvisioningActors(session);
    if(profile==='FundProvisioning')proof.allowed=await actors.ledger.icrc1_fee()===10000n;
    if(profile==='ManageBootstrap'){
     const value=await actors.management.canister_status({canister_id:Principal.fromText(bootstrap)});
     proof.allowed=value.settings.controllers.length===1&&value.settings.controllers[0].toText()===session.principal.toText();
    }
    if(profile==='CallBootstrap')proof.allowed=Object.hasOwn(await actors.bootstrap.status(1n),'Ok');
    proof.denied=await denied(session,'rrkah-fqaaa-aaaaa-aaaaq-cai','get_neuron_info',[100n],govFactory);
   }
   if(!proof.allowed||!proof.denied)throw Error('Real replica capability assertion failed');
   active={session,manager};publish({profile,busy:false,principal:session.principal.toText(),hasSession:true,proof});
  }catch(error){if(token===generation){active=undefined;publish({profile,busy:false,principal:null,hasSession:false,error:String(error.message).slice(0,400)});}}
  finally{if(pending===manager)pending=undefined;if(flight===request)flight=undefined;settled();}
 };
}
for(const [label,action]of[['Sign out',reset],['Check expired session',async()=>{let rejected=false;try{active?.session.validate();}catch{rejected=true;}await reset();publish({busy:false,hasSession:false,expiredRejected:rejected});}]]){
 const button=document.createElement('button');button.textContent=label;button.onclick=action;document.body.append(button);
}
publish({busy:false,principal:null,hasSession:false});
