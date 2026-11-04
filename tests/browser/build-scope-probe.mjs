// Uses the same reviewed modules/configuration; output exists only in an isolated fixture.
import {build} from '../../dendrite/node_modules/esbuild/lib/main.js';
import {resolveBuildConfiguration} from '../../dendrite/canisters/dendrite/web/build-config.mjs';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const source=resolve(process.argv[2]), config=resolveBuildConfiguration();
const define=Object.fromEntries(Object.entries({CANISTER_ID:config.canisterId,API_HOST:config.apiHost,FETCH_ROOT_KEY:config.fetchRootKey,DERIVATION_ORIGIN:config.derivationOrigin,ALTERNATIVE_ORIGINS:config.alternativeOrigins,IDENTITY_PROVIDER:config.identityProvider}).map(([k,v])=>[`__DENDRITE_${k}__`,JSON.stringify(v)]));
await build({entryPoints:{'scope-probe':resolve('tests/browser/scoped-signing-probe.js'),'evidence-probe':resolve('tests/browser/public-evidence-probe.js'),'mutation-fault-probe':resolve('tests/browser/mutation-fault-probe.js')},bundle:true,minify:true,format:'esm',target:'es2022',outdir:`${source}/canisters/dendrite/public/generated`,define,alias:{'@dendrite-public':`${source}/canisters/dendrite/web/src/governance-read-actor.js`,'@dendrite-evidence':`${source}/canisters/dendrite/web/src/preliminary-evidence.js`,'@dendrite-auth':`${source}/canisters/dendrite/web/src/auth.js`,'@dendrite-nns':`${source}/canisters/dendrite/web/src/nns-actor.js`},nodePaths:[resolve('dendrite/node_modules')]});
await writeFile(`${source}/canisters/dendrite/public/404.html`,'<!doctype html><html><head><meta charset="utf-8"><title>Local scoped signing proof</title></head><body><script type="module" src="/generated/scope-probe.js"></script></body></html>');
