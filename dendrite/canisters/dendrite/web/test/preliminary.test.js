import test from "node:test";
import assert from "node:assert/strict";
import { Principal } from "@icp-sdk/core/principal";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  NNS_GOVERNANCE_CANISTER_ID,
  createAnonymousGovernanceReadActor,
  governanceReadConfiguration,
} from "../src/governance-read-actor.js";
import {
  ALPHA_VOTE_NEURON_ID,
  OMEGA_REJECT_NEURON_ID,
  PreliminaryEvidenceError,
  collectPreliminaryEvidence,
  createNeuronLoader,
  deriveDependencyIds,
  listNeuronsRequest,
  validateListNeuronsBatch,
} from "../src/preliminary-evidence.js";
import { evaluatePreliminary } from "../src/preliminary-evaluator.js";
import { createApplication } from "../src/app.js";
import {
  groupTopics,
  ruleTitle,
  shortPrincipal,
  sortedFindings,
  variantName,
} from "../src/compliance-view.js";

const principal = Principal.fromText("aaaaa-aa");
const fixturePrincipal = (byte) => Principal.fromUint8Array(Uint8Array.of(byte));
const topic = (name) => ({ [name]: null });
const neuron = (id, overrides = {}) => ({
  id: [{ id: BigInt(id) }],
  staked_maturity_e8s_equivalent: [0n],
  controller: [principal],
  not_for_profit: false,
  maturity_e8s_equivalent: 0n,
  cached_neuron_stake_e8s: 100n,
  created_timestamp_seconds: 1n,
  auto_stake_maturity: [],
  aging_since_timestamp_seconds: 1n,
  hot_keys: [],
  dissolve_state: [{ DissolveDelaySeconds: 63_115_200n }],
  followees: [[0, { followees: [{ id: ALPHA_VOTE_NEURON_ID }] }]],
  neuron_fees_e8s: 0n,
  visibility: [1],
  known_neuron_data: [{ name: `Neuron ${id}`, description: [], links: [[]], committed_topics: [[[]]] }],
  voting_power_refreshed_timestamp_seconds: [90n],
  deciding_voting_power: [10n],
  potential_voting_power: [10n],
  ...overrides,
});
const response = (ids, neurons = ids.map((id) => neuron(id))) => ({
  neuron_infos: ids.map((id) => [BigInt(id), { retrieved_at_timestamp_seconds: 100n }]),
  full_neurons: neurons,
  total_pages_available: [1n],
});
const metadataResult = (raw, timestamp = 100n) => ({
  Ok: {
    id: raw.id,
    retrieved_at_timestamp_seconds: timestamp,
    known_neuron_data: raw.known_neuron_data,
    visibility: raw.visibility,
  },
});
const metadataFor = (resolve = (id) => neuron(id)) =>
  async (id) => metadataResult(resolve(BigInt(id)));

test("anonymous Governance read actor is fixed, signed anonymously, and query-verified", async () => {
  assert.deepEqual(governanceReadConfiguration({ host: "https://icp-api.io", fetchRootKey: false }), {
    host: "https://icp-api.io",
    shouldFetchRootKey: false,
    verifyQuerySignatures: true,
    canisterId: NNS_GOVERNANCE_CANISTER_ID,
  });
  assert.throws(() => governanceReadConfiguration({ host: "https://icp-api.io", fetchRootKey: true }));
  let agentOptions, actorConfig;
  const read = await createAnonymousGovernanceReadActor({
    host: "https://icp-api.io",
    fetchRootKey: false,
    createAgent: async (options) => { agentOptions = options; return {}; },
    createActor: (_factory, config) => { actorConfig = config; return { list_neurons: async () => ({}), get_neuron_info: async () => ({}) }; },
  });
  assert.equal(agentOptions.host, "https://icp-api.io");
  assert.equal(agentOptions.shouldFetchRootKey, false);
  assert.equal(agentOptions.verifyQuerySignatures, true);
  assert.equal(agentOptions.identity.getPrincipal().toText(), "2vxsx-fae");
  assert.equal(actorConfig.canisterId.toText(), NNS_GOVERNANCE_CANISTER_ID);
  assert.deepEqual(Object.keys(read), ["list_neurons", "get_neuron_info"]);
});

