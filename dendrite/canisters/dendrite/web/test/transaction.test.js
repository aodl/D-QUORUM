import test from "node:test";
import assert from "node:assert/strict";
import { Principal } from "@icp-sdk/core/principal";
import { COMMAND_CAPABILITIES, buildAddManagerHotkeyCommand, buildAdvancedCommand, buildConfigureOperation, buildDirectManagerOperation, buildManageNeuronProposal, buildPrimaryFollowCommand, buildRefreshVotingPowerCommand, buildRegisterVoteCommand, buildRewardReceiverCommand, buildStandardSetFollowingCommand, classifyRewardReceiver, createTransactionPipeline, decodeManageNeuronResponse, encodeManageNeuronRequest, formatE8s, managedNeuronId, openManageNeuronProposalRequest, parseIcpToE8s, prepareManagerHotkey, prepareManagerVote, preparePrimaryFollow, prepareRefreshVotingPower, prepareRewardReceiver, prepareStandardSetFollowing, prepareTargetVote, proposalReviewDetails, selectTargetManageNeuronProposals, selfAuthenticatingPrincipal, validateOpenManagerProposal, verifyRewardReceivers } from "../src/transaction.js";
import { actionableManagers, directImpact, exactValue, renderControlPanel } from "../src/control-panel.js";
import { renderAdvancedCommands } from "../src/advanced-panel.js";

const principal = Principal.fromText("aaaaa-aa");
const userPrincipal = Principal.selfAuthenticating(Uint8Array.from([1, 2, 3]));
const signingIdentity = { getPrincipal: () => principal };
const targetedSession = () => ({ principal, signingIdentity, validate: async () => true });
const manager = (overrides = {}) => ({ neuron_id: 10n, evidence_status: { Found: null }, known_neuron: [{ name: "Manager" }], controller: [principal], hot_keys: [], minted_stake_e8s: [200_000_000n], neuron_management_followees: [], omega_ready_topics: [4], ...overrides });
const report = (overrides = {}) => ({ neuron_id: 20n, managers: [manager()], quorum_threshold: [1], ...overrides });

test("exact e8s parsing and formatting never uses floating point", () => {
  assert.equal(parseIcpToE8s("1.00000001"), 100_000_001n);
  assert.equal(formatE8s(100_000_001n), "1.00000001");
  assert.equal(formatE8s(100_000_000n), "1");
  for (const value of ["01", ".1", "1.", "1.000000001", "1e2", "-1", " 1"]) assert.throws(() => parseIcpToE8s(value));
  assert.throws(() => formatE8s(-1n));
  assert.throws(() => parseIcpToE8s("184467440737.09551616"), /nat64/);
});

test("proposal builder uses modern IDs and exact nesting while direct builder stays narrow", () => {
  const command = { RefreshVotingPower: {} };
  const request = buildManageNeuronProposal("10", "20", command);
  assert.deepEqual(request, { id: [], neuron_id_or_subaccount: [{ NeuronId: { id: 10n } }], command: [{ MakeProposal: { title: ["Dendrite neuron management request"], url: "", summary: "Manage Dendrite neuron 20.", action: [{ ManageNeuron: { id: [], neuron_id_or_subaccount: [{ NeuronId: { id: 20n } }], command: [command] } }] } }] });
  assert.ok(Object.isFrozen(request) && Object.isFrozen(request.command[0].MakeProposal.action[0]));
  assert.deepEqual(buildDirectManagerOperation(10n, { RegisterVote: { proposal: [{ id: 7n }], vote: 1 } }).neuron_id_or_subaccount, [{ NeuronId: { id: 10n } }]);
  assert.throws(() => buildManageNeuronProposal(10n, 20n, {}), /Exactly one/);
  assert.throws(() => buildDirectManagerOperation(10n, null), /Exactly one/);
  assert.throws(() => buildManageNeuronProposal(10n, 20n, command, "x".repeat(1001)), /too long/);
});

test("one pipeline submits the identical reviewed object only after confirmation and revalidation", async () => {
  const requests = []; let checks = 0, validations = 0, economics = 100_000_000n;
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: economics }), manage_neuron: async (request) => { requests.push(request); return { command: [{ MakeProposal: { proposal_id: [{ id: 77n }], message: [] } }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => ({ ...targetedSession(), validate: async () => { validations++; } }), getNnsActor: async () => actor, checkNeuron: async () => { checks++; return report(); } });
  const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} }, operation: "Refresh voting power" });
  assert.equal(requests.length, 0);
  await assert.rejects(() => pipeline.submit(review), /confirmed/);
  const result = await pipeline.submit(review, { confirmed: true });
  assert.equal(result.proposalId, 77n); assert.equal(requests[0], review.request); assert.equal(checks, 2); assert.equal(validations, 2); assert.equal(pipeline.pending, undefined);
});

test("stale authority relationship and changed fees discard or block submission", async () => {
  let current = report(), fee = 1n, calls = 0;
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: fee }), manage_neuron: async () => { calls++; return { command: [{ MakeProposal: { proposal_id: [{ id: 1n }], message: [] } }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
  let review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} }, operation: "refresh" });
  current = report({ managers: [] });
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /not Found/);
  assert.equal(calls, 0);
  current = report(); review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} }, operation: "refresh" }); fee = 2n;
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /fee changed/);
  assert.equal(pipeline.pending, undefined); assert.equal(calls, 0);
});

test("ambiguous ingress outcome is never retried or labelled failure", async () => {
  let calls = 0;
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => { calls++; throw new Error("timeout"); } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
  const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} }, operation: "refresh" });
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /outcome is unknown and this request cannot be resubmitted/);
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /current explicitly confirmed review/);
  assert.equal(calls, 1); assert.equal(pipeline.pending, undefined); assert.equal(pipeline.state, "outcome-unknown");
});

test("strict response decoding bounds errors and rejects wrong or missing variants", () => {
  assert.throws(() => decodeManageNeuronResponse({ command: [] }, "RegisterVote"), /missing/);
  assert.throws(() => decodeManageNeuronResponse({ command: [{ Follow: {} }] }, "RegisterVote"), /Unexpected/);
  assert.throws(() => decodeManageNeuronResponse({ command: [{ MakeProposal: { proposal_id: [], message: [] } }] }, "MakeProposal"), /omitted/);
  assert.throws(() => decodeManageNeuronResponse({ command: [{ Error: { error_type: 5, error_message: "<img>" + "x".repeat(600) } }] }, "RegisterVote"), /Governance error 5/);
  assert.deepEqual(decodeManageNeuronResponse({ command: [{ RegisterVote: {} }] }, "RegisterVote"), { operation: "RegisterVote" });
});

test("review fails closed for malformed sessions, evidence, fees, stake, and controller authority", async () => {
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 10n }) };
  let session = null, current = report();
  const pipeline = createTransactionPipeline({ getSession: async () => session, getNnsActor: async () => actor, checkNeuron: async () => current });
  await assert.rejects(() => pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} } }), /targeted session/);
  session = targetedSession(); current = { ...report(), neuron_id: 21n };
  await assert.rejects(() => pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} } }), /does not match/);
  current = report({ managers: [manager({ minted_stake_e8s: [] })] });
  await assert.rejects(() => pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} } }), /unavailable/);
  current = report({ managers: [manager({ minted_stake_e8s: [1n] })] });
  await assert.rejects(() => pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} } }), /does not cover/);
  current = report({ managers: [manager({ controller: [], hot_keys: [principal] })] });
  await assert.rejects(() => pipeline.reviewDirect({ targetId: 20n, managerId: 10n, command: { Configure: {} }, controllerOnly: true }), /requires/);
});

