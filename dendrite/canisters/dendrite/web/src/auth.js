import { AuthClient, IdleManager } from "@icp-sdk/auth/client";
import { DelegationChain, DelegationIdentity, ECDSAKeyIdentity } from "@icp-sdk/core/identity";
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

// Structural checks complement SDK signatures and replica verification; they do not
// authenticate the signatures themselves. Unknown delegation restrictions fail closed.
function inspectChain(identity, now, maximum = 20) {
  const chain = identity?.getDelegation?.();
  const bytes = (value, bound) => value instanceof Uint8Array && value.length > 0 && value.length <= bound;
  if (!chain || !Array.isArray(chain.delegations) || !chain.delegations.length || chain.delegations.length > maximum || !bytes(chain.publicKey, 4096)) {
    throw new Error("Internet Identity delegation chain cannot be inspected safely.");
  }
  const principal = exactPrincipal(identity);
  if (!samePrincipal(principal, Principal.selfAuthenticating(chain.publicKey))) throw new Error("Delegation root does not match the application principal.");
  let expiration = now + AUTHENTICATION_DELEGATION_TTL_NS;
  for (const signed of chain.delegations) {
    const link = signed?.delegation;
    if (!link || Object.keys(link).some((key) => !["pubkey", "expiration", "targets"].includes(key)) || !bytes(link.pubkey, 4096) || !bytes(signed.signature, 65536)) {
      throw new Error("Internet Identity delegation contains malformed or unsupported restrictions.");
    }
    if (typeof link.expiration !== "bigint" || link.expiration <= now || link.expiration > (1n << 64n) - 1n) throw new Error("Internet Identity delegation is expired or malformed.");
    if (link.targets !== undefined) {
      if (!Array.isArray(link.targets) || !link.targets.length || link.targets.length > 1000 || !link.targets.every((target) => target instanceof Principal) || !link.targets.some((target) => samePrincipal(target, NNS_GOVERNANCE_PRINCIPAL))) {
        throw new Error("Internet Identity ancestor delegation does not permit NNS Governance.");
      }
    }
    if (link.expiration < expiration) expiration = link.expiration;
  }
  return { chain, principal, expiration };
}

export function validateGovernanceDelegation(identity, nowNanoseconds = BigInt(Date.now()) * 1_000_000n) {
  const { chain, principal } = inspectChain(identity, nowNanoseconds);
  const leaf = chain.delegations.at(-1).delegation;
  if (chain.delegations.some(({ delegation }) => delegation.expiration < leaf.expiration)) throw new Error("Governance child outlives an ancestor delegation.");
  const targets = leaf.targets;
  if (!Array.isArray(targets) || targets.length !== 1 || !samePrincipal(targets[0], NNS_GOVERNANCE_PRINCIPAL)) {
    throw new Error("Unrestricted Internet Identity sessions cannot authorize NNS transactions.");
  }
  return Object.freeze({ principal, signingIdentity: identity, validate() { validateGovernanceDelegation(identity); return true; } });
}

export async function deriveGovernanceSession(bootstrap, bootstrapPublicKey) {
  const now = BigInt(Date.now()) * 1_000_000n;
  const { chain, principal, expiration } = inspectChain(bootstrap, now, 19);
  const leaf = chain.delegations.at(-1).delegation.pubkey;
  if (!(bootstrapPublicKey instanceof Uint8Array) || leaf.length !== bootstrapPublicKey.length || !leaf.every((byte, index) => byte === bootstrapPublicKey[index])) {
    throw new Error("Internet Identity delegation does not bind the requested bootstrap key.");
  }
  const transactionKey = await ECDSAKeyIdentity.generate({ extractable: false });
  // SDK Date precision is milliseconds: round DOWN so no parent is outlived.
  const restricted = await DelegationChain.create(bootstrap, transactionKey.getPublicKey(), new Date(Number(expiration / 1_000_000n)), { previous: chain, targets: [NNS_GOVERNANCE_PRINCIPAL] });
  const identity = DelegationIdentity.fromDelegation(transactionKey, restricted);
  if (!samePrincipal(exactPrincipal(identity), principal)) throw new Error("Scoped identity changed the application principal.");
  return validateGovernanceDelegation(identity);
}

export function createBrowserAuthSession(options = {}) {
  const configuration = identityConfiguration(options);
  const currentOrigin = options.currentOrigin ?? globalThis.location?.origin;
  let originError;
  let derivationOrigin;
  try { derivationOrigin = authenticationOrigin(currentOrigin, configuration); } catch (error) { originError = error; }
  const AuthClientClass = options.AuthClientClass ?? AuthClient;
  let client, current, busy = false, generation = 0, idle;
  const signOut = async () => {
    generation++;
    current = undefined;
    const previousIdle = idle; idle = undefined;
    previousIdle?.exit();
    if (client) await client.signOut();
  };
  return {
    configuration, originError,
    async restore() {
      if (originError) throw originError;
      // Reload intentionally requires II again: never restore broader credentials.
      current?.validate();
      return current ?? null;
    },
    async signIn() {
      if (originError) throw originError;
      if (busy) throw new Error("Authentication is already in progress.");
      busy = true;
      const token = ++generation;
      let authClient, session;
      try {
        const bootstrapKey = await ECDSAKeyIdentity.generate({ extractable: false });
        if (token !== generation) throw new Error("Authentication cancelled.");
        // Supplying the identity bypasses AuthClient's legacy localStorage migration.
        // Discard credential writes; AuthClient still writes a non-secret expiry
        // marker, which its supported signOut API removes in finally below.
        authClient = new AuthClientClass({ identity: bootstrapKey,
          storage: { async get() { return null; }, async set() {}, async remove() {} },
          idleOptions: { disableIdle: true }, identityProvider: configuration.identityProvider,
          ...(derivationOrigin ? { derivationOrigin } : {}),
        });
        client = authClient;
        const bootstrap = await authClient.signIn({ maxTimeToLive: AUTHENTICATION_DELEGATION_TTL_NS });
        session = await deriveGovernanceSession(bootstrap, bootstrapKey.getPublicKey().toDer());
      } finally {
        try { if (authClient) await authClient.signOut(); } finally { client = undefined; busy = false; }
      }
      if (token !== generation) throw new Error("Authentication cancelled.");
      current = Object.freeze({ ...session, validate() {
        if (token !== generation) throw new Error("Authentication session has been signed out.");
        return session.validate();
      } });
      if (globalThis.window && globalThis.document) idle = IdleManager.create({ onIdle: () => {
        // SDK exit() invokes callbacks even during manual teardown. Clear the
        // reference first, and never recursively exit an already exiting manager.
        if (!idle) return;
        idle = undefined; void signOut(); globalThis.location.reload();
      } });
      return current;
    },
    signOut,
  };
}
