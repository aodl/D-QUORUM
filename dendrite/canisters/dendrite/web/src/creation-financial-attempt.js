import {Principal} from '@icp-sdk/core/principal';
import {IDL} from '@icp-sdk/core/candid';
import {bytesHex,hexBytes,sha256Hex,fundingSubaccount} from './creation-accounts.js';
import {creationArgumentTypes,validateCreationRequestBinding} from './creation-protocol.js';
export const financialAttemptKinds=new Set(['PayConversion','CreateCanister','PayStake']);
// No signing key or canister is created for this fixed opaque marker. Under
// the pinned allocation rules ordinary canister IDs are 10 bytes; this is 29.
// Allowances additionally remain strictly below the current ledger fee.
export const cyclesDispatchMarker=Principal.fromUint8Array(Uint8Array.from([...hexBytes(sha256Hex(new TextEncoder().encode('dendrite/cycles-dispatch-marker/v1'))).slice(0,28),1]));
export const dispatchSpender=(plan,kind,{legacyCycleManagement=false}={})=>({owner:kind==='CreateCanister'&&!legacyCycleManagement?cyclesDispatchMarker:Principal.managementCanister(),subaccount:[hexBytes(sha256Hex(new TextEncoder().encode(`dendrite-dispatch-reservation/v1/${bytesHex(plan.creation_id)}/${kind}`)))]});
export function dispatchReservation(plan,kind,argument,fee,generation,createdAt,requestId,{legacyCycleManagement=false}={}){
 if(!financialAttemptKinds.has(kind)||generation<1n||generation>16n||fee<=16n)throw Error('Dispatch reservation exceeds its reviewed bounded fee/generation contract.');
 const args={from_subaccount:[fundingSubaccount(plan.owner,plan.creation_id)],spender:dispatchSpender(plan,kind,{legacyCycleManagement}),amount:generation,expected_allowance:[generation-1n],expires_at:[],fee:[fee],memo:[hexBytes(requestId,32)],created_at_time:[createdAt]};
 const encoded=IDL.encode([creationArgumentTypes.approve],[args]);
 return {argument:bytesHex(encoded),argument_digest:sha256Hex(encoded),reply_witness:null,block_id:null};
}
export function validateDispatchReservation(reservation,intent,plan){
 if(!reservation||Object.keys(reservation).sort().join(',')!=='argument,argument_digest,block_id,reply_witness')throw Error('Invalid dispatch reservation schema.');
 if(reservation.argument.length>4096||sha256Hex(hexBytes(reservation.argument))!==reservation.argument_digest)throw Error('Dispatch reservation argument binding failed.');
 const args=IDL.decode([creationArgumentTypes.approve],hexBytes(reservation.argument))[0],generation=args.amount,fee=args.fee[0],timestamp=BigInt(intent.created_at_time);
 validateCreationRequestBinding(intent.request_binding,{owner:plan.owner,destination:intent.destination,methodName:intent.kind==='CreateCanister'?'create_canister':'icrc1_transfer',argument:hexBytes(intent.argument)});
 const expected=dispatchReservation(plan,intent.kind,hexBytes(intent.argument),fee,generation,timestamp,intent.request_binding.request_id,{legacyCycleManagement:intent.kind==='CreateCanister'&&args.spender.owner.toText()==='aaaaa-aa'});
 if(expected.argument!==reservation.argument)throw Error('Dispatch reservation source/spender/amount/fee/memo/time changed.');
 return args;
}
// Only a first dispatch that won its atomic reservation can classify these
// typed replies. An old Unknown attempt is never resubmitted to obtain TooOld.
export function financialRefusal(result,kind){
 const key=Object.keys(result?.Err??{})[0];
 return (kind==='CreateCanister'?['InsufficientFunds','TooOld','CreatedInFuture']:['BadFee','InsufficientFunds','TooOld','CreatedInFuture']).includes(key)?key:undefined;
}

// Pinned cycles-ledger storage::approve rejects a management-principal account
// before allowance mutation or fee charging. Recognise only that exact legacy
// request/code; other GenericError outcomes remain uncertain.
export function reservationRefusal(result,kind,args){
 const key=Object.keys(result?.Err??{})[0];
 if(['BadFee','InsufficientFunds','AllowanceChanged','Expired','TooOld','CreatedInFuture'].includes(key))return key;
 if(kind==='CreateCanister'&&args.spender.owner.toText()==='aaaaa-aa'&&key==='GenericError'&&result.Err.GenericError.error_code===100001n)return 'CyclesDeniedManagementOwner';
 return undefined;
}
