import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {CDPSessionEvent} from '../../dendrite/node_modules/puppeteer-core/lib/puppeteer/api/CDPSession.js';
import {SyntheticPasskeys} from './synthetic-passkeys.mjs';

// Modeled CDP unit tests only. All opaque fixture values are generated in RAM;
// assertions compare booleans/counts so failures cannot dump credential records.
const providerOrigin='http://id.ai.localhost:4944';
const credential=()=>({credentialId:randomBytes(32).toString('base64'),privateKey:randomBytes(64).toString('base64'),rpId:'id.ai.localhost',userHandle:randomBytes(32).toString('base64'),largeBlob:randomBytes(32).toString('base64'),cmtgKeys:[randomBytes(32).toString('base64')],activeCmtgKeyIndex:0,isResidentCredential:true,signCount:0,backupEligibility:false,backupState:false});
class CDP extends EventEmitter{
 constructor(){super();this.record=null;this.commands=[];this.failRestore=false;}
 async send(method,params){
  this.commands.push(method);
  if(method==='WebAuthn.addVirtualAuthenticator')return {authenticatorId:'unit-device'};
  if(method==='WebAuthn.addCredential'){
   if(this.failRestore)throw Error(JSON.stringify(params));
   this.record={...params.credential};this.emit('WebAuthn.credentialAdded',{authenticatorId:'unit-device',credential:this.record});
  }
  if(method==='WebAuthn.getCredentials')return {credentials:this.record?[{...this.record}]:[]};
  if(method==='WebAuthn.removeVirtualAuthenticator')this.record=null;
  return {};
 }
 nativeAdd(value){this.record={...value};this.emit('WebAuthn.credentialAdded',{authenticatorId:'unit-device',credential:this.record});}
 nativeAssert(count){this.record={...this.record,signCount:count};this.emit('WebAuthn.credentialAsserted',{authenticatorId:'unit-device',credential:this.record});}
 close(){this.emit(CDPSessionEvent.Disconnected);}
}
const page=(context='context')=>({createCDPSession:async()=>({send:async()=>({targetInfo:{targetId:'application',browserContextId:context}}),detach:async()=>{}})});
async function device(hardware,label,{context='context',cdp=new CDP()}={}){
 const ticket=await hardware.begin(page(context),label,'unit-operation');
 await hardware.beforeResume(cdp,{type:'page',targetId:`popup-${ticket.generation}`,openerId:'application',browserContextId:context});return {ticket,cdp};
}
async function register(hardware,label,principal){const d=await device(hardware,label);const value=credential();d.cdp.nativeAdd(value);d.cdp.nativeAssert(1);await hardware.checkpoint(d.ticket);d.cdp.close();await hardware.finish(d.ticket,{principal,requireAssertion:true});return value;}

test('ordinary popup closure and replacement retain only selected participant state and exact counters',async()=>{
 const h=new SyntheticPasskeys({providerOrigin});
 try{
  const a=await register(h,'alice','alice-public');await register(h,'bob','bob-public');
  const d=await device(h,'alice',{context:'second-tab-context'});
  assert.equal(d.cdp.record.privateKey===a.privateKey&&d.cdp.record.credentialId===a.credentialId&&d.cdp.record.userHandle===a.userHandle,true);
  assert.equal(d.cdp.record.signCount,1);assert.equal(d.cdp.record.isResidentCredential,true);
  assert.equal(d.cdp.record.largeBlob===a.largeBlob&&d.cdp.record.cmtgKeys[0]===a.cmtgKeys[0],true);
  assert.equal(d.cdp.record.backupEligibility,false);assert.equal(d.cdp.record.backupState,false);
  d.cdp.nativeAssert(2);d.cdp.close();await h.finish(d.ticket,{principal:'alice-public',expectedPrincipal:'alice-public',requireAssertion:true});
  assert.deepEqual(h.evidence().participants.map(p=>p.signature_counter),[2,1]);
  assert.equal(h.evidence().timeline.filter(e=>e.event==='target.closed').length,3);
  assert.equal(h.evidence().timeline.every(e=>e.target_id===null||e.target_id.startsWith('popup-')),true);
  h.assertEvidence(JSON.stringify(h.evidence()));
 }finally{await h.dispose();}assert.equal(h.evidence().participants.length,0);assert.equal(h.evidence().timeline.length,0);
});

test('failed restoration neither leaks a credential through CDP errors nor changes another participant',async()=>{
 const h=new SyntheticPasskeys({providerOrigin});
 try{
  const a=await register(h,'alice','alice-public');await register(h,'bob','bob-public');
  const ticket=await h.begin(page(),'bob','failing-restoration'),bad=new CDP();bad.failRestore=true;
  await assert.rejects(()=>h.beforeResume(bad,{type:'page',targetId:'failed-popup',openerId:'application',browserContextId:'context'}),error=>error.message==='Synthetic passkey CDP command failed: WebAuthn.addCredential');
  await h.abort(ticket);const d=await device(h,'alice');assert.equal(d.cdp.record.privateKey===a.privateKey,true);assert.equal(d.cdp.record.signCount,1);
  d.cdp.nativeAssert(2);d.cdp.close();await h.finish(d.ticket,{principal:'alice-public'});
  assert.deepEqual(h.evidence().participants.map(p=>p.signature_counter),[2,1]);
 }finally{await h.dispose();}
});

test('counter rollback, wrong principal, wrong context and stale generations fail closed',async()=>{
 const h=new SyntheticPasskeys({providerOrigin});
 try{
  await register(h,'alice','alice-public');let d=await device(h,'alice');d.cdp.nativeAssert(0);
  await assert.rejects(()=>h.checkpoint(d.ticket),/counter/);await h.abort(d.ticket);
  d=await device(h,'alice');assert.equal(d.cdp.record.signCount,1);
  await assert.rejects(()=>h.finish(d.ticket,{principal:'bob-public'}),/principal changed/);await h.abort(d.ticket);
  await assert.rejects(()=>h.checkpoint(d.ticket),/Stale/);
  const ticket=await h.begin(page(),'alice','wrong-context');await assert.rejects(()=>h.beforeResume(new CDP(),{type:'page',targetId:'alien',openerId:'application',browserContextId:'other'}),/another browser context/);await h.abort(ticket);
 }finally{await h.dispose();}
});

test('evidence rejects synthetic material and usable session fields without echoing them',async()=>{
 const h=new SyntheticPasskeys({providerOrigin});
 try{
  const value=await register(h,'alice','alice-public');
  for(const bytes of [JSON.stringify(value),value.privateKey,value.credentialId,value.userHandle,value.largeBlob,value.cmtgKeys[0],'{"delegations":["blocked"]}','{"signingIdentity":"blocked"}'])assert.throws(()=>h.assertEvidence(bytes),/cannot enter evidence/);
  h.assertEvidence(JSON.stringify(h.evidence()));
 }finally{await h.dispose();}
});
