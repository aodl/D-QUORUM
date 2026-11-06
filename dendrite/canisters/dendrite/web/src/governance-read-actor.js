import { Actor, AnonymousIdentity, HttpAgent } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory } from "../../../../src/declarations/nns-governance-read/nns-governance-read.did.js";

export const NNS_GOVERNANCE_CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai";

const configuredApiHost = () =>
  typeof __DENDRITE_API_HOST__ === "string"
    ? __DENDRITE_API_HOST__
    : globalThis.__DENDRITE_API_HOST__;
const configuredRootKeyPolicy = () =>
  typeof __DENDRITE_FETCH_ROOT_KEY__ === "boolean"
    ? __DENDRITE_FETCH_ROOT_KEY__
    : globalThis.__DENDRITE_FETCH_ROOT_KEY__;

export function governanceReadConfiguration(options = {}) {
  const host = options.host ?? configuredApiHost();
  const shouldFetchRootKey = options.fetchRootKey ?? configuredRootKeyPolicy();
  if (typeof host !== "string") throw new TypeError("IC API host is not configured.");
  if (typeof shouldFetchRootKey !== "boolean") throw new TypeError("Root-key policy is not configured.");
  if (host === "https://icp-api.io" && shouldFetchRootKey) {
    throw new TypeError("Production Governance reads must not fetch a root key.");
  }
  return Object.freeze({
    host,
    shouldFetchRootKey,
    verifyQuerySignatures: true,
    canisterId: NNS_GOVERNANCE_CANISTER_ID,
  });
}

export async function createAnonymousGovernanceReadActor(options = {}) {
  const createAgent = options.createAgent ?? ((agentOptions) => HttpAgent.create(agentOptions));
  const createActor = options.createActor ?? ((factory, config) => Actor.createActor(factory, config));
  const configuration = governanceReadConfiguration(options);
  const identity = new AnonymousIdentity();
  const agent = await createAgent({
    host: configuration.host,
    identity,
    shouldFetchRootKey: configuration.shouldFetchRootKey,
    verifyQuerySignatures: configuration.verifyQuerySignatures,
  });
  const actor = createActor(idlFactory, {
    agent,
    canisterId: Principal.fromText(configuration.canisterId),
  });
  return Object.freeze({
    list_neurons: (request) => actor.list_neurons(request),
    get_neuron_info: (neuronId) => actor.get_neuron_info(neuronId),
  });
}
