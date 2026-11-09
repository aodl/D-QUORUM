import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {creationArtifact,reviewedHistoricalBootstraps} from '../src/creation-compatibility.js';
import {sha256Hex} from '../src/creation-accounts.js';
test('supported genuine historical build variants remain checksum-bound independently of current frontend artifact',async()=>{
 for(const old of reviewedHistoricalBootstraps){const bytes=await readFile(new URL(`../../../bootstrap/compat/${old.sha256}.wasm`,import.meta.url));assert.equal(sha256Hex(bytes),old.sha256);assert.equal(bytes.length,old.bytes);assert.equal(creationArtifact(old.sha256,{sha256:'new'}).sha256,old.sha256);}
 assert.throws(()=>creationArtifact('0'.repeat(64),{sha256:'new'}),/outside reviewed/);
});
