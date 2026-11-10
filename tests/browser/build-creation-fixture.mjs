// Isolated browser-fixture policy: keep II's window (and Chrome's native
// synthetic passkey device) alive between genuine SDK authentication requests.
// The SDK Signer already supports this option. AuthClient does not forward it.
// No signature, scope, expiry, certificate or application workflow is replaced.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=resolve(process.argv[2]),{buildFrontend}=await import(pathToFileURL(`${source}/canisters/dendrite/web/build-frontend.mjs`));
const historical=process.argv[3]==='--reviewed-v1-bootstrap';
if(process.argv.length>3&&!historical)throw Error('Only the reviewed V1 fixture selection is supported');
const providerOrigin=new URL(process.env.DENDRITE_IDENTITY_PROVIDER).origin;
if(process.env.DENDRITE_BUILD_MODE!=='local'||!new URL(providerOrigin).hostname.endsWith('.localhost'))throw Error('Native window retention is local-test infrastructure only');
let transformed=0,historicalTransforms=0,authorityTransforms=0;
await buildFrontend({plugins:[{name:'creation-native-authenticator-window',setup(build){
build.onLoad({filter:/creation-protocol\.js$/},async({path})=>{
 const original=await readFile(path,'utf8');
 const management='if (session.profile === "ManageBootstrap") return Object.freeze({ management: actor(managementFactory, Principal.managementCanister(), { effectiveCanisterId: Principal.fromText(session.bootstrapCanisterId) }) });';
 const bootstrap='return Object.freeze({ bootstrap: actor(bootstrapFactory, session.bootstrapCanisterId) });';
 if(original.split(management).length!==2||original.split(bootstrap).length!==2)throw Error('Retained authority negative control no longer binds exact capability construction');
 const contents=original.replace(management,`if (session.profile === "ManageBootstrap") {
  const management=actor(managementFactory,Principal.managementCanister(),{effectiveCanisterId:Principal.fromText(session.bootstrapCanisterId)});
  globalThis.creationRetainedControllerProbe=async()=>{
   const expiry=session.signingIdentity.getDelegation().delegations.at(-1).delegation.expiration,now=BigInt(Date.now())*1000000n;
   if(expiry<=now)throw Error('Retained creator test credential expired before replica authority denial');
   try { await management.update_settings({canister_id:Principal.fromText(session.bootstrapCanisterId),settings:{controllers:[[session.principal]],compute_allocation:[],memory_allocation:[],freezing_threshold:[]},sender_canister_version:[]});return {controller_denied:false}; }
   catch(error){const diagnostic=String(error.message).slice(0,1500);return {canister:session.bootstrapCanisterId,principal:session.principal.toText(),credential_valid_until_ns:String(expiry),now_ns:String(now),controller_denied:/controller/i.test(diagnostic)&&!/delegation|signature|expir/i.test(diagnostic),diagnostic};}
  };
  return Object.freeze({management});
 }`).replace(bootstrap,`const bootstrap=actor(bootstrapFactory,session.bootstrapCanisterId);
 globalThis.creationRetainedBootstrapProbe=async()=>{
  const expiry=session.signingIdentity.getDelegation().delegations.at(-1).delegation.expiration,now=BigInt(Date.now())*1000000n;
  if(expiry<=now)throw Error('Retained bootstrap test credential expired before code-absence denial');
  try{await bootstrap.advance({revision:1n,step:{Configure:null}});return {code_unavailable:false};}
  catch(error){const diagnostic=String(error.message).slice(0,1500);return {canister:session.bootstrapCanisterId,principal:session.principal.toText(),credential_valid_until_ns:String(expiry),now_ns:String(now),code_unavailable:/stopped|has no (wasm|module)|method.*not.*found/i.test(diagnostic),diagnostic};}
 };
 return Object.freeze({bootstrap});`);
 await writeFile(`${source}/../creation-authority-probe-policy.json`,JSON.stringify({classification:'local-only bounded negative controls retain exact C scoped actors in browser memory; no generic targets or credential export; no canonical source modification',original_sha256:createHash('sha256').update(original).digest('hex'),fixture_sha256:createHash('sha256').update(contents).digest('hex')},null,2));
 authorityTransforms++;return {contents,loader:'js'};
});
if(historical)build.onLoad({filter:/creation-controller\.js$/},async({path})=>{
 const original=await readFile(path,'utf8'),{reviewedHistoricalBootstraps}=await import(pathToFileURL(`${source}/canisters/dendrite/web/src/creation-compatibility.js`));
 const selected=reviewedHistoricalBootstraps[0],manifest={...selected,wasm_path:`/generated/bootstrap.${selected.sha256.slice(0,16)}.wasm`};
 const needle='const currentManifest=typeof __DENDRITE_BOOTSTRAP_MANIFEST__!=="undefined"?__DENDRITE_BOOTSTRAP_MANIFEST__:globalThis.__DENDRITE_BOOTSTRAP_MANIFEST__;';
 if(original.split(needle).length!==2)throw Error('Reviewed historical selection no longer binds exactly one controller manifest');
 await writeFile(`${source}/../historical-bootstrap-policy.json`,JSON.stringify({classification:'local test current frontend with exact reviewed V1 bootstrap selection; not canonical frontend bytes',reviewed_source:'97343f8dbb714a0a12f90a474805518c83017184',manifest},null,2));
 historicalTransforms++;return {contents:original.replace(needle,`const currentManifest=${JSON.stringify(manifest)};`),loader:'js'};
});
build.onLoad({filter:/@icp-sdk\/signer\/lib\/esm\/web\/postMessageChannel\.js$/},async({path})=>{
 const original=await readFile(path,'utf8');return {contents:original.replace('this.#options.signerWindow.close();','console.trace("creation-native-channel-close"); /* Keep native passkey hardware alive; channel close/listeners and all timeouts remain real. */'),loader:'js'};
});
build.onLoad({filter:/@icp-sdk\/auth\/dist\/esm\/client\/auth-client\.js$/},async({path})=>{
 const original=await readFile(path,'utf8'),needle='new Signer({';
 if(original.split(needle).length!==2)throw Error('Pinned AuthClient constructor changed; review native-device retention before testing');
 if(original.split('new PostMessageTransport({').length!==2)throw Error('Pinned AuthClient transport constructor changed');
 const windowProvider=`window: { open(url, name, features) {
   const resident = globalThis.creationNativeSignerWindow ?? (() => { try { return globalThis.window.opener?.creationNativeSignerWindow; } catch { return undefined; } })();
   const existing = resident && !resident.closed ? resident : globalThis.window.open('', name, features);
   if (!existing) return existing;
   globalThis.creationNativeSignerWindow = existing;
   try { if (existing.location.href === 'about:blank') existing.location.href = url; }
   catch { /* Existing cross-origin II document: preserve its native device. */ }
   return existing;
 }, addEventListener: globalThis.window.addEventListener.bind(globalThis.window),
 removeEventListener: globalThis.window.removeEventListener.bind(globalThis.window),
 focus: globalThis.window.focus.bind(globalThis.window) },`;
 // Several independent heartbeat clients sharing one retained window amplify
 // each other's status messages in this pinned SDK. Share only its transport
 // signer; AuthClient still requests a new genuine II delegation to each fresh
 // nonextractable key. No identity/delegation or capability is shared here.
 const contents=original.replace(needle,'globalThis.creationNativeSigner ??= new Signer({ autoCloseTransportChannel: false,').replace('new PostMessageTransport({',`new PostMessageTransport({ closeOnEstablishTimeout: false, closeOnPendingTimeout: false, ${windowProvider}`);
 const fixtureContents=`globalThis.creationNativeAuthenticatorWindow = true;
globalThis.addEventListener('message', event => {
 if (event.origin === ${JSON.stringify(providerOrigin)} && event.data === 'dendrite-native-window-reference-v1' && event.source) {
  globalThis.creationNativeSignerWindow = event.source;
  globalThis.creationNativeWindowLinked = true;
 }
});
${contents}`;
 await writeFile(`${source}/../sdk-window-policy.json`,JSON.stringify({classification:'local test native-device lifetime only; genuine II, same reviewed production heartbeat policy, unchanged expiry and replica verification',sdk:'@icp-sdk/auth@7.1.0',signer_option:{autoCloseTransportChannel:false,transport_lifetime:'one real SDK Signer channel per application document; independent fresh AuthClient keys and II requests'},transport_option:{closeOnEstablishTimeout:false,closeOnPendingTimeout:false,window:'retained real II target; public WindowProxy handoff after document restart and same-origin secondary document; no SDK envelope forwarding; channel close/listeners and timeouts unchanged'},original_sha256:createHash('sha256').update(original).digest('hex'),fixture_sha256:createHash('sha256').update(fixtureContents).digest('hex')},null,2));
 transformed++;return {contents:fixtureContents,loader:'js'};
 });}}]});
if(transformed!==1)throw Error('Native-authenticator fixture option was not applied exactly once');

if(historical&&historicalTransforms!==1)throw Error('Reviewed V1 selection was not applied exactly once');

if(authorityTransforms!==1)throw Error("Retained authority negative control was not applied exactly once");
