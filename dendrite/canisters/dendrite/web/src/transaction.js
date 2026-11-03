import { Principal } from "@icp-sdk/core/principal";
import { IDL } from "@icp-sdk/core/candid";
import { idlFactory as nnsIdlFactory } from "../../../../src/declarations/nns-governance/nns-governance.did.js";
import { classifyManagerAuthority } from "./authority.js";
import { parseNeuronId } from "./ids.js";
import { ALPHA_VOTE_NEURON_ID, OMEGA_REJECT_NEURON_ID, OMEGA_VOTE_NEURON_ID } from "./ids.js";
import { TOPIC_LABELS } from "./compliance-view.js";

export const PROPOSAL_TITLE = "Dendrite neuron management request";
export const COMMAND_CAPABILITIES = Object.freeze({
  Spawn: "high-risk", Split: "high-risk", Follow: "enabled", ClaimOrRefresh: "enabled",
  Configure: "enabled", RegisterVote: "enabled", Merge: "high-risk",
  DisburseToNeuron: "unavailable-target-not-for-profit-false",
  MakeProposal: "unavailable-nested-proposal", StakeMaturity: "enabled",
  MergeMaturity: "unavailable-removed-upstream", Disburse: "unavailable-target-not-for-profit-false",
  RefreshVotingPower: "enabled", DisburseMaturity: "high-risk", SetFollowing: "high-risk",
});
const E8S_PER_ICP = 100_000_000n;
const MAX_NOTE_BYTES = 1_000;
const MAX_NNS_ERROR_CHARS = 512;
const MAX_REVIEW_DETAILS = 32;
const MAX_REVIEW_DETAIL_CHARS = 1_024;

const manageNeuronRequestType = nnsIdlFactory({ IDL })._fields.find(([name]) => name === "manage_neuron")?.[1]?.argTypes?.[0];
if (!manageNeuronRequestType) throw new Error("ManageNeuronRequest IDL is unavailable.");

const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
export const encodeManageNeuronRequest = (request) => hex(IDL.encode([manageNeuronRequestType], [request]));
const requestDigest = async (encodedHex) => hex(await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(encodedHex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))));

