import {createHash} from "node:crypto";
import {readFile,readdir,mkdir,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";

const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const run=args=>{const result=spawnSync("cargo",args,{encoding:"utf8",stdio:["ignore","pipe","inherit"]});if(result.status!==0)throw Error(`Bootstrap build failed: cargo ${args.join(" ")}`);return result.stdout;};
async function sourceFiles(directory){const out=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory())out.push(...await sourceFiles(path));else if(entry.name.endsWith(".rs")||entry.name==="Cargo.toml"||entry.name.endsWith(".did"))out.push(path);}return out;}
export async function prepareBootstrap(){
  const files=["Cargo.toml","Cargo.lock","rust-toolchain.toml",...await sourceFiles("canisters/bootstrap"),...await sourceFiles("crates/ic-clients"),...await sourceFiles("crates/dendrite-types")].sort();
  const entries=await Promise.all(files.map(async p=>[p,hash(await readFile(p))]));
  const sourceFingerprint=hash(Buffer.from(JSON.stringify(entries)));
  const directory="target/bootstrap-release";await mkdir(directory,{recursive:true});
  const external=process.env.DENDRITE_BOOTSTRAP_RELEASE_DIR;
  if(external){const manifest=JSON.parse(await readFile(resolve(external,"manifest.json"),"utf8"));const bytes=await readFile(resolve(external,"bootstrap.wasm"));
    if(manifest.source_fingerprint!==sourceFingerprint||manifest.sha256!==hash(bytes))throw Error("Prebuilt bootstrap source/byte binding mismatch.");
    return {bytes,manifest,candid:await readFile(resolve(external,"bootstrap.did"))};}
  const compiled=process.env.DENDRITE_BOOTSTRAP_COMPILED_DIR;
  if(!compiled)run(["build","--locked","--release","--target","wasm32-unknown-unknown","-p","dendrite-bootstrap"]);
  const bytes=await readFile(compiled?resolve(compiled,"bootstrap.wasm"):"target/wasm32-unknown-unknown/release/dendrite_bootstrap.wasm");
  const candid=compiled?await readFile(resolve(compiled,"bootstrap.did")):Buffer.from(run(["run","--locked","--quiet","-p","dendrite-bootstrap","--example","bootstrap-interface"]));
  const reviewed=await readFile("canisters/bootstrap/bootstrap.did");if(!candid.equals(reviewed))throw Error("Bootstrap Candid is stale; regenerate and review before building.");
  const policy=JSON.parse(compiled?await readFile(resolve(compiled,"policy.json"),"utf8"):run(["run","--locked","--quiet","-p","dendrite-bootstrap","--example","bootstrap-policy"]));
  if(JSON.stringify(policy)!==JSON.stringify(JSON.parse(await readFile("src/declarations/bootstrap/policy.json","utf8"))))throw Error("Bootstrap shared policy declaration is stale.");
  const manifest={version:1,component:"dendrite-bootstrap",sha256:hash(bytes),bytes:bytes.length,candid_sha256:hash(candid),source_fingerprint:sourceFingerprint,policy};
  await writeFile(`${directory}/bootstrap.wasm`,bytes);
  await writeFile(`${directory}/bootstrap.did`,candid);await writeFile(`${directory}/manifest.json`,`${JSON.stringify(manifest,null,2)}\n`);
  return {bytes,manifest,candid};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))await prepareBootstrap();