test("direct controller-only review and high-risk exact target confirmation", async () => {
  let calls = 0; const actor = { manage_neuron: async () => { calls++; return { command: [{ Configure: {} }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
  const review = await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, command: { Configure: { operation: [{ AddHotKey: { new_hot_key: [Principal.fromText("2vxsx-fae")] } }] } }, operation: "Add hotkey", controllerOnly: true, highRisk: true });
  assert.equal(review.dendriteContextNeuronId, 20n); assert.equal(review.mutationNeuronId, 10n); assert.equal(review.confirmationNeuronId, 10n);
  await assert.rejects(() => pipeline.submit(review, { confirmed: true, typedTarget: "20" }), /exactly/);
  assert.equal(calls, 0);
  assert.deepEqual(await pipeline.submit(review, { confirmed: true, typedTarget: "10" }), { operation: "Configure" });
});

test("proposal and direct reviews confirm and encode their actual mutation targets", async () => {
  let expected = "MakeProposal";
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => ({ command: [{ [expected]: expected === "MakeProposal" ? { proposal_id: [{ id: 1n }] } : {} }] }) };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
  const proposalReview = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} }, highRisk: true });
  assert.equal(proposalReview.confirmationNeuronId, 20n);
  await assert.rejects(() => pipeline.submit(proposalReview, { confirmed: true, typedTarget: "10" }), /exactly/);
  await pipeline.submit(proposalReview, { confirmed: true, typedTarget: "20" });

  expected = "Follow";
  const receiverReview = await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, command: buildRewardReceiverCommand(99n), operation: "Set reward receiver", highRisk: true });
  assert.equal(receiverReview.mutationNeuronId, 10n); assert.equal(receiverReview.confirmationNeuronId, 10n);
  assert.equal(receiverReview.request.neuron_id_or_subaccount[0].NeuronId.id, receiverReview.mutationNeuronId);
  await assert.rejects(() => pipeline.submit(receiverReview, { confirmed: true, typedTarget: "20" }), /exactly/);
  await pipeline.submit(receiverReview, { confirmed: true, typedTarget: "10" });
});

test("actionable manager options deduplicate raw IDs and prefer eligible Found evidence", () => {
  const unavailable = manager({ evidence_status: { Unavailable: null }, controller: [], neuron_id: 10n });
  const eligible = manager({ neuron_id: 10n, controller: [principal] });
  const other = manager({ neuron_id: 11n, controller: [principal] });
  assert.deepEqual(actionableManagers(report({ managers: [unavailable, eligible, eligible, other] }), principal).map((entry) => entry.neuron_id), [10n, 11n]);
});

test("controller-only authority is rechecked and every failed final preflight clears review", async () => {
  let current = report(), calls = 0;
  const actor = { manage_neuron: async () => { calls++; return { command: [{ Configure: {} }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
  const review = await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, command: { Configure: { operation: [{ AddHotKey: { new_hot_key: [Principal.fromText("2vxsx-fae")] } }] } }, controllerOnly: true });
  current = report({ managers: [manager({ controller: [], hot_keys: [principal] })] });
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /Controller authority changed/);
  assert.equal(calls, 0); assert.equal(pipeline.pending, undefined); assert.equal(pipeline.state, "none");
});

test("fresh preparation fingerprints manager quorum and committed-topic evidence", async () => {
  let current = report({ committed_topics: [{ topic: 4 }], quorum_threshold: [1] }), calls = 0;
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => { calls++; return { command: [{ MakeProposal: { proposal_id: [{ id: 1n }] } }] }; } };
  const prepare = async ({ report: fresh }) => ({ command: { RefreshVotingPower: {} }, details: [], securityFingerprint: String(fresh.committed_topics.length) });
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
  for (const changed of [
    report({ managers: [manager(), manager({ neuron_id: 11n })], committed_topics: [{ topic: 4 }], quorum_threshold: [1] }),
    report({ committed_topics: [{ topic: 4 }], quorum_threshold: [2] }),
    report({ committed_topics: [], quorum_threshold: [1] }),
  ]) {
    current = report({ committed_topics: [{ topic: 4 }], quorum_threshold: [1] });
    const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, prepare });
    current = changed;
    await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /changed/);
    assert.equal(pipeline.pending, undefined);
  }
  assert.equal(calls, 0);
});

test("unexpected post-call response and transport ambiguity are terminal after one call", async () => {
  for (const response of [{ command: [] }, { command: [{ Follow: {} }] }]) {
    let calls = 0;
    const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => { calls++; return response; } };
    const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
    const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} } });
    await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /cannot be resubmitted/);
    await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /current explicitly confirmed/);
    assert.equal(calls, 1); assert.equal(pipeline.state, "outcome-unknown");
  }
});

test("explicit Governance rejection is known, clears review, and permits a new review", async () => {
  let calls = 0;
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => { calls++; return { command: [{ Error: { error_type: 3, error_message: "rejected" } }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
  const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} } });
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /Governance error 3/);
  assert.equal(pipeline.state, "none"); assert.equal(pipeline.pending, undefined); assert.equal(calls, 1);
  assert.ok(await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} } }));
});

test("an in-flight update cannot be replaced by another review", async () => {
  let release;
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => new Promise((resolve) => { release = resolve; }) };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
  const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} } });
  const submitted = pipeline.submit(review, { confirmed: true });
  while (!release) await Promise.resolve();
  await assert.rejects(() => pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} } }), /in flight/);
  await assert.rejects(() => pipeline.reviewDirect({ targetId: 20n, managerId: 10n, command: { RegisterVote: { proposal: [{ id: 1n }], vote: 1 } } }), /in flight/);
  release({ command: [{ MakeProposal: { proposal_id: [{ id: 1n }] } }] });
  await submitted;
});

test("proposal and direct preparation races cannot replace accepted or in-flight work", async () => {
  for (const firstKind of ["proposal", "direct"]) {
    let resolveOld, checks = 0, calls = 0;
    const oldReport = new Promise((resolve) => { resolveOld = resolve; });
    const actor = {
      get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }),
      manage_neuron: async (request) => {
        calls++;
        const expected = request.command[0].MakeProposal ? "MakeProposal" : "RegisterVote";
        return { command: [{ [expected]: expected === "MakeProposal" ? { proposal_id: [{ id: 1n }] } : {} }] };
      },
    };
    const pipeline = createTransactionPipeline({
      getSession: async () => targetedSession(),
      getNnsActor: async () => actor,
      checkNeuron: async () => ++checks === 1 ? oldReport : report(),
    });
    const start = (kind) => kind === "proposal"
      ? pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} }, operation: "proposal" })
      : pipeline.reviewDirect({ targetId: 20n, managerId: 10n, command: { RegisterVote: { proposal: [{ id: 7n }], vote: 1 } }, operation: "direct" });
    const old = start(firstKind);
    await Promise.resolve();
    assert.equal(pipeline.state, "preparing");
    await assert.rejects(() => start(firstKind === "proposal" ? "direct" : "proposal"), /already preparing/);
    pipeline.discardUnsubmittedReview();
    const accepted = await start(firstKind === "proposal" ? "direct" : "proposal");
    await pipeline.submit(accepted, { confirmed: true });
    resolveOld(report());
    await assert.rejects(() => old, /preparation was cancelled/);
    assert.equal(pipeline.pending, undefined);
    assert.equal(pipeline.state, "none");
    assert.equal(calls, 1);
  }
});

test("unresolved outcome summary blocks review until explicit no-retry acknowledgment", async () => {
  let calls = 0;
  const actor = {
    get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }),
    manage_neuron: async () => { calls++; throw new Error("transport ambiguity"); },
  };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
  const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} }, operation: "refresh evidence" });
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /outcome is unknown/);
  assert.deepEqual({ operation: pipeline.outcomeUnknown.operation, context: pipeline.outcomeUnknown.dendriteContextNeuronId, mutation: pipeline.outcomeUnknown.mutationOrManagedNeuronId, digest: pipeline.outcomeUnknown.requestDigest },
    { operation: "refresh evidence", context: 20n, mutation: 20n, digest: review.requestDigest });
  await assert.rejects(() => pipeline.reviewDirect({ targetId: 20n, managerId: 10n, command: { RegisterVote: {} } }), /unresolved/);
  assert.throws(() => pipeline.acknowledgeOutcomeUnknown(), /may have succeeded/);
  pipeline.acknowledgeOutcomeUnknown({ confirmed: true });
  assert.equal(calls, 1);
  assert.equal(pipeline.state, "none");
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /current explicitly confirmed/);
  assert.ok(await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, command: { RegisterVote: { proposal: [{ id: 2n }], vote: 1 } } }));
});