const canonical = (value) => JSON.stringify(value, (_key, item) => {
  if (typeof item === "bigint") return `nat:${item}`;
  if (item instanceof Uint8Array) return `bytes:${hex(item)}`;
  if (typeof item?.toText === "function") return `principal:${item.toText()}`;
  if (item && typeof item === "object" && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
  return item;
});

const boundedDetails = (details = []) => {
  if (!Array.isArray(details) || details.length > MAX_REVIEW_DETAILS) throw new Error("Review details exceed the bounded display limit.");
  return details.map((detail) => String(detail).slice(0, MAX_REVIEW_DETAIL_CHARS));
};

export function formatE8s(value) {
  if (typeof value !== "bigint" || value < 0n) throw new TypeError("e8s must be a non-negative bigint.");
  const whole = value / E8S_PER_ICP;
  const fraction = String(value % E8S_PER_ICP).padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function parseIcpToE8s(value) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)(\.[0-9]{1,8})?$/.test(value)) {
    throw new TypeError("ICP must be a canonical non-negative decimal with at most 8 places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const e8s = BigInt(whole) * E8S_PER_ICP + BigInt((fraction + "00000000").slice(0, 8));
  if (e8s > 18_446_744_073_709_551_615n) throw new RangeError("ICP amount exceeds nat64.");
  return e8s;
}

export function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  if (value instanceof Principal || ArrayBuffer.isView(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

const neuron = (id) => ({ NeuronId: { id: parseNeuronId(String(id)) } });
const boundedNote = (note) => {
  const value = String(note ?? "");
  if (new TextEncoder().encode(value).length > MAX_NOTE_BYTES) throw new RangeError("Proposal note is too long.");
  return value;
};

export function buildManageNeuronProposal(managerId, targetId, innerCommand, note = "") {
  const manager = parseNeuronId(String(managerId));
  const target = parseNeuronId(String(targetId));
  if (!innerCommand || Object.keys(innerCommand).length !== 1) throw new TypeError("Exactly one target command is required.");
  const summary = `Manage Dendrite neuron ${target}.${boundedNote(note) ? ` Note: ${boundedNote(note)}` : ""}`;
  return deepFreeze({
    id: [],
    neuron_id_or_subaccount: [neuron(manager)],
    command: [{ MakeProposal: {
      title: [PROPOSAL_TITLE], url: "", summary,
      action: [{ ManageNeuron: {
        id: [], neuron_id_or_subaccount: [neuron(target)], command: [innerCommand],
      } }],
    } }],
  });
}

export function buildDirectManagerOperation(managerId, command) {
  if (!command || Object.keys(command).length !== 1) throw new TypeError("Exactly one direct command is required.");
  return deepFreeze({ id: [], neuron_id_or_subaccount: [neuron(managerId)], command: [command] });
}

const distinctNeuronIds = (values, minimum = 0, maximum = 15) => {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) throw new RangeError(`Enter ${minimum}–${maximum} followees.`);
  const ids = values.map((value) => parseNeuronId(String(value)));
  if (new Set(ids.map(String)).size !== ids.length) throw new TypeError("Followee IDs must be distinct.");
  return ids;
};

export function buildFollowCommand(topic, followeeIds, minimum = 0) {
  if (!Number.isInteger(topic) || !TOPIC_LABELS.has(topic) || topic === 11) throw new Error("Unknown or reserved topic; Dendrite interface update required.");
  return deepFreeze({ Follow: { topic, followees: distinctNeuronIds(followeeIds, minimum).map((id) => ({ id })) } });
}

export function buildPrimaryFollowCommand(report, topic, selectedIds = [], knownCandidates = []) {
  const targetId = report?.neuron_id;
  if (topic === 1) {
    const ids = distinctNeuronIds(selectedIds, 5);
    if (ids.some((id) => id === targetId)) throw new Error("The target cannot manage itself.");
    const known = new Set(knownCandidates.filter((entry) => entry?.known).map((entry) => String(entry.id)));
    if (ids.some((id) => !known.has(String(id)))) throw new Error("Every manager candidate must be a returned full public known neuron.");
    return buildFollowCommand(topic, ids, 5);
  }
  const committed = report?.committed_topics?.some((entry) => entry.topic === topic);
  if (committed) {
    const ids = distinctNeuronIds(selectedIds, 3);
    for (const id of ids) {
      const candidate = report.managers.find((entry) => entry.neuron_id === id);
      if (!candidate || variant(candidate.evidence_status) !== "Found" || !candidate.known_neuron?.length) throw new Error("Committed delegates must be found known target managers.");
      if (!candidate.omega_ready_topics?.includes(topic)) throw new Error(`Manager ${id} does not follow omega-reject ${OMEGA_REJECT_NEURON_ID} exactly on this topic.`);
    }
    return buildFollowCommand(topic, ids, 3);
  }
  if (!TOPIC_LABELS.has(topic) || topic === 11) throw new Error("Unknown or reserved topic; Dendrite interface update required.");
  const ids = selectedIds.length === 0 ? [BigInt(ALPHA_VOTE_NEURON_ID)] : distinctNeuronIds(selectedIds, 1);
  const approved = [ALPHA_VOTE_NEURON_ID, OMEGA_VOTE_NEURON_ID, OMEGA_REJECT_NEURON_ID].map(BigInt);
  if (ids.length !== 1 || !approved.includes(ids[0])) {
    throw new Error("Uncommitted topics must follow alpha-vote, omega-vote, or omega-reject exactly.");
  }
  return buildFollowCommand(topic, ids, 1);
}

export const buildRefreshVotingPowerCommand = () => deepFreeze({ RefreshVotingPower: {} });

export function buildStandardSetFollowingCommand(report, rows, knownCandidates = []) {
  if (!Array.isArray(rows) || rows.length > TOPIC_LABELS.size) throw new RangeError("SetFollowing rows exceed the recognised topic bound.");
  if (new Set(rows.map((row) => row.topic)).size !== rows.length) throw new Error("SetFollowing topics must be unique.");
  const topicFollowing = rows.map((row) => {
    const follow = buildPrimaryFollowCommand(report, row.topic, row.followeeIds, knownCandidates).Follow;
    return { topic: [row.topic], followees: [follow.followees] };
  });
  return deepFreeze({ SetFollowing: { topic_following: [topicFollowing] } });
}

export function buildRegisterVoteCommand(proposalInfo, vote) {
  const id = proposalInfo?.id?.[0]?.id;
  if (typeof id !== "bigint") throw new Error("Proposal does not exist.");
  if (proposalInfo.status !== 1) throw new Error("Proposal is not Open.");
  if (proposalInfo.topic === 1) throw new Error("Use manager voting for Neuron Management proposals.");
  if (vote !== 1 && vote !== 2) throw new Error("Vote must be explicitly Yes or No.");
  return deepFreeze({ RegisterVote: { proposal: [{ id }], vote } });
}

const percentage = (value) => {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new RangeError("Percentage must be 1–100.");
  return value;
};
const optional = (value) => value === undefined ? [] : [value];
const nat64 = (value, label) => {
  const parsed = typeof value === "bigint" ? value : BigInt(value);
  if (parsed < 0n || parsed > 18_446_744_073_709_551_615n) throw new RangeError(`${label} must be nat64.`);
  return parsed;
};
const nat32 = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 4_294_967_295) throw new RangeError(`${label} must be nat32.`);
  return value;
};
const bytes32 = (value, label) => {
  if (!(value instanceof Uint8Array) || value.length !== 32) throw new TypeError(`${label} must be exactly 32 bytes.`);
  return Uint8Array.from(value);
};

export function selfAuthenticatingPrincipal(value) {
  if (typeof value !== "string" || value === "") throw new TypeError("Spawn controller is required.");
  let principal;
  try { principal = Principal.fromText(value); } catch (_error) { throw new TypeError("Spawn controller must be a valid principal."); }
  const bytes = principal.toUint8Array();
  if (bytes.length !== 29 || bytes[28] !== 2) throw new TypeError("Spawn controller must be a self-authenticating user principal.");
  return principal;
}

export function buildConfigureOperation(kind, fields = {}) {
  switch (kind) {
    case "IncreaseDissolveDelay": return { IncreaseDissolveDelay: { additional_dissolve_delay_seconds: nat32(fields.seconds, "Dissolve delay increase") } };
    case "SetDissolveTimestamp": return { SetDissolveTimestamp: { dissolve_timestamp_seconds: nat64(fields.timestampSeconds, "Dissolve timestamp") } };
    case "StartDissolving": return { StartDissolving: {} };
    case "StopDissolving": return { StopDissolving: {} };
    case "AddHotKey": return { AddHotKey: { new_hot_key: [Principal.fromText(fields.principal)] } };
    case "RemoveHotKey": return { RemoveHotKey: { hot_key_to_remove: [Principal.fromText(fields.principal)] } };
    case "JoinCommunityFund": return { JoinCommunityFund: {} };
    case "LeaveCommunityFund": return { LeaveCommunityFund: {} };
    case "ChangeAutoStakeMaturity": if (typeof fields.enabled !== "boolean") throw new TypeError("Auto-stake maturity setting must be boolean."); else return { ChangeAutoStakeMaturity: { requested_setting_for_auto_stake_maturity: fields.enabled } };
    case "SetVisibility": {
      const visibility = nat32(fields.visibility, "Visibility");
      if (visibility !== 1 && visibility !== 2) throw new Error("Visibility must be explicitly Private or Public.");
      return { SetVisibility: { visibility: [visibility] } };
    }
    default: throw new Error("Unknown Configure operation; interface update required.");
  }
}

