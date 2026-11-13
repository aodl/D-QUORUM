// Builder regression only; real canonical qualification uses the verified export.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,symlink,rm,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
// Public reviewed Wasm fixture; independent of ignored Cargo and dist outputs.
const bytes=await readFile(join(root,'dendrite/canisters/bootstrap/compat/fef1735bb08b92bad58ec761f199741fa459292b81864c219aff5442e7423265.wasm'));
const manifest={version:1,component:'dendrite-bootstrap',sha256:digest(bytes),bytes:bytes.length};

async function fixture(t){
 await mkdir(join(root,'.cache/tmp'),{recursive:true});
 const directory=await mkdtemp(join(root,'.cache/tmp/scope-probe-builder-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const source=join(directory,'fixture/source'),release=join(directory,'canonical/bootstrap');
 const local=join(directory,'dendrite/target/wasm32-unknown-unknown/release/dendrite_bootstrap.wasm');
 await mkdir(join(source,'canisters/dendrite/public/generated'),{recursive:true});
 await mkdir(join(directory,'dendrite'),{recursive:true});
 await mkdir(join(directory,'tests'),{recursive:true});
 await mkdir(release,{recursive:true});
 await symlink(join(root,'dendrite/canisters/dendrite/web'),join(source,'canisters/dendrite/web'));
 await symlink(join(root,'dendrite/node_modules'),join(source,'node_modules'));
 await symlink(join(root,'dendrite/node_modules'),join(directory,'dendrite/node_modules'));
 await symlink(join(root,'tests/browser'),join(directory,'tests/browser'));
 await writeFile(join(release,'bootstrap.wasm'),bytes);
 await writeFile(join(release,'manifest.json'),JSON.stringify(manifest));
 const environment={...process.env,DENDRITE_BUILD_MODE:'local',DENDRITE_CANISTER_ID:'hp4av-oiaaa-aaaar-qcaha-cai',DENDRITE_API_HOST:'http://127.0.0.1:4944',DENDRITE_FETCH_ROOT_KEY:'true',DENDRITE_DERIVATION_ORIGIN:'http://hp4av-oiaaa-aaaar-qcaha-cai.localhost:4944',DENDRITE_IDENTITY_PROVIDER:'http://id.ai.localhost:4944/authorize',DENDRITE_ALTERNATIVE_ORIGINS_JSON:'[]',DENDRITE_BOOTSTRAP_TEST_WASM:join(release,'bootstrap.wasm'),DENDRITE_BOOTSTRAP_RELEASE_DIR:release};
 return {source,release,local,environment,run:()=>spawnSync(process.execPath,[join(root,'tests/browser/build-scope-probe.mjs'),source],{cwd:directory,env:environment,encoding:'utf8'})};
}

async function assertProbe(f,expected){
 const result=f.run();assert.equal(result.status,0,result.stderr);
 assert.deepEqual(await readFile(join(f.source,'canisters/dendrite/public/generated/provisioning-bootstrap.wasm')),expected);
 const probe=await readFile(join(f.source,'canisters/dendrite/public/generated/scope-probe.js'),'utf8');
 assert.ok(probe.includes(digest(expected)),'probe hash binds the exact emitted Wasm bytes');
 assert.ok(await readFile(join(f.source,'../scope-build-delta.json'),'utf8'));
}

test('canonical scope probe builds with its manifest-bound export and no local Rust target',async t=>{
 const f=await fixture(t);
 await assert.rejects(access(f.local),{code:'ENOENT'});
 await assertProbe(f,bytes);
 await assert.rejects(access(f.local),{code:'ENOENT'});
});

test('canonical scope probe overrides a different local Cargo artifact',async t=>{
 const f=await fixture(t);await mkdir(resolve(f.local,'..'),{recursive:true});
 await writeFile(f.local,'different local artifact');
 await assertProbe(f,bytes);
});

test('local scope probe retains the Cargo path and verifies its prepared manifest',async t=>{
 const f=await fixture(t);delete f.environment.DENDRITE_BOOTSTRAP_TEST_WASM;delete f.environment.DENDRITE_BOOTSTRAP_RELEASE_DIR;
 await mkdir(resolve(f.local,'..'),{recursive:true});await writeFile(f.local,bytes);
 const release=resolve(f.local,'../../../bootstrap-release');await mkdir(release,{recursive:true});
 await writeFile(join(release,'manifest.json'),JSON.stringify(manifest));
 await assertProbe(f,bytes);
});

test('scope probe rejects corrupt or missing canonical artifacts without using local bytes',async t=>{
 for(const missing of [false,true])await t.test(missing?'missing':'corrupt',async t=>{
  const f=await fixture(t);await mkdir(resolve(f.local,'..'),{recursive:true});await writeFile(f.local,bytes);
  if(missing)await rm(f.environment.DENDRITE_BOOTSTRAP_TEST_WASM);
  else await writeFile(f.environment.DENDRITE_BOOTSTRAP_TEST_WASM,Buffer.concat([bytes,Buffer.from('corrupt')]));
  const result=f.run();assert.notEqual(result.status,0);
  assert.match(result.stderr,missing?/ENOENT/:/bootstrap.*manifest.*mismatch/i);
  await assert.rejects(access(join(f.source,'canisters/dendrite/public/generated/provisioning-bootstrap.wasm')),{code:'ENOENT'});
 });
});

test('scope probe rejects missing, malformed, or incorrect bootstrap manifests',async t=>{
 for(const [name,value]of [['missing',undefined],['malformed','{'],['digest',{...manifest,sha256:'0'.repeat(64)}],['length',{...manifest,bytes:bytes.length+1}],['component',{...manifest,component:'other'}],['version',{...manifest,version:2}]])await t.test(name,async t=>{
  const f=await fixture(t),path=join(f.release,'manifest.json');
  if(value===undefined)await rm(path);else await writeFile(path,typeof value==='string'?value:JSON.stringify(value));
  const result=f.run();assert.notEqual(result.status,0,name);
  assert.match(result.stderr,name==='missing'?/ENOENT/:name==='malformed'?/SyntaxError/:/bootstrap manifest mismatch/);
  await assert.rejects(access(join(f.source,'canisters/dendrite/public/generated/provisioning-bootstrap.wasm')),{code:'ENOENT'});
 });
});

test('canonical scope probe requires an explicit nonempty artifact and release directory',async t=>{
 for(const [key,value]of [['DENDRITE_BOOTSTRAP_TEST_WASM',''],['DENDRITE_BOOTSTRAP_RELEASE_DIR',''],['DENDRITE_BOOTSTRAP_RELEASE_DIR',undefined]])await t.test(key+': '+value,async t=>{
  const f=await fixture(t);if(value===undefined)delete f.environment[key];else f.environment[key]=value;
  const result=f.run();assert.notEqual(result.status,0);
  assert.match(result.stderr,/requires an explicit bootstrap artifact and release directory/);
 });
});
