import { AuthClient } from "@icp-sdk/auth/client";
import { Principal } from "@icp-sdk/core/principal";

export const AUTHENTICATION_DELEGATION_TTL_NS = 28_800_000_000_000n;
export const NNS_GOVERNANCE_CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const NNS_GOVERNANCE_PRINCIPAL = Principal.fromText(NNS_GOVERNANCE_CANISTER_ID);

const configured = (name, fallback) => typeof fallback !== "undefined" ? fallback : globalThis[name];

export function identityConfiguration(options = {}) {
  const derivationOrigin = options.derivationOrigin ?? configured("__DENDRITE_DERIVATION_ORIGIN__", typeof __DENDRITE_DERIVATION_ORIGIN__ === "string" ? __DENDRITE_DERIVATION_ORIGIN__ : undefined);
  const alternativeOrigins = options.alternativeOrigins ?? configured("__DENDRITE_ALTERNATIVE_ORIGINS__", typeof __DENDRITE_ALTERNATIVE_ORIGINS__ !== "undefined" ? __DENDRITE_ALTERNATIVE_ORIGINS__ : undefined);
  const identityProvider = options.identityProvider ?? configured("__DENDRITE_IDENTITY_PROVIDER__", typeof __DENDRITE_IDENTITY_PROVIDER__ === "string" ? __DENDRITE_IDENTITY_PROVIDER__ : undefined);
  if (typeof derivationOrigin !== "string" || !Array.isArray(alternativeOrigins) || typeof identityProvider !== "string") {
    throw new TypeError("Internet Identity build configuration is unavailable.");
  }
  return { derivationOrigin, alternativeOrigins: [...alternativeOrigins], identityProvider };
}

export function authenticationOrigin(currentOrigin, configuration) {
  if (currentOrigin === configuration.derivationOrigin) return undefined;
  if (configuration.alternativeOrigins.includes(currentOrigin)) return configuration.derivationOrigin;
  throw new Error(`Login is disabled: ${currentOrigin} is not the configured Dendrite origin.`);
}

function exactPrincipal(identity) {
  const value = identity?.getPrincipal?.();
  const text = value?.toText?.();
  if (typeof text !== "string") throw new Error("Internet Identity returned a malformed identity.");
  const principal = Principal.fromText(text);
  if (principal.compareTo(Principal.anonymous()) === "eq") {
    throw new Error("Internet Identity returned an anonymous identity.");
  }
  return principal;
}

const samePrincipal = (left, right) => left.compareTo(right) === "eq";

export function validateGovernanceDelegation(identity, nowNanoseconds = BigInt(Date.now()) * 1_000_000n) {
  const chain = identity?.getDelegation?.();
  if (!chain || !Array.isArray(chain.delegations) || chain.delegations.length === 0) {
    throw new Error("Internet Identity delegation chain cannot be inspected safely.");
  }
  for (const signedDelegation of chain.delegations) {
    const delegation = signedDelegation?.delegation;
    if (typeof delegation?.expiration !== "bigint" || delegation.expiration <= nowNanoseconds) {
      throw new Error("Internet Identity delegation is expired or malformed.");
    }
    if (!Array.isArray(delegation.targets) || delegation.targets.length === 0) {
      throw new Error("Unrestricted Internet Identity sessions cannot authorize NNS transactions.");
    }
    if (delegation.targets.some((target) => !samePrincipal(target, NNS_GOVERNANCE_PRINCIPAL))) {
      throw new Error("Internet Identity delegation is not restricted to NNS Governance.");
    }
  }
  const principal = exactPrincipal(identity);
  return Object.freeze({
    principal,
    signingIdentity: identity,
    validate() {
      validateGovernanceDelegation(identity);
      return true;
    },
  });
}

export function createBrowserAuthSession(options = {}) {
  const configuration = identityConfiguration(options);
  const currentOrigin = options.currentOrigin ?? globalThis.location?.origin;
  let originError;
  let derivationOrigin;
  try { derivationOrigin = authenticationOrigin(currentOrigin, configuration); } catch (error) { originError = error; }
  const AuthClientClass = options.AuthClientClass ?? AuthClient;
  let client;
  const getClient = () => {
    if (originError) throw originError;
    if (!client) client = new AuthClientClass({
      identityProvider: configuration.identityProvider,
      ...(derivationOrigin ? { derivationOrigin } : {}),
    });
    return client;
  };
  return {
    configuration,
    originError,
    async restore() {
      const authClient = getClient();
      if (!authClient.isAuthenticated()) return null;
      try {
        return validateGovernanceDelegation(await authClient.getIdentity());
      } catch (error) {
        await authClient.signOut();
        throw error;
      }
    },
    async signIn() {
      const authClient = getClient();
      try {
        return validateGovernanceDelegation(await authClient.signIn({
          maxTimeToLive: AUTHENTICATION_DELEGATION_TTL_NS,
          targets: [NNS_GOVERNANCE_PRINCIPAL],
        }));
      } catch (error) {
        await authClient.signOut();
        throw error;
      }
    },
    async signOut() {
      if (client) await client.signOut();
    },
  };
}