const votingReport = (snapshot, refreshed, potential = 8n, deciding = 7n) => report({
  checked_at_timestamp_seconds: snapshot,
  target: [{ voting_power_refreshed_timestamp_seconds: refreshed === undefined ? [] : [refreshed],
    potential_voting_power: potential === undefined ? [] : [potential],
    deciding_voting_power: deciding === undefined ? [] : [deciding] }],
});

test("voting-power refresh permits ordinary time and power progression", async () => {
  for (const final of [
    votingReport(101n, 40n),
    votingReport(3_700n, 40n),
    votingReport(101n, 40n, 9n, 6n),
  ]) {
    let current = votingReport(100n, 40n), calls = 0;
    const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => { calls++; return { command: [{ MakeProposal: { proposal_id: [{ id: 1n }] } }] }; } };
    const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
    const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, prepare: prepareRefreshVotingPower() });
    assert.match(review.details.join(" "), /Evidence observed for this review.*NNS snapshot: 100.*target refresh timestamp: 40.*refresh age: 60.*six-month threshold: 15778800/);
    assert.match(review.details.join(" "), /potential voting power: 8.*deciding voting power: 7/);
    current = final;
    await pipeline.submit(review, { confirmed: true });
    assert.equal(calls, 1);
  }
});

test("voting-power refresh invalidates changed refresh evidence and fails missing or contradictory evidence closed", async () => {
  let current = votingReport(100n, 40n), calls = 0;
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => { calls++; return { command: [{ MakeProposal: { proposal_id: [{ id: 1n }] } }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
  const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, prepare: prepareRefreshVotingPower() });
  current = votingReport(101n, 41n);
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /evidence changed/);
  assert.equal(calls, 0);
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /current explicitly confirmed review/);
  current = votingReport(101n, 40n);
  assert.ok(await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, prepare: prepareRefreshVotingPower() }));

  for (const invalid of [
    report({ checked_at_timestamp_seconds: undefined, target: [{ voting_power_refreshed_timestamp_seconds: [40n], potential_voting_power: [8n], deciding_voting_power: [7n] }] }),
    votingReport(100n, undefined),
    report({ checked_at_timestamp_seconds: 100n, target: [{ voting_power_refreshed_timestamp_seconds: [40n], potential_voting_power: [], deciding_voting_power: [7n] }] }),
    report({ checked_at_timestamp_seconds: 100n, target: [{ voting_power_refreshed_timestamp_seconds: [40n], potential_voting_power: [8n], deciding_voting_power: [] }] }),
    votingReport(100n, 101n),
    votingReport(-1n, 0n),
    report({ checked_at_timestamp_seconds: 100n, target: [] }),
  ]) {
    const isolated = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => invalid });
    await assert.rejects(() => isolated.reviewProposal({ targetId: 20n, managerId: 10n, prepare: prepareRefreshVotingPower() }), /unavailable|later than/);
  }
  assert.equal(calls, 0);
});

test("reviewed Candid bytes detect typed-array mutation and builders clone caller bytes", async () => {
  let calls = 0; const source = new Uint8Array(32);
  const command = buildAdvancedCommand("DisburseMaturity", { percentage: 1, accountIdentifier: source });
  source[0] = 9;
  assert.equal(command.DisburseMaturity.to_account_identifier[0].hash[0], 0);
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => { calls++; return { command: [{ MakeProposal: { proposal_id: [{ id: 1n }] } }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
  const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: command });
  assert.match(review.requestDigest, /^[0-9a-f]{64}$/);
  review.request.command[0].MakeProposal.action[0].ManageNeuron.command[0].DisburseMaturity.to_account_identifier[0].hash[0] = 7;
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /request bytes changed/);
  assert.equal(calls, 0); assert.equal(pipeline.pending, undefined);
});

test("operation preparation revalidates omega readiness and target proposal state", async () => {
  const readyManagers = [manager(), manager({ neuron_id: 11n }), manager({ neuron_id: 12n })];
  let current = report({ managers: readyManagers, committed_topics: [{ topic: 4 }], quorum_threshold: [2] }), proposalStatus = 1, calls = 0;
  const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), get_proposal_info: async (id) => [{ id: [{ id }], status: proposalStatus, topic: 4, deadline_timestamp_seconds: [1n], proposal: [{ title: ["Vote"], summary: "summary" }], proposer: [] }], manage_neuron: async () => { calls++; return { command: [{ MakeProposal: { proposal_id: [{ id: 1n }] } }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
  let review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, prepare: preparePrimaryFollow(4, [10n, 11n, 12n]) });
  current = report({ managers: [manager({ omega_ready_topics: [] }), readyManagers[1], readyManagers[2]], committed_topics: [{ topic: 4 }], quorum_threshold: [2] });
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /omega-reject/);
  assert.equal(pipeline.pending, undefined);
  current = report(); proposalStatus = 1;
  review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, prepare: prepareTargetVote(9n, 1) });
  proposalStatus = 2;
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /not Open/);
  assert.equal(pipeline.pending, undefined); assert.equal(calls, 0);
});

test("hotkey and receiver facts are re-read immediately before direct submission", async () => {
  const other = "rrkah-fqaaa-aaaaa-aaaaq-cai"; let current = report(), readable = true, calls = 0;
  const actor = { list_neurons: async ({ neuron_ids }) => ({ full_neurons: readable ? neuron_ids.map((id) => ({ id: [{ id }], controller: [principal], hot_keys: [], cached_neuron_stake_e8s: 1n })) : [] }), manage_neuron: async () => { calls++; return { command: [{ Configure: {} }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
  let review = await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, prepare: prepareManagerHotkey(other), controllerOnly: true });
  current = report({ managers: [manager({ hot_keys: [Principal.fromText(other)] })] });
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /already a manager hotkey/);
  assert.equal(pipeline.pending, undefined);
  current = report(); readable = true;
  review = await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, prepare: prepareRewardReceiver(99n), controllerOnly: true });
  readable = false;
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /requested receiver neuron.*returned as readable/);
  assert.equal(pipeline.pending, undefined); assert.equal(calls, 0);
});

test("reward-receiver preflight binds controller and normalized hotkey membership but not stake", async () => {
  const controllerA = Principal.selfAuthenticating(Uint8Array.from([4, 1]));
  const controllerB = Principal.selfAuthenticating(Uint8Array.from([4, 2]));
  const hotkeyA = Principal.selfAuthenticating(Uint8Array.from([4, 3]));
  const hotkeyB = Principal.selfAuthenticating(Uint8Array.from([4, 4]));
  const receiver = (overrides = {}) => ({ id: [{ id: 99n }], controller: [controllerA], hot_keys: [hotkeyA, hotkeyB], cached_neuron_stake_e8s: 1n, ...overrides });
  const cases = [
    { name: "unchanged", review: receiver(), final: receiver(), succeeds: true },
    { name: "controller change", review: receiver(), final: receiver({ controller: [controllerB] }) },
    { name: "hotkey addition", review: receiver({ hot_keys: [hotkeyA] }), final: receiver({ hot_keys: [hotkeyA, hotkeyB] }) },
    { name: "hotkey removal", review: receiver(), final: receiver({ hot_keys: [hotkeyA] }) },
    { name: "hotkey order", review: receiver(), final: receiver({ hot_keys: [hotkeyB, hotkeyA] }), succeeds: true },
    { name: "duplicate normalization", review: receiver({ hot_keys: [hotkeyA, hotkeyA, hotkeyB] }), final: receiver({ hot_keys: [hotkeyB, hotkeyA] }), succeeds: true },
    { name: "stake only", review: receiver(), final: receiver({ cached_neuron_stake_e8s: 99n }), succeeds: true },
    { name: "controller missing at preflight", review: receiver(), final: receiver({ controller: [] }), error: /controller/ },
    { name: "hotkeys malformed at preflight", review: receiver(), final: receiver({ hot_keys: "bad" }), error: /hotkey/ },
  ];
  for (const scenario of cases) {
    let currentReceiver = scenario.review, calls = 0;
    const actor = {
      list_neurons: async () => ({ full_neurons: [currentReceiver] }),
      manage_neuron: async () => { calls++; return { command: [{ Follow: {} }] }; },
    };
    const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
    const review = await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, prepare: prepareRewardReceiver(99n), controllerOnly: true, highRisk: true });
    assert.match(review.details.join(" "), /Receiver neuron ID: 99.*receiver controller:/);
    assert.match(review.details.join(" "), /Receiver hotkeys:.*Readable cached stake \(informational\):/);
    assert.match(review.details.join(" "), /sole Neuron Management followee status for manager neuron 10/);
    currentReceiver = scenario.final;
    if (scenario.succeeds) await pipeline.submit(review, { confirmed: true, typedTarget: "10" });
    else await assert.rejects(() => pipeline.submit(review, { confirmed: true, typedTarget: "10" }), scenario.error ?? /evidence changed/, scenario.name);
    assert.equal(calls, scenario.succeeds ? 1 : 0, scenario.name);
  }
});

