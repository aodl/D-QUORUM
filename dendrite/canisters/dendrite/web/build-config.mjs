import { Principal } from "@icp-sdk/core/principal";

export const PRODUCTION_IC_API_HOST = "https://icp-api.io";
export const PRODUCTION_IDENTITY_PROVIDER = "https://id.ai/authorize";
export const AUTHENTICATION_DELEGATION_TTL_NS = 8n * 60n * 60n * 1_000_000_000n;
export const LOCAL_IC_API_HOSTS = new Set([
  "http://127.0.0.1:4943",
  "http://localhost:4943",
]);
export const ACCEPTED_CONNECTION_ORIGINS = new Set([
  PRODUCTION_IC_API_HOST,
  ...LOCAL_IC_API_HOSTS,
]);

export function exactOrigin(value, name, protocols) {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required.`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute origin.`);
  }
  if (!protocols.has(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || value !== parsed.origin) {
    throw new Error(`${name} must be an exact origin without credentials, path, query, fragment, or trailing slash.`);
  }
  return parsed.origin;
}

export function normalizeAlternativeOrigins(value, derivationOrigin, mode) {
  let parsed;
  try { parsed = JSON.parse(value ?? "[]"); } catch { throw new Error("DENDRITE_ALTERNATIVE_ORIGINS_JSON must be valid JSON."); }
  if (parsed && !Array.isArray(parsed) && Object.keys(parsed).length === 1) {
    parsed = parsed.alternativeOrigins;
  }
  if (!Array.isArray(parsed) || parsed.some((origin) => typeof origin !== "string")) {
    throw new Error("DENDRITE_ALTERNATIVE_ORIGINS_JSON must be an array of strings or an exact alternativeOrigins document.");
  }
  if (parsed.length > 10) throw new Error("At most 10 alternative origins are allowed.");
  const protocols = mode === "production" ? new Set(["https:"]) : new Set(["http:", "https:"]);
  const normalized = parsed.map((origin) => exactOrigin(origin, "alternative origin", protocols));
  if (new Set(normalized).size !== normalized.length) throw new Error("Alternative origins must be unique.");
  if (normalized.includes(derivationOrigin)) throw new Error("The canonical derivation origin cannot be an alternative.");
  return normalized.sort();
}

function exactIdentityProvider(value, mode) {
  if (typeof value !== "string" || !value) throw new Error("DENDRITE_IDENTITY_PROVIDER is required.");
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("DENDRITE_IDENTITY_PROVIDER must be an absolute authorization URL."); }
  const protocols = mode === "production" ? new Set(["https:"]) : new Set(["http:", "https:"]);
  if (!protocols.has(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/authorize" || parsed.search || parsed.hash || value !== parsed.href) {
    throw new Error("DENDRITE_IDENTITY_PROVIDER must be an exact /authorize URL without credentials, query, or fragment.");
  }
  return value;
}

export function resolveBuildConfiguration(environment = process.env) {
  const canisterId = environment.DENDRITE_CANISTER_ID ?? environment.CANISTER_ID_DENDRITE;
  if (!canisterId) throw new Error("DENDRITE_CANISTER_ID is required.");
  try {
    Principal.fromText(canisterId);
  } catch {
    throw new Error("DENDRITE_CANISTER_ID is not a valid textual principal.");
  }

  const mode = environment.DENDRITE_BUILD_MODE ?? "production";
  if (!new Set(["production", "local"]).has(mode)) {
    throw new Error("DENDRITE_BUILD_MODE must be production or local.");
  }
  const apiHost = exactOrigin(environment.DENDRITE_API_HOST ?? PRODUCTION_IC_API_HOST, "DENDRITE_API_HOST", new Set(["http:", "https:"]));
  if (mode === "production" && apiHost !== PRODUCTION_IC_API_HOST) {
    throw new Error(`Production DENDRITE_API_HOST must be ${PRODUCTION_IC_API_HOST}.`);
  }
  if (mode === "local" && !LOCAL_IC_API_HOSTS.has(apiHost)) {
    throw new Error("Local DENDRITE_API_HOST must be an explicitly supported replica origin.");
  }

  const fetchRootKey = environment.DENDRITE_FETCH_ROOT_KEY === "true";
  if (environment.DENDRITE_FETCH_ROOT_KEY && !new Set(["true", "false"]).has(environment.DENDRITE_FETCH_ROOT_KEY)) {
    throw new Error("DENDRITE_FETCH_ROOT_KEY must be true or false.");
  }
  if (mode === "production" && fetchRootKey) {
    throw new Error("Production builds cannot fetch a root key.");
  }
  const derivationOrigin = exactOrigin(
    environment.DENDRITE_DERIVATION_ORIGIN,
    "DENDRITE_DERIVATION_ORIGIN",
    mode === "production" ? new Set(["https:"]) : new Set(["http:", "https:"]),
  );
  const alternativeOrigins = normalizeAlternativeOrigins(
    environment.DENDRITE_ALTERNATIVE_ORIGINS_JSON,
    derivationOrigin,
    mode,
  );
  const identityProvider = exactIdentityProvider(
    environment.DENDRITE_IDENTITY_PROVIDER ?? (mode === "production" ? PRODUCTION_IDENTITY_PROVIDER : ""),
    mode,
  );
  if (mode === "production" && identityProvider !== PRODUCTION_IDENTITY_PROVIDER) {
    throw new Error(`Production DENDRITE_IDENTITY_PROVIDER must be ${PRODUCTION_IDENTITY_PROVIDER}.`);
  }
  const providerHostname = new URL(identityProvider).hostname;
  if (mode === "local" && providerHostname !== "localhost" && providerHostname !== "127.0.0.1" && !providerHostname.endsWith(".localhost")) {
    throw new Error("Local identity provider must use localhost, loopback, or a .localhost hostname.");
  }
  return { canisterId, apiHost, fetchRootKey, mode, derivationOrigin, alternativeOrigins, identityProvider };
}
