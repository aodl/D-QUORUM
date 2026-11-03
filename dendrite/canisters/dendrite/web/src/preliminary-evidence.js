export const ALPHA_VOTE_NEURON_ID = 2_947_465_672_511_369n;
export const OMEGA_VOTE_NEURON_ID = 18_363_645_821_499_695_760n;
export const OMEGA_REJECT_NEURON_ID = 18_422_777_432_977_120_264n;
export const SOURCE_REVISION = "d55a0f4d4edfabe49d8fd543aff473084cb741f2";
export const RECOGNISED_TOPICS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18]);
export const MAX_DEPENDENCY_NEURONS = 64 * 15;
export const MAX_METADATA_TIMESTAMP_SKEW_SECONDS = 300n;
export const MAX_METADATA_CONCURRENCY = 8;

const LIMITS = Object.freeze({
  requested: 50,
  returned: 50,
  hotKeys: 10,
  followingEntries: 64,
  followees: 15,
  committedTopics: 64,
  knownNameBytes: 200,
  knownDescriptionBytes: 3_000,
  knownLinks: 10,
  knownLinkBytes: 100,
  sourceFailures: 32,
});
const encoder = new TextEncoder();
const opt = (value) => Array.isArray(value) && value.length === 1 ? value[0] : undefined;
const idKey = (value) => BigInt(value).toString();

export class PreliminaryEvidenceError extends Error {
  constructor(kind, message, affectedNeuronIds = []) {
    super(String(message).slice(0, 512));
    this.name = "PreliminaryEvidenceError";
    this.kind = kind;
    this.affectedNeuronIds = affectedNeuronIds.slice(0, LIMITS.requested);
  }
}

const SOURCE_FAILURE_KINDS = new Set(["Rejected", "DecodeFailed", "InvalidResponse", "ResponseTooLarge"]);

function classifySourceFailure(error, affectedNeuronIds) {
  if (error instanceof PreliminaryEvidenceError) return new PreliminaryEvidenceError(
    SOURCE_FAILURE_KINDS.has(error.kind) ? error.kind : "Rejected",
    error.message,
    error.affectedNeuronIds.length ? error.affectedNeuronIds : affectedNeuronIds,
  );
  const message = String(error?.message ?? "Governance query failed").slice(0, 512);
  const kind = error?.kind === "DecodeFailed" || /\b(?:decode|decoding|candid)\b/i.test(message)
    ? "DecodeFailed"
    : error?.kind === "InvalidResponse" || /\b(?:invalid|malformed|unexpected|contradictory)\b.*\bresponse\b|\bresponse\b.*\b(?:invalid|malformed|unexpected|contradictory)\b/i.test(message)
      ? "InvalidResponse"
      : error?.kind === "ResponseTooLarge" || /\b(?:oversized|too large|response size)\b|\bresponse\b.*\b(?:exceeds?|exceeded)\b.*\bbound\b/i.test(message)
        ? "ResponseTooLarge"
        : "Rejected";
  return new PreliminaryEvidenceError(kind, message, affectedNeuronIds);
}

export function listNeuronsRequest(ids) {
  const requested = ids.map(BigInt);
  if (requested.length === 0 || requested.length > LIMITS.requested || requested.some((id) => id === 0n)) {
    throw new PreliminaryEvidenceError("InvalidRequest", "list_neurons request must contain one to fifty non-zero IDs", requested);
  }
  return {
    neuron_ids: requested,
    include_neurons_readable_by_caller: false,
    include_empty_neurons_readable_by_caller: [false],
    include_public_neurons_in_full_neurons: [true],
    page_number: [0n],
    page_size: [50n],
    neuron_subaccounts: [],
  };
}

function boundedUtf8(value, maximum, label) {
  if (typeof value !== "string" || encoder.encode(value).length > maximum) {
    throw new PreliminaryEvidenceError("InvalidResponse", `${label} exceeds its pinned byte bound`);
  }
  return value;
}

