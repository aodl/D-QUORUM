import test from 'node:test';
import assert from 'node:assert/strict';
import {Principal} from '@icp-sdk/core/principal';
import {IDL} from '@icp-sdk/core/candid';
import {creationArgumentTypes,creationRequestBinding,validateCreationRequestBinding} from '../src/creation-protocol.js';
import {dispatchReservation,validateDispatchReservation,dispatchSpender,financialRefusal,reservationRefusal,cyclesDispatchMarker} from '../src/creation-financial-attempt.js';
import {bytesHex,hexBytes,sha256Hex} from '../src/creation-accounts.js';
const owner=Principal.selfAuthenticating(Uint8Array.of(1)),destination='ryjl3-tyaaa-aaaaa-aaaba-cai',plan={owner,creation_id:new Uint8Array(32).fill(2)};
function request(){const argument=IDL.encode([creationArgumentTypes.transfer],[{from_subaccount:[],to:{owner,subaccount:[]},fee:[10000n],amount:100n,memo:[],created_at_time:[1n]}]);const binding=creationRequestBinding({owner,destination,methodName:'icrc1_transfer',argument,nonce:new Uint8Array(32).fill(3),ingressExpiry:1790000000000000000n});return {argument,binding};}
test('original ingress binds sender, destination, method, exact Candid, expiry and nonce',()=>{
 const {argument,binding}=request(),expected={owner,destination,methodName:'icrc1_transfer',argument};assert.equal(validateCreationRequestBinding(binding,expected),binding);
 for(const mutate of [b=>b.request.sender='2vxsx-fae',b=>b.request.canister_id='aaaaa-aa',b=>b.request.method_name='transfer',b=>b.request.arg='00',b=>b.request.ingress_expiry='1790000000000000001',b=>b.request.nonce='04'.repeat(32),b=>b.request_id='00'.repeat(32),b=>b.request.extra='unreviewed']){const altered=structuredClone(binding);mutate(altered);assert.throws(()=>validateCreationRequestBinding(altered,expected));}
});
test('same monetary arguments with a later ingress cannot substitute for the original refusal',()=>{
 const {argument,binding}=request(),later=creationRequestBinding({owner,destination,methodName:'icrc1_transfer',argument,nonce:hexBytes(binding.request.nonce),ingressExpiry:BigInt(binding.request.ingress_expiry)+1n});
 assert.equal(binding.request.arg,later.request.arg);assert.notEqual(binding.request_id,later.request_id);
 const reservation=dispatchReservation(plan,'PayStake',argument,10000n,1n,1n,binding.request_id),intent={kind:'PayStake',destination,argument:bytesHex(argument),created_at_time:'1',request_binding:binding};
 assert.equal(validateDispatchReservation(reservation,intent,plan).amount,1n);
 assert.throws(()=>validateDispatchReservation(reservation,{...intent,request_binding:later},plan),/memo|changed/);
 // The reviewed faulty argument-only predicate cannot distinguish these requests.
 assert.equal(sha256Hex(hexBytes(binding.request.arg)),sha256Hex(hexBytes(later.request.arg)));
});
test('atomic dispatch reservation is fixed to its workflow purpose and bounded below the current fee',()=>{
 const {argument,binding}=request(),reservation=dispatchReservation(plan,'PayStake',argument,10000n,1n,1n,binding.request_id),args=IDL.decode([creationArgumentTypes.approve],hexBytes(reservation.argument))[0];
 assert.equal(args.spender.owner.toText(),'aaaaa-aa');assert.equal(args.amount,1n);assert.deepEqual(args.expected_allowance,[0n]);assert.deepEqual(args.expires_at,[]);assert.equal(bytesHex(args.memo[0]),binding.request_id);
 assert.notEqual(bytesHex(dispatchSpender(plan,'PayStake').subaccount[0]),bytesHex(dispatchSpender(plan,'PayConversion').subaccount[0]));
 for(const [fee,generation]of [[10000n,0n],[10000n,17n],[1n,1n]])assert.throws(()=>dispatchReservation(plan,'PayStake',argument,fee,generation,1n,binding.request_id));
 assert.throws(()=>dispatchReservation(plan,'ArbitraryPayment',argument,10000n,1n,1n,binding.request_id));
});
test('typed first-dispatch refusals remain distinct from duplicate, refund and ambiguous outcomes',()=>{
 for(const code of ['BadFee','InsufficientFunds','TooOld','CreatedInFuture'])assert.equal(financialRefusal({Err:{[code]:null}},'PayStake'),code);
 for(const error of [{Duplicate:{duplicate_of:1n}},{GenericError:{error_code:1n,message:'definitely failed'}},{TemporarilyUnavailable:null},{FailedToCreate:{fee_block:[1n],refund_block:[2n],error:'refunded'}}])assert.equal(financialRefusal({Err:error},'CreateCanister'),undefined);
 assert.equal(financialRefusal({Ok:1n},'PayStake'),undefined);
});
test('untrusted saved ingress rejects malformed shape, timestamp range and nonce encoding before dispatch authority',()=>{
 const {argument,binding}=request(),expected={owner,destination,methodName:'icrc1_transfer',argument};
 assert.throws(()=>validateCreationRequestBinding(null,expected),/Missing original/);
 for(const change of [
  b=>b.extra='ignored',b=>b.request=null,b=>b.request.request_type='query',
  b=>b.request.ingress_expiry='0',b=>b.request.ingress_expiry='01',b=>b.request.ingress_expiry='-1',b=>b.request.ingress_expiry='18446744073709551616',
  b=>b.request.nonce=null,b=>b.request.nonce='00',b=>b.request.nonce='zz'.repeat(32),
 ]){const altered=structuredClone(binding);change(altered);assert.throws(()=>validateCreationRequestBinding(altered,expected));}
 assert.equal(validateCreationRequestBinding(binding,expected),binding,'rejection checks never mutate the original identity');
});

