import assert from "node:assert/strict";
import test from "node:test";
import { Cbor, LookupPathStatus } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import {
  createCertifiedCanisterStateReader,
  decodeCertifiedControllers,
  normalizeCertifiedCanisterState,
} from "../src/certified-canister-state.js";

const encoder = new TextEncoder();
const controller = Principal.fromUint8Array(Uint8Array.of(1));
const other = Principal.fromUint8Array(Uint8Array.of(2));
const nanos = 1_700_000_000_000_000_000n;
const leb = (value) => {
  const bytes = [];
  let remaining = BigInt(value);
  do {
    let octet = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining) octet |= 0x80;
    bytes.push(octet);
  } while (remaining);
  return Uint8Array.from(bytes);
};
const label = (value) => new TextDecoder().decode(value);
const certificate = ({ controllers = [], moduleHash, moduleStatus = LookupPathStatus.Absent } = {}) => ({
  lookup_path(path) {
    if (path.length === 1 && label(path[0]) === "time") {
      return { status: LookupPathStatus.Found, value: leb(nanos) };
    }
    const name = label(path[2]);
    if (name === "controllers") {
      return { status: LookupPathStatus.Found, value: Cbor.encode(controllers.map((item) => item.toUint8Array())) };
    }
    if (name === "module_hash") {
      return moduleStatus === LookupPathStatus.Found
        ? { status: moduleStatus, value: moduleHash }
        : { status: moduleStatus };
    }
    return { status: LookupPathStatus.Unknown };
  },
});

test("certified empty canister proves controllers and module-hash absence", () => {
  const state = normalizeCertifiedCanisterState(certificate(), controller);
  assert.equal(state.callSucceeded, true);
  assert.equal(state.moduleHash, undefined);
  assert.deepEqual(state.controllers, []);
  assert.equal(state.certificateTime, "2023-11-14T22:13:20.000Z");
});

test("installed module and controller list are retained and deterministically sorted", () => {
  const hash = Uint8Array.from({ length: 32 }, (_, index) => index);
  const state = normalizeCertifiedCanisterState(certificate({
    controllers: [other, controller],
    moduleHash: hash,
    moduleStatus: LookupPathStatus.Found,
  }), controller);
  assert.deepEqual(state.moduleHash, hash);
  assert.deepEqual(state.controllers.map((item) => item.toText()), [controller, other]
    .map((item) => item.toText()).sort());
});

test("malformed certified fields never produce partial evidence", () => {
  assert.throws(() => decodeCertifiedControllers(Uint8Array.of(0xff)), /malformed/);
  assert.throws(() => decodeCertifiedControllers(Cbor.encode([new Uint8Array(30)])), /invalid length/);
  assert.throws(() => decodeCertifiedControllers(Cbor.encode(Array.from({ length: 11 }, () => Uint8Array.of(1)))), /pinned bound/);
  assert.throws(() => normalizeCertifiedCanisterState(certificate({
    moduleHash: new Uint8Array(31),
    moduleStatus: LookupPathStatus.Found,
  }), controller), /module hash is malformed/);
  assert.throws(() => normalizeCertifiedCanisterState(certificate({
    moduleStatus: LookupPathStatus.Unknown,
  }), controller), /ambiguous/);
  const missingControllers = certificate();
  missingControllers.lookup_path = (path) => label(path.at(-1)) === "controllers"
    ? { status: LookupPathStatus.Absent }
    : certificate().lookup_path(path);
  assert.throws(() => normalizeCertifiedCanisterState(missingControllers, controller), /Controllers is absent/);
});

test("reader binds one anonymous read_state to the exact controller and evicts rejection", async () => {
  const seen = [];
  let attempts = 0;
  const agent = {
    rootKey: Uint8Array.of(9),
    readState: async (effective, options) => {
      seen.push({ effective, options });
      return { certificate: Uint8Array.of(7) };
    },
  };
  const reader = createCertifiedCanisterStateReader({
    host: "https://icp-api.io",
    fetchRootKey: false,
    createAgent: async (options) => {
      assert.equal(options.identity.getPrincipal().isAnonymous(), true);
      assert.equal(options.shouldFetchRootKey, false);
      return agent;
    },
    createCertificate: async (options) => {
      attempts += 1;
      assert.equal(options.principal.canisterId.toText(), controller.toText());
      assert.equal(options.disableTimeVerification, false);
      if (attempts === 1) throw new Error("invalid certificate signature");
      return certificate();
    },
  });
  await assert.rejects(reader.read(controller), /invalid certificate signature/);
  assert.equal(reader.cache.size, 0);
  const state = await reader.read(controller);
  assert.equal(state.moduleHash, undefined);
  assert.equal(seen.length, 2);
  assert.ok(seen.every(({ effective }) => effective.toText() === controller.toText()));
  assert.ok(seen.every(({ options }) => options.paths.length === 3));
});

test("production root-key policy cannot be weakened", () => {
  assert.throws(() => createCertifiedCanisterStateReader({
    host: "https://icp-api.io",
    fetchRootKey: true,
  }), /must not fetch a root key/);
});

test("certified readiness data and malformed time cannot become partial teardown proof",async()=>{
 const base=certificate(),wrap=(field,value,status=LookupPathStatus.Found)=>({lookup_path(path){return label(path.at(-1))===field?{status,value}:base.lookup_path(path);}});
 const marker=new Uint8Array(32).fill(7);assert.deepEqual(normalizeCertifiedCanisterState(wrap('certified_data',marker),controller).certifiedData,marker);
 assert.throws(()=>normalizeCertifiedCanisterState(wrap('certified_data',new Uint8Array(33)),controller),/Certified data/);
 for(const value of [new Uint8Array(),new Uint8Array(11),Uint8Array.of(0x80),Uint8Array.of(0x81,0),Uint8Array.of(0,1)])assert.throws(()=>normalizeCertifiedCanisterState(wrap('time',value),controller),/time/);
 assert.throws(()=>normalizeCertifiedCanisterState(wrap('time',undefined,LookupPathStatus.Unknown),controller),/Certificate time is absent/);
 assert.throws(()=>decodeCertifiedControllers(Cbor.encode('not an array')),/malformed/);
 // An indefinite array encodes the same values, but is not canonical CBOR.
 assert.throws(()=>decodeCertifiedControllers(Uint8Array.of(0x9f,0xff)),/canonically/);
 const reader=createCertifiedCanisterStateReader({host:'http://127.0.0.1:4944',fetchRootKey:true,createAgent:async()=>({rootKey:undefined})});await assert.rejects(()=>reader.read(controller),/root key/);assert.equal(reader.cache.size,0);reader.clear();
});
