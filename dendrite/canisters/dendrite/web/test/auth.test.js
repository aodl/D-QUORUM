import test from "node:test";
import assert from "node:assert/strict";
import { Principal } from "@icp-sdk/core/principal";
import { DelegationChain, DelegationIdentity, Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { AUTHENTICATION_DELEGATION_TTL_NS, NNS_GOVERNANCE_CANISTER_ID, authenticationOrigin, createBrowserAuthSession, deriveGovernanceSession, identityConfiguration, validateGovernanceDelegation } from "../src/auth.js";
import { classifyManagerAuthority, renderManagerAuthority } from "../src/authority.js";
const canonical = "https://dendrite.example", alternative = "https://www.dendrite.example";
const configuration = { derivationOrigin: canonical, alternativeOrigins: [alternative], identityProvider: "https://id.ai/authorize" };
const user = Principal.fromText("aaaaa-aa"), other = Principal.anonymous();
const governance = Principal.fromText(NNS_GOVERNANCE_CANISTER_ID);
async function bootstrap({ targets, expires = Date.now() + 60000 } = {}) {
  const root = Ed25519KeyIdentity.generate(), key = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(root, key.getPublicKey(), new Date(expires), { targets });
  return { identity: DelegationIdentity.fromDelegation(key, chain), key, chain };
}
class FakeAuthClient {
  static instances = [];
  static operation;
  constructor(options) { this.options = options; FakeAuthClient.instances.push(this); }
  async signIn(options) {
    this.signInOptions = options;
    if (FakeAuthClient.operation) await FakeAuthClient.operation();
    const root = Ed25519KeyIdentity.generate();
    const chain = await DelegationChain.create(root, this.options.identity.getPublicKey(), new Date(Date.now() + 60000));
    return DelegationIdentity.fromDelegation(this.options.identity, chain);
  }
  async signOut() { this.signedOut = true; }
}
const session = (origin = canonical) => createBrowserAuthSession({ ...configuration, currentOrigin: origin, AuthClientClass: FakeAuthClient });
test("canonical alternative and unapproved origins are explicit", async () => {
  assert.equal(authenticationOrigin(canonical, configuration), undefined);
  assert.equal(authenticationOrigin(alternative, configuration), canonical);
  assert.throws(() => authenticationOrigin("https://evil.example", configuration));
  assert.ok(session("https://evil.example").originError);
  await assert.rejects(session("https://evil.example").signIn, /disabled/);
  assert.throws(() => identityConfiguration({ derivationOrigin: canonical, alternativeOrigins: [] }), /configuration/);
  const auth = session(alternative); await auth.signIn();
  assert.equal(FakeAuthClient.instances.at(-1).options.derivationOrigin, canonical);
  await auth.signOut();
});
test("genuine SDK child preserves root principal signatures scope and parent expiry", async () => {
  const parent = await bootstrap();
  const result = await deriveGovernanceSession(parent.identity, parent.key.getPublicKey().toDer());
  assert.equal(result.principal.toText(), parent.identity.getPrincipal().toText());
  const chain = result.signingIdentity.getDelegation();
  assert.deepEqual(chain.publicKey, parent.chain.publicKey);
  assert.deepEqual(chain.delegations[0], parent.chain.delegations[0]);
  assert.equal(chain.delegations.length, 2);
  assert.equal(chain.delegations[0].delegation.targets, undefined);
  assert.deepEqual(chain.delegations[1].delegation.targets.map(p => p.toText()), [NNS_GOVERNANCE_CANISTER_ID]);
  assert.ok(chain.delegations[1].signature.length > 0);
  assert.ok(chain.delegations[1].delegation.expiration <= chain.delegations[0].delegation.expiration);
  assert.equal(result.validate(), true);
  assert.throws(() => validateGovernanceDelegation(parent.identity), /Unrestricted/);
});
test("wrong-target empty expired ancestors and expired or broadened children fail closed", async () => {
  for (const options of [{ targets: [] }, { targets: [other] }, { expires: Date.now() - 1000 }]) {
    const parent = await bootstrap(options);
    await assert.rejects(() => deriveGovernanceSession(parent.identity, parent.key.getPublicKey().toDer()), /permit|expired/);
  }
  const parent = await bootstrap({ targets: [governance] });
  const child = await deriveGovernanceSession(parent.identity, parent.key.getPublicKey().toDer());
  assert.throws(() => validateGovernanceDelegation(child.signingIdentity, parent.chain.delegations[0].delegation.expiration), /expired/);
  const extra = Ed25519KeyIdentity.generate();
  const broadChain = await DelegationChain.create(parent.identity, extra.getPublicKey(), new Date(Date.now() + 50000), { previous: parent.chain, targets: [governance, other] });
  assert.throws(() => validateGovernanceDelegation(DelegationIdentity.fromDelegation(extra, broadChain)), /Unrestricted/);
});
test("key principal malformed restrictions and chain bounds cannot be bypassed", async () => {
  const parent = await bootstrap();
  await assert.rejects(() => deriveGovernanceSession(parent.identity, Ed25519KeyIdentity.generate().getPublicKey().toDer()), /bootstrap key/);
  const wrong = { getPrincipal: () => user, getDelegation: () => parent.chain };
  assert.throws(() => validateGovernanceDelegation(wrong), /root/);
  const leaf = parent.chain.delegations[0].delegation;
  leaf.permissions = "queries";
  await assert.rejects(() => deriveGovernanceSession(parent.identity, parent.key.getPublicKey().toDer()), /unsupported/);
  delete leaf.permissions; leaf.targets = ["not a principal"];
  await assert.rejects(() => deriveGovernanceSession(parent.identity, parent.key.getPublicKey().toDer()), /permit/);
  delete leaf.targets;
  parent.chain.delegations.push(...Array(20).fill(parent.chain.delegations[0]));
  await assert.rejects(() => deriveGovernanceSession(parent.identity, parent.key.getPublicKey().toDer()), /inspected safely/);
  assert.throws(() => validateGovernanceDelegation({}), /inspected safely/);
});
test("bootstrap never restores or persists credentials and SDK cleanup precedes publication", async () => {
  FakeAuthClient.instances.length = 0;
  const auth = session(); assert.equal(await auth.restore(), null);
  assert.equal(FakeAuthClient.instances.length, 0);
  const scoped = await auth.signIn(), client = FakeAuthClient.instances[0];
  assert.ok(client.options.identity);
  assert.equal(client.signInOptions.maxTimeToLive, AUTHENTICATION_DELEGATION_TTL_NS);
  assert.equal(client.signedOut, true);
  await client.options.storage.set("credential", "discarded");
  assert.equal(await client.options.storage.get("credential"), null);
  assert.equal(await auth.restore(), scoped);
  await auth.signOut(); assert.equal(await auth.restore(), null);
  assert.throws(scoped.validate, /signed out/);
  assert.equal(await session().restore(), null);
});
test("concurrent sign-in sign-out cancellation and popup failure never publish stale signer", async () => {
  let release;
  FakeAuthClient.operation = () => new Promise(resolve => { release = resolve; });
  const auth = session(), pending = auth.signIn();
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(auth.signIn, /in progress/);
  await auth.signOut(); release();
  await assert.rejects(() => pending, /cancelled/);
  assert.equal(await auth.restore(), null);
  assert.equal(FakeAuthClient.instances.at(-1).signedOut, true);
  FakeAuthClient.operation = () => { throw new Error("popup closed"); };
  await assert.rejects(session().signIn, /popup closed/);
  assert.equal(FakeAuthClient.instances.at(-1).signedOut, true);
  FakeAuthClient.operation = undefined;
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