test("reward-receiver preparation rejects missing or malformed authority evidence without an update", async () => {
  const invalid = [
    { id: [{ id: 99n }], controller: [], hot_keys: [], cached_neuron_stake_e8s: 1n },
    { id: [{ id: 99n }], controller: [principal], cached_neuron_stake_e8s: 1n },
    { id: [{ id: 99n }], controller: [principal], hot_keys: "bad", cached_neuron_stake_e8s: 1n },
    { id: [{ id: 99n }], controller: [principal], hot_keys: Array(11).fill(principal), cached_neuron_stake_e8s: 1n },
    { id: [{ id: 99n }], controller: [principal], hot_keys: [{}], cached_neuron_stake_e8s: 1n },
  ];
  for (const receiver of invalid) {
    let calls = 0;
    const actor = { list_neurons: async () => ({ full_neurons: [receiver] }), manage_neuron: async () => { calls++; return { command: [{ Follow: {} }] }; } };
    const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
    await assert.rejects(() => pipeline.reviewDirect({ targetId: 20n, managerId: 10n, prepare: prepareRewardReceiver(99n), controllerOnly: true }), /controller|hotkey/);
    assert.equal(calls, 0);
  }
});

test("receiver lookups use only explicit IDs with one bounded page", async () => {
  const requests = [];
  const actor = {
    list_neurons: async (request) => {
      requests.push(request);
      return {
        full_neurons: request.neuron_ids.map((id) => ({ id: [{ id }], controller: [principal], hot_keys: [], cached_neuron_stake_e8s: 1n })),
        total_pages_available: [1n],
      };
    },
  };
  const configured = [
    manager({ neuron_management_followees: [99n] }),
    manager({ neuron_id: 11n, neuron_management_followees: [100n] }),
    manager({ neuron_id: 12n, neuron_management_followees: [99n] }),
  ];
  const verification = await verifyRewardReceivers(configured, actor);
  assert.deepEqual(verification.map((entry) => entry.status), ["FoundAndReadable", "FoundAndReadable", "FoundAndReadable"]);
  assert.deepEqual(requests[0], {
    neuron_ids: [99n, 100n],
    include_neurons_readable_by_caller: false,
    include_empty_neurons_readable_by_caller: [false],
    include_public_neurons_in_full_neurons: [true],
    page_number: [0n],
    page_size: [2n],
    neuron_subaccounts: [],
  });

  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
  await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, prepare: prepareRewardReceiver(99n), controllerOnly: true });
  assert.deepEqual(requests[1], {
    neuron_ids: [99n],
    include_neurons_readable_by_caller: false,
    include_empty_neurons_readable_by_caller: [false],
    include_public_neurons_in_full_neurons: [true],
    page_number: [0n],
    page_size: [1n],
    neuron_subaccounts: [],
  });
  assert.ok(requests.every((request) => request.include_neurons_readable_by_caller === false));
});

test("explicit receiver response validation distinguishes omission from unavailable evidence", async () => {
  const managers = [manager({ neuron_management_followees: [99n] })];
  const status = async (response) => (await verifyRewardReceivers(managers, { list_neurons: async () => response }))[0].status;
  assert.equal(await status({ full_neurons: [{ id: [{ id: 99n }] }] }), "FoundAndReadable", "absent page count is one");
  assert.equal(await status({ full_neurons: [{ id: [{ id: 99n }] }], total_pages_available: [] }), "FoundAndReadable");
  assert.equal(await status({ full_neurons: [] }), "NotReturnedToCaller");
  for (const response of [
    { full_neurons: [{ id: [{ id: 100n }] }] },
    { full_neurons: [{ id: [{ id: 99n }] }, { id: [{ id: 99n }] }] },
    { full_neurons: [{ id: [{ id: 0n }] }] },
    { full_neurons: [{ id: [] }] },
    { full_neurons: [{ id: [{ id: "99" }] }] },
    { full_neurons: "malformed" },
    { full_neurons: [{ id: [{ id: 99n }] }], total_pages_available: [2n] },
    { full_neurons: [{ id: [{ id: 99n }] }], total_pages_available: [1n, 1n] },
  ]) assert.equal(await status(response), "UpstreamUnavailable");
});

test("explicit receiver setup avoids caller-readable union expansion", async () => {
  const receiver = { id: [{ id: 99n }], controller: [principal], hot_keys: [], cached_neuron_stake_e8s: 1n };
  const requests = []; let calls = 0;
  const actor = {
    list_neurons: async (request) => {
      requests.push(request);
      const records = [receiver];
      if (request.include_neurons_readable_by_caller) records.unshift({ id: [{ id: 10n }], controller: [principal], hot_keys: [] });
      return { full_neurons: records, total_pages_available: [1n] };
    },
    manage_neuron: async () => { calls++; return { command: [{ Follow: {} }] }; },
  };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
  const review = await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, prepare: prepareRewardReceiver(99n), controllerOnly: true });
  assert.equal(requests[0].include_neurons_readable_by_caller, false);
  assert.deepEqual(requests[0].neuron_ids, [99n]);
  assert.match(review.details.join(" "), /Receiver neuron ID: 99/);
  await pipeline.submit(review, { confirmed: true });
  assert.equal(calls, 1);
  assert.ok(requests.every((request) => request.neuron_ids.length === 1 && request.neuron_ids[0] === 99n));
});

test("public and private explicit receivers use returned readability without existence inference", async () => {
  const fullReceiver = { id: [{ id: 99n }], controller: [principal], hot_keys: [], cached_neuron_stake_e8s: 1n };
  for (const visibility of ["public", "private-readable"]) {
    const actor = { list_neurons: async () => ({ full_neurons: [fullReceiver], total_pages_available: [1n] }) };
    const prepared = await prepareRewardReceiver(99n)({ report: report(), nnsActor: actor, targetId: 20n, managerId: 10n });
    assert.match(prepared.details.join(" "), /Receiver neuron ID: 99/, visibility);
  }
  const omitted = { list_neurons: async () => ({ full_neurons: [], total_pages_available: [1n] }) };
  await assert.rejects(() => prepareRewardReceiver(99n)({ report: report(), nnsActor: omitted, targetId: 20n, managerId: 10n }), /not returned as readable to this caller/);
  assert.equal((await verifyRewardReceivers([manager({ neuron_management_followees: [99n] })], omitted))[0].status, "NotReturnedToCaller");
});

