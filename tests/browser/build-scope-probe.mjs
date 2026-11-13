// Uses the same reviewed modules/configuration; output exists only in an isolated fixture.
import {authenticationLifecycleAudit} from './auth-lifecycle-audit.mjs';
import {signerHeartbeatPolicy} from "../../dendrite/canisters/dendrite/web/sdk-heartbeat-policy.mjs";
import {build} from '../../dendrite/node_modules/esbuild/lib/main.js';
import {resolveBuildConfiguration} from '../../dendrite/canisters/dendrite/web/build-config.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]), config=resolveBuildConfiguration(),audit=authenticationLifecycleAudit(source);
const define=Object.fromEntries(Object.entries({CANISTER_ID:config.canisterId,API_HOST:config.apiHost,FETCH_ROOT_KEY:config.fetchRootKey,DERIVATION_ORIGIN:config.derivationOrigin,ALTERNATIVE_ORIGINS:config.alternativeOrigins,IDENTITY_PROVIDER:config.identityProvider}).map(([k,v])=>[`__DENDRITE_${k}__`,JSON.stringify(v)]));
const canonical=process.env.DENDRITE_BOOTSTRAP_TEST_WASM,release=process.env.DENDRITE_BOOTSTRAP_RELEASE_DIR;
if(canonical!==undefined&&(!canonical||!release))throw Error('Canonical scope probe requires an explicit bootstrap artifact and release directory');
const bootstrapPath=resolve(canonical??'dendrite/target/wasm32-unknown-unknown/release/dendrite_bootstrap.wasm');
const manifest=JSON.parse(await readFile(resolve(release??'dendrite/target/bootstrap-release','manifest.json'),'utf8'));
const bootstrap=await readFile(bootstrapPath),bootstrapHash=createHash('sha256').update(bootstrap).digest('hex');
if(manifest.version!==1||manifest.component!=='dendrite-bootstrap'||manifest.bytes!==bootstrap.length||manifest.sha256!==bootstrapHash)throw Error('Scope probe bootstrap manifest mismatch');
define.__SCOPE_BOOTSTRAP_SHA256__=JSON.stringify(bootstrapHash);
await writeFile(`${source}/canisters/dendrite/public/generated/provisioning-bootstrap.wasm`,bootstrap);
await build({entryPoints:{'auth-capability-probe':resolve('tests/browser/auth-capability-probe.js'),'scope-probe':resolve('tests/browser/scoped-signing-probe.js'),'evidence-probe':resolve('tests/browser/public-evidence-probe.js'),'mutation-fault-probe':resolve('tests/browser/mutation-fault-probe.js')},bundle:true,minify:true,plugins:[signerHeartbeatPolicy(),audit.plugin],format:'esm',target:'es2022',outdir:`${source}/canisters/dendrite/public/generated`,define,alias:{'@dendrite-creation-protocol':`${source}/canisters/dendrite/web/src/creation-protocol.js`,'@dendrite-creation-accounts':`${source}/canisters/dendrite/web/src/creation-accounts.js`,'@dendrite-system-state':`${source}/canisters/dendrite/web/src/certified-canister-state.js`,'@dendrite-public':`${source}/canisters/dendrite/web/src/governance-read-actor.js`,'@dendrite-evidence':`${source}/canisters/dendrite/web/src/preliminary-evidence.js`,'@dendrite-auth':`${source}/canisters/dendrite/web/src/auth.js`,'@dendrite-nns':`${source}/canisters/dendrite/web/src/nns-actor.js`},nodePaths:[resolve('dendrite/node_modules')]});
await writeFile(`${source}/canisters/dendrite/public/404.html`,'<!doctype html><html><head><meta charset="utf-8"><title>Local scoped signing proof</title></head><body><script type="module" src="/generated/browser-probe-entry.js"></script></body></html>');

await writeFile(`${source}/canisters/dendrite/public/generated/browser-probe-entry.js`,"await import(new URL(location.href).searchParams.has('auth-capability')?'./auth-capability-probe.js':'./scope-probe.js');");
await audit.write(resolve(source,"../scope-build-delta.json"),[{classification:"isolated test-only entries",entries:["browser-probe-entry","auth-capability-probe","scope-probe","evidence-probe","mutation-fault-probe"],authentication_modules_unchanged:true}]);
