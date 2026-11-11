// Local endpoints and bounded non-authentication probes only. Authentication
// uses the production AuthClient/Signer lifecycle, including ordinary closure.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {signerHeartbeatPolicy} from '../../dendrite/canisters/dendrite/web/sdk-heartbeat-policy.mjs';
import {authenticationLifecycleAudit} from './auth-lifecycle-audit.mjs';
const source=resolve(process.argv[2]),{buildFrontend}=await import(pathToFileURL(`${source}/canisters/dendrite/web/build-frontend.mjs`));
const historical=process.argv[3]==='--reviewed-v1-bootstrap';
if(process.argv.length>3&&!historical)throw Error('Only the reviewed V1 fixture selection is supported');
if(process.env.DENDRITE_BUILD_MODE!=='local'||!new URL(process.env.DENDRITE_IDENTITY_PROVIDER).hostname.endsWith('.localhost'))throw Error('Creation probes are local-test infrastructure only');
let historicalTransforms=0,authorityTransforms=0;const deltas=[],audit=authenticationLifecycleAudit(source);
await buildFrontend({plugins:[signerHeartbeatPolicy(),audit.plugin,{name:'creation-negative-authority-probes',setup(build){
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
 deltas.push({module:'creation-protocol.js',classification:'bounded existing negative authority probes; successful authentication unchanged',original_sha256:createHash('sha256').update(original).digest('hex'),fixture_sha256:createHash('sha256').update(contents).digest('hex')});
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
}}]});

if(historical&&historicalTransforms!==1)throw Error('Reviewed V1 selection was not applied exactly once');

if(authorityTransforms!==1)throw Error("Retained authority negative control was not applied exactly once");

if(historicalTransforms)deltas.push({module:'creation-controller.js',classification:'explicit reviewed historical bootstrap selection',applications:historicalTransforms});
await audit.write(`${source}/../creation-build-delta.json`,deltas);