test("SetFollowing and manager-vote preparation derive exact commands from fresh reads", async () => {
  const fresh = report({ committed_topics: [{ topic: 4 }], managers: [manager(), manager({ neuron_id: 11n }), manager({ neuron_id: 12n })] });
  const actor = { list_neurons: async ({ neuron_ids }) => ({ full_neurons: neuron_ids.map((id) => ({ id: [{ id }], known_neuron_data: [{ name: `Known ${id}` }] })) }) };
  const prepared = await prepareStandardSetFollowing([{ topic: 4, followeeIds: [10n, 11n, 12n] }, { topic: 17, followeeIds: [18_363_645_821_499_695_760n] }])({ report: fresh, nnsActor: actor });
  assert.deepEqual(prepared.command.SetFollowing.topic_following[0][1].followees[0].map((entry) => entry.id), [18_363_645_821_499_695_760n]);
  const info = { id: [{ id: 7n }], status: 1, topic: 1, ballots: [[10n, { vote: 0 }]], deadline_timestamp_seconds: [1n], proposer: [{ id: 10n }], proposal: [{ title: ["Title"], summary: "Summary", action: [{ ManageNeuron: { id: [{ id: 20n }], neuron_id_or_subaccount: [], command: [{ RefreshVotingPower: {} }] } }] }] };
  const vote = await prepareManagerVote(7n, 1)({ nnsActor: { get_proposal_info: async () => [info] }, targetId: 20n, managerId: 10n });
  assert.equal(vote.command.RegisterVote.vote, 1); assert.match(vote.details.join(" "), /Managed target: 20/);
  assert.match(proposalReviewDetails({}, undefined).join(" "), /unavailable/);
});

test("invalid preparation and changed direct fingerprints fail closed", async () => {
  let current = report(), calls = 0;
  const actor = { manage_neuron: async () => { calls++; return { command: [{ Configure: {} }] }; } };
  const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
  for (const prepare of [async () => ({}), async () => ({ command: {}, securityFingerprint: "x" }), async () => ({ command: { Configure: {} } })]) {
    await assert.rejects(() => pipeline.reviewDirect({ targetId: 20n, managerId: 10n, prepare }), /invalid command or security fingerprint/);
  }
  const prepare = async ({ report: fresh }) => ({ command: { Configure: { operation: [] } }, details: [], securityFingerprint: String(fresh.managers[0].hot_keys.length) });
  const review = await pipeline.reviewDirect({ targetId: 20n, managerId: 10n, prepare });
  current = report({ managers: [manager({ hot_keys: [Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai")] })] });
  await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /direct-operation evidence changed/);
  assert.equal(calls, 0); assert.equal(pipeline.pending, undefined);
});

test("primary following enforces manager, committed omega, and approved default policies", () => {
  const value = report({ committed_topics: [{ topic: 4, delegate_ids: [10n] }], managers: [manager(), manager({ neuron_id: 11n }), manager({ neuron_id: 12n })] });
  const candidates = [10n, 11n, 12n, 13n, 14n].map((id) => ({ id, known: true }));
  assert.deepEqual(buildPrimaryFollowCommand(value, 1, candidates.map((entry) => entry.id), candidates).Follow.followees.map((entry) => entry.id), [10n, 11n, 12n, 13n, 14n]);
  assert.deepEqual(buildPrimaryFollowCommand(value, 4, [10n, 11n, 12n]).Follow.followees.map((entry) => entry.id), [10n, 11n, 12n]);
  assert.equal(buildPrimaryFollowCommand(value, 0).Follow.followees[0].id, 2_947_465_672_511_369n);
  assert.equal(buildPrimaryFollowCommand(value, 17).Follow.followees[0].id, 2_947_465_672_511_369n);
  assert.equal(buildPrimaryFollowCommand(value, 17, [18_363_645_821_499_695_760n]).Follow.followees[0].id, 18_363_645_821_499_695_760n);
  assert.equal(buildPrimaryFollowCommand(value, 17, [18_422_777_432_977_120_264n]).Follow.followees[0].id, 18_422_777_432_977_120_264n);
  assert.throws(() => buildPrimaryFollowCommand(value, 17, [999n]), /alpha-vote, omega-vote, or omega-reject/);
  assert.throws(() => buildPrimaryFollowCommand(value, 99), /update required/);
  assert.throws(() => buildPrimaryFollowCommand(value, 1, [10n, 10n, 11n, 12n, 13n], candidates), /distinct/);
  assert.throws(() => buildPrimaryFollowCommand(value, 4, [10n, 11n, 99n]), /known target managers/);
  const notReady = report({ committed_topics: [{ topic: 4 }], managers: [manager({ omega_ready_topics: [] }), manager({ neuron_id: 11n }), manager({ neuron_id: 12n })] });
  assert.throws(() => buildPrimaryFollowCommand(notReady, 4, [10n, 11n, 12n]), /omega-reject/);
});

test("refresh and target vote builders use replicated Open state, never browser time", () => {
  assert.deepEqual(buildRefreshVotingPowerCommand(), { RefreshVotingPower: {} });
  const open = { id: [{ id: 9n }], status: 1, topic: 4, deadline_timestamp_seconds: [100n] };
  assert.deepEqual(buildRegisterVoteCommand(open, 1), { RegisterVote: { proposal: [{ id: 9n }], vote: 1 } });
  assert.deepEqual(buildRegisterVoteCommand({ ...open, deadline_timestamp_seconds: [1n] }, 2).RegisterVote.vote, 2);
  assert.deepEqual(buildRegisterVoteCommand({ ...open, deadline_timestamp_seconds: [9_999_999_999_999n] }, 1).RegisterVote.vote, 1);
  assert.throws(() => buildRegisterVoteCommand({}, 1), /does not exist/);
  assert.throws(() => buildRegisterVoteCommand({ ...open, status: 2 }, 1), /not Open/);
  assert.throws(() => buildRegisterVoteCommand({ ...open, topic: 1 }, 1), /manager voting/);
});

test("every pinned command has an explicit policy and every enabled advanced builder is typed", () => {
  assert.deepEqual(Object.keys(COMMAND_CAPABILITIES).sort(), ["ClaimOrRefresh","Configure","Disburse","DisburseMaturity","DisburseToNeuron","Follow","MakeProposal","Merge","MergeMaturity","RefreshVotingPower","RegisterVote","SetFollowing","Spawn","Split","StakeMaturity"].sort());
  for (const kind of ["MakeProposal", "MergeMaturity", "Disburse", "DisburseToNeuron"]) assert.throws(() => buildAdvancedCommand(kind), /unavailable/);
  assert.ok(buildAdvancedCommand("Spawn", { percentage: 50, newController: userPrincipal.toText(), nonce: 1n }).Spawn);
  assert.ok(buildAdvancedCommand("Split", { amountE8s: 1n }).Split);
  assert.ok(buildAdvancedCommand("Follow", { topic: 4, followeeIds: [1n] }).Follow);
  assert.ok(buildAdvancedCommand("ClaimOrRefresh").ClaimOrRefresh);
  assert.ok(buildAdvancedCommand("Configure", { configureKind: "StartDissolving" }).Configure);
  assert.ok(buildAdvancedCommand("RegisterVote", { proposalInfo: { id: [{ id: 1n }], status: 1, topic: 4, deadline_timestamp_seconds: [2n] }, vote: 1 }).RegisterVote);
  assert.ok(buildAdvancedCommand("Merge", { sourceNeuronId: 1n }).Merge);
  assert.ok(buildAdvancedCommand("StakeMaturity", {}).StakeMaturity);
  assert.ok(buildAdvancedCommand("RefreshVotingPower").RefreshVotingPower);
  assert.ok(buildAdvancedCommand("DisburseMaturity", { percentage: 1, accountIdentifier: new Uint8Array(32) }).DisburseMaturity);
  assert.ok(buildAdvancedCommand("SetFollowing", { rows: [{ topic: 4, followeeIds: [1n] }] }).SetFollowing);
});

class FakeNode { constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.textContent="";this.value="";} append(...children){this.children.push(...children);} replaceChildren(...children){this.children=[...children];} addEventListener(name,listener){this.listeners[name]=listener;} dispatch(name){return this.listeners[name]();} }
const find = (node, predicate) => predicate(node) ? node : (node.children ?? []).map((child) => find(child, predicate)).find(Boolean);
test("control panel renders primary workflows and performs no mutation before exact confirmation", async () => {
  const previous = globalThis.document; globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => ({ textContent: text }) };
  try {
    const root = new FakeNode("main"), current = report({ checked_at_timestamp_seconds: 50n, target: [{ voting_power_refreshed_timestamp_seconds: [40n], potential_voting_power: [2n], deciding_voting_power: [2n] }], committed_topics: [] });
    let mutations = 0, refreshed = 0;
    const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), list_neurons: async ({ neuron_ids }) => ({ full_neurons: neuron_ids.map((id) => ({ id: [{ id }], known_neuron_data: [{ name: `Known ${id}` }], controller: [principal], hot_keys: [], cached_neuron_stake_e8s: 1n })) }), manage_neuron: async () => { mutations++; return { command: [{ MakeProposal: { proposal_id: [{ id: 8n }], message: [] } }] }; } };
    const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
    const cleanup = renderControlPanel(root, { report: current, session: targetedSession(), nnsActor: actor, pipeline, onSettlement: async () => { refreshed++; }, onRerun: async () => {} });
    const selects = []; const collect = (node) => { if (node.tag === "select") selects.push(node); for (const child of node.children ?? []) collect(child); }; collect(root); selects[0].value = "10";
    await find(root, (node) => node.textContent === "Review voting-power refresh").dispatch("click");
    assert.equal(mutations, 0); assert.match(JSON.stringify(root), /No NNS simulation was performed/);
    find(root, (node) => node.name === "topic").value = "1";
    find(root, (node) => node.name === "followees").value = "1,2,3,4,5";
    await find(root, (node) => node.textContent === "Review following replacement").dispatch("click");
    assert.match(JSON.stringify(root), /Known 1/);
    find(root, (node) => node.name === "topic").value = "2";
    find(root, (node) => node.name === "followees").value = "18363645821499695760";
    await find(root, (node) => node.textContent === "Review following replacement").dispatch("click");
    assert.match(JSON.stringify(root), /18363645821499695760/); assert.doesNotMatch(JSON.stringify(root), /followees[^]*nat:999/);
    find(root, (node) => node.name === "topic").value = "";
    await find(root, (node) => node.textContent === "Review following replacement").dispatch("click");
    assert.match(JSON.stringify(root), /explicit recognised topic/);
    find(root, (node) => node.name === "receiver").value = "99";
    await find(root, (node) => node.textContent === "Review controller-only reward receiver setup").dispatch("click");
    assert.ok(find(root, (node) => node.name === "target-confirmation"));
    assert.match(JSON.stringify(root), /Dendrite context: 20/); assert.match(JSON.stringify(root), /Direct NNS mutation target: 10/);
    cleanup();
    const staleCheckbox = find(root, (node) => node.name === "confirmation"); staleCheckbox.checked = true;
    await find(root, (node) => node.textContent === "Submit exact reviewed request").dispatch("click");
    assert.equal(mutations, 0); assert.match(JSON.stringify(root), /current explicitly confirmed review/);
    await find(root, (node) => node.textContent === "Review voting-power refresh").dispatch("click");
    assert.match(JSON.stringify(root), /not reimbursed/); assert.match(JSON.stringify(root), /Encoded request SHA-256/);
    const checkbox = find(root, (node) => node.name === "confirmation"); checkbox.checked = true;
    await find(root, (node) => node.textContent === "Submit exact reviewed request").dispatch("click");
    assert.equal(mutations, 1); assert.equal(refreshed, 1); assert.match(JSON.stringify(root), /Proposal 8 submitted/);
  } finally { globalThis.document = previous; }
});

test("delayed RefreshVotingPower UI review submits after ordinary NNS time progression", async () => {
  const previous = globalThis.document; globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => ({ textContent: text }) };
  try {
    const root = new FakeNode("main");
    let current = votingReport(100n, 40n, 8n, 7n), calls = 0;
    const actor = {
      get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }),
      manage_neuron: async () => { calls++; return { command: [{ MakeProposal: { proposal_id: [{ id: 55n }] } }] }; },
    };
    const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => current });
    renderControlPanel(root, { report: current, session: targetedSession(), nnsActor: actor, pipeline, onSettlement: async () => {} });
    find(root, (node) => node.tag === "select" && node.children?.some((child) => child.textContent === "10 — Manager")).value = "10";
    await find(root, (node) => node.textContent === "Review voting-power refresh").dispatch("click");
    assert.match(JSON.stringify(root), /Evidence observed for this review.*NNS snapshot: 100/);
    current = votingReport(3_700n, 40n, 10n, 6n);
    find(root, (node) => node.name === "confirmation").checked = true;
    await find(root, (node) => node.textContent === "Submit exact reviewed request").dispatch("click");
    assert.equal(calls, 1);
    assert.match(JSON.stringify(root), /Proposal 55 submitted/);
  } finally { globalThis.document = previous; }
});