export function buildAdvancedCommand(kind, fields = {}) {
  if (!(kind in COMMAND_CAPABILITIES)) throw new Error("Unknown command; interface update required.");
  if (COMMAND_CAPABILITIES[kind].startsWith("unavailable")) throw new Error(`Command unavailable: ${COMMAND_CAPABILITIES[kind]}.`);
  switch (kind) {
    case "Spawn": return deepFreeze({ Spawn: { percentage_to_spawn: optional(fields.percentage === undefined ? undefined : percentage(fields.percentage)), new_controller: [selfAuthenticatingPrincipal(fields.newController)], nonce: optional(fields.nonce === undefined ? undefined : nat64(fields.nonce, "Nonce")) } });
    case "Split": return deepFreeze({ Split: { amount_e8s: nat64(fields.amountE8s, "Amount"), memo: optional(fields.memo === undefined ? undefined : nat64(fields.memo, "Memo")) } });
    case "Follow": return buildFollowCommand(fields.topic, fields.followeeIds);
    case "ClaimOrRefresh": return deepFreeze({ ClaimOrRefresh: { by: [{ NeuronIdOrSubaccount: {} }] } });
    case "RegisterVote": return buildRegisterVoteCommand(fields.proposalInfo, fields.vote);
    case "Merge": return deepFreeze({ Merge: { source_neuron_id: [{ id: parseNeuronId(String(fields.sourceNeuronId)) }] } });
    case "StakeMaturity": return deepFreeze({ StakeMaturity: { percentage_to_stake: optional(fields.percentage === undefined ? undefined : percentage(fields.percentage)) } });
    case "RefreshVotingPower": return buildRefreshVotingPowerCommand();
    case "DisburseMaturity": {
      const command = { percentage_to_disburse: percentage(fields.percentage), to_account: [], to_account_identifier: [] };
      if (fields.account) command.to_account = [{ owner: [Principal.fromText(fields.account.owner)], subaccount: optional(fields.account.subaccount === undefined ? undefined : bytes32(fields.account.subaccount, "ICRC subaccount")) }];
      if (fields.accountIdentifier) command.to_account_identifier = [{ hash: bytes32(fields.accountIdentifier, "Account identifier") }];
      if ((command.to_account.length + command.to_account_identifier.length) !== 1) throw new Error("Choose exactly one explicit maturity destination.");
      return deepFreeze({ DisburseMaturity: command });
    }
    case "SetFollowing": {
      if (!Array.isArray(fields.rows) || fields.rows.length > TOPIC_LABELS.size) throw new RangeError("SetFollowing rows exceed the recognised topic bound.");
      if (new Set(fields.rows.map((row) => row.topic)).size !== fields.rows.length) throw new Error("SetFollowing topics must be unique.");
      return deepFreeze({ SetFollowing: { topic_following: [fields.rows.map((row) => {
        if (!TOPIC_LABELS.has(row.topic) || row.topic === 11) throw new Error("Unknown or reserved topic; interface update required.");
        return { topic: [row.topic], followees: [distinctNeuronIds(row.followeeIds).map((id) => ({ id }))] };
      })] } });
    }
    case "Configure": return deepFreeze({ Configure: { operation: [buildConfigureOperation(fields.configureKind, fields)] } });
    default: throw new Error(`Enabled command ${kind} needs an explicit reviewed builder.`);
  }
}

export function openManageNeuronProposalRequest(limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Proposal limit must be 1–100.");
  return deepFreeze({ include_reward_status: [], omit_large_fields: [true], before_proposal: [], limit,
    exclude_topic: [], include_all_manage_neuron_proposals: [], include_status: [1], return_self_describing_action: [false] });
}

const storedManageNeuron = (info) => info?.proposal?.[0]?.action?.[0]?.ManageNeuron;
export function managedNeuronId(info) {
  const managed = storedManageNeuron(info);
  if (!managed) throw new Error("Proposal is not a stored Neuron Management action.");
  const legacy = managed.id?.[0]?.id;
  const modern = managed.neuron_id_or_subaccount?.[0];
  if (modern?.Subaccount !== undefined) throw new Error("Subaccount-targeted management proposals are unsupported on a neuron-ID page.");
  const modernId = modern?.NeuronId?.id;
  if (modernId !== undefined && typeof modernId !== "bigint") throw new Error("Stored modern proposal target is malformed.");
  if (legacy !== undefined && typeof legacy !== "bigint") throw new Error("Stored legacy proposal target is malformed.");
  if (modernId !== undefined && legacy !== undefined && modernId !== legacy) throw new Error("Stored proposal target fields conflict.");
  const id = modernId ?? legacy;
  if (typeof id !== "bigint") throw new Error("Stored proposal target is missing.");
  return id;
}
const proposalWarning = (info, message) => `Proposal ${info?.id?.[0]?.id ?? "unknown"}: ${message}`.slice(0, MAX_NNS_ERROR_CHARS);
export function selectTargetManageNeuronProposals(proposals, targetId) {
  const target = parseNeuronId(String(targetId));
  const matching = [], warnings = [];
  for (const info of proposals ?? []) {
    if (info?.topic !== 1) continue;
    if (!storedManageNeuron(info)) {
      warnings.push(proposalWarning(info, "Neuron Management proposal has no stored ManageNeuron action and was skipped."));
      continue;
    }
    try {
      if (managedNeuronId(info) === target) matching.push(info);
    } catch (error) {
      warnings.push(proposalWarning(info, String(error?.message ?? "Malformed stored management target was skipped.")));
    }
  }
  return Object.freeze({ proposals: Object.freeze(matching), warnings: Object.freeze(warnings) });
}

