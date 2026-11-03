export const U64_MAX = 18446744073709551615n;
export const ALPHA_VOTE_NEURON_ID = "2947465672511369";
export const OMEGA_VOTE_NEURON_ID = "18363645821499695760";
export const OMEGA_REJECT_NEURON_ID = "18422777432977120264";
export function parseNeuronId(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) throw new TypeError("Enter a non-zero canonical decimal neuron ID.");
  const id = BigInt(value);
  if (id > U64_MAX) throw new RangeError("Neuron ID exceeds u64.");
  return id;
}
export function formatNeuronId(id) { if (typeof id !== "bigint" || id <= 0n || id > U64_MAX) throw new TypeError("Invalid neuron ID."); return id.toString(10); }
