export async function checkLive(api, canonicalId) {
  const result = await api.check_neuron(BigInt(canonicalId));
  if ("Err" in result) throw result.Err;
  return result.Ok;
}