test("control panel disables transactions when no Found manager grants authority", () => {
  const previous = globalThis.document; globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => ({ textContent: text }) };
  try {
    const root = new FakeNode("main");
    assert.equal(renderControlPanel(root, { report: report({ managers: [] }), session: targetedSession(), nnsActor: {}, pipeline: {}, onSuccess: async () => {} }), undefined);
    assert.match(JSON.stringify(root), /no authority over a Found target manager/);
  } finally { globalThis.document = previous; }
});

test("rerendered control panel retains unresolved warning and requires confirmed acknowledgment", async () => {
  const previous = globalThis.document; globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => ({ textContent: text }) };
  try {
    let calls = 0, settlements = 0;
    const actor = { get_network_economics_parameters: async () => ({ neuron_management_fee_per_proposal_e8s: 1n }), manage_neuron: async () => { calls++; throw new Error("timeout"); }, get_proposal_info: async () => [] };
    const pipeline = createTransactionPipeline({ getSession: async () => targetedSession(), getNnsActor: async () => actor, checkNeuron: async () => report() });
    const review = await pipeline.reviewProposal({ targetId: 20n, managerId: 10n, innerCommand: { RefreshVotingPower: {} }, operation: "uncertain refresh" });
    await assert.rejects(() => pipeline.submit(review, { confirmed: true }), /unknown/);
    const root = new FakeNode("main");
    renderControlPanel(root, { report: report(), session: targetedSession(), nnsActor: actor, pipeline, onSettlement: async () => { settlements++; }, onRerun: async () => {} });
    const rendered = JSON.stringify(root);
    assert.match(rendered, /Unresolved NNS transaction outcome/);
    assert.match(rendered, new RegExp(review.requestDigest));
    assert.match(rendered, /Dendrite context neuron: 20.*Mutation or managed neuron: 20/);
    assert.equal(find(root, (node) => node.textContent === "Review voting-power refresh").disabled, true);
    await find(root, (node) => node.textContent === "Acknowledge unresolved outcome and allow a new review").dispatch("click");
    assert.equal(pipeline.state, "outcome-unknown");
    assert.equal(calls, 1);
    find(root, (node) => node.name === "acknowledge-outcome").checked = true;
    await find(root, (node) => node.textContent === "Acknowledge unresolved outcome and allow a new review").dispatch("click");
    assert.equal(pipeline.state, "none");
    assert.equal(calls, 1);
    assert.equal(settlements, 1);
  } finally { globalThis.document = previous; }
});