test("preliminary list_neurons request is complete and exact", () => {
  assert.deepEqual(listNeuronsRequest([9n, 7n]), {
    neuron_ids: [9n, 7n],
    include_neurons_readable_by_caller: false,
    include_empty_neurons_readable_by_caller: [false],
    include_public_neurons_in_full_neurons: [true],
    page_number: [0n],
    page_size: [50n],
    neuron_subaccounts: [],
  });
  assert.throws(() => listNeuronsRequest([]), PreliminaryEvidenceError);
  assert.throws(() => listNeuronsRequest(Array.from({ length: 51 }, (_, index) => BigInt(index + 1))), PreliminaryEvidenceError);
});

test("read-only declaration is generated exactly and exposes no mutation", () => {
  const directory = mkdtempSync(join(tmpdir(), "dendrite-read-idl-"));
  try {
    const generated = join(directory, "read.js");
    const result = spawnSync("tools/scripts/generate-governance-read-idl.sh", ["candid/nns-governance/governance.subset.did", generated], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const contents = readFileSync(generated, "utf8");
    assert.equal(contents, readFileSync("src/declarations/nns-governance-read/nns-governance-read.did.js", "utf8"));
    assert.match(contents, /list_neurons/);
    for (const forbidden of ["manage_neuron", "get_network_economics_parameters", "list_proposals"]) assert.doesNotMatch(contents, new RegExp(forbidden));
    assert.match(contents, /\['query'\]/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("whole-batch validation rejects structural, bound, timestamp, and arithmetic contradictions", () => {
  assert.equal(validateListNeuronsBatch([1n], response([1n]), { target: true }).neurons.get("1").id, 1n);
  const cases = [
    { ...response([1n]), total_pages_available: [2n] },
    { ...response([1n]), neuron_infos: [[2n, { retrieved_at_timestamp_seconds: 100n }]] },
    { ...response([1n]), neuron_infos: [[1n, { retrieved_at_timestamp_seconds: 100n }], [1n, { retrieved_at_timestamp_seconds: 100n }]] },
    response([1n], [neuron(2n)]),
    response([1n], [neuron(1n), neuron(1n)]),
    response([1n], [neuron(1n, { id: [] })]),
    response([1n], [neuron(1n, { followees: [[0, { followees: [] }], [0, { followees: [] }]] })]),
    response([1n], [neuron(1n, { hot_keys: Array(11).fill(principal) })]),
    response([1n], [neuron(1n, { followees: [[0, { followees: Array.from({ length: 16 }, (_, index) => ({ id: BigInt(index + 1) })) }]] })]),
    response([1n], [neuron(1n, { cached_neuron_stake_e8s: 1n, neuron_fees_e8s: 2n })]),
    response([1n], [neuron(1n, { voting_power_refreshed_timestamp_seconds: [101n] })]),
  ];
  for (const invalid of cases) assert.throws(() => validateListNeuronsBatch([1n], invalid, { target: true }), PreliminaryEvidenceError);
});

test("loader caches pending reads, batches sorted dependencies, and retries failed entries", async () => {
  const requests = [];
  let fail = true;
  const loader = createNeuronLoader({ getNeuronInfo: metadataFor(), listNeurons: async (request) => {
    requests.push(request.neuron_ids);
    if (fail) { fail = false; throw new Error("temporary"); }
    return response(request.neuron_ids);
  } });
  const first = await loader.loadDependencies([3n, 2n, 3n]);
  assert.equal(first.get("2").kind, "Unavailable");
  assert.equal(first.sourceFailures[0].kind, "Rejected");
  assert.match(first.sourceFailures[0].message, /temporary/);
  assert.deepEqual(first.sourceFailures[0].affectedNeuronIds, [2n, 3n]);
  const second = await loader.loadDependencies([2n, 3n]);
  assert.equal(second.get("2").kind, "Found");
  assert.deepEqual(requests, [[2n, 3n], [2n, 3n]]);
  loader.clear();
  assert.equal(loader.cache.size, 0);
});

test("dependency planning requests every configured followee for live names and rules", () => {
  const target = {
    committedTopics: [4],
    followees: new Map([
      [0, [ALPHA_VOTE_NEURON_ID]],
      [1, [100n, 101n, 102n, 103n, 104n]],
      [4, [100n, 101n, 102n]],
    ]),
  };
  assert.deepEqual(deriveDependencyIds(target), [100n, 101n, 102n, 103n, 104n, ALPHA_VOTE_NEURON_ID]);
  assert(deriveDependencyIds(target).includes(ALPHA_VOTE_NEURON_ID));
  assert(!deriveDependencyIds(target).includes(OMEGA_REJECT_NEURON_ID));
});

test("dependency failures preserve typed bounded batch evidence", async () => {
  for (const [kind, makeFailure] of [
    ["Rejected", () => Object.assign(new Error("replica rejected"), { kind: "Rejected" })],
    ["DecodeFailed", () => new Error("Candid decode failed")],
    ["InvalidResponse", () => new PreliminaryEvidenceError("InvalidResponse", "bad structure")],
    ["ResponseTooLarge", () => new PreliminaryEvidenceError("ResponseTooLarge", "too many records")],
  ]) {
    const loader = createNeuronLoader({ getNeuronInfo: metadataFor(), listNeurons: async () => { throw makeFailure(); } });
    const loaded = await loader.loadDependencies([1n, 2n]);
    assert.equal(loaded.sourceFailures[0].kind, kind);
    assert.deepEqual(loaded.sourceFailures[0].affectedNeuronIds, [1n, 2n]);
    assert.ok(loaded.sourceFailures[0].message.length <= 512);
  }
  let calls = 0;
  const loader = createNeuronLoader({ getNeuronInfo: metadataFor(), listNeurons: async (request) => {
    calls += 1;
    if (calls <= 2) throw Object.assign(new Error(`batch ${calls} rejected`), { kind: "Rejected" });
    return response(request.neuron_ids);
  } });
  const ids = Array.from({ length: 51 }, (_, index) => BigInt(index + 1));
  const failed = await loader.loadDependencies(ids);
  assert.equal(failed.sourceFailures.length, 2);
  assert.equal(failed.sourceFailures[0].affectedNeuronIds.length, 50);
  assert.equal(failed.sourceFailures[1].affectedNeuronIds.length, 1);
  const retried = await loader.loadDependencies(ids);
  assert.equal(retried.sourceFailures.length, 0);
  assert.equal(retried.get("1").kind, "Found");
});

test("target failures preserve bounded source-failure classification and target identity", async () => {
  const targetId = 42n;
  for (const [kind, message, makeFailure] of [
    ["Rejected", "replica rejected the query", () => Object.assign(new Error("replica rejected the query"), { kind: "Rejected" })],
    ["DecodeFailed", "Candid decoding failed at field neuron_infos", () => new Error("Candid decoding failed at field neuron_infos")],
    ["InvalidResponse", "malformed Governance response", () => new Error("malformed Governance response")],
    ["ResponseTooLarge", "Governance response exceeded its size bound", () => new Error("Governance response exceeded its size bound")],
    ["Rejected", "generic transport failure", () => new Error("generic transport failure")],
  ]) {
    const loader = createNeuronLoader({ getNeuronInfo: metadataFor(), listNeurons: async () => { throw makeFailure(); } });
    const evidence = await collectPreliminaryEvidence(targetId, loader);
    assert.equal(evidence.target.kind, "Unavailable");
    assert.equal(evidence.sourceFailures.length, 1);
    assert.equal(evidence.sourceFailures[0].method, "list_neurons");
    assert.equal(evidence.sourceFailures[0].kind, kind);
    assert.equal(evidence.sourceFailures[0].message, message);
    assert.deepEqual(evidence.sourceFailures[0].affectedNeuronIds, [targetId]);
  }
});

test("preliminary evaluator never passes controller-only rules", async () => {
  const target = neuron(42n, {
    followees: [
      [0, { followees: [{ id: ALPHA_VOTE_NEURON_ID }] }],
      [1, { followees: [10n, 11n, 12n, 13n, 14n].map((id) => ({ id })) }],
      [4, { followees: [10n, 11n, 12n].map((id) => ({ id })) }],
    ],
    known_neuron_data: [{ name: "Target", description: [], links: [[]], committed_topics: [[[topic("Governance")]]] }],
  });
  const resolve = (id) => id === 42n ? target : neuron(id, { known_neuron_data: [{ name: `Known ${id}`, description: [], links: [[]], committed_topics: [] }], followees: [[4, { followees: [{ id: OMEGA_REJECT_NEURON_ID }] }]] });
  const governance = { list_neurons: async (request) => response(request.neuron_ids, request.neuron_ids.map(resolve)), get_neuron_info: metadataFor(resolve) };
  const loader = createNeuronLoader({ listNeurons: (request) => governance.list_neurons(request), getNeuronInfo: governance.get_neuron_info });
  const report = evaluatePreliminary(42n, await collectPreliminaryEvidence(42n, loader));
  for (const id of ["DENDRITE-CONTROL-001", "DENDRITE-CONTROL-002", "DENDRITE-CONTROL-003"]) {
    assert.equal(variantName(report.rules.find((rule) => rule.rule_id === id).status), "Indeterminate");
  }
  assert.notEqual(variantName(report.overall_status), "Compliant");
});

test("certified controller evidence drives live controller pass and fail semantics", async () => {
  const target = neuron(42n, {
    followees: [
      [0, { followees: [{ id: ALPHA_VOTE_NEURON_ID }] }],
      [1, { followees: [10n, 11n, 12n, 13n, 14n].map((id) => ({ id })) }],
      [4, { followees: [10n, 11n, 12n].map((id) => ({ id })) }],
    ],
    known_neuron_data: [{ name: "Target", description: [], links: [[]], committed_topics: [[[topic("Governance")]]] }],
  });
  const resolve = (id) => id === 42n ? target : neuron(id, { known_neuron_data: [{ name: `Known ${id}`, description: [], links: [[]], committed_topics: [] }], followees: [[4, { followees: [{ id: OMEGA_REJECT_NEURON_ID }] }]] });
  const governance = { list_neurons: async (request) => response(request.neuron_ids, request.neuron_ids.map(resolve)), get_neuron_info: metadataFor(resolve) };
  const collect = (controller) => collectPreliminaryEvidence(
    42n,
    createNeuronLoader({ listNeurons: (request) => governance.list_neurons(request), getNeuronInfo: governance.get_neuron_info }),
    { read: async (principal) => {
      assert.equal(principal.toText(), target.controller[0].toText());
      return controller;
    } },
  );
  for (const [controller, statuses] of [
    [{ callSucceeded: true, moduleHash: undefined, controllers: [], certificateTime: "2026-01-01T00:00:00.000Z" }, ["Pass", "Pass", "Pass"]],
    [{ callSucceeded: true, moduleHash: new Uint8Array(32), controllers: [], certificateTime: "2026-01-01T00:00:00.000Z" }, ["Pass", "Fail", "Pass"]],
    [{ callSucceeded: true, moduleHash: undefined, controllers: [fixturePrincipal(2)], certificateTime: "2026-01-01T00:00:00.000Z" }, ["Pass", "Pass", "Fail"]],
  ]) {
    const report = evaluatePreliminary(42n, await collect(controller));
    assert.deepEqual(report.rules.filter((rule) => rule.rule_id.startsWith("DENDRITE-CONTROL-0"))
      .slice(0, 3).map((rule) => variantName(rule.status)), statuses);
  }
  const unavailable = evaluatePreliminary(42n, await collectPreliminaryEvidence(
    42n,
    createNeuronLoader({ listNeurons: (request) => governance.list_neurons(request), getNeuronInfo: governance.get_neuron_info }),
    { read: async () => { throw new Error("stale certificate"); } },
  ));
  assert.deepEqual(unavailable.rules.filter((rule) => ["DENDRITE-CONTROL-001", "DENDRITE-CONTROL-002", "DENDRITE-CONTROL-003"].includes(rule.rule_id))
    .map((rule) => variantName(rule.status)), ["Indeterminate", "Indeterminate", "Indeterminate"]);
});

test("CO.DELTA metadata is merged only from explicit get_neuron_info", async () => {
  const id = 33_138_099_823_745_946n;
  const full = neuron(id, {
    known_neuron_data: [],
    followees: [[4, { followees: [] }]],
  });
  const metadataCalls = [];
  const loader = createNeuronLoader({
    listNeurons: async (request) => response(request.neuron_ids, [full]),
    getNeuronInfo: async (requested) => {
      metadataCalls.push(requested);
      return {
        Ok: {
          id: [{ id }],
          retrieved_at_timestamp_seconds: 100n,
          visibility: [1],
          known_neuron_data: [{
            name: "CO.DELTA △",
            description: ["Registered known neuron"],
            links: [["https://example.com/co-delta"]],
            committed_topics: [[[topic("Governance")]]],
          }],
        },
      };
    },
  });
  const evidence = await collectPreliminaryEvidence(id, loader);
  assert.equal(evidence.target.neuron.knownData.name, "CO.DELTA △");
  assert.deepEqual(evidence.target.neuron.committedTopics, []);
  assert.deepEqual(metadataCalls, [id]);
  const knownRule = evaluatePreliminary(id, evidence).rules
    .find((rule) => rule.rule_id === "DENDRITE-KNOWN-002");
  assert.equal(variantName(knownRule.status), "Pass");
});

test("known metadata distinguishes confirmed absence, invalidity, and rejection", async () => {
  const id = 42n;
  for (const [result, expectedKind, expectedStatus] of [
    [{ Ok: { id: [{ id }], retrieved_at_timestamp_seconds: 100n, visibility: [1], known_neuron_data: [] } }, "ConfirmedAbsent", "Fail"],
    [{ Ok: { id: [{ id: 43n }], retrieved_at_timestamp_seconds: 100n, visibility: [1], known_neuron_data: [] } }, "Unavailable", "Indeterminate"],
  ]) {
    const loader = createNeuronLoader({
      listNeurons: async (request) => response(request.neuron_ids, [neuron(id)]),
      getNeuronInfo: async () => result,
    });
    const evidence = await collectPreliminaryEvidence(id, loader);
    assert.equal(evidence.target.neuron.knownMetadataEvidence.kind, expectedKind);
    assert.equal(variantName(evaluatePreliminary(id, evidence).rules
      .find((rule) => rule.rule_id === "DENDRITE-KNOWN-002").status), expectedStatus);
  }
  const rejected = createNeuronLoader({
    listNeurons: async (request) => response(request.neuron_ids, [neuron(id)]),
    getNeuronInfo: async () => { throw Object.assign(new Error("get_neuron_info was rejected"), { kind: "Rejected" }); },
  });
  const unavailable = await collectPreliminaryEvidence(id, rejected);
  assert.equal(unavailable.target.neuron.knownMetadataEvidence.kind, "Unavailable");
  assert.equal(unavailable.sourceFailures[0].method, "get_neuron_info");
});

const differentialEvidence = () => {
  const managers = [100n, 101n, 102n, 103n, 104n];
  const following = new Map([[1, [...managers]], [4, [100n, 101n, 102n]]]);
  for (const code of [0, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18]) following.set(code, [ALPHA_VOTE_NEURON_ID]);
  const found = (id) => ({ kind: "Found", neuron: {
    id, controller: undefined, knownData: { id, name: `known-${id}`, description: undefined, links: [] },
    hotKeys: [], notForProfit: false, dissolveDelaySeconds: 63_115_200n, dissolving: false,
    effectiveStakeE8s: 1n, mintedStakeE8s: 1n, votingPowerRefreshedTimestampSeconds: 999_999n,
    potentialVotingPower: 1n, decidingVotingPower: 1n, committedTopics: [],
    followees: new Map(managers.slice(0, 3).includes(id) ? [[4, [OMEGA_REJECT_NEURON_ID]]] : []),
  } });
  return {
    nowSeconds: 1_000_000n,
    target: { kind: "Found", neuron: {
      id: 42n, controller: fixturePrincipal(1), knownData: { id: 42n, name: "Dendrite", description: "A compliant target", links: ["https://example.com/dendrite"] },
      hotKeys: [], notForProfit: false, dissolveDelaySeconds: 63_115_200n, dissolving: false,
      effectiveStakeE8s: 100_000_000n, mintedStakeE8s: 100_000_000n, votingPowerRefreshedTimestampSeconds: 999_999n,
      potentialVotingPower: 10n, decidingVotingPower: 10n, committedTopics: [4], followees: following,
    } },
    dependencies: new Map(managers.map((id) => [id.toString(), found(id)])),
    controller: { callSucceeded: true, moduleHash: undefined, controllers: [] },
    sourceFailures: [],
    unknownCommittedTopics: 0,
  };
};
function mutateDifferential(name, evidence) {
  const target = () => evidence.target.neuron;
  switch (name) {
    case "fully_compliant": break;
    case "target_missing": evidence.target = { kind: "ConfirmedMissing" }; break;
    case "target_unavailable": evidence.target = { kind: "Unavailable" }; break;
    case "wrong_target_id": target().id = 43n; break;
    case "missing_known_neuron": target().knownData = undefined; break;
    case "target_hotkeys": target().hotKeys.push(fixturePrincipal(2)); break;
    case "not_for_profit": target().notForProfit = true; break;
    case "dissolving": target().dissolving = true; break;
    case "short_dissolve_delay": target().dissolveDelaySeconds = 1n; break;
    case "stale_voting_power": target().votingPowerRefreshedTimestampSeconds = 1n; break;
    case "voting_power_mismatch": target().decidingVotingPower = 9n; break;
    case "too_few_managers": target().followees.set(1, [100n, 101n, 102n, 103n]); break;
    case "too_many_managers": target().followees.set(1, Array.from({ length: 16 }, (_, index) => BigInt(index + 100))); break;
    case "duplicate_managers": target().followees.get(1).push(100n); break;
    case "self_manager": target().followees.get(1).push(42n); break;
    case "manager_missing": evidence.dependencies.set("100", { kind: "ConfirmedMissing" }); break;
    case "manager_unavailable": evidence.dependencies.set("100", { kind: "Unavailable" }); break;
    case "manager_hotkeys": evidence.dependencies.get("100").neuron.hotKeys.push(fixturePrincipal(3)); break;
    case "incorrect_management_following": target().followees.set(1, [7n]); break;
    case "alpha_vote_mismatch": target().followees.set(3, [7n]); break;
    case "omega_reject_mismatch": evidence.dependencies.get("100").neuron.followees.set(4, [ALPHA_VOTE_NEURON_ID]); break;
    case "committed_missing_delegate": target().followees.set(4, [100n, 101n]); break;
    case "committed_extra_delegate": target().followees.get(4).push(104n); break;
    case "non_committed_mismatch": target().followees.set(17, [7n]); break;
    case "quorum_edge": target().followees.set(1, [100n, 101n, 102n, 103n, 104n, 105n]); break;
    case "controller_unavailable": evidence.controller = undefined; break;
    case "controller_module_present": evidence.controller.moduleHash = new Uint8Array([1]); break;
    case "controller_list_retained": evidence.controller.controllers.push(fixturePrincipal(4)); break;
    case "unknown_committed_topic": evidence.unknownCommittedTopics = 1; break;
    case "source_failure": evidence.sourceFailures.push({ method: "list_neurons", kind: "Rejected", message: "bounded rejection", affectedNeuronIds: [100n] }); break;
    case "unknown_following_topic": target().followees.set(99, [7n]); break;
    case "contradictory_unavailable_evidence": target().effectiveStakeE8s = undefined; break;
    case "duplicate_unknown_committed": target().committedTopics = [4, 4]; evidence.unknownCommittedTopics = 1; break;
    case "controller_call_failure": evidence.controller.callSucceeded = false; break;
    case "invalid_response_failure": evidence.sourceFailures.push({ method: "list_neurons", kind: "InvalidResponse", message: "invalid dependency response", affectedNeuronIds: [100n, 101n] }); break;
    case "response_too_large_failure": evidence.sourceFailures.push({ method: "list_neurons", kind: "ResponseTooLarge", message: "dependency response exceeded its bound", affectedNeuronIds: [102n] }); break;
    case "decode_failure": evidence.sourceFailures.push({ method: "list_neurons", kind: "DecodeFailed", message: "dependency response could not be decoded", affectedNeuronIds: [103n] }); break;
    case "unavailable_dependency_batch":
      evidence.dependencies.set("100", { kind: "Unavailable" });
      evidence.dependencies.set("101", { kind: "Unavailable" });
      evidence.sourceFailures.push({ method: "list_neurons", kind: "Rejected", message: "dependency batch rejected", affectedNeuronIds: [100n, 101n] });
      break;
    default: throw new Error(`unknown differential fixture ${name}`);
  }
}

const decimal = (value) => BigInt(value).toString();
const optionalProjection = (value, project = (item) => item) => value?.length ? project(value[0]) : null;
const principalProjection = (value) => typeof value?.toText === "function" ? value.toText() : String(value);
const knownProjection = (known) => ({
  id: decimal(known.id),
  name: known.name,
  description: known.description ?? null,
  links: [...known.links],
});
export function canonicalPolicyProjection(report) {
  return {
    standard_version: report.standard_version,
    neuron_id: decimal(report.neuron_id),
    checked_at_timestamp_seconds: decimal(report.checked_at_timestamp_seconds),
    overall_status: variantName(report.overall_status),
    target: optionalProjection(report.target, (target) => ({
      neuron_id: decimal(target.neuron_id),
      known_neuron: optionalProjection(target.known_neuron, knownProjection),
      controller: optionalProjection(target.controller, principalProjection),
      hot_keys: target.hot_keys.map(principalProjection),
      not_for_profit: optionalProjection(target.not_for_profit),
      dissolve_delay_seconds: optionalProjection(target.dissolve_delay_seconds, decimal),
      dissolving: optionalProjection(target.dissolving),
      effective_stake_e8s: optionalProjection(target.effective_stake_e8s, decimal),
      voting_power_refreshed_timestamp_seconds: optionalProjection(target.voting_power_refreshed_timestamp_seconds, decimal),
      potential_voting_power: optionalProjection(target.potential_voting_power, decimal),
      deciding_voting_power: optionalProjection(target.deciding_voting_power, decimal),
    })),
    managers: report.managers.map((manager) => ({
      neuron_id: decimal(manager.neuron_id),
      evidence_status: variantName(manager.evidence_status),
      known_neuron: optionalProjection(manager.known_neuron, knownProjection),
      controller: optionalProjection(manager.controller, principalProjection),
      hot_keys: manager.hot_keys.map(principalProjection),
      minted_stake_e8s: optionalProjection(manager.minted_stake_e8s, decimal),
      neuron_management_followees: manager.neuron_management_followees.map(decimal),
      omega_ready_topics: [...manager.omega_ready_topics],
    })),
    committed_topics: report.committed_topics.map((entry) => ({ topic: entry.topic, delegate_ids: entry.delegate_ids.map(decimal) })),
    non_committed_topics: report.non_committed_topics.map((entry) => ({ topic: entry.topic, followee_ids: entry.followee_ids.map(decimal) })),
    controller: optionalProjection(report.controller, (controller) => ({
      principal: optionalProjection(controller.principal, principalProjection),
      call_succeeded: controller.call_succeeded,
      module_hash: optionalProjection(controller.module_hash, (bytes) => [...bytes]),
      controllers: controller.controllers.map(principalProjection),
    })),
    rules: report.rules.map((rule) => ({
      rule_id: rule.rule_id,
      status: variantName(rule.status),
      message: rule.message,
      observed: optionalProjection(rule.observed),
      expected: optionalProjection(rule.expected),
      related_neuron_ids: rule.related_neuron_ids.map(decimal),
      relevant_topic: optionalProjection(rule.relevant_topic),
    })),
    quorum_threshold: optionalProjection(report.quorum_threshold),
    source_revision: report.source_revision,
    source_failures: report.source_failures.map((failure) => ({
      method: failure.method,
      kind: variantName(failure.kind),
      message: failure.message,
      affected_neuron_ids: failure.affected_neuron_ids.map(decimal),
    })),
  };
}

test("browser evaluator matches all deterministic Rust policy fixtures", () => {
  const fixtures = JSON.parse(readFileSync("canisters/dendrite/web/test/fixtures/evaluator.json", "utf8"));
  assert.equal(fixtures.length, 38);
  for (const fixture of fixtures) {
    const evidence = differentialEvidence();
    mutateDifferential(fixture.name, evidence);
    const report = evaluatePreliminary(42n, evidence);
    assert.deepEqual(canonicalPolicyProjection(report), fixture.projection, fixture.name);
  }
});

test("browser report-construction invariants fail with bounded analysis errors", () => {
  const missingTimestamp = differentialEvidence();
  missingTimestamp.nowSeconds = 0n;
  assert.throws(
    () => evaluatePreliminary(42n, missingTimestamp),
    /Analysis failed: NNS evidence snapshot timestamp is invalid/,
  );
  const excessiveFailures = differentialEvidence();
  excessiveFailures.sourceFailures = Array.from({ length: 33 }, () => ({
    method: "list_neurons",
    kind: "Rejected",
    message: "unavailable",
    affectedNeuronIds: [42n],
  }));
  assert.throws(
    () => evaluatePreliminary(42n, excessiveFailures),
    /Analysis failed: report source failures exceed the bounded report limit/,
  );
});

class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; this.listeners = {}; this.attributes = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  dispatch(name, event = { preventDefault() {} }) { return this.listeners[name](event); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() {}
}
const fakeDocument = (root) => ({ createElement: (tag) => new FakeNode(tag), createTextNode: (text) => ({ textContent: text }), querySelector: () => root });
const findNode = (root, predicate) => {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
};
const report = (id = 42n) => ({
  standard_version: "nns-dendrite/1.1-draft", neuron_id: id, checked_at_timestamp_seconds: 100n,
  overall_status: { Indeterminate: null }, target: [], managers: [], committed_topics: [], non_committed_topics: [],
  controller: [], rules: [{ rule_id: "DENDRITE-CONTROL-001", status: { Indeterminate: null }, message: "requires on-chain verification", observed: [], expected: [], related_neuron_ids: [], relevant_topic: [] }],
  quorum_threshold: [], source_revision: "revision", source_failures: [],
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("public route renders one live state without report actions or Dendrite reads", async () => {
  const prior = globalThis.document, root = new FakeNode("main"), location = { hash: "#/neuron/42" };
  globalThis.document = fakeDocument(root);
  try {
    let dendriteCalls = 0;
    const app = createApplication({
      root, location, onHashChange: () => {},
      preliminaryAnalyzerFactory: () => ({ analyze: async () => report(), clear() {} }),
      actorFactory: async () => ({ check_neuron: async () => { dendriteCalls += 1; } }),
      authSession: { configuration: { derivationOrigin: "https://dendrite.example" }, restore: async () => null },
      trustInjectedPreliminaryForTests: true,
    });
    await app.start();
    const rendered = JSON.stringify(root);
    assert.match(rendered, /Indeterminate/);
    assert.doesNotMatch(rendered, /Live analysis|Refresh live analysis|Verify on-chain|Consensus verified|Verification stale/);
    assert.equal(findNode(root, (node) => node.className?.includes?.("management-toggle")), undefined);
    assert.ok(findNode(root, (node) => node.className?.includes?.("site-nav")));
    assert.equal(dendriteCalls, 0);
  } finally { globalThis.document = prior; }
});

test("presentation helpers order severity, group topics, shorten principals, and deliberately title unknown rules", () => {
  const findings = sortedFindings([
    { status: { Warning: null } }, { status: { Fail: null } }, { status: { Indeterminate: null } }, { status: { StandardUpdateRequired: null } },
  ]);
  assert.deepEqual(findings.map((item) => variantName(item.status)), ["Fail", "StandardUpdateRequired", "Indeterminate", "Warning"]);
  assert.equal(groupTopics({ committed_topics: [{ topic: 4, delegate_ids: [2n, 1n] }, { topic: 5, delegate_ids: [1n, 2n] }], non_committed_topics: [] })[0].topics.length, 2);
  assert.equal(groupTopics({ committed_topics: [{ topic: 4, delegate_ids: [1n, 1n] }, { topic: 5, delegate_ids: [1n] }], non_committed_topics: [] }).length, 2);
  assert.match(shortPrincipal("aaaaa-bbbbb-ccccc-ddddd"), /…/);
  assert.equal(ruleTitle("UNKNOWN-RULE"), "Technical check: UNKNOWN-RULE");
});

test("preliminary production modules use no persistent browser storage", () => {
  for (const path of [
    "canisters/dendrite/web/src/governance-read-actor.js",
    "canisters/dendrite/web/src/preliminary-evidence.js",
    "canisters/dendrite/web/src/preliminary-evaluator.js",
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /localStorage|sessionStorage|indexedDB|caches\./);
  }
});
