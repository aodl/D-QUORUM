// Uses the same reviewed modules/configuration; output exists only in an isolated fixture.
import {signerHeartbeatPolicy} from "../../dendrite/canisters/dendrite/web/sdk-heartbeat-policy.mjs";
import {build} from '../../dendrite/node_modules/esbuild/lib/main.js';
import {resolveBuildConfiguration} from '../../dendrite/canisters/dendrite/web/build-config.mjs';
import {writeFile,readFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]), config=resolveBuildConfiguration();
const define=Object.fromEntries(Object.entries({CANISTER_ID:config.canisterId,API_HOST:config.apiHost,FETCH_ROOT_KEY:config.fetchRootKey,DERIVATION_ORIGIN:config.derivationOrigin,ALTERNATIVE_ORIGINS:config.alternativeOrigins,IDENTITY_PROVIDER:config.identityProvider}).map(([k,v])=>[`__DENDRITE_${k}__`,JSON.stringify(v)]));
const bootstrapPath=resolve('dendrite/target/wasm32-unknown-unknown/release/dendrite_bootstrap.wasm');
define.__SCOPE_BOOTSTRAP_SHA256__=JSON.stringify(createHash('sha256').update(await readFile(bootstrapPath)).digest('hex'));
await copyFile(bootstrapPath,`${source}/canisters/dendrite/public/generated/provisioning-bootstrap.wasm`);
await build({entryPoints:{'scope-probe':resolve('tests/browser/scoped-signing-probe.js'),'evidence-probe':resolve('tests/browser/public-evidence-probe.js'),'mutation-fault-probe':resolve('tests/browser/mutation-fault-probe.js')},bundle:true,minify:true,plugins:[signerHeartbeatPolicy()],format:'esm',target:'es2022',outdir:`${source}/canisters/dendrite/public/generated`,define,alias:{'@dendrite-creation-protocol':`${source}/canisters/dendrite/web/src/creation-protocol.js`,'@dendrite-creation-accounts':`${source}/canisters/dendrite/web/src/creation-accounts.js`,'@dendrite-system-state':`${source}/canisters/dendrite/web/src/certified-canister-state.js`,'@dendrite-public':`${source}/canisters/dendrite/web/src/governance-read-actor.js`,'@dendrite-evidence':`${source}/canisters/dendrite/web/src/preliminary-evidence.js`,'@dendrite-auth':`${source}/canisters/dendrite/web/src/auth.js`,'@dendrite-nns':`${source}/canisters/dendrite/web/src/nns-actor.js`},nodePaths:[resolve('dendrite/node_modules')]});
await writeFile(`${source}/canisters/dendrite/public/404.html`,'<!doctype html><html><head><meta charset="utf-8"><title>Local scoped signing proof</title></head><body><script type="module" src="/generated/scope-probe.js"></script></body></html>');