export function validateOpenManagerProposal(info, targetId, managerId, vote) {
  const target = parseNeuronId(String(targetId)), manager = parseNeuronId(String(managerId));
  if (info?.status !== 1) throw new Error("Neuron Management proposal is no longer Open.");
  if (info.topic !== 1) throw new Error("Proposal topic is not Neuron Management.");
  if (managedNeuronId(info) !== target) throw new Error("Stored proposal target does not match the current Dendrite neuron.");
  const ballot = info.ballots?.find(([id]) => id === manager)?.[1];
  if (!ballot) throw new Error("Selected manager has no visible ballot in this proposal's fixed electoral roll.");
  if (ballot.vote === 1) throw new Error("Selected manager ballot is already Yes.");
  if (ballot.vote === 2) throw new Error("Selected manager ballot is already No.");
  if (ballot.vote !== 0) throw new Error("Selected manager ballot has an unknown vote code; interface update required.");
  if (vote !== 1 && vote !== 2) throw new Error("Manager vote must be explicitly Yes or No.");
  const proposalId = info.id?.[0]?.id;
  if (typeof proposalId !== "bigint") throw new Error("Proposal ID is unavailable.");
  return deepFreeze({ RegisterVote: { proposal: [{ id: proposalId }], vote } });
}

export function classifyRewardReceiver(manager) {
  if (variant(manager?.evidence_status) !== "Found") return Object.freeze({ status: "Indeterminate" });
  const followees = manager.neuron_management_followees ?? [];
  if (followees.length === 0) return Object.freeze({ status: "FallbackToKnownNeuron" });
  const distinct = [...new Map(followees.map((id) => [String(id), id])).values()];
  if (distinct.length === 1) return Object.freeze({ status: "ConfiguredUnverified", receiverId: distinct[0], duplicateConfiguration: followees.length > 1 });
  return Object.freeze({ status: "Ambiguous", receiverIds: distinct });
}

const listExplicitRewardReceivers = async (nnsActor, receiverIds) => {
  if (!Array.isArray(receiverIds) || receiverIds.length < 1 || receiverIds.length > 15) {
    throw new RangeError("Receiver lookup requires one to 15 distinct neuron IDs.");
  }
  const ids = receiverIds.map((id) => parseNeuronId(String(id)));
  const requested = new Set(ids.map(String));
  if (requested.size !== ids.length) throw new Error("Receiver lookup neuron IDs must be distinct.");
  const response = await nnsActor.list_neurons({
    neuron_ids: ids,
    include_neurons_readable_by_caller: false,
    include_empty_neurons_readable_by_caller: [false],
    include_public_neurons_in_full_neurons: [true],
    page_number: [0n],
    page_size: [BigInt(ids.length)],
    neuron_subaccounts: [],
  });
  if (!Array.isArray(response?.full_neurons)) throw new Error("Receiver lookup returned malformed full-neuron evidence.");
  const pages = response.total_pages_available;
  if (pages !== undefined && (!Array.isArray(pages) || pages.length > 1 || (pages.length === 1 && pages[0] !== 1n))) {
    throw new Error("Receiver lookup returned an invalid page count.");
  }
  const returned = new Map();
  for (const entry of response.full_neurons) {
    let id;
    try {
      if (!Array.isArray(entry?.id) || entry.id.length !== 1) throw new Error();
      if (typeof entry.id[0]?.id !== "bigint") throw new Error();
      id = parseNeuronId(String(entry.id[0].id));
    } catch (_error) {
      throw new Error("Receiver lookup returned a malformed or zero neuron ID.");
    }
    const key = String(id);
    if (!requested.has(key)) throw new Error("Receiver lookup returned an unexpected neuron ID.");
    if (returned.has(key)) throw new Error("Receiver lookup returned a duplicate neuron ID.");
    returned.set(key, entry);
  }
  return returned;
};

export async function verifyRewardReceivers(managers, nnsActor) {
  const configured = [];
  const seenManagers = new Set();
  for (const manager of managers) {
    if (seenManagers.has(String(manager.neuron_id))) continue;
    seenManagers.add(String(manager.neuron_id));
    const classification = classifyRewardReceiver(manager);
    if (classification.status === "ConfiguredUnverified") configured.push({ managerId: manager.neuron_id, receiverId: classification.receiverId });
  }
  const receiverIds = [...new Map(configured.map((entry) => [String(entry.receiverId), entry.receiverId])).values()];
  if (receiverIds.length > 15) throw new Error("Receiver verification is bounded to 15 distinct IDs.");
  if (!receiverIds.length) return [];
  let returned;
  try {
    returned = await listExplicitRewardReceivers(nnsActor, receiverIds);
  } catch (_error) {
    return configured.map((entry) => Object.freeze({ ...entry, status: "UpstreamUnavailable" }));
  }
  return configured.map((entry) => Object.freeze({ ...entry, status: returned.has(String(entry.receiverId)) ? "FoundAndReadable" : "NotReturnedToCaller" }));
}

export function buildAddManagerHotkeyCommand(manager, targetId, newPrincipal, maximum = 10) {
  const target = parseNeuronId(String(targetId));
  if (manager.neuron_id === target) throw new Error("Onboarding cannot add a hotkey to the target Dendrite neuron.");
  const principal = Principal.fromText(newPrincipal);
  if (principal.compareTo(Principal.anonymous()) === "eq") throw new Error("Anonymous principal cannot be added as a hotkey.");
  if (manager.controller?.[0]?.compareTo(principal) === "eq") throw new Error("Adding the manager controller as its own hotkey is redundant.");
  if (manager.hot_keys.some((entry) => entry.compareTo(principal) === "eq")) throw new Error("That principal is already a manager hotkey.");
  if (manager.hot_keys.length >= maximum) throw new Error("Manager hotkey count is already at the NNS maximum.");
  return deepFreeze({ Configure: { operation: [{ AddHotKey: { new_hot_key: [principal] } }] } });
}

