// Generated deterministically from candid/nns-governance/governance.subset.did.
// Anonymous live analysis exposes only explicit public Governance queries.
export const idlFactory = ({ IDL }) => {
  const NeuronId = IDL.Record({ 'id' : IDL.Nat64 });
  const KnownNeuronData = IDL.Record({
    'name' : IDL.Text,
    'committed_topics' : IDL.Opt(IDL.Vec(IDL.Opt(IDL.Reserved))),
    'description' : IDL.Opt(IDL.Text),
    'links' : IDL.Opt(IDL.Vec(IDL.Text)),
  });
  const NeuronInfo = IDL.Record({
    'id' : IDL.Opt(NeuronId),
    'retrieved_at_timestamp_seconds' : IDL.Nat64,
    'visibility' : IDL.Opt(IDL.Int32),
    'known_neuron_data' : IDL.Opt(KnownNeuronData),
  });
  const GovernanceError = IDL.Record({
    'error_message' : IDL.Text,
    'error_type' : IDL.Int32,
  });
  const NeuronInfoResult = IDL.Variant({
    'Ok' : NeuronInfo,
    'Err' : GovernanceError,
  });
  const ListNeurons = IDL.Record({
    'page_size' : IDL.Opt(IDL.Nat64),
    'include_public_neurons_in_full_neurons' : IDL.Opt(IDL.Bool),
    'neuron_ids' : IDL.Vec(IDL.Nat64),
    'page_number' : IDL.Opt(IDL.Nat64),
    'include_empty_neurons_readable_by_caller' : IDL.Opt(IDL.Bool),
    'neuron_subaccounts' : IDL.Opt(
      IDL.Vec(IDL.Record({ 'subaccount' : IDL.Vec(IDL.Nat8) }))
    ),
    'include_neurons_readable_by_caller' : IDL.Bool,
  });
  const DissolveState = IDL.Variant({
    'DissolveDelaySeconds' : IDL.Nat64,
    'WhenDissolvedTimestampSeconds' : IDL.Nat64,
  });
  const Followees = IDL.Record({ 'followees' : IDL.Vec(NeuronId) });
  const Neuron = IDL.Record({
    'id' : IDL.Opt(NeuronId),
    'staked_maturity_e8s_equivalent' : IDL.Opt(IDL.Nat64),
    'controller' : IDL.Opt(IDL.Principal),
    'voting_power_refreshed_timestamp_seconds' : IDL.Opt(IDL.Nat64),
    'potential_voting_power' : IDL.Opt(IDL.Nat64),
    'not_for_profit' : IDL.Bool,
    'maturity_e8s_equivalent' : IDL.Nat64,
    'deciding_voting_power' : IDL.Opt(IDL.Nat64),
    'cached_neuron_stake_e8s' : IDL.Nat64,
    'created_timestamp_seconds' : IDL.Nat64,
    'auto_stake_maturity' : IDL.Opt(IDL.Bool),
    'aging_since_timestamp_seconds' : IDL.Nat64,
    'hot_keys' : IDL.Vec(IDL.Principal),
    'dissolve_state' : IDL.Opt(DissolveState),
    'followees' : IDL.Vec(IDL.Tuple(IDL.Int32, Followees)),
    'neuron_fees_e8s' : IDL.Nat64,
    'visibility' : IDL.Opt(IDL.Int32),
    'known_neuron_data' : IDL.Opt(KnownNeuronData),
  });
  const ListNeuronsResponse = IDL.Record({
    'neuron_infos' : IDL.Vec(IDL.Tuple(IDL.Nat64, NeuronInfo)),
    'full_neurons' : IDL.Vec(Neuron),
    'total_pages_available' : IDL.Opt(IDL.Nat64),
  });
  return IDL.Service({
    'get_neuron_info' : IDL.Func([IDL.Nat64], [NeuronInfoResult], ['query']),
    'list_neurons' : IDL.Func([ListNeurons], [ListNeuronsResponse], ['query']),
  });
};
