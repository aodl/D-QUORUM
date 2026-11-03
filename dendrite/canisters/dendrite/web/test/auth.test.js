import test from "node:test";
import assert from "node:assert/strict";
import { Principal } from "@icp-sdk/core/principal";
import { AUTHENTICATION_DELEGATION_TTL_NS, NNS_GOVERNANCE_CANISTER_ID, authenticationOrigin, createBrowserAuthSession, identityConfiguration, validateGovernanceDelegation } from "../src/auth.js";
import { classifyManagerAuthority, renderManagerAuthority } from "../src/authority.js";

const canonical = "https://dendrite.example";
const alternative = "https://www.dendrite.example";
const configuration = {
  derivationOrigin: canonical,
  alternativeOrigins: [alternative],
  identityProvider: "https://id.ai/authorize",
};
const user = Principal.fromText("aaaaa-aa");
const other = Principal.fromText("2vxsx-fae");
const governance = Principal.fromText(NNS_GOVERNANCE_CANISTER_ID);
const delegation = (targets = [governance], expiration = BigInt(Date.now() + 60_000) * 1_000_000n) => ({
  delegations: [{ delegation: { expiration, targets } }],
});
const identity = (principal = user, chain = delegation()) => ({ getPrincipal: () => principal, getDelegation: () => chain });

class FakeAuthClient {
  static instances = [];
  constructor(options) { this.options = options; this.authenticated = false; FakeAuthClient.instances.push(this); }
  isAuthenticated() { return this.authenticated; }
  async getIdentity() { if (this.restoreError) throw this.restoreError; return this.identity; }
  async signIn(options) { this.signInOptions = options; if (this.signInError) throw this.signInError; return this.identity; }
  async signOut() { this.signedOut = true; }
}

const session = (origin = canonical) => createBrowserAuthSession({
  ...configuration,
  currentOrigin: origin,
  AuthClientClass: FakeAuthClient,
});

test("canonical alternative and unapproved origins are explicit", () => {
  assert.equal(authenticationOrigin(canonical, configuration), undefined);
  assert.equal(authenticationOrigin(alternative, configuration), canonical);
  assert.throws(() => authenticationOrigin("https://evil.example", configuration));
  const canonicalSession = session();
  canonicalSession.restore();
  assert.equal(FakeAuthClient.instances.at(-1).options.derivationOrigin, undefined);
  const alternativeSession = session(alternative);
  alternativeSession.restore();
  assert.equal(FakeAuthClient.instances.at(-1).options.derivationOrigin, canonical);
  assert.ok(session("https://evil.example").originError);
  assert.throws(() => identityConfiguration({ derivationOrigin: canonical, alternativeOrigins: [] }), /configuration/);
});

test("one client restores signs in for at most eight hours and signs out", async () => {
  FakeAuthClient.instances.length = 0;
  const auth = session();
  assert.equal(await auth.restore(), null);
  const client = FakeAuthClient.instances[0];
  client.identity = identity();
  client.authenticated = true;
  assert.equal((await auth.restore()).principal.toText(), user.toText());
  assert.equal((await auth.signIn()).principal.toText(), user.toText());
  assert.equal(client.signInOptions.maxTimeToLive, AUTHENTICATION_DELEGATION_TTL_NS);
  assert.deepEqual(client.signInOptions.targets.map((target) => target.toText()), [NNS_GOVERNANCE_CANISTER_ID]);
  await auth.signOut();
  assert.equal(client.signedOut, true);
  assert.equal(FakeAuthClient.instances.length, 1);
});

test("delegations must be live and restricted only to NNS Governance", () => {
  assert.equal(validateGovernanceDelegation(identity()).principal.toText(), user.toText());
  assert.throws(() => validateGovernanceDelegation(identity(user, delegation(null))), /Unrestricted/);
  assert.throws(() => validateGovernanceDelegation(identity(user, delegation([other]))), /not restricted/);
  assert.throws(() => validateGovernanceDelegation(identity(user, delegation([governance], 1n))), /expired/);
  assert.throws(() => validateGovernanceDelegation({ getPrincipal: () => user }), /inspected safely/);
});

test("invalid restored legacy sessions are cleared", async () => {
  const auth = session();
  await auth.restore();
  const client = FakeAuthClient.instances.at(-1);
  client.authenticated = true;
  client.identity = identity(user, delegation(null));
  await assert.rejects(() => auth.restore(), /Unrestricted/);
  assert.equal(client.signedOut, true);
});

test("cancel failure expiry malformed identity and storage errors fail closed", async () => {
  let auth = session();
  await auth.restore();
  let client = FakeAuthClient.instances.at(-1);
  client.identity = identity();
  client.signInError = new Error("popup closed");
  await assert.rejects(() => auth.signIn(), /popup closed/);
  client.signInError = new Error("authentication cancelled");
  await assert.rejects(() => auth.signIn(), /cancelled/);

  auth = session();
  assert.equal(await auth.restore(), null);
  client = FakeAuthClient.instances.at(-1);
  client.authenticated = true;
  client.identity = {};
  await assert.rejects(() => auth.restore(), /inspected safely/);
  client.restoreError = new Error("storage unavailable");
  await assert.rejects(() => auth.restore(), /storage unavailable/);

  auth = session();
  await auth.signOut();
  await auth.restore();
  client = FakeAuthClient.instances.at(-1);
  client.authenticated = true;
  client.identity = identity(Principal.anonymous());
  await assert.rejects(() => auth.restore(), /anonymous identity/);
});

const manager = (status, controller = [], hotKeys = []) => ({
  neuron_id: 100n,
  evidence_status: { [status]: null },
  controller,
  hot_keys: hotKeys,
  known_neuron: [],
});

test("manager authority uses exact parsed principals and unavailable never authorizes", () => {
  assert.equal(classifyManagerAuthority(manager("Found", [user]), user).role, "Controller");
  assert.equal(classifyManagerAuthority(manager("Found", [], [user]), user).role, "Hotkey");
  assert.equal(classifyManagerAuthority(manager("Found", [user], [user]), user).role, "Controller and hotkey");
  assert.equal(classifyManagerAuthority(manager("Found", [other], [other]), user).role, "No authority");
  assert.equal(classifyManagerAuthority(manager("Unavailable", [user], [user]), user).role, "Unavailable");
  assert.equal(classifyManagerAuthority(manager("ConfirmedMissing", [user], [user]), user).role, "Manager not returned");
});

class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; }
  append(...children) { this.children.push(...children); }
}

test("raw duplicates and hostile names render inert while new reports recompute authority", () => {
  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  try {
    const first = manager("Found", [user]);
    first.known_neuron = [{ name: "<img onerror=attack>" }];
    const root = new FakeNode("main");
    renderManagerAuthority(root, { managers: [first, first] }, user);
    const rendered = JSON.stringify(root);
    assert.equal((rendered.match(/<img onerror=attack>/g) ?? []).length, 2);
    assert.equal((rendered.match(/Controller/g) ?? []).length >= 2, true);
    assert.doesNotMatch(rendered, /AddHotKey|manage_neuron/);
    assert.match(rendered, /Eligible proposer/);
    assert.match(rendered, /subject to fresh preflight and confirmation/);
    assert.doesNotMatch(rendered, /future proposer|separately audited transaction tranche|No NNS mutation is performed/);
    assert.equal(classifyManagerAuthority(first, user).eligible, true);
    assert.equal(classifyManagerAuthority(manager("Found", [other]), user).eligible, false);
  } finally {
    globalThis.document = prior;
  }
});