export function buildRewardReceiverCommand(receiverId) {
  return buildFollowCommand(1, [receiverId], 1);
}

const listKnownCandidates = async (nnsActor, ids) => {
  if (!ids.length) return [];
  const response = await nnsActor.list_neurons({ neuron_ids: ids, include_neurons_readable_by_caller: false,
    include_empty_neurons_readable_by_caller: [], include_public_neurons_in_full_neurons: [true],
    page_number: [], page_size: [], neuron_subaccounts: [] });
  return response.full_neurons.map((entry) => ({ id: entry.id?.[0]?.id, known: Boolean(entry.known_neuron_data?.length), name: entry.known_neuron_data?.[0]?.name ?? "unknown" }));
};

export function preparePrimaryFollow(topic, selectedIds) {
  const fixedTopic = Number(topic);
  const fixedIds = distinctNeuronIds(selectedIds);
  return async ({ report, nnsActor }) => {
    const candidates = fixedTopic === 1 ? await listKnownCandidates(nnsActor, fixedIds) : [];
    const command = buildPrimaryFollowCommand(report, fixedTopic, fixedIds, candidates);
    const actualIds = command.Follow.followees.map((entry) => entry.id);
    return {
      command,
      details: [`Complete replacement for ${TOPIC_LABELS.get(fixedTopic)} (${fixedTopic}): ${actualIds.join(", ") || "empty"}.`, ...candidates.map((entry) => `Validated known neuron ${entry.id} — ${entry.name}.`)],
      securityFingerprint: canonical({ topic: fixedTopic, followeeIds: actualIds }),
    };
  };
}

export function prepareStandardSetFollowing(rows) {
  const fixedRows = rows.map((row) => ({ topic: Number(row.topic), followeeIds: distinctNeuronIds(row.followeeIds) }));
  return async ({ report, nnsActor }) => {
    const managerIds = fixedRows.filter((row) => row.topic === 1).flatMap((row) => row.followeeIds);
    const candidates = await listKnownCandidates(nnsActor, managerIds);
    const command = buildStandardSetFollowingCommand(report, fixedRows, candidates);
    const actualRows = command.SetFollowing.topic_following[0].map((row) => ({ topic: row.topic[0], followeeIds: row.followees[0].map((entry) => entry.id) }));
    return { command, details: actualRows.map((row) => `${TOPIC_LABELS.get(row.topic)}: ${row.followeeIds.join(", ") || "empty"}.`), securityFingerprint: canonical(actualRows) };
  };
}

const proposalTitle = (info) => info?.proposal?.[0]?.title?.[0] ?? "Untitled proposal";
export function proposalReviewDetails(info, selectedVote, managedTarget) {
  const proposal = info?.proposal?.[0];
  return [
    `Proposal ID: ${info?.id?.[0]?.id ?? "unavailable"}.`,
    `Title: ${String(proposalTitle(info)).slice(0, 256)}.`,
    `Summary: ${String(proposal?.summary ?? "").slice(0, 1_000)}.`,
    `Topic: ${info?.topic ?? "unavailable"}; proposer: ${info?.proposer?.[0]?.id ?? "unavailable"}; status: ${info?.status ?? "unavailable"}.`,
    `NNS deadline (informational): ${info?.deadline_timestamp_seconds?.[0] ?? "unavailable"}. Selected vote: ${selectedVote === 1 ? "Yes" : selectedVote === 2 ? "No" : "not selected"}.`,
    ...(managedTarget === undefined ? [] : [`Managed target: ${managedTarget}; inner command: ${variant(storedManageNeuron(info)?.command?.[0]) ?? "unavailable"}.`]),
  ];
}

export function prepareTargetVote(proposalId, vote) {
  const fixedId = parseNeuronId(String(proposalId));
  return async ({ nnsActor }) => {
    const info = (await nnsActor.get_proposal_info(fixedId))?.[0];
    const command = buildRegisterVoteCommand(info, vote);
    if (command.RegisterVote.proposal[0].id !== fixedId) throw new Error("Fresh proposal ID does not match the reviewed proposal.");
    return { command, details: proposalReviewDetails(info, vote), securityFingerprint: canonical({ proposalId: fixedId, topic: info.topic, vote }) };
  };
}

export function prepareManagerVote(proposalId, vote) {
  const fixedId = parseNeuronId(String(proposalId));
  return async ({ nnsActor, targetId, managerId }) => {
    const info = (await nnsActor.get_proposal_info(fixedId))?.[0];
    const command = validateOpenManagerProposal(info, targetId, managerId, vote);
    const target = managedNeuronId(info);
    return { command, details: proposalReviewDetails(info, vote, target), securityFingerprint: canonical({ proposalId: fixedId, topic: info.topic, target, managerId, vote, ballot: 0 }) };
  };
}

export function prepareManagerHotkey(newPrincipal, maximum = 10) {
  const fixedPrincipal = Principal.fromText(newPrincipal).toText();
  return async ({ report, targetId, managerId, principal }) => {
    const manager = report.managers.find((entry) => entry.neuron_id === managerId);
    const command = buildAddManagerHotkeyCommand(manager, targetId, fixedPrincipal, maximum);
    return { command, details: [`Add hotkey ${fixedPrincipal}; current hotkeys ${manager.hot_keys.length}/${maximum}.`, ...(principal.toText() === fixedPrincipal ? [] : ["Warning: this onboards a different finalized-origin principal than the currently authenticated Dendrite principal."])], securityFingerprint: canonical({ managerId, principal: fixedPrincipal, hotKeys: manager.hot_keys }) };
  };
}

