import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {authenticationLifecycleAudit,pinnedAuthenticationModules} from './auth-lifecycle-audit.mjs';

test('fixture loader returns pinned production authentication bytes without transformations',async()=>{
 const audit=authenticationLifecycleAudit(new URL('../../dendrite',import.meta.url).pathname);let load;
 audit.plugin.setup({onLoad:(_,handler)=>load=handler});
 for(const [module,digest]of Object.entries(pinnedAuthenticationModules)){
  const path=new URL('../../dendrite/node_modules/'+module,import.meta.url).pathname;
  const raw=await readFile(path,'utf8'),loaded=await load({path});
  assert.equal(loaded.contents,raw);assert.equal(createHash('sha256').update(loaded.contents).digest('hex'),digest);
 }
 const path=new URL('../../dendrite/canisters/dendrite/web/src/auth.js',import.meta.url).pathname;
 assert.equal((await load({path})).contents,await readFile(path,'utf8'));
});

test('creation fixtures contain no retained-window authentication transport or opener surgery',async()=>{
 for(const name of ['build-creation-fixture.mjs','creation-journey.mjs','team-management.mjs']){
  const text=await readFile(new URL(name,import.meta.url),'utf8');
  for(const forbidden of ['creationNativeSigner','creationNativeSignerWindow','autoCloseTransportChannel','dendrite-native-opener-v1','window.opener=','holdIdentityScripts','retainedWindowTransportSource'])assert.equal(text.includes(forbidden),false,`${name}: ${forbidden}`);
 }
 const production=await readFile(new URL('../../dendrite/canisters/dendrite/web/build-frontend.mjs',import.meta.url),'utf8');
 assert.equal(production.includes('synthetic-passkeys'),false);assert.equal(production.includes('auth-capability-probe'),false);
 assert.ok(production.includes('signerHeartbeatPolicy()'));
});