test("open manager proposal helpers are bounded target-specific and vote-aware", () => {
  const request = openManageNeuronProposalRequest(25);
  assert.deepEqual(request.include_status, [1]);
  assert.notDeepEqual(request.include_all_manage_neuron_proposals, [true]);
  assert.deepEqual(request.include_all_manage_neuron_proposals, []);
  assert.throws(() => openManageNeuronProposalRequest(101), /1–100/);
  const info = { id: [{ id: 7n }], status: 1, topic: 1, deadline_timestamp_seconds: [100n], ballots: [[10n, { vote: 0, voting_power: 1n }]], proposal: [{ action: [{ ManageNeuron: { id: [], neuron_id_or_subaccount: [{ NeuronId: { id: 20n } }], command: [{ RefreshVotingPower: {} }] } }] }] };
  assert.deepEqual(selectTargetManageNeuronProposals([info], 20n).proposals, [info]);
  assert.deepEqual(validateOpenManagerProposal({ ...info, deadline_timestamp_seconds: [1n] }, 20n, 10n, 2), { RegisterVote: { proposal: [{ id: 7n }], vote: 2 } });
  assert.deepEqual(validateOpenManagerProposal({ ...info, deadline_timestamp_seconds: [9_999_999_999_999n] }, 20n, 10n, 1).RegisterVote.vote, 1);
  assert.throws(() => validateOpenManagerProposal({ ...info, status: 2 }, 20n, 10n, 1), /no longer Open/);
  assert.throws(() => validateOpenManagerProposal({ ...info, topic: 4 }, 20n, 10n, 1), /not Neuron Management/);
  assert.throws(() => validateOpenManagerProposal(info, 21n, 10n, 1), /does not match/);
  assert.throws(() => validateOpenManagerProposal({ ...info, ballots: [] }, 20n, 10n, 1), /no visible ballot/);
  assert.throws(() => validateOpenManagerProposal({ ...info, ballots: [[10n, { vote: 1 }]] }, 20n, 10n, 1), /already Yes/);
  assert.throws(() => validateOpenManagerProposal({ ...info, ballots: [[10n, { vote: 2 }]] }, 20n, 10n, 1), /already No/);
  assert.throws(() => validateOpenManagerProposal({ ...info, ballots: [[10n, { vote: 9 }]] }, 20n, 10n, 1), /unknown vote code/);
  assert.throws(() => validateOpenManagerProposal(info, 20n, 10n, 0), /explicitly/);
  assert.throws(() => validateOpenManagerProposal({ ...info, id: [] }, 20n, 10n, 1), /unavailable/);
});

test("stored management targets accept legacy and modern neuron IDs and fail closed otherwise", () => {
  const wrap = (managed) => ({ proposal: [{ action: [{ ManageNeuron: managed }] }] });
  assert.equal(managedNeuronId(wrap({ id: [], neuron_id_or_subaccount: [{ NeuronId: { id: 20n } }] })), 20n);
  assert.equal(managedNeuronId(wrap({ id: [{ id: 20n }], neuron_id_or_subaccount: [] })), 20n);
  assert.equal(managedNeuronId(wrap({ id: [{ id: 20n }], neuron_id_or_subaccount: [{ NeuronId: { id: 20n } }] })), 20n);
  assert.throws(() => managedNeuronId(wrap({ id: [{ id: 20n }], neuron_id_or_subaccount: [{ NeuronId: { id: 21n } }] })), /conflict/);
  assert.throws(() => managedNeuronId(wrap({ id: [], neuron_id_or_subaccount: [{ Subaccount: new Uint8Array(32) }] })), /Subaccount/);
  assert.throws(() => managedNeuronId(wrap({ id: [], neuron_id_or_subaccount: [] })), /missing/);
  assert.equal(selectTargetManageNeuronProposals([{ topic: 1, ...wrap({ id: [{ id: 20n }], neuron_id_or_subaccount: [] }) }], 20n).proposals.length, 1);
});

test("mixed Open proposals retain valid target management entries and bound malformed warnings", () => {
  const managed = (id, target) => ({ id: [{ id }], topic: 1, proposal: [{ action: [{ ManageNeuron: target }] }] });
  const target = managed(2n, { id: [], neuron_id_or_subaccount: [{ NeuronId: { id: 20n } }] });
  const selected = selectTargetManageNeuronProposals([
    { id: [{ id: 1n }], topic: 4, proposal: [{ action: [{ Motion: {} }] }] },
    target,
    managed(3n, { id: [{ id: 21n }], neuron_id_or_subaccount: [] }),
    { id: [{ id: 4n }], topic: 1, proposal: [{ action: [{ Motion: {} }] }] },
    managed(5n, { id: [{ id: 20n }], neuron_id_or_subaccount: [{ NeuronId: { id: 21n } }] }),
  ], 20n);
  assert.deepEqual(selected.proposals, [target]);
  assert.equal(selected.warnings.length, 2);
  assert.ok(selected.warnings.every((warning) => warning.length <= 512));
});

test("control panel renders valid target proposals alongside bounded malformed warnings", async () => {
  const previous = globalThis.document; globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => ({ textContent: text }) };
  try {
    const valid = { id: [{ id: 2n }], topic: 1, status: 1, ballots: [], proposal: [{ title: ["Valid"], summary: "summary", action: [{ ManageNeuron: { id: [], neuron_id_or_subaccount: [{ NeuronId: { id: 20n } }], command: [{ RefreshVotingPower: {} }] } }] }] };
    const actor = { list_proposals: async () => ({ proposal_info: [{ id: [{ id: 1n }], topic: 4 }, valid, { id: [{ id: 3n }], topic: 1, proposal: [{ action: [{ Motion: {} }] }] }] }) };
    const root = new FakeNode("main");
    renderControlPanel(root, { report: report(), session: targetedSession(), nnsActor: actor, pipeline: { state: "none", discardReadyReview() {} }, onSuccess: async () => {} });
    await find(root, (node) => node.textContent === "Load bounded open proposals").dispatch("click");
    const rendered = JSON.stringify(root);
    assert.match(rendered, /Proposal 2/); assert.match(rendered, /Skipped proposal warnings/); assert.match(rendered, /Proposal 3/);
  } finally { globalThis.document = previous; }
});

test("hotkey and reward readiness helpers preserve controller-honest boundaries", async () => {
  assert.deepEqual(classifyRewardReceiver(manager({ neuron_management_followees: [] })), { status: "FallbackToKnownNeuron" });
  assert.deepEqual(classifyRewardReceiver(manager({ neuron_management_followees: [99n] })), { status: "ConfiguredUnverified", receiverId: 99n, duplicateConfiguration: false });
  assert.deepEqual(classifyRewardReceiver(manager({ neuron_management_followees: [99n, 99n] })), { status: "ConfiguredUnverified", receiverId: 99n, duplicateConfiguration: true });
  assert.equal(classifyRewardReceiver(manager({ neuron_management_followees: [1n, 2n] })).status, "Ambiguous");
  assert.equal(classifyRewardReceiver(manager({ evidence_status: { Unavailable: null } })).status, "Indeterminate");
  const other = "rrkah-fqaaa-aaaaa-aaaaq-cai";
  assert.ok(buildAddManagerHotkeyCommand(manager(), 20n, other).Configure);
  assert.throws(() => buildAddManagerHotkeyCommand(manager(), 20n, "2vxsx-fae"), /Anonymous/);
  assert.throws(() => buildAddManagerHotkeyCommand(manager(), 20n, principal.toText()), /redundant/);
  assert.throws(() => buildAddManagerHotkeyCommand(manager({ neuron_id: 20n }), 20n, other), /target Dendrite/);
  assert.throws(() => buildAddManagerHotkeyCommand(manager({ hot_keys: [Principal.fromText(other)] }), 20n, other), /already/);
  assert.throws(() => buildAddManagerHotkeyCommand(manager({ hot_keys: Array(10).fill(Principal.fromText("aaaaa-aa")) }), 20n, other), /maximum/);
  assert.deepEqual(buildRewardReceiverCommand(99n), { Follow: { topic: 1, followees: [{ id: 99n }] } });
  const managers = [manager({ neuron_management_followees: [99n] }), manager({ neuron_id: 11n, neuron_management_followees: [100n] })];
  assert.deepEqual((await verifyRewardReceivers(managers, { list_neurons: async () => ({ full_neurons: [{ id: [{ id: 99n }] }] }) })).map((entry) => entry.status), ["FoundAndReadable", "NotReturnedToCaller"]);
  assert.deepEqual((await verifyRewardReceivers(managers, { list_neurons: async () => { throw new Error("unavailable"); } })).map((entry) => entry.status), ["UpstreamUnavailable", "UpstreamUnavailable"]);
  await assert.rejects(() => verifyRewardReceivers(Array.from({ length: 16 }, (_, index) => manager({ neuron_id: BigInt(index + 1), neuron_management_followees: [BigInt(index + 100)] })), { list_neurons: async () => ({ full_neurons: [] }) }), /bounded to 15/);
});

