import {CDPSessionEvent} from '../../dendrite/node_modules/puppeteer-core/lib/puppeteer/api/CDPSession.js';

// Isolated local-test hardware only. No AuthClient identity, delegation, or
// authentication response enters this object. Credential records never escape it.
export class SyntheticPasskeys {
 #people=new Map(); #current; #events=[]; #provider; #offset; #started=Date.now();
 constructor({providerOrigin,clockOffset=()=>0}) {
  this.#provider=new URL(providerOrigin);
  if(!this.#provider.hostname.endsWith('.localhost'))throw Error('Synthetic passkeys require isolated local II');
  if(process.env.DEBUG||process.env.NODE_DEBUG)throw Error('Disable protocol debug logging before synthetic passkey tests');
  this.#offset=clockOffset;
 }
 #trace(event,extra={},t=this.#current) {
  const wall=Date.now(),offset=this.#offset();
  this.#events.push({event,wall_ms:wall,wall_offset_ms:wall-this.#started,virtual_ms:wall+offset,virtual_offset_ms:offset,participant:t?.label??null,generation:t?.generation??null,operation:t?.operation??null,target_id:t?.target??null,opener_id:t?.opener??null,context_id:t?.context??null,...extra});
  if(this.#events.length>256)this.#events.shift();
 }
 async #send(session,method,params={},closing=false) {
  try{return await session.send(method,params);}catch(error){
   if(closing&&/closed|detached/i.test(String(error.message)))return undefined;
   // CDP errors can include request parameters. Never propagate their objects,
   // messages, or causes when credential-bearing commands fail.
   throw Error(`Synthetic passkey CDP command failed: ${method}`);
  }
 }
 async begin(page,label,operation) {
  if(this.#current)throw Error('A synthetic passkey operation is already active');
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(label))throw Error('Invalid synthetic participant label');
  if(typeof operation!=='string'||operation.length>128)throw Error('Invalid synthetic authentication operation');
  const cdp=await page.createCDPSession();
  const {targetInfo}=await this.#send(cdp,'Target.getTargetInfo');await cdp.detach();
  let person=this.#people.get(label);
  if(!person){person={credentials:new Map(),generation:0,principal:null,assertions:0};this.#people.set(label,person);}
  const handle=Object.freeze({label,generation:++person.generation,operation});
  this.#current={...handle,handle,person,opener:targetInfo.targetId,context:targetInfo.browserContextId,device:null};
  this.#trace('authentication.begin');return handle;
 }
 #remember(t,credential) {
  const old=t.person.credentials.get(credential.credentialId);
  if(!old&&t.person.credentials.size)throw Error('Unexpected additional synthetic passkey');
  if(!old&&!credential.privateKey)return; // A following getCredentials supplies it.
  const next=structuredClone({...old,...credential,privateKey:credential.privateKey||old?.privateKey});
  if(typeof next.credentialId!=='string'||!next.credentialId||next.rpId!==this.#provider.hostname||next.isResidentCredential!==true||typeof next.privateKey!=='string'||!next.privateKey||!Number.isSafeInteger(next.signCount)||next.signCount<0)throw Error('Invalid local resident synthetic credential');
  if(old&&(next.signCount<old.signCount||next.privateKey!==old.privateKey||next.userHandle!==old.userHandle||next.rpId!==old.rpId))throw Error('Synthetic passkey binding or signature counter changed unexpectedly');
  t.person.credentials.set(next.credentialId,Object.freeze(next));
 }
 async #capture(t) {
  const d=t.device;if(!d||d.closed)return;
  const result=await this.#send(d.cdp,'WebAuthn.getCredentials',{authenticatorId:d.id},true);
  if(result)for(const credential of result.credentials)this.#remember(t,credential);
 }
 // Called by the existing network-containment target owner, before it resumes
 // the popup. It does not open/navigate windows or change authentication RPCs.
 async beforeResume(cdp,info) {
  const t=this.#current;
  if(!t||info.type!=='page'||info.openerId!==t.opener)return;
  if(info.browserContextId!==t.context)throw Error('Synthetic popup belongs to another browser context');
  if(t.device){if(t.target===info.targetId)return;throw Error('Unexpected simultaneous authentication popup');}
  t.target=info.targetId;
  await this.#send(cdp,'WebAuthn.enable');
  const {authenticatorId}=await this.#send(cdp,'WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  const d=t.device={cdp,id:authenticatorId,closed:false,pending:Promise.resolve(),failure:null,assertions:0};
  const capture=(kind,data)=>{
   if(data.authenticatorId!==d.id)return;
   try{this.#remember(t,data.credential);if(kind==='asserted'){d.assertions++;t.person.assertions++;}this.#trace(`credential.${kind}`,{credential_count:t.person.credentials.size},t);}
   catch{d.failure=Error('Synthetic credential binding or signature-counter check failed');}
   if(!t.person.credentials.size)d.pending=d.pending.then(()=>this.#capture(t)).catch(()=>{if(!d.closed)d.failure=Error('Synthetic credential capture failed');});
  };
  cdp.on('WebAuthn.credentialAdded',data=>capture('added',data));
  cdp.on('WebAuthn.credentialUpdated',data=>capture('updated',data));
  cdp.on('WebAuthn.credentialAsserted',data=>capture('asserted',data));
  cdp.on(CDPSessionEvent.Disconnected,()=>{d.closed=true;this.#trace('target.closed',{},t);});
  cdp.on('Page.frameNavigated',({frame})=>{if(!frame.parentId&&frame.url){const url=new URL(frame.url);this.#trace('target.navigated',{origin:url.origin.slice(0,200),path:url.pathname.slice(0,256)},t);}});
  await this.#send(cdp,'Page.enable');
  for(const credential of t.person.credentials.values())await this.#send(cdp,'WebAuthn.addCredential',{authenticatorId:d.id,credential:structuredClone(credential)});
  this.#trace('target.attached',{restored_credentials:t.person.credentials.size});
 }
 #ticket(handle) {if(this.#current?.handle!==handle)throw Error('Stale synthetic authentication generation');return this.#current;}
 async checkpoint(handle) {const t=this.#ticket(handle);await t.device?.pending;await this.#capture(t);if(t.device?.failure)throw t.device.failure;}
 async finish(handle,{principal,expectedPrincipal,requireAssertion=false}={}) {
  const t=this.#ticket(handle);
  await this.checkpoint(handle);
  if(!t.device||t.person.credentials.size!==1)throw Error('Native synthetic passkey was not captured');
  if(requireAssertion&&!t.device.assertions)throw Error('No native WebAuthn assertion was observed');
  if(principal!==undefined){
   if((expectedPrincipal&&principal!==expectedPrincipal)||(t.person.principal&&principal!==t.person.principal))throw Error('Synthetic participant application principal changed');
   t.person.principal=principal;
  }
  this.#trace('authentication.complete',{principal:principal??null,popup_closed:t.device.closed});
  await this.abort(handle);
 }
 async abort(handle) {
  const t=this.#ticket(handle),d=t.device;
  if(d){await d.pending;if(!d.closed)await this.#send(d.cdp,'WebAuthn.removeVirtualAuthenticator',{authenticatorId:d.id},true);}
  this.#current=undefined;
 }
 evidence() {return {classification:'Synthetic local authenticator hardware continuity only; no credential/session export',participants:[...this.#people].map(([label,p])=>({label,principal:p.principal,credential_count:p.credentials.size,assertion_count:p.assertions,signature_counter:[...p.credentials.values()][0]?.signCount??null})),timeline:this.#events.map(e=>({...e}))};}
 assertEvidence(bytes) {
  const text=typeof bytes==='string'?bytes:Buffer.from(bytes).toString('utf8');
  if(/"(?:privateKey|credentialId|userHandle|largeBlob|cmtgKeys|delegations|signingIdentity|authenticatorData|clientDataJSON)"\s*:/.test(text))throw Error('Private fixture/session field cannot enter evidence');
  for(const p of this.#people.values())for(const c of p.credentials.values())for(const value of [c.privateKey,c.credentialId,c.userHandle,c.largeBlob,...(c.cmtgKeys??[])])if(value&&value.length>=12&&text.includes(value))throw Error('Synthetic credential material cannot enter evidence');
 }
 async dispose() {
  try{if(this.#current)await this.abort(this.#current.handle);}
  finally{
   for(const person of this.#people.values())person.credentials.clear();
   this.#people.clear();this.#events.length=0;this.#current=undefined;
   // Lifetime cleanup, not a claim of reliable JS memory erasure.
  }
 }
}