test('cycles approval uses a fixed non-management marker and audits only the exact denied legacy owner',()=>{
 const marker=cyclesDispatchMarker.toUint8Array();assert.equal(marker.length,29);assert.equal(marker[28],1);
 assert.equal(dispatchSpender(plan,'CreateCanister').owner.toText(),cyclesDispatchMarker.toText());
 assert.equal(dispatchSpender(plan,'PayConversion').owner.toText(),'aaaaa-aa');
 const denied={Err:{GenericError:{error_code:100001n,message:'not used as proof'}}};
 const legacy={spender:{owner:Principal.managementCanister()}};
 assert.equal(reservationRefusal(denied,'CreateCanister',legacy),'CyclesDeniedManagementOwner');
 assert.equal(reservationRefusal(denied,'PayStake',legacy),undefined);
 assert.equal(reservationRefusal(denied,'CreateCanister',{spender:{owner:cyclesDispatchMarker}}),undefined);
 assert.equal(reservationRefusal({Err:{GenericError:{error_code:100000n}}},'CreateCanister',legacy),undefined);
});

test('legacy Cycles management-spender reservation retains its original ingress and bytes',()=>{
 const argument=IDL.encode([creationArgumentTypes.create],[{from_subaccount:[],created_at_time:[1n],amount:2000000000000n,creation_args:[]}]);
 const destination='um5iw-rqaaa-aaaaq-qaaba-cai';
 const binding=creationRequestBinding({owner,destination,methodName:'create_canister',argument,nonce:new Uint8Array(32).fill(3),ingressExpiry:1790000000000000000n});
 const intent={kind:'CreateCanister',destination,argument:bytesHex(argument),created_at_time:'1',request_binding:binding};
 const original=dispatchReservation(plan,intent.kind,argument,100000000n,1n,1n,binding.request_id,{legacyCycleManagement:true});
 const snapshot=structuredClone(original);
 assert.equal(validateDispatchReservation(original,intent,plan).spender.owner.toText(),'aaaaa-aa');
 assert.deepEqual(original,snapshot);
 const current=dispatchReservation(plan,intent.kind,argument,100000000n,1n,1n,binding.request_id);
 assert.notEqual(current.argument,original.argument);
 assert.equal(validateDispatchReservation(current,intent,plan).spender.owner.toText(),cyclesDispatchMarker.toText());
});
