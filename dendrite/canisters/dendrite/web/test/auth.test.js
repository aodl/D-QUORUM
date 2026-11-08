import test from "node:test";
import assert from "node:assert/strict";
import { Principal } from "@icp-sdk/core/principal";
import { DelegationChain, DelegationIdentity, Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { AUTHENTICATION_DELEGATION_TTL_NS, NNS_GOVERNANCE_CANISTER_ID, authenticationOrigin, createBrowserAuthSession, deriveGovernanceSession, identityConfiguration, validateGovernanceDelegation } from "../src/auth.js";
import { classifyManagerAuthority, renderManagerAuthority } from "../src/authority.js";
import { CMC_CANISTER_ID, CYCLES_LEDGER_CANISTER_ID, ICP_LEDGER_CANISTER_ID, PROVISIONING_DELEGATION_TTL_NS, createBrowserProvisioningSession, deriveProvisioningSession, validateProvisioningDelegation } from "../src/auth.js";
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

test("named provisioning children retain P and exact limited destinations without changing management login", async () => {
  const parent = await bootstrap({ expires: Date.now() + 3_600_000 });
  const controller = "pi33i-pt777-77776-aaaaa-cai";
  for (const [profile, canister, targets] of [
    ["FundProvisioning", undefined, [ICP_LEDGER_CANISTER_ID, CMC_CANISTER_ID, CYCLES_LEDGER_CANISTER_ID]],
    ["ManageBootstrap", controller, ["aaaaa-aa", controller]],
    ["CallBootstrap", controller, [controller]],
  ]) {
    const child = await deriveProvisioningSession(parent.identity, parent.key.getPublicKey().toDer(), profile, canister);
    assert.equal(child.principal.toText(), parent.identity.getPrincipal().toText());
    const leaf = child.signingIdentity.getDelegation().delegations.at(-1).delegation;
    assert.deepEqual(leaf.targets.map((p) => p.toText()), targets);
    assert.ok(leaf.expiration <= BigInt(Date.now()) * 1_000_000n + PROVISIONING_DELEGATION_TTL_NS);
    assert.equal(child.validate(), true);
    assert.throws(() => validateGovernanceDelegation(child.signingIdentity), /permit|Unrestricted/);
    assert.throws(() => validateProvisioningDelegation(parent.identity, profile, canister), /Unscoped/);
  }
  const governanceOnly = await deriveGovernanceSession(parent.identity, parent.key.getPublicKey().toDer());
  assert.deepEqual(governanceOnly.signingIdentity.getDelegation().delegations.at(-1).delegation.targets.map((p) => p.toText()), [NNS_GOVERNANCE_CANISTER_ID]);
});

test("provisioning rejects arbitrary targets broadened children inherited exclusions and changed keys", async () => {
  const parent = await bootstrap();
  for (const [profile, target] of [["arbitrary", undefined], ["FundProvisioning", "pi33i-pt777-77776-aaaaa-cai"], ["CallBootstrap", undefined], ["CallBootstrap", "aaaaa-aa"], ["CallBootstrap", NNS_GOVERNANCE_CANISTER_ID]]) {
    await assert.rejects(() => deriveProvisioningSession(parent.identity, parent.key.getPublicKey().toDer(), profile, target));
  }
  const excluded = await bootstrap({ targets: [governance] });
  await assert.rejects(() => deriveProvisioningSession(excluded.identity, excluded.key.getPublicKey().toDer(), "FundProvisioning"), /ancestor/);
  await assert.rejects(() => deriveProvisioningSession(parent.identity, Ed25519KeyIdentity.generate().getPublicKey().toDer(), "FundProvisioning"), /provisioning key/);
  const key = Ed25519KeyIdentity.generate();
  for (const [targets, expiration] of [
    [[ICP_LEDGER_CANISTER_ID, CMC_CANISTER_ID, CYCLES_LEDGER_CANISTER_ID, NNS_GOVERNANCE_CANISTER_ID], Date.now()+50_000],
    [[ICP_LEDGER_CANISTER_ID, CMC_CANISTER_ID, CYCLES_LEDGER_CANISTER_ID], Date.now()+3_600_000],
  ]) {
    const chain = await DelegationChain.create(parent.identity, key.getPublicKey(), new Date(expiration), { previous: parent.chain, targets: targets.map((p) => Principal.fromText(p)) });
    assert.throws(() => validateProvisioningDelegation(DelegationIdentity.fromDelegation(key, chain), "FundProvisioning"), /Unscoped/);
  }
});

test("separately consented provisioning login uses short TTL and memory-only SDK cleanup", async () => {
  const auth = createBrowserProvisioningSession("FundProvisioning", undefined, { ...configuration, currentOrigin: canonical, AuthClientClass: FakeAuthClient });
  assert.equal(await auth.restore(), null);
  const scoped = await auth.signIn();
  const client = FakeAuthClient.instances.at(-1);
  assert.equal(client.signInOptions.maxTimeToLive, PROVISIONING_DELEGATION_TTL_NS);
  assert.equal(client.signedOut, true);
  await client.options.storage.set("credential", "discarded");
  assert.equal(await client.options.storage.get("credential"), null);
  await auth.signOut();
  assert.equal(await auth.restore(), null);
  assert.throws(() => scoped.validate(), /signed out/);
});
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
  const originalKey=leaf.pubkey,originalExpiry=leaf.expiration;
  leaf.pubkey=new Uint8Array();
  await assert.rejects(()=>deriveGovernanceSession(parent.identity,parent.key.getPublicKey().toDer()),/malformed/);
  leaf.pubkey=originalKey;
  for(const expiry of [0n,1n<<64n,42,undefined]){
    leaf.expiration=expiry;
    await assert.rejects(()=>deriveGovernanceSession(parent.identity,parent.key.getPublicKey().toDer()),/expired|malformed/);
  }
  leaf.expiration=originalExpiry;
  parent.chain.delegations.push(...Array(20).fill(parent.chain.delegations[0]));
  await assert.rejects(() => deriveGovernanceSession(parent.identity, parent.key.getPublicKey().toDer()), /inspected safely/);
  assert.throws(() => validateGovernanceDelegation({}), /inspected safely/);
});
test("complete chain scope is an intersection and SDK-signed self delegations are rejected", async () => {
  const parent=await bootstrap({targets:[governance,user]});
  assert.equal((await deriveGovernanceSession(parent.identity,parent.key.getPublicKey().toDer())).validate(),true);
  const root=Ed25519KeyIdentity.generate();
  const self=await DelegationChain.create(root,root.getPublicKey(),new Date(Date.now()+60000),{targets:[governance]});
  assert.throws(()=>validateGovernanceDelegation(DelegationIdentity.fromDelegation(root,self)),/self-signed/);
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

test("actual SDK idle teardown never recursively signs out or reloads on manual sign-out", async () => {
  const previous={window:globalThis.window,document:globalThis.document,location:globalThis.location};
  let callback, reloads=0;
  globalThis.window={addEventListener(){},removeEventListener(){},clearTimeout(){},setTimeout(fn){callback=fn;return 1;}};
  globalThis.document={addEventListener(){},removeEventListener(){}};
  globalThis.location={reload(){reloads++;}};
  try {
    const auth=session();const first=await auth.signIn();await auth.signOut();
    assert.equal(reloads,0);assert.throws(first.validate,/signed out/);
    const second=await auth.signIn();callback();
    assert.equal(reloads,1);assert.throws(second.validate,/signed out/);
    assert.equal(await auth.restore(),null);
  } finally { for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;} }
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
