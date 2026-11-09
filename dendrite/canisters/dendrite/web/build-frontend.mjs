import {signerHeartbeatPolicy} from "./sdk-heartbeat-policy.mjs";
import {reviewedHistoricalBootstraps} from "./src/creation-compatibility.js";
import { build } from "esbuild";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolveBuildConfiguration } from "./build-config.mjs";
import { prepareBootstrap } from "./build-bootstrap.mjs";

export async function buildFrontend({ plugins = [] } = {}) {
const root = "canisters/dendrite";
const configuration = resolveBuildConfiguration();
const output = process.env.DENDRITE_FRONTEND_OUTPUT_DIR ?? `${root}/public`;
const generated = `${output}/generated`;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 16);
const bootstrap = await prepareBootstrap();
const bootstrapName = `bootstrap.${bootstrap.manifest.sha256.slice(0,16)}.wasm`;
const bootstrapManifest = { ...bootstrap.manifest, wasm_path: `/generated/${bootstrapName}` };
await rm(generated, { recursive: true, force: true });
await mkdir(generated, { recursive: true });
await writeFile(`${generated}/${bootstrapName}`, bootstrap.bytes);
for(const reviewed of reviewedHistoricalBootstraps){
 const bytes=await readFile(`canisters/bootstrap/compat/${reviewed.sha256}.wasm`);
 if(bytes.length!==reviewed.bytes||createHash("sha256").update(bytes).digest("hex")!==reviewed.sha256)throw Error("Historical bootstrap source artifact checksum mismatch");
 await writeFile(`${generated}/bootstrap.${reviewed.sha256.slice(0,16)}.wasm`,bytes);
}

const bootstrapMetadata = Buffer.from(`${JSON.stringify(bootstrapManifest,null,2)}\n`);
const bootstrapMetadataName = `bootstrap-manifest.${digest(bootstrapMetadata)}.json`;
const bootstrapCandidName = `bootstrap.${digest(bootstrap.candid)}.did`;
await writeFile(`${generated}/${bootstrapMetadataName}`,bootstrapMetadata);
await writeFile(`${generated}/${bootstrapCandidName}`,bootstrap.candid);
const result = await build({ entryPoints: [`${root}/web/src/main.js`], bundle: true, minify: true, sourcemap: false, write: false, target: "es2022", legalComments: "none", format: "esm", plugins:[signerHeartbeatPolicy(),...plugins], define: {
  __DENDRITE_CANISTER_ID__: JSON.stringify(configuration.canisterId),
  __DENDRITE_API_HOST__: JSON.stringify(configuration.apiHost),
  __DENDRITE_FETCH_ROOT_KEY__: JSON.stringify(configuration.fetchRootKey),
  __DENDRITE_DERIVATION_ORIGIN__: JSON.stringify(configuration.derivationOrigin),
  __DENDRITE_ALTERNATIVE_ORIGINS__: JSON.stringify(configuration.alternativeOrigins),
  __DENDRITE_IDENTITY_PROVIDER__: JSON.stringify(configuration.identityProvider),
  __DENDRITE_BOOTSTRAP_MANIFEST__: JSON.stringify(bootstrapManifest),
} });
const js = result.outputFiles[0].contents;
const css = await readFile(`${root}/web/src/styles.css`);
const jsName = `app.${digest(js)}.js`, cssName = `styles.${digest(css)}.css`;
await writeFile(`${generated}/${jsName}`, js);
await writeFile(`${generated}/${cssName}`, css);
let html = await readFile(`${root}/web/index.template.html`, "utf8");
html = html.replace("__APP_JS__", `/generated/${jsName}`).replace("__APP_CSS__", `/generated/${cssName}`);
await writeFile(`${output}/index.html`, html);
await mkdir(`${output}/.well-known`, { recursive: true });
await writeFile(
  `${output}/.well-known/ii-alternative-origins`,
  JSON.stringify({ alternativeOrigins: configuration.alternativeOrigins }),
);
const manifest = { "app.js": `/generated/${jsName}`, "styles.css": `/generated/${cssName}`, "bootstrap.wasm":bootstrapManifest.wasm_path,
  "bootstrap-manifest.json":`/generated/${bootstrapMetadataName}`, "bootstrap.did":`/generated/${bootstrapCandidName}` };
await writeFile(`${output}/asset-manifest.json`, `${JSON.stringify(manifest, Object.keys(manifest).sort(), 2)}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await buildFrontend();
