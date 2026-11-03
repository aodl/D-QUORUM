import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory } from "../../../../src/declarations/nns-governance/nns-governance.did.js";
import { NNS_GOVERNANCE_CANISTER_ID } from "./auth.js";
import { runtimeConfiguration } from "./actor.js";

export async function createAuthenticatedNnsActor(signingIdentity, options = {}) {
  if (!signingIdentity?.getPrincipal) throw new TypeError("A validated signing identity is required.");
  const createAgent = options.createAgent ?? ((agentOptions) => HttpAgent.create(agentOptions));
  const createActor = options.createActor ?? ((factory, config) => Actor.createActor(factory, config));
  const configuration = runtimeConfiguration(options);
  const agent = await createAgent({
    host: configuration.host,
    shouldFetchRootKey: configuration.shouldFetchRootKey,
    identity: signingIdentity,
  });
  return createActor(idlFactory, {
    agent,
    canisterId: Principal.fromText(NNS_GOVERNANCE_CANISTER_ID),
  });
}