export function prepareRewardReceiver(receiverId) {
  const fixedReceiver = parseNeuronId(String(receiverId));
  return async ({ report, nnsActor, targetId, managerId }) => {
    if (fixedReceiver === targetId) throw new Error("The target Dendrite neuron cannot be its manager's reward receiver.");
    if (fixedReceiver === managerId) throw new Error("A manager neuron cannot be its own reward receiver.");
    const manager = report.managers.find((entry) => entry.neuron_id === managerId);
    if (!manager) throw new Error("Selected manager is no longer a current target manager.");
    const receivers = await listExplicitRewardReceivers(nnsActor, [fixedReceiver]);
    const receiver = receivers.get(String(fixedReceiver));
    if (!receiver) throw new Error("The requested receiver neuron was not returned as readable to this caller.");
    if (!Array.isArray(receiver.controller) || receiver.controller.length !== 1) {
      throw new Error("Receiver controller evidence is unavailable or malformed.");
    }
    let controller;
    try { controller = principalText(receiver.controller[0]); } catch (_error) {
      throw new Error("Receiver controller evidence is unavailable or malformed.");
    }
    if (!Array.isArray(receiver.hot_keys) || receiver.hot_keys.length > 10) {
      throw new Error("Receiver hotkey evidence is unavailable or exceeds the bounded limit.");
    }
    let hotKeys;
    try {
      hotKeys = [...new Set(receiver.hot_keys.map(principalText))].sort();
    } catch (_error) {
      throw new Error("Receiver hotkey evidence is malformed.");
    }
    const command = buildRewardReceiverCommand(fixedReceiver);
    return {
      command,
      details: [
        `Receiver neuron ID: ${fixedReceiver}; receiver controller: ${controller}.`,
        `Receiver hotkeys: ${hotKeys.length ? hotKeys.join(", ") : "None"}. Readable cached stake (informational): ${receiver.cached_neuron_stake_e8s ?? "unavailable"} e8s.`,
        `This Follow operation gives receiver neuron ${fixedReceiver} sole Neuron Management followee status for manager neuron ${managerId}.`,
      ],
      securityFingerprint: canonical({ managerId, receiverId: fixedReceiver, controller, hotKeys }),
    };
  };
}

export function prepareRefreshVotingPower() {
  return async ({ report }) => {
    const target = report.target?.[0];
    const snapshot = report.checked_at_timestamp_seconds;
    const refreshed = target?.voting_power_refreshed_timestamp_seconds?.[0];
    const potential = target?.potential_voting_power?.[0];
    const deciding = target?.deciding_voting_power?.[0];
    if (!target || [snapshot, refreshed, potential, deciding].some((value) => typeof value !== "bigint" || value < 0n)) {
      throw new Error("Fresh voting-power evidence is unavailable.");
    }
    if (refreshed > snapshot) throw new Error("Target refresh timestamp is later than the NNS snapshot timestamp.");
    const age = snapshot - refreshed;
    return {
      command: buildRefreshVotingPowerCommand(),
      details: [
        `Evidence observed for this review — NNS snapshot: ${snapshot}; target refresh timestamp: ${refreshed}; refresh age: ${age} seconds; six-month threshold: 15778800 seconds.`,
        `Evidence observed for this review — potential voting power: ${potential}; deciding voting power: ${deciding}.`,
      ],
      securityFingerprint: canonical({ command: "RefreshVotingPower", refreshed }),
    };
  };
}

const variant = (value) => Object.keys(value ?? {})[0];
class GovernanceRejection extends Error {}
export const isGovernanceRejection = (error) => error instanceof GovernanceRejection;
export function decodeManageNeuronResponse(response, expected) {
  if (!Array.isArray(response?.command) || response.command.length !== 1) throw new Error("NNS response is missing a command; interface update required.");
  const command = response.command[0];
  const name = variant(command);
  if (name === "Error") {
    const error = command.Error ?? {};
    const type = Number.isInteger(error.error_type) ? error.error_type : "unknown";
    const message = String(error.error_message ?? "Governance rejected the request.").slice(0, MAX_NNS_ERROR_CHARS);
    throw new GovernanceRejection(`Governance error ${type}: ${message}`);
  }
  if (name !== expected) throw new Error(`Unexpected NNS ${name ?? "unknown"} response; interface update required.`);
  if (expected === "MakeProposal") {
    const id = command.MakeProposal?.proposal_id?.[0]?.id;
    if (typeof id !== "bigint") throw new Error("NNS proposal response omitted its proposal ID.");
    return Object.freeze({ proposalId: id });
  }
  return Object.freeze({ operation: expected });
}

const foundManager = (report, managerId, principal) => {
  const manager = report?.managers?.find((entry) => entry.neuron_id === managerId);
  if (!manager || variant(manager.evidence_status) !== "Found") throw new Error("Selected manager is not Found in fresh Dendrite evidence.");
  if (!classifyManagerAuthority(manager, principal).eligible) throw new Error("Authenticated principal no longer controls the selected manager.");
  return manager;
};