function normalizeKnownData(value, id, _interpretCommittedTopics) {
  const data = opt(value);
  if (!data) return { knownData: undefined, committedTopics: [], unknownCommittedTopics: 0 };
  const name = boundedUtf8(data.name, LIMITS.knownNameBytes, "known-neuron name");
  const description = opt(data.description);
  if (description !== undefined) boundedUtf8(description, LIMITS.knownDescriptionBytes, "known-neuron description");
  const links = opt(data.links) ?? [];
  if (links.length > LIMITS.knownLinks) throw new PreliminaryEvidenceError("InvalidResponse", "known-neuron links exceed their pinned bound");
  for (const link of links) boundedUtf8(link, LIMITS.knownLinkBytes, "known-neuron link");
  const rawTopics = opt(data.committed_topics) ?? [];
  if (rawTopics.length > LIMITS.committedTopics) throw new PreliminaryEvidenceError("InvalidResponse", "committed topics exceed their pinned bound");
  return {
    knownData: { id, name, description, links: [...links] },
    committedTopics: [],
    unknownCommittedTopics: 0,
  };
}

function normalizeNeuron(raw) {
  const id = BigInt(opt(raw?.id)?.id ?? 0);
  if (id === 0n) throw new PreliminaryEvidenceError("InvalidResponse", "full neuron has a missing or zero ID");
  if (!Array.isArray(raw.hot_keys) || raw.hot_keys.length > LIMITS.hotKeys) {
    throw new PreliminaryEvidenceError("InvalidResponse", "neuron hotkeys exceed their pinned bound", [id]);
  }
  if (!Array.isArray(raw.followees) || raw.followees.length > LIMITS.followingEntries) {
    throw new PreliminaryEvidenceError("InvalidResponse", "following map exceeds its pinned bound", [id]);
  }
  const followees = new Map();
  for (const entry of raw.followees) {
    if (!Array.isArray(entry) || entry.length !== 2 || !Number.isInteger(entry[0])) {
      throw new PreliminaryEvidenceError("InvalidResponse", "following map entry has an invalid topic key", [id]);
    }
    if (followees.has(entry[0])) throw new PreliminaryEvidenceError("InvalidResponse", "neuron contains duplicate following-topic keys", [id]);
    const values = entry[1]?.followees;
    if (!Array.isArray(values) || values.length > LIMITS.followees) {
      throw new PreliminaryEvidenceError("InvalidResponse", "followee vector exceeds its pinned bound", [id]);
    }
    followees.set(entry[0], values.map((value) => BigInt(value.id)));
  }
  const cached = BigInt(raw.cached_neuron_stake_e8s);
  const fees = BigInt(raw.neuron_fees_e8s);
  if (fees > cached) throw new PreliminaryEvidenceError("InvalidResponse", "neuron stake arithmetic is contradictory", [id]);
  const mintedStakeE8s = cached - fees;
  const maturity = BigInt(opt(raw.staked_maturity_e8s_equivalent) ?? 0n);
  const maximum = (1n << 64n) - 1n;
  if (mintedStakeE8s + maturity > maximum) throw new PreliminaryEvidenceError("InvalidResponse", "neuron stake arithmetic is contradictory", [id]);
  const dissolve = opt(raw.dissolve_state);
  const dissolveName = dissolve ? Object.keys(dissolve)[0] : undefined;
  const refreshed = opt(raw.voting_power_refreshed_timestamp_seconds);
  return {
    id,
    controller: opt(raw.controller),
    // list_neurons deliberately omits known_neuron_data. It is never evidence
    // for known-neuron status; get_neuron_info is merged later.
    knownData: undefined,
    hotKeys: [...raw.hot_keys],
    notForProfit: Boolean(raw.not_for_profit),
    dissolveDelaySeconds: dissolveName === "DissolveDelaySeconds" ? BigInt(dissolve.DissolveDelaySeconds) : undefined,
    dissolving: dissolveName === "WhenDissolvedTimestampSeconds" ? true : dissolveName === "DissolveDelaySeconds" ? false : undefined,
    effectiveStakeE8s: mintedStakeE8s + maturity,
    mintedStakeE8s,
    votingPowerRefreshedTimestampSeconds: refreshed === undefined ? undefined : BigInt(refreshed),
    potentialVotingPower: opt(raw.potential_voting_power) === undefined ? undefined : BigInt(opt(raw.potential_voting_power)),
    decidingVotingPower: opt(raw.deciding_voting_power) === undefined ? undefined : BigInt(opt(raw.deciding_voting_power)),
    committedTopics: [],
    followees,
    unknownCommittedTopics: 0,
  };
}

