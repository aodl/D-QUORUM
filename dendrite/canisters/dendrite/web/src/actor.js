import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory } from "../../../../src/declarations/dendrite/dendrite.did.js";

const configuredCanisterId = () => typeof __DENDRITE_CANISTER_ID__ === "string" ? __DENDRITE_CANISTER_ID__ : globalThis.__DENDRITE_CANISTER_ID__;
const configuredApiHost = () => typeof __DENDRITE_API_HOST__ === "string" ? __DENDRITE_API_HOST__ : globalThis.__DENDRITE_API_HOST__;
const configuredRootKeyPolicy = () => typeof __DENDRITE_FETCH_ROOT_KEY__ === "boolean" ? __DENDRITE_FETCH_ROOT_KEY__ : globalThis.__DENDRITE_FETCH_ROOT_KEY__;

export function validatedCanisterId(value = configuredCanisterId()) {
  if (typeof value !== "string") throw new TypeError("Dendrite canister ID is not configured.");
  Principal.fromText(value);
  return value;
}

export function runtimeConfiguration(options = {}) {
  const host = options.host ?? configuredApiHost();
  const shouldFetchRootKey = options.fetchRootKey ?? configuredRootKeyPolicy();
  if (typeof host !== "string") throw new TypeError("IC API host is not configured.");
  if (typeof shouldFetchRootKey !== "boolean") throw new TypeError("Root-key policy is not configured.");
  return { canisterId: validatedCanisterId(options.canisterId), host, shouldFetchRootKey };
}

export async function createAnonymousActor(options = {}) {
  const createAgent = options.createAgent ?? ((agentOptions) => HttpAgent.create(agentOptions));
  const createActor = options.createActor ?? ((factory, config) => Actor.createActor(factory, config));
  const configuration = runtimeConfiguration(options);
  const agent = await createAgent({
    host: configuration.host,
    shouldFetchRootKey: configuration.shouldFetchRootKey,
    ...(options.agentOptions ?? {}),
  });
  return createActor(idlFactory, {
    agent,
    canisterId: configuration.canisterId,
  });
}
