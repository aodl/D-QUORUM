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
function inspectChain(identity, now, maximum = 20, requiredTargets = [NNS_GOVERNANCE_PRINCIPAL], ttl = AUTHENTICATION_DELEGATION_TTL_NS) {
  const chain = identity?.getDelegation?.();
  const bytes = (value, bound) => value instanceof Uint8Array && value.length > 0 && value.length <= bound;
  if (!chain || !Array.isArray(chain.delegations) || !chain.delegations.length || chain.delegations.length > maximum || !bytes(chain.publicKey, 4096)) {
    throw new Error("Internet Identity delegation chain cannot be inspected safely.");
  }
  const principal = exactPrincipal(identity);
  if (!samePrincipal(principal, Principal.selfAuthenticating(chain.publicKey))) throw new Error("Delegation root does not match the application principal.");
  let expiration = now + ttl;
  const seenKeys = new Set([Array.from(chain.publicKey).join(",")]);
  for (const signed of chain.delegations) {
    const link = signed?.delegation;
    if (!link || Object.keys(link).some((key) => !["pubkey", "expiration", "targets"].includes(key)) || !bytes(link.pubkey, 4096) || !bytes(signed.signature, 65536)) {
      throw new Error("Internet Identity delegation contains malformed or unsupported restrictions.");
    }
    const publicKey = Array.from(link.pubkey).join(",");
    if (seenKeys.has(publicKey)) throw new Error("Internet Identity delegation has a cyclic or self-signed key.");
    seenKeys.add(publicKey);
    if (typeof link.expiration !== "bigint" || link.expiration <= now || link.expiration > (1n << 64n) - 1n) throw new Error("Internet Identity delegation is expired or malformed.");
    if (link.targets !== undefined) {
      if (!Array.isArray(link.targets) || !link.targets.length || link.targets.length > 1000 || !link.targets.every((target) => target instanceof Principal) || !requiredTargets.every((required) => link.targets.some((target) => samePrincipal(target, required)))) {
        throw new Error(requiredTargets.length === 1 && samePrincipal(requiredTargets[0], NNS_GOVERNANCE_PRINCIPAL)
          ? "Internet Identity ancestor delegation does not permit NNS Governance."
          : "Internet Identity ancestor delegation does not permit the named provisioning capability.");
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

export const PROVISIONING_DELEGATION_TTL_NS = 900_000_000_000n;
export const ICP_LEDGER_CANISTER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";
export const CMC_CANISTER_ID = "rkp4c-7iaaa-aaaaa-aaaca-cai";
export const CYCLES_LEDGER_CANISTER_ID = "um5iw-rqaaa-aaaaq-qaaba-cai";
export const PROVISIONING_PROFILES = Object.freeze(["FundProvisioning", "ManageBootstrap", "CallBootstrap"]);

function provisioningTargets(profile, bootstrapCanisterId) {
  if (!PROVISIONING_PROFILES.includes(profile)) throw new Error("Unknown provisioning capability profile.");
  if (profile === "FundProvisioning") {
    if (bootstrapCanisterId !== undefined) throw new Error("Funding capability does not accept a target list or canister override.");
    return [ICP_LEDGER_CANISTER_ID, CMC_CANISTER_ID, CYCLES_LEDGER_CANISTER_ID].map((text) => Principal.fromText(text));
  }
  if (typeof bootstrapCanisterId !== "string") throw new Error("An exact verified bootstrap canister is required.");
  const canister = Principal.fromText(bootstrapCanisterId);
  if (canister.toUint8Array().at(-1) !== 1 || [NNS_GOVERNANCE_CANISTER_ID, ICP_LEDGER_CANISTER_ID, CMC_CANISTER_ID, CYCLES_LEDGER_CANISTER_ID].includes(canister.toText())) {
    throw new Error("Provisioning requires an application-canister binding.");
  }
  // Management target restrictions do not constrain canister_id arguments. The
  // exact reviewed C and actual sole-controller check remain separate safeguards.
  return profile === "ManageBootstrap" ? [Principal.managementCanister(), canister] : [canister];
}

export function validateProvisioningDelegation(identity, profile, bootstrapCanisterId, nowNanoseconds = BigInt(Date.now()) * 1_000_000n) {
  const required = provisioningTargets(profile, bootstrapCanisterId);
  const { chain, principal } = inspectChain(identity, nowNanoseconds, 20, required, PROVISIONING_DELEGATION_TTL_NS);
  const leaf = chain.delegations.at(-1).delegation;
  if (!Array.isArray(leaf.targets) || leaf.targets.length !== required.length
    || !required.every((target) => leaf.targets.some((candidate) => samePrincipal(target, candidate)))
    || leaf.expiration > nowNanoseconds + PROVISIONING_DELEGATION_TTL_NS
    || chain.delegations.some(({ delegation }) => delegation.expiration < leaf.expiration)) {
    throw new Error("Unscoped, broadened or overlong provisioning signer.");
  }
  return Object.freeze({ principal, signingIdentity: identity, profile, bootstrapCanisterId,
    validate() { validateProvisioningDelegation(identity, profile, bootstrapCanisterId); return true; } });
}

export async function deriveProvisioningSession(bootstrap, bootstrapPublicKey, profile, bootstrapCanisterId) {
  const targets = provisioningTargets(profile, bootstrapCanisterId);
  const { chain, principal, expiration } = inspectChain(bootstrap, BigInt(Date.now()) * 1_000_000n, 19, targets, PROVISIONING_DELEGATION_TTL_NS);
  const leaf = chain.delegations.at(-1).delegation.pubkey;
  if (!(bootstrapPublicKey instanceof Uint8Array) || leaf.length !== bootstrapPublicKey.length || !leaf.every((byte, index) => byte === bootstrapPublicKey[index])) {
    throw new Error("Internet Identity delegation does not bind the requested provisioning key.");
  }
  const key = await ECDSAKeyIdentity.generate({ extractable: false });
  const chainWithChild = await DelegationChain.create(bootstrap, key.getPublicKey(), new Date(Number(expiration / 1_000_000n)), { previous: chain, targets });
  const identity = DelegationIdentity.fromDelegation(key, chainWithChild);
  if (!samePrincipal(exactPrincipal(identity), principal)) throw new Error("Provisioning identity changed the application principal.");
  return validateProvisioningDelegation(identity, profile, bootstrapCanisterId);
}

export function createBrowserAuthSession(options = {}) {
  return browserSession(options, deriveGovernanceSession, AUTHENTICATION_DELEGATION_TTL_NS);
}

export function createBrowserProvisioningSession(profile, bootstrapCanisterId, options = {}) {
  provisioningTargets(profile, bootstrapCanisterId);
  return browserSession(options, (bootstrap, key) => deriveProvisioningSession(bootstrap, key, profile, bootstrapCanisterId), PROVISIONING_DELEGATION_TTL_NS);
}

function browserSession(options, deriveSession, maximumTtl) {
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
        const bootstrap = await authClient.signIn({ maxTimeToLive: maximumTtl });
        session = await deriveSession(bootstrap, bootstrapKey.getPublicKey().toDer());
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