export function validateListNeuronsBatch(requestedIds, response, { target = false } = {}) {
  const requested = requestedIds.map(BigInt);
  listNeuronsRequest(requested);
  const expected = new Set(requested.map(idKey));
  if (!response || !Array.isArray(response.full_neurons) || !Array.isArray(response.neuron_infos)) {
    throw new PreliminaryEvidenceError("InvalidResponse", "list_neurons response collections are missing", requested);
  }
  if (response.full_neurons.length > LIMITS.returned || response.neuron_infos.length > LIMITS.returned) {
    throw new PreliminaryEvidenceError("ResponseTooLarge", "list_neurons response exceeds its pinned collection bound", requested);
  }
  if (BigInt(opt(response.total_pages_available) ?? -1) !== 1n) {
    throw new PreliminaryEvidenceError("InvalidResponse", "list_neurons response has an invalid page count", requested);
  }
  const infos = new Map();
  for (const entry of response.neuron_infos) {
    if (!Array.isArray(entry) || entry.length !== 2) throw new PreliminaryEvidenceError("InvalidResponse", "neuron-info entry is malformed", requested);
    const id = BigInt(entry[0]), key = idKey(id);
    if (id === 0n || !expected.has(key)) throw new PreliminaryEvidenceError("InvalidResponse", "response contains an unexpected neuron-info ID", requested);
    if (infos.has(key)) throw new PreliminaryEvidenceError("InvalidResponse", "response contains duplicate neuron-info IDs", requested);
    infos.set(key, { retrievedAtTimestampSeconds: BigInt(entry[1].retrieved_at_timestamp_seconds) });
  }
  const neurons = new Map();
  let unknownCommittedTopics = 0;
  for (const raw of response.full_neurons) {
    const neuron = normalizeNeuron(raw);
    const key = idKey(neuron.id);
    if (!expected.has(key)) throw new PreliminaryEvidenceError("InvalidResponse", "response contains an unexpected full-neuron ID", requested);
    if (neurons.has(key)) throw new PreliminaryEvidenceError("InvalidResponse", "response contains duplicate full-neuron IDs", requested);
    neurons.set(key, neuron);
    unknownCommittedTopics += neuron.unknownCommittedTopics;
  }
  if (target) {
    const id = idKey(requested[0]);
    if (neurons.has(id)) {
      const retrieved = infos.get(id)?.retrievedAtTimestampSeconds ?? 0n;
      if (retrieved === 0n) throw new PreliminaryEvidenceError("InvalidResponse", "target NNS snapshot timestamp is unavailable", requested);
      const refreshed = neurons.get(id).votingPowerRefreshedTimestampSeconds;
      if (refreshed !== undefined && refreshed > retrieved) {
        throw new PreliminaryEvidenceError("InvalidResponse", "target voting-power refresh timestamp is later than its NNS snapshot", requested);
      }
    }
  }
  return { neurons, infos, unknownCommittedTopics };
}

function validateKnownMetadata(id, result, listTimestamp) {
  if (!result || typeof result !== "object") {
    throw new PreliminaryEvidenceError("InvalidResponse", "get_neuron_info returned a malformed result", [id]);
  }
  if ("Err" in result) {
    const message = boundedUtf8(result.Err?.error_message ?? "", 512, "Governance error message");
    throw new PreliminaryEvidenceError("Rejected", `get_neuron_info returned Governance error: ${message}`, [id]);
  }
  if (!("Ok" in result)) {
    throw new PreliminaryEvidenceError("InvalidResponse", "get_neuron_info returned an unknown result variant", [id]);
  }
  const info = result.Ok;
  const retrieved = BigInt(info?.retrieved_at_timestamp_seconds ?? 0);
  if (retrieved === 0n || listTimestamp === 0n) {
    throw new PreliminaryEvidenceError("InvalidResponse", "Governance retrieval timestamp is zero", [id]);
  }
  const responseId = BigInt(opt(info.id)?.id ?? 0);
  if (responseId !== id) {
    throw new PreliminaryEvidenceError("InvalidResponse", "get_neuron_info returned a mismatched neuron ID", [id]);
  }
  const skew = retrieved > listTimestamp ? retrieved - listTimestamp : listTimestamp - retrieved;
  if (skew > MAX_METADATA_TIMESTAMP_SKEW_SECONDS) {
    throw new PreliminaryEvidenceError("InvalidResponse", "Governance query timestamps exceed the permitted 300-second skew", [id]);
  }
  const known = normalizeKnownData(info.known_neuron_data, id, true);
  return known.knownData
    ? { kind: "Found", data: known.knownData, committedTopics: known.committedTopics,
      unknownCommittedTopics: known.unknownCommittedTopics, retrievedAtTimestampSeconds: retrieved }
    : { kind: "ConfirmedAbsent", retrievedAtTimestampSeconds: retrieved };
}