export function createTransactionPipeline({ getSession, getNnsActor, checkNeuron }) {
  let pending;
  let outcomeUnknown;
  let state = "none";
  let preparationGeneration = 0;
  const clear = () => { pending = undefined; state = "none"; };
  const beginPreparation = () => {
    if (state === "preparing") throw new Error("Another transaction review is already preparing.");
    if (state === "in-flight") throw new Error("Another transaction is already in flight; a review cannot replace it.");
    if (state === "outcome-unknown") throw new Error("A prior transaction outcome is unresolved; acknowledge it before creating a new review.");
    pending = undefined;
    preparationGeneration += 1;
    state = "preparing";
    return preparationGeneration;
  };
  const ownsPreparation = (generation) => state === "preparing" && preparationGeneration === generation;
  const requirePreparation = (generation) => {
    if (!ownsPreparation(generation)) throw new Error("Transaction review preparation was cancelled.");
  };
  const preparedAwait = async (generation, value) => {
    const result = await value;
    requirePreparation(generation);
    return result;
  };
  const failPreparation = (generation) => {
    if (ownsPreparation(generation)) clear();
  };
  const liveContext = async (targetId, managerId, generation) => {
    const session = generation === undefined ? await getSession() : await preparedAwait(generation, getSession());
    if (!session?.principal || !session?.signingIdentity || typeof session.validate !== "function") throw new Error("A current Governance-targeted session is required.");
    if (generation === undefined) await session.validate();
    else await preparedAwait(generation, session.validate());
    const report = generation === undefined ? await checkNeuron(targetId) : await preparedAwait(generation, checkNeuron(targetId));
    if (report?.neuron_id !== targetId) throw new Error("Fresh Dendrite report target does not match the request.");
    return { session, report, manager: foundManager(report, managerId, session.principal) };
  };
  const economics = async (actor, manager, generation) => {
    const request = actor.get_network_economics_parameters();
    const value = generation === undefined ? await request : await preparedAwait(generation, request);
    const fee = value?.neuron_management_fee_per_proposal_e8s;
    const stake = manager.minted_stake_e8s?.[0];
    if (typeof fee !== "bigint" || typeof stake !== "bigint") throw new Error("Current proposal fee or manager minted stake is unavailable.");
    if (stake < fee) throw new Error("Selected manager minted stake does not cover the proposal fee.");
    return { fee, stake };
  };
  const baseProposalFingerprint = (context, targetId, managerId, fee) => canonical({
    targetId, managerId, principal: context.session.principal,
    orderedManagerIds: context.report.managers.map((entry) => entry.neuron_id),
    distinctManagerCount: new Set(context.report.managers.map((entry) => entry.neuron_id.toString())).size,
    quorum: context.report.quorum_threshold,
    committedTopics: context.report.committed_topics ?? [], fee,
  });
  const runPreparation = async (prepare, context, actor, fixed, generation) => {
    const request = prepare({ report: context.report, nnsActor: actor, targetId: fixed.targetId, managerId: fixed.managerId, principal: context.session.principal });
    const prepared = generation === undefined ? await request : await preparedAwait(generation, request);
    if (!prepared?.command || Object.keys(prepared.command).length !== 1 || typeof prepared.securityFingerprint !== "string") {
      throw new Error("Operation preparation returned an invalid command or security fingerprint.");
    }
    return { command: prepared.command, details: boundedDetails(prepared.details), securityFingerprint: prepared.securityFingerprint };
  };
  return Object.freeze({
    discardUnsubmittedReview() {
      if (state === "preparing") {
        preparationGeneration += 1;
        clear();
      } else if (state === "ready") {
        clear();
      }
    },
    get state() { return state; },
    get pending() { return pending; },
    get outcomeUnknown() { return outcomeUnknown; },
    acknowledgeOutcomeUnknown({ confirmed = false } = {}) {
      if (state !== "outcome-unknown") throw new Error("There is no unresolved transaction outcome to acknowledge.");
      if (!confirmed) throw new Error("Confirm that the prior operation may have succeeded before acknowledging it.");
      outcomeUnknown = undefined;
      clear();
    },
    async reviewProposal({ targetId, managerId, innerCommand, prepare, operation, note = "", highRisk = false, details = [] }) {
      const generation = beginPreparation();
      try {
        const target = parseNeuronId(String(targetId)), manager = parseNeuronId(String(managerId));
        const context = await liveContext(target, manager, generation);
        const actor = await preparedAwait(generation, getNnsActor());
        const { fee, stake } = await economics(actor, context.manager, generation);
        const preparation = prepare ?? (async () => ({ command: innerCommand, details, securityFingerprint: canonical(innerCommand) }));
        const prepared = await runPreparation(preparation, context, actor, { targetId: target, managerId: manager }, generation);
        const request = buildManageNeuronProposal(manager, target, prepared.command, note);
        const encodedRequest = encodeManageNeuronRequest(request);
        const digest = await preparedAwait(generation, requestDigest(encodedRequest));
        requirePreparation(generation);
        pending = deepFreeze({ kind: "SubmitManageNeuronProposal",
          dendriteContextNeuronId: target, proposerManagerNeuronId: manager,
          managedNeuronId: target, confirmationNeuronId: target,
          operation, details: prepared.details, highRisk, request, encodedRequest,
          requestDigest: digest, prepare: preparation,
          securityFingerprint: `${baseProposalFingerprint(context, target, manager, fee)}|${prepared.securityFingerprint}`,
          reviewedFeeE8s: fee, mintedStakeE8s: stake,
          principal: context.session.principal.toText(),
          managerName: context.manager.known_neuron?.[0]?.name ?? "unknown",
          targetName: context.report.target?.[0]?.known_neuron?.[0]?.name ?? "unknown",
          managerCount: new Set(context.report.managers.map((entry) => entry.neuron_id.toString())).size,
          quorum: context.report.quorum_threshold?.[0] });
        state = "ready";
        return pending;
      } catch (error) {
        failPreparation(generation);
        throw error;
      }
    },
    async reviewDirect({ targetId, managerId, command, prepare, operation, highRisk = false, controllerOnly = false, revalidate, details = [] }) {
      const generation = beginPreparation();
      try {
        const target = parseNeuronId(String(targetId)), manager = parseNeuronId(String(managerId));
        const context = await liveContext(target, manager, generation);
        const authority = classifyManagerAuthority(context.manager, context.session.principal);
        if (controllerOnly && !authority.isController) throw new Error("This operation requires the manager controller.");
        const actor = await preparedAwait(generation, getNnsActor());
        const preparation = prepare ?? (async () => {
          const validated = revalidate ? await revalidate() : command;
          return { command: validated, details, securityFingerprint: canonical(validated) };
        });
        const prepared = await runPreparation(preparation, context, actor, { targetId: target, managerId: manager }, generation);
        const request = buildDirectManagerOperation(manager, prepared.command);
        const encodedRequest = encodeManageNeuronRequest(request);
        const digest = await preparedAwait(generation, requestDigest(encodedRequest));
        requirePreparation(generation);
        pending = deepFreeze({ kind: "DirectManagerOperation",
          dendriteContextNeuronId: target, mutationNeuronId: manager,
          confirmationNeuronId: manager,
          operation, details: prepared.details, highRisk, controllerOnly, request, encodedRequest,
          requestDigest: digest, prepare: preparation,
          securityFingerprint: prepared.securityFingerprint,
          principal: context.session.principal.toText(),
          managerName: context.manager.known_neuron?.[0]?.name ?? "unknown",
          targetName: context.report.target?.[0]?.known_neuron?.[0]?.name ?? "unknown" });
        state = "ready";
        return pending;
      } catch (error) {
        failPreparation(generation);
        throw error;
      }
    },
    async submit(review, { confirmed = false, typedTarget = "" } = {}) {
      if (state === "in-flight") throw new Error("Another transaction is already in flight.");
      if (!confirmed || state !== "ready" || review !== pending) throw new Error("Submit the current explicitly confirmed review.");
      if (review.highRisk && typedTarget !== review.confirmationNeuronId.toString()) throw new Error("Type the mutation target neuron ID exactly.");
      state = "in-flight";
      let reachedUpdate = false;
      try {
        let context, actor, prepared;
        try {
          const targetId = review.dendriteContextNeuronId;
          const managerId = review.kind === "SubmitManageNeuronProposal" ? review.proposerManagerNeuronId : review.mutationNeuronId;
          context = await liveContext(targetId, managerId);
          if (context.session.principal.toText() !== review.principal) throw new Error("Authenticated principal changed; create a new review.");
          const authority = classifyManagerAuthority(context.manager, context.session.principal);
          if (review.controllerOnly && !authority.isController) throw new Error("Controller authority changed; create a new review.");
          actor = await getNnsActor();
          if (encodeManageNeuronRequest(review.request) !== review.encodedRequest) throw new Error("Exact reviewed request bytes changed; create a new review.");
          prepared = await runPreparation(review.prepare, context, actor, { targetId, managerId });
          if (review.kind === "SubmitManageNeuronProposal") {
            const current = await economics(actor, context.manager);
            if (current.fee !== review.reviewedFeeE8s) throw new Error("The proposal fee changed; create a new review.");
            if (current.stake < review.reviewedFeeE8s) throw new Error("Manager stake changed; create a new review.");
            const fingerprint = `${baseProposalFingerprint(context, review.managedNeuronId, review.proposerManagerNeuronId, current.fee)}|${prepared.securityFingerprint}`;
            if (fingerprint !== review.securityFingerprint) throw new Error("Security-relevant proposal evidence changed; create a new review.");
          } else if (prepared.securityFingerprint !== review.securityFingerprint) {
            throw new Error("Security-relevant direct-operation evidence changed; create a new review.");
          }
        } catch (error) {
          clear();
          throw error;
        }
        reachedUpdate = true;
        const response = await actor.manage_neuron(review.request);
        try {
          const expected = review.kind === "SubmitManageNeuronProposal" ? "MakeProposal" : variant(review.request.command[0]);
          const result = decodeManageNeuronResponse(response, expected);
          clear();
          return result;
        } catch (error) {
          if (error instanceof GovernanceRejection) { clear(); throw error; }
          pending = undefined;
          outcomeUnknown = Object.freeze({
            operation: String(review.operation ?? "NNS transaction").slice(0, 256),
            dendriteContextNeuronId: review.dendriteContextNeuronId,
            mutationOrManagedNeuronId: review.kind === "SubmitManageNeuronProposal" ? review.managedNeuronId : review.mutationNeuronId,
            requestDigest: review.requestDigest,
            timestampMilliseconds: Date.now(),
          });
          state = "outcome-unknown";
          throw new Error(`Transaction outcome is unknown and this request cannot be resubmitted. Inspect Governance before taking another action. ${String(error?.message ?? "NNS returned an unexpected response.").slice(0, 256)}`);
        }
      } catch (error) {
        if (reachedUpdate && state === "in-flight") {
          pending = undefined;
          outcomeUnknown = Object.freeze({
            operation: String(review.operation ?? "NNS transaction").slice(0, 256),
            dendriteContextNeuronId: review.dendriteContextNeuronId,
            mutationOrManagedNeuronId: review.kind === "SubmitManageNeuronProposal" ? review.managedNeuronId : review.mutationNeuronId,
            requestDigest: review.requestDigest,
            timestampMilliseconds: Date.now(),
          });
          state = "outcome-unknown";
          throw new Error(`Transaction outcome is unknown and this request cannot be resubmitted. Inspect Governance before taking another action. ${String(error?.message ?? "The network call did not return.").slice(0, 256)}`);
        }
        throw error;
      } finally {
        if (state === "in-flight") clear();
      }
    },
  });
}

export function principalText(value) { return Principal.fromText(value.toText()).toText(); }
