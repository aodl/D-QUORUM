// Isolated fixture only. Decode method_name inside the browser; envelopes,
// signatures, delegations and keys never leave this realm or enter retained logs.
import { Cbor, requestIdOf } from '@icp-sdk/core/agent';
const original=globalThis.fetch.bind(globalThis);
let mode='none', resume;
const publicState={held:false,mutationRequests:0,lostReplies:0};const faultIds=new Set();
export const arm=value=>{if(!['hold','lose','none','holdController','losePayment'].includes(value))throw Error('unknown scripted fault');mode=value;publicState.held=false;};
export const state=()=>({...publicState,faultRequestIds:[...faultIds]});
export const release=()=>{const resolve=resume;resume=undefined;publicState.held=false;resolve?.();};
globalThis.fetch=async(input,options)=>{
 const url=new URL(input?.url??input,location.href);
 if(url.pathname.includes('/call')&&options?.body){
  const envelope=Cbor.decode(new Uint8Array(options.body));
  if(mode==='holdController'&&envelope?.content?.method_name==='update_settings'&&(envelope.content.canister_id?.toText?.()==='aaaaa-aa'||envelope.content.canister_id instanceof Uint8Array&&envelope.content.canister_id.length===0)){mode='none';publicState.held=true;await new Promise(resolve=>{resume=resolve;});}
  if(mode==='losePayment'&&url.pathname.includes('/canister/ryjl3-tyaaa-aaaaa-aaaba-cai/call')&&envelope?.content?.method_name==='icrc1_transfer'){
   mode='none';faultIds.add([...new Uint8Array(requestIdOf(envelope.content))].map(byte=>byte.toString(16).padStart(2,'0')).join(''));
   await original(input,options);publicState.lostReplies++;
   throw new TypeError('Scripted lost ICP transfer response after dispatch');
  }
  if(url.pathname.includes('/canister/rrkah-fqaaa-aaaaa-aaaaq-cai/call')&&envelope?.content?.method_name==='manage_neuron'){
   publicState.mutationRequests++;
   if(mode==='hold'){mode='none';publicState.held=true;await new Promise(resolve=>{resume=resolve;});}
   else if(mode==='lose'){
    faultIds.add([...new Uint8Array(requestIdOf(envelope.content))].map(byte=>byte.toString(16).padStart(2,'0')).join(''));
    await original(input,options);
    publicState.lostReplies++;
    throw new TypeError('Scripted lost Governance mutation response after dispatch');
   }
  }
 }
 return original(input,options);
};
