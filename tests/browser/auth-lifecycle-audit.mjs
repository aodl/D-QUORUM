import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const sha=value=>createHash('sha256').update(value).digest('hex');
export const pinnedAuthenticationModules=Object.freeze({
 '@icp-sdk/auth/dist/esm/client/auth-client.js':'e9134de77daeb9ee673351a39cc1f48b9d23f1499073523fa03f1c88b21dd985',
 '@icp-sdk/signer/lib/esm/signer.js':'b0b5b69c5accfafd6628d490435456ef4c40604f01b400c1def53a094423ac11',
 '@icp-sdk/signer/lib/esm/web/postMessageTransport.js':'d29d90b489016328b9be9ada53f8ab65cfde0a10de5d0b9ed8985d0f88258515',
 '@icp-sdk/signer/lib/esm/web/postMessageChannel.js':'96072fb8991ebf7322debc3cd56afe62e2f1d4e605bbe8c99caa6ebd5eb814d4',
});

// The production heartbeat loader runs first. Every other AuthClient/Signer
// module is loaded here byte-for-byte, so test plugins cannot rewrite it.
export function authenticationLifecycleAudit(source){
 const modules={};
 return {
  plugin:{name:'unchanged-production-authentication',setup(build){
   build.onLoad({filter:/(@icp-sdk\/(auth|signer)\/.+\.js$|\/web\/src\/auth\.js$)/},async({path})=>{
    const contents=await readFile(path,'utf8'),name=path.includes('/node_modules/')?path.split('/node_modules/').at(-1):'application/auth.js',digest=sha(contents);
    if(pinnedAuthenticationModules[name]&&pinnedAuthenticationModules[name]!==digest)throw Error('Pinned production authentication input changed: '+name);
    modules[name]={input_sha256:digest,loaded_sha256:digest};return {contents,loader:'js'};
   });
  }},
  async write(path,nonAuthenticationInstrumentation=[]){
   for(const name of Object.keys(pinnedAuthenticationModules))if(!modules[name])throw Error('Authentication build audit did not observe '+name);
   if(!modules['application/auth.js'])throw Error('Production application authentication module absent');
   const policyPath=new URL('../../dendrite/canisters/dendrite/web/sdk-heartbeat-policy.mjs',import.meta.url).pathname;
   const policyBytes=await readFile(policyPath);
   let sourcePolicy;try{sourcePolicy=await readFile(resolve(source,'canisters/dendrite/web/sdk-heartbeat-policy.mjs'));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(sourcePolicy&&sha(sourcePolicy)!==sha(policyBytes))throw Error('Fixture production heartbeat policy differs from the reviewed build policy');
   const {heartbeatPolicy,reviewedHeartbeatSource}=await import(pathToFileURL(policyPath));
   const input=await readFile(resolve(source,'node_modules/@icp-sdk/signer/lib/esm/web/heartbeat/client.js'),'utf8');
   const patched=reviewedHeartbeatSource(input);
   if(sha(input)!==heartbeatPolicy.source_sha256||sha(patched)!==heartbeatPolicy.patched_sha256)throw Error('Production heartbeat policy input/output mismatch');
   const manifest={classification:'Local fixture build delta, not canonical production bytes. Production AuthClient/Signer transport lifecycle preserved.',fixture_authentication_transformations:[],loaded_authentication_modules:modules,production_heartbeat_policy:{...heartbeatPolicy,policy_source_sha256:sha(policyBytes),historical_source_policy_absent:sourcePolicy===undefined,loader:sourcePolicy?'production build loader':'historical test-builder adapter for the same reviewed production policy'},non_authentication_instrumentation:nonAuthenticationInstrumentation,local_configuration:Object.fromEntries(['DENDRITE_BUILD_MODE','DENDRITE_CANISTER_ID','DENDRITE_API_HOST','DENDRITE_FETCH_ROOT_KEY','DENDRITE_DERIVATION_ORIGIN','DENDRITE_IDENTITY_PROVIDER'].map(k=>[k,process.env[k]]))};
   await writeFile(path,JSON.stringify(manifest,null,2));return manifest;
  },
 };
}