export function createNeuronLoader({ listNeurons, getNeuronInfo }) {
  const cache = new Map();
  const metadataCache = new Map();
  async function loadMetadata(id, timestamp) {
    const key = idKey(id);
    if (!metadataCache.has(key)) {
      const pending = Promise.resolve().then(() => getNeuronInfo(BigInt(id)))
        .then((result) => validateKnownMetadata(BigInt(id), result, BigInt(timestamp)))
        .catch((error) => {
          metadataCache.delete(key);
          throw classifySourceFailure(error, [BigInt(id)]);
        });
      metadataCache.set(key, pending);
    }
    return metadataCache.get(key);
  }
  async function fetchBatch(ids, target = false) {
    const requested = [...new Map(ids.map((id) => [idKey(id), BigInt(id)])).values()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const response = await listNeurons(listNeuronsRequest(requested));
    return validateListNeuronsBatch(requested, response, { target });
  }
  async function loadTarget(id) {
    const key = idKey(id);
    if (!cache.has(key)) {
      const pending = fetchBatch([BigInt(id)], true).then(async (batch) => {
        let lookup = batch.neurons.has(key) ? { kind: "Found", neuron: batch.neurons.get(key) } : { kind: "ConfirmedMissing" };
        const listTimestamp = batch.infos.get(key)?.retrievedAtTimestampSeconds ?? 0n;
        let metadataFailure;
        if (lookup.kind === "Found") {
          try {
            const metadata = await loadMetadata(BigInt(id), listTimestamp);
            lookup.neuron.knownMetadataEvidence = metadata;
            if (metadata.kind === "Found") {
              lookup.neuron.knownData = metadata.data;
              lookup.neuron.committedTopics = metadata.committedTopics;
              lookup.neuron.unknownCommittedTopics = metadata.unknownCommittedTopics;
            }
          } catch (error) {
            metadataFailure = classifySourceFailure(error, [BigInt(id)]);
            lookup.neuron.knownMetadataEvidence = { kind: "Unavailable", failure: metadataFailure };
          }
        }
        cache.set(key, Promise.resolve(lookup));
        return { lookup, retrievedAtTimestampSeconds: listTimestamp,
          unknownCommittedTopics: lookup.kind === "Found" ? lookup.neuron.unknownCommittedTopics : 0,
          metadataFailure };
      }).catch((error) => { cache.delete(key); throw error; });
      const cachedLookup = pending.then((result) => result.lookup);
      cachedLookup.catch(() => {});
      cache.set(key, cachedLookup);
      return pending;
    }
    return { lookup: await cache.get(key), retrievedAtTimestampSeconds: 0n, unknownCommittedTopics: 0 };
  }
  async function loadDependencies(ids) {
    const unique = [...new Map(ids.map((id) => [idKey(id), BigInt(id)])).values()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const missing = unique.filter((id) => !cache.has(idKey(id)));
    const sourceFailures = [];
    for (let offset = 0; offset < missing.length; offset += LIMITS.requested) {
      const batchIds = missing.slice(offset, offset + LIMITS.requested);
      const pending = fetchBatch(batchIds, false);
      for (const id of batchIds) {
        const key = idKey(id);
        const entry = pending.then(
          (batch) => batch.neurons.has(key) ? { kind: "Found", neuron: batch.neurons.get(key) } : { kind: "ConfirmedMissing" },
          () => ({ kind: "Unavailable" }),
        );
        cache.set(key, entry);
      }
      try {
        const validated = await pending;
        const found = batchIds.filter((id) => validated.neurons.has(idKey(id)));
        for (let index = 0; index < found.length; index += MAX_METADATA_CONCURRENCY) {
          await Promise.all(found.slice(index, index + MAX_METADATA_CONCURRENCY).map(async (id) => {
            const key = idKey(id), neuron = validated.neurons.get(key);
            try {
              const metadata = await loadMetadata(id, validated.infos.get(key)?.retrievedAtTimestampSeconds ?? 0n);
              neuron.knownMetadataEvidence = metadata;
              if (metadata.kind === "Found") neuron.knownData = metadata.data;
            } catch (error) {
              const failure = classifySourceFailure(error, [id]);
              neuron.knownMetadataEvidence = { kind: "Unavailable", failure };
              if (sourceFailures.length < LIMITS.sourceFailures) sourceFailures.push({
                method: "get_neuron_info", kind: failure.kind, message: failure.message,
                affectedNeuronIds: [id],
              });
            }
          }));
        }
      } catch (error) {
        const failure = classifySourceFailure(error, batchIds);
        if (sourceFailures.length < LIMITS.sourceFailures) sourceFailures.push({
          method: "list_neurons",
          kind: failure.kind,
          message: failure.message,
          affectedNeuronIds: failure.affectedNeuronIds.slice(0, LIMITS.requested),
        });
      }
    }
    const result = new Map();
    for (const id of unique) {
      const key = idKey(id);
      try {
        const entry = await cache.get(key);
        result.set(key, entry);
        if (entry?.kind === "Unavailable") cache.delete(key);
      } catch {
        cache.delete(key);
        result.set(key, { kind: "Unavailable" });
      }
    }
    Object.defineProperty(result, "sourceFailures", {
      value: Object.freeze(sourceFailures),
      enumerable: false,
    });
    return result;
  }
  return Object.freeze({
    loadTarget,
    loadDependencies,
    clear: () => { cache.clear(); metadataCache.clear(); },
    cache,
    metadataCache,
  });
}

export function deriveDependencyIds(target) {
  const ids = [];
  for (const followees of target.followees.values()) ids.push(...followees);
  const unique = [...new Map(ids.map((id) => [idKey(id), id])).values()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (unique.length > MAX_DEPENDENCY_NEURONS) {
    throw new PreliminaryEvidenceError("InvalidResponse", "dependency graph exceeds the pinned hard bound", unique);
  }
  return unique;
}

export async function collectPreliminaryEvidence(neuronId, loader, controllerReader) {
  const targetId = BigInt(neuronId);
  try {
    const target = await loader.loadTarget(targetId);
    const targetSourceFailures = target.metadataFailure ? [{
      method: "get_neuron_info",
      kind: target.metadataFailure.kind,
      message: target.metadataFailure.message,
      affectedNeuronIds: [targetId],
    }] : [];
    if (target.lookup.kind !== "Found") return {
      nowSeconds: target.retrievedAtTimestampSeconds,
      target: target.lookup,
      dependencies: new Map(),
      controller: undefined,
      sourceFailures: targetSourceFailures,
      unknownCommittedTopics: target.unknownCommittedTopics,
      controllerProvenance: { kind: "unavailable", reason: "Target controller was unavailable." },
    };
    let controller;
    let controllerProvenance;
    const targetController = target.lookup.neuron.controller;
    if (targetController !== undefined && controllerReader) {
      try {
        controller = await controllerReader.read(targetController);
        controllerProvenance = {
          kind: "certified-system-state",
          canisterId: targetController.toText(),
          certificateTime: controller.certificateTime,
        };
      } catch (error) {
        controllerProvenance = {
          kind: "unavailable",
          reason: String(error?.message ?? "Certified controller state was unavailable.").slice(0, 512),
        };
      }
    } else {
      controllerProvenance = {
        kind: "unavailable",
        reason: targetController === undefined
          ? "The Governance response did not contain a target controller."
          : "The certified controller-state reader was unavailable.",
      };
    }
    const dependencies = await loader.loadDependencies(deriveDependencyIds(target.lookup.neuron));
    return {
      nowSeconds: target.retrievedAtTimestampSeconds,
      target: target.lookup,
      dependencies,
      controller,
      sourceFailures: [...targetSourceFailures, ...(dependencies.sourceFailures ?? [])].slice(0, LIMITS.sourceFailures),
      unknownCommittedTopics: target.unknownCommittedTopics,
      controllerProvenance,
    };
  } catch (error) {
    const failure = classifySourceFailure(error, [targetId]);
    return {
      nowSeconds: 0n,
      target: { kind: "Unavailable" },
      dependencies: new Map(),
      controller: undefined,
      sourceFailures: [{
        method: "list_neurons",
        kind: failure.kind,
        message: failure.message,
        affectedNeuronIds: [targetId],
      }],
      unknownCommittedTopics: 0,
      controllerProvenance: { kind: "unavailable", reason: "Target Governance evidence was unavailable." },
    };
  }
}
