import test from 'node:test';
import assert from 'node:assert/strict';
import {Actor,HttpAgent,Certificate,Cbor,LookupPathStatus} from '@icp-sdk/core/agent';
import {IDL} from '@icp-sdk/core/candid';
import {Principal} from '@icp-sdk/core/principal';
import {Ed25519KeyIdentity,DelegationChain,DelegationIdentity} from '@icp-sdk/core/identity';
import {deriveProvisioningSession} from '../src/auth.js';
import {createProvisioningActors,createCanisterWithWitness,bootstrapStatusWithWitness,verifyCreationWitness,readCreationLedgerBlock,readCreationStakeBalance,readCreationControllerIcpBalance,creationRegistrationMetadata,verifyCreationRegistrationMetadata} from '../src/creation-protocol.js';
import {bytesHex} from '../src/creation-accounts.js';
import {idlFactory as bootstrapFactory} from '../../../../src/declarations/bootstrap/bootstrap.did.js';

// Transport recording tests deliberately substitute the certificate decoder.
// They test request binding and failure handling, not cryptographic authenticity;
// the separate real-II/replica lanes are the authority for that evidence.
const c=Principal.fromText('pi33i-pt777-77776-aaaaa-cai'),root=Ed25519KeyIdentity.generate(),key=Ed25519KeyIdentity.generate();
const options={host:'http://127.0.0.1:4944',fetchRootKey:true,canisterId:c.toText()};
test('registration readback binds every reviewed metadata field including committed topic variants',()=>{
 const plan={metadata:[{name:'Provisional candidate',description:'P still controls C',links:['https://example.invalid']}],committed_topics:[4,3]},expected=creationRegistrationMetadata(plan);
 assert.deepEqual(expected.committed_topics,[[[{Governance:null}],[{NetworkEconomics:null}]]]);
 assert.equal(verifyCreationRegistrationMetadata(plan,expected),true);
 const reordered=structuredClone(expected);reordered.committed_topics[0].reverse();assert.equal(verifyCreationRegistrationMetadata(plan,reordered),true);
 const mutations=[m=>m.name='Changed',m=>m.description=['Changed'],m=>m.links=[[]],m=>delete m.committed_topics,m=>m.committed_topics=[],m=>m.committed_topics=[[],[]],m=>m.committed_topics=[null],m=>m.committed_topics=[[[]]],m=>m.committed_topics=[[[{Governance:null}],[{Governance:null}]]],m=>m.committed_topics=[[[{Governance:null}],[{CatchAll:null}]]],m=>m.committed_topics=[[[{Governance:null,NetworkEconomics:null}]]],m=>m.committed_topics=[[[{Governance:'unexpected'}]]]];
 for(const mutate of mutations){const metadata=structuredClone(expected);mutate(metadata);assert.throws(()=>verifyCreationRegistrationMetadata(plan,metadata),/metadata/);}
 assert.throws(()=>verifyCreationRegistrationMetadata(plan,undefined),/Awaiting/);
 assert.throws(()=>creationRegistrationMetadata({...plan,metadata:[]}),/required/);
 assert.throws(()=>creationRegistrationMetadata({...plan,committed_topics:[99]}),/Unsupported/);
 assert.equal(verifyCreationRegistrationMetadata({...plan,metadata:[]},expected),true);
 assert.equal(verifyCreationRegistrationMetadata({...plan,committed_topics:[]},{...expected,committed_topics:[]}),true);
});
async function session(profile){const chain=await DelegationChain.create(root,key.getPublicKey(),new Date(Date.now()+60000));return deriveProvisioningSession(DelegationIdentity.fromDelegation(key,chain),key.getPublicKey().toDer(),profile,profile==='FundProvisioning'?undefined:c.toText());}
test('named provisioning actors retain exact destinations effective routing and session expiry checks',async t=>{
 const calls=[];t.mock.method(HttpAgent,'create',async config=>{calls.push(config);return {};});
 for(const [profile,expected]of [['FundProvisioning',['ledger','cmc','cycles']],['ManageBootstrap',['management']],['CallBootstrap',['bootstrap']]]){
  const s=await session(profile),actors=await createProvisioningActors(s,options);assert.deepEqual(Object.keys(actors),expected);
  const first=actors[expected[0]];assert.equal(Actor.agentOf(first),Actor.agentOf(actors[expected.at(-1)]));
  if(profile==='ManageBootstrap')assert.equal(Actor.canisterIdOf(first).toText(),'aaaaa-aa');
  if(profile==='CallBootstrap')assert.equal(Actor.canisterIdOf(first).toText(),c.toText());
  assert.equal(calls.at(-1).identity,s.signingIdentity);assert.equal(calls.at(-1).retryTimes,0);assert.equal(calls.at(-1).verifyQuerySignatures,true);
 }
 await assert.rejects(()=>createProvisioningActors({},options),/named/);
 const s=await session('FundProvisioning');await assert.rejects(()=>createProvisioningActors({...s,validate(){throw Error('expired before actor publication');}},options),/expired/);
});
test('replicated creation witnesses bind public request content and require an actual replied result',async t=>{
 let reply,request,missing=false,status='replied';const checks=[];
 const agent={rootKey:new Uint8Array(96),update:async(target,opts)=>{
  request={request_type:'call',canister_id:target,sender:root.getPrincipal(),method_name:opts.methodName,arg:opts.arg,ingress_expiry:1n};
  const type=Actor.interfaceOf(actor)._fields.find(([name])=>name===opts.methodName)[1];reply=IDL.encode(type.retTypes,[{Ok:{block_id:7n,canister_id:c}}]);
  return missing?{}:{requestDetails:request,reply,rawCertificate:Uint8Array.of(1)};
 }};
 const factory=()=>IDL.Service({create_canister:IDL.Func([IDL.Record({amount:IDL.Nat})],[IDL.Variant({Ok:IDL.Record({block_id:IDL.Nat,canister_id:IDL.Principal})})],[])});
 const actor=Actor.createActor(factory,{agent,canisterId:c});
 t.mock.method(Certificate,'create',async config=>{checks.push(config);return {lookup_path:path=>({status:LookupPathStatus.Found,value:new TextDecoder().decode(path.at(-1))==='reply'?reply:new TextEncoder().encode(status)})};});
 const result=await createCanisterWithWitness(actor,{amount:2n});assert.equal(result.value.Ok.canister_id.toText(),c.toText());assert.equal(result.witness.request.sender,root.getPrincipal().toText());assert.ok(!('signature'in result.witness.request));assert.equal(checks[0].disableTimeVerification,false);assert.equal(checks[0].maxAgeInMinutes,undefined);
 const verified=await verifyCreationWitness(result.witness,{agent,canisterId:c,owner:root.getPrincipal(),methodName:'create_canister',includeSystemState:false});assert.equal(verified.args[0].amount,2n);assert.equal(checks.at(-1).maxAgeInMinutes,43200);
 status='processing';await assert.rejects(()=>createCanisterWithWitness(actor,{amount:2n}),/successful reply/);
 missing=true;await assert.rejects(()=>createCanisterWithWitness(actor,{amount:2n}),/no recoverable/);
 await assert.rejects(()=>bootstrapStatusWithWitness(actor,1n),/Unsupported/);
});
test('bootstrap witness collects current certified module controllers and time independently',async t=>{
 let reply;const paths=[];
 const agent={rootKey:new Uint8Array(96),update:async(target,opts)=>{
  const signature=bootstrapFactory({IDL})._fields.find(([n])=>n==='status')[1];reply=IDL.encode(signature.retTypes,[{Err:'recorded protocol rejection'}]);return {requestDetails:{request_type:'call',canister_id:target,sender:root.getPrincipal(),method_name:'status',arg:opts.arg,ingress_expiry:1n,nonce:Uint8Array.of(1)},reply,rawCertificate:Uint8Array.of(1)};
 },readState:async(_target,options)=>{paths.push(...options.paths);return {certificate:Uint8Array.of(2)};}};
 t.mock.method(Certificate,'create',async()=>({lookup_path:path=>{
  const name=new TextDecoder().decode(path.at(-1));return {status:LookupPathStatus.Found,value:name==='reply'?reply:name==='status'?new TextEncoder().encode('replied'):name==='controllers'?Cbor.encode([root.getPrincipal().toUint8Array()]):name==='time'?Uint8Array.of(1):new Uint8Array(32)};
 }}));
 const result=await bootstrapStatusWithWitness(Actor.createActor(bootstrapFactory,{agent,canisterId:c}),1n);assert.equal(result.value.Err,'recorded protocol rejection');assert.equal(result.witness.certificate,'02');assert.equal(paths.length,5);assert.ok(!paths.some(path=>new TextDecoder().decode(path.at(-1))==='certified_data'));
});
test('ledger recovery accepts only one exact block or the ledger-endorsed bounded archive',async t=>{
 let history,archiveResult,archiveCalls=0;const requested=[],balanceRequests=[],block={transaction:{memo:1n}};
 t.mock.method(HttpAgent,'create',async()=>({}));t.mock.method(Actor,'createActor',(_factory,config)=>{
  requested.push(config.canisterId);return config.canisterId==='ryjl3-tyaaa-aaaaa-aaaba-cai'?{query_blocks:async()=>history,icrc1_balance_of:async account=>{balanceRequests.push(account);return 2n;}}:{get_blocks:async args=>{archiveCalls++;assert.deepEqual(args,{start:7n,length:1n});return archiveResult;}};
 });
 history={blocks:[block],first_block_index:7n,archived_blocks:[]};assert.equal(await readCreationLedgerBlock(7n,options),block);
 const range={start:5n,length:5n,callback:[c,'get_blocks']};history={blocks:[],archived_blocks:[range]};archiveResult={Ok:{blocks:[block]}};assert.equal(await readCreationLedgerBlock(7n,options),block);assert.equal(archiveCalls,1);
 for(const bad of [{blocks:[block,block],archived_blocks:[]},{blocks:[],archived_blocks:[range,range]},{blocks:[],archived_blocks:[]},{blocks:[],archived_blocks:[{...range,start:8n}]},{blocks:[],archived_blocks:[{...range,callback:[c,'arbitrary_method']}]}]){history=bad;await assert.rejects(()=>readCreationLedgerBlock(7n,options),/bounded|unavailable/);}
 history={blocks:[],archived_blocks:[range]};archiveResult={Ok:{blocks:[]}};await assert.rejects(()=>readCreationLedgerBlock(7n,options),/archive block/);assert.equal(await readCreationStakeBalance(c,1n,options),2n);assert.equal(balanceRequests.at(-1).owner.toText(),'rrkah-fqaaa-aaaaa-aaaaq-cai');assert.equal(balanceRequests.at(-1).subaccount[0].length,32);assert.equal(await readCreationControllerIcpBalance(c,options),2n);assert.equal(balanceRequests.at(-1).owner.toText(),c.toText());assert.equal(balanceRequests.at(-1).subaccount.length,0);assert.ok(requested.length>0);assert.equal(bytesHex(Uint8Array.of(1)),'01');
});