test("advanced command bounds fail closed", () => {
  assert.throws(() => buildAdvancedCommand("FutureCommand"), /Unknown command/);
  assert.throws(() => buildAdvancedCommand("Spawn", { percentage: 0 }), /1–100/);
  assert.throws(() => buildAdvancedCommand("DisburseMaturity", { percentage: 1 }), /exactly one/);
  assert.throws(() => buildAdvancedCommand("DisburseMaturity", { percentage: 1, account: { owner: "aaaaa-aa" }, accountIdentifier: new Uint8Array(32) }), /exactly one/);
});

test("Spawn requires exactly one valid self-authenticating controller", () => {
  for (const value of [undefined, "", "2vxsx-fae", "aaaaa-aa", "rrkah-fqaaa-aaaaa-aaaaq-cai", "not-a-principal"]) {
    assert.throws(() => buildAdvancedCommand("Spawn", { newController: value }), /controller|principal/);
  }
  assert.equal(selfAuthenticatingPrincipal(userPrincipal.toText()).toText(), userPrincipal.toText());
  const command = buildAdvancedCommand("Spawn", { newController: userPrincipal.toText(), percentage: 50, nonce: 1n });
  assert.deepEqual(command.Spawn.new_controller, [userPrincipal]);
  assert.match(encodeManageNeuronRequest(buildManageNeuronProposal(10n, 20n, command)), /^[0-9a-f]+$/);
});

test("all current Configure operations use explicit typed builders", () => {
  assert.ok(buildConfigureOperation("IncreaseDissolveDelay", { seconds: 1 }).IncreaseDissolveDelay);
  assert.ok(buildConfigureOperation("SetDissolveTimestamp", { timestampSeconds: 1n }).SetDissolveTimestamp);
  for (const kind of ["StartDissolving","StopDissolving","JoinCommunityFund","LeaveCommunityFund"]) assert.ok(buildConfigureOperation(kind)[kind]);
  assert.ok(buildConfigureOperation("AddHotKey", { principal: "aaaaa-aa" }).AddHotKey);
  assert.ok(buildConfigureOperation("RemoveHotKey", { principal: "aaaaa-aa" }).RemoveHotKey);
  assert.ok(buildConfigureOperation("ChangeAutoStakeMaturity", { enabled: true }).ChangeAutoStakeMaturity);
  assert.ok(buildConfigureOperation("SetVisibility", { visibility: 1 }).SetVisibility);
  assert.throws(() => buildConfigureOperation("Future"), /Unknown Configure/);
  assert.throws(() => buildAdvancedCommand("DisburseMaturity", { percentage: 1, accountIdentifier: new Uint8Array(31) }), /32 bytes/);
  assert.throws(() => buildAdvancedCommand("SetFollowing", { rows: [{ topic: 99, followeeIds: [] }] }), /Unknown/);
});

test("SetFollowing applies the same standard candidate rules to every row", () => {
  const value = report({ committed_topics: [{ topic: 4 }], managers: [manager(), manager({ neuron_id: 11n }), manager({ neuron_id: 12n })] });
  const command = buildStandardSetFollowingCommand(value, [{ topic: 4, followeeIds: [10n, 11n, 12n] }, { topic: 0, followeeIds: [18_422_777_432_977_120_264n] }]);
  assert.deepEqual(command.SetFollowing.topic_following[0][0].followees[0].map((entry) => entry.id), [10n, 11n, 12n]);
  assert.deepEqual(command.SetFollowing.topic_following[0][1].followees[0].map((entry) => entry.id), [18_422_777_432_977_120_264n]);
  assert.throws(() => buildStandardSetFollowingCommand(value, [{ topic: 4, followeeIds: [10n, 99n, 12n] }]), /known target managers/);
});

test("advanced panel exposes explicit typed forms and unavailable reasons", async () => {
  const previous = globalThis.document; globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => ({ textContent: text }) };
  try {
    const root = new FakeNode("main"), reviews = [];
    renderAdvancedCommands(root, { report: { neuron_id: 20n }, managerId: () => 10n, pipeline: { reviewProposal: async (value) => { reviews.push(value); return value; } }, showReview: () => {}, fail: (error) => { throw error; } });
    const byName = (name) => find(root, (node) => node.name === name);
    const click = async (label) => find(root, (node) => node.textContent === label).dispatch("click");
    const selects = []; const collect = (node) => { if (node.tag === "select") selects.push(node); for (const child of node.children ?? []) collect(child); }; collect(root);
    selects[0].value = "StartDissolving"; await click("Review Configure");
    for (const [kind, value] of [["IncreaseDissolveDelay","1"],["SetDissolveTimestamp","2"],["AddHotKey","aaaaa-aa"],["RemoveHotKey","aaaaa-aa"],["JoinCommunityFund",""],["LeaveCommunityFund",""],["ChangeAutoStakeMaturity","true"],["SetVisibility","2"]]) { selects[0].value = kind; byName("configure-value").value = value; await click("Review Configure"); }
    byName("spawn-percent").value = "50"; byName("spawn-controller").value = userPrincipal.toText(); byName("spawn-nonce").value = "1"; await click("Review Spawn");
    byName("split-amount").value = "1.25"; await click("Review Split");
    await click("Review ClaimOrRefresh");
    byName("merge-source").value = "99"; await click("Review Merge");
    await click("Review StakeMaturity");
    byName("maturity-percent").value = "10"; byName("maturity-destination").value = "legacy"; byName("maturity-bytes").value = "00".repeat(32); await click("Review DisburseMaturity");
    byName("maturity-destination").value = "icrc"; byName("maturity-owner").value = "aaaaa-aa"; byName("maturity-bytes").value = ""; await click("Review DisburseMaturity");
    byName("set-topic").value = "4"; byName("set-followees").value = "10,11"; await click("Review SetFollowing");
    assert.equal(reviews.length, 17); assert.match(JSON.stringify(root), /Nested MakeProposal/); assert.equal(reviews.filter((value) => value.highRisk).length >= 11, true);
    for (const operation of ["Configure: SetDissolveTimestamp", "Configure: StartDissolving", "Configure: AddHotKey", "Configure: RemoveHotKey", "Configure: JoinCommunityFund", "Configure: LeaveCommunityFund", "Configure: SetVisibility", "Spawn from target maturity", "Split target stake", "Merge source neuron into target", "Disburse target maturity", "Replace multiple topic followee lists"]) assert.equal(reviews.find((value) => value.operation === operation)?.highRisk, true, operation);
  } finally { globalThis.document = previous; }
});

test("exact request reviews render every typed value and direct standard impact safely", () => {
  assert.equal(exactValue(7n), '"nat:7"');
  assert.equal(exactValue("text"), '"text"');
  assert.equal(exactValue(2), "2");
  assert.equal(exactValue(false), "false");
  assert.equal(exactValue(null), "null");
  assert.equal(exactValue(undefined), undefined);
  assert.equal(exactValue(new Uint8Array([0, 255])), '"bytes:0x00ff"');
  assert.match(exactValue([1n, "x"]), /nat:1/);
  assert.equal(exactValue({ toText: () => "aaaaa-aa" }), '"principal:aaaaa-aa"');
  assert.match(exactValue({ z: true, a: 1n }), /nat:1/);
  assert.match(directImpact("AddHotKey"), /no-hotkey/);
  assert.match(directImpact("StartDissolving"), /locked-neuron/);
  assert.match(directImpact("RemoveHotKey"), /restore/);
  assert.match(directImpact("Refresh target voting power"), /freshness/);
  assert.match(directImpact("Follow replacement"), /following/);
  assert.match(directImpact("following replacement"), /following/);
  assert.equal(directImpact("Split"), undefined);
});
