import { sha224, sha256 } from "@noble/hashes/sha2";
import { Principal } from "@icp-sdk/core/principal";
const text = new TextEncoder();
const concat = (...values) => Uint8Array.from(values.flatMap((v) => [...v]));
export const bytesHex = (value) => [...value].map((n) => n.toString(16).padStart(2, "0")).join("");
export function hexBytes(value, length) {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/.test(value) || (length !== undefined && value.length !== length*2)) throw new Error("Invalid canonical hexadecimal bytes.");
  return Uint8Array.from(value.match(/../g), (part) => Number.parseInt(part, 16));
}
export const sha256Hex = (bytes) => bytesHex(sha256(bytes));
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const octet of bytes) { crc ^= octet; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  const out = new Uint8Array(4);new DataView(out.buffer).setUint32(0,(crc^0xffffffff)>>>0);return out;
}
export function legacyAccount(owner, subaccount = new Uint8Array(32)) {
  if (!(subaccount instanceof Uint8Array) || subaccount.length !== 32) throw new Error("Account subaccount must contain 32 bytes.");
  const digest = sha224(concat(text.encode("\x0aaccount-id"), Principal.from(owner).toUint8Array(), subaccount));
  return concat(crc32(digest), digest);
}
export function validateLegacyAccount(value) {
  const bytes = typeof value === "string" ? hexBytes(value,32) : value;
  if (!(bytes instanceof Uint8Array) || bytes.length!==32 || bytesHex(crc32(bytes.slice(4)))!==bytesHex(bytes.slice(0,4))) throw new Error("Invalid legacy account identifier checksum.");
  return new Uint8Array(bytes);
}
export function principalSubaccount(owner) {
  const bytes = Principal.from(owner).toUint8Array();
  if (bytes.length > 29) throw new Error("Invalid owner principal length.");
  const sub = new Uint8Array(32);sub[0]=bytes.length;sub.set(bytes,1);return sub;
}
export function stakingSubaccount(controller, nonce) {
  const n = BigInt(nonce);if(n<0n||n>0xffffffffffffffffn)throw new Error("Invalid creation nonce.");
  const bytes = new Uint8Array(8);new DataView(bytes.buffer).setBigUint64(0,n);
  return sha256(concat(text.encode("\x0cneuron-stake"),Principal.from(controller).toUint8Array(),bytes));
}
export function fundingSubaccount(owner, creationId) {
  if (!(creationId instanceof Uint8Array) || creationId.length!==32)throw new Error("Invalid creation identifier.");
  return sha256(concat(text.encode("\x13dendrite-funding-v1"),Principal.from(owner).toUint8Array(),creationId));
}
