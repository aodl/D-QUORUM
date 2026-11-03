import {
  AnonymousIdentity,
  Certificate,
  Cbor,
  HttpAgent,
  LookupPathStatus,
} from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { governanceReadConfiguration } from "./governance-read-actor.js";

const text = new TextEncoder();
const MAX_CONTROLLERS = 10;
const MAX_PRINCIPAL_BYTES = 29;
const PATH_TIME = [text.encode("time")];
const path = (canister, name) => [
  text.encode("canister"),
  canister.toUint8Array(),
  text.encode(name),
];

const equalBytes = (left, right) =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

function decodeUnsignedLeb128(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 10) {
    throw new TypeError("Certificate time has an invalid encoding.");
  }
  let value = 0n;
  let shift = 0n;
  for (let index = 0; index < bytes.length; index += 1) {
    const octet = bytes[index];
    value |= BigInt(octet & 0x7f) << shift;
    if ((octet & 0x80) === 0) {
      if (index !== bytes.length - 1 || (index > 0 && octet === 0)) {
        throw new TypeError("Certificate time is not canonically encoded.");
      }
      return value;
    }
    shift += 7n;
  }
  throw new TypeError("Certificate time has an invalid encoding.");
}

function foundBytes(certificate, certifiedPath, label) {
  const result = certificate.lookup_path(certifiedPath);
  if (result.status !== LookupPathStatus.Found || !(result.value instanceof Uint8Array)) {
    throw new TypeError(`${label} is absent or ambiguous in certified state.`);
  }
  return result.value;
}

export function decodeCertifiedControllers(bytes) {
  let decoded;
  try {
    decoded = Cbor.decode(bytes);
  } catch {
    throw new TypeError("Certified controllers use malformed CBOR.");
  }
  if (!Array.isArray(decoded) || decoded.length > MAX_CONTROLLERS) {
    throw new TypeError("Certified controllers exceed their pinned bound or are malformed.");
  }
  if (!equalBytes(Cbor.encode(decoded), bytes)) {
    throw new TypeError("Certified controllers are not canonically CBOR encoded.");
  }
  const controllers = decoded.map((raw) => {
    if (!(raw instanceof Uint8Array) || raw.length > MAX_PRINCIPAL_BYTES) {
      throw new TypeError("Certified controller principal has an invalid length.");
    }
    return Principal.fromUint8Array(raw);
  });
  controllers.sort((left, right) => left.toText().localeCompare(right.toText()));
  return controllers;
}

export function normalizeCertifiedCanisterState(certificate, canisterId) {
  const principal = Principal.from(canisterId);
  const controllers = decodeCertifiedControllers(foundBytes(
    certificate,
    path(principal, "controllers"),
    "Controllers",
  ));
  const moduleLookup = certificate.lookup_path(path(principal, "module_hash"));
  let moduleHash;
  if (moduleLookup.status === LookupPathStatus.Found) {
    if (!(moduleLookup.value instanceof Uint8Array) || moduleLookup.value.length !== 32) {
      throw new TypeError("Certified module hash is malformed.");
    }
    moduleHash = new Uint8Array(moduleLookup.value);
  } else if (moduleLookup.status !== LookupPathStatus.Absent) {
    throw new TypeError("Certified module-hash status is ambiguous.");
  }
  const certificateTimeNanos = decodeUnsignedLeb128(foundBytes(certificate, PATH_TIME, "Certificate time"));
  const certificateTimeMilliseconds = certificateTimeNanos / 1_000_000n;
  if (certificateTimeMilliseconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError("Certificate time is outside the supported range.");
  }
  return Object.freeze({
    callSucceeded: true,
    moduleHash,
    controllers: Object.freeze(controllers),
    certificateTime: new Date(Number(certificateTimeMilliseconds)).toISOString(),
  });
}

export function createCertifiedCanisterStateReader(options = {}) {
  const configuration = governanceReadConfiguration(options);
  const createAgent = options.createAgent ?? ((agentOptions) => HttpAgent.create(agentOptions));
  const createCertificate = options.createCertificate ?? ((certificateOptions) => Certificate.create(certificateOptions));
  const cache = new Map();

  async function read(controller) {
    const principal = Principal.from(controller);
    const canonical = principal.toText();
    if (!cache.has(canonical)) {
      const pending = (async () => {
        const agent = await createAgent({
          host: configuration.host,
          identity: new AnonymousIdentity(),
          shouldFetchRootKey: configuration.shouldFetchRootKey,
          verifyQuerySignatures: true,
        });
        if (!(agent.rootKey instanceof Uint8Array)) throw new TypeError("The IC root key is unavailable.");
        const requestedPaths = [
          PATH_TIME,
          path(principal, "controllers"),
          path(principal, "module_hash"),
        ];
        const response = await agent.readState(principal, { paths: requestedPaths });
        const certificate = await createCertificate({
          certificate: response.certificate,
          rootKey: agent.rootKey,
          principal: { canisterId: principal },
          disableTimeVerification: false,
          agent,
        });
        return normalizeCertifiedCanisterState(certificate, principal);
      })();
      cache.set(canonical, pending);
      pending.catch(() => {
        if (cache.get(canonical) === pending) cache.delete(canonical);
      });
    }
    return cache.get(canonical);
  }

  return Object.freeze({ read, clear: () => cache.clear(), cache });
}
