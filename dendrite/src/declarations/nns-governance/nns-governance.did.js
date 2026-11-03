// Generated deterministically from candid/nns-governance/governance-transaction.subset.did.
// Replicated reads intentionally transform every query annotation to an update annotation.
export const idlFactory = ({ IDL }) => {
  const ManageNeuronRequest = IDL.Rec();
  const Proposal = IDL.Rec();
  const NetworkEconomics = IDL.Record({
    'neuron_management_fee_per_proposal_e8s' : IDL.Nat64,
  });
  const ProposalId = IDL.Record({ 'id' : IDL.Nat64 });
  const Ballot = IDL.Record({ 'vote' : IDL.Int32, 'voting_power' : IDL.Nat64 });
  const NeuronId = IDL.Record({ 'id' : IDL.Nat64 });
  const Spawn = IDL.Record({
    'percentage_to_spawn' : IDL.Opt(IDL.Nat32),
    'new_controller' : IDL.Opt(IDL.Principal),
    'nonce' : IDL.Opt(IDL.Nat64),
  });
  const Split = IDL.Record({
    'memo' : IDL.Opt(IDL.Nat64),
    'amount_e8s' : IDL.Nat64,
  });
  const Follow = IDL.Record({
    'topic' : IDL.Int32,
    'followees' : IDL.Vec(NeuronId),
  });
  const AccountIdentifier = IDL.Record({ 'hash' : IDL.Vec(IDL.Nat8) });
  const Account = IDL.Record({
    'owner' : IDL.Opt(IDL.Principal),
    'subaccount' : IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const DisburseMaturity = IDL.Record({
    'to_account_identifier' : IDL.Opt(AccountIdentifier),
    'to_account' : IDL.Opt(Account),
    'percentage_to_disburse' : IDL.Nat32,
  });
  const RefreshVotingPower = IDL.Record({});
  const By = IDL.Variant({
    'NeuronIdOrSubaccount' : IDL.Record({}),
    'MemoAndController' : IDL.Reserved,
    'Memo' : IDL.Nat64,
  });
  const ClaimOrRefresh = IDL.Record({ 'by' : IDL.Opt(By) });
  const RemoveHotKey = IDL.Record({
    'hot_key_to_remove' : IDL.Opt(IDL.Principal),
  });
  const AddHotKey = IDL.Record({ 'new_hot_key' : IDL.Opt(IDL.Principal) });
  const ChangeAutoStakeMaturity = IDL.Record({
    'requested_setting_for_auto_stake_maturity' : IDL.Bool,
  });
  const IncreaseDissolveDelay = IDL.Record({
    'additional_dissolve_delay_seconds' : IDL.Nat32,
  });
  const SetVisibility = IDL.Record({ 'visibility' : IDL.Opt(IDL.Int32) });
  const SetDissolveTimestamp = IDL.Record({
    'dissolve_timestamp_seconds' : IDL.Nat64,
  });
  const Operation = IDL.Variant({
    'RemoveHotKey' : RemoveHotKey,
    'AddHotKey' : AddHotKey,
    'ChangeAutoStakeMaturity' : ChangeAutoStakeMaturity,
    'StopDissolving' : IDL.Record({}),
    'StartDissolving' : IDL.Record({}),
    'IncreaseDissolveDelay' : IncreaseDissolveDelay,
    'SetVisibility' : SetVisibility,
    'JoinCommunityFund' : IDL.Record({}),
    'LeaveCommunityFund' : IDL.Record({}),
    'SetDissolveTimestamp' : SetDissolveTimestamp,
  });
  const Configure = IDL.Record({ 'operation' : IDL.Opt(Operation) });
  const RegisterVote = IDL.Record({
    'vote' : IDL.Int32,
    'proposal' : IDL.Opt(ProposalId),
  });
  const Merge = IDL.Record({ 'source_neuron_id' : IDL.Opt(NeuronId) });
  const DisburseToNeuron = IDL.Record({
    'dissolve_delay_seconds' : IDL.Nat64,
    'kyc_verified' : IDL.Bool,
    'amount_e8s' : IDL.Nat64,
    'new_controller' : IDL.Opt(IDL.Principal),
    'nonce' : IDL.Nat64,
  });
  const FolloweesForTopic = IDL.Record({
    'topic' : IDL.Opt(IDL.Int32),
    'followees' : IDL.Opt(IDL.Vec(NeuronId)),
  });
  const SetFollowing = IDL.Record({
    'topic_following' : IDL.Opt(IDL.Vec(FolloweesForTopic)),
  });
  const StakeMaturity = IDL.Record({
    'percentage_to_stake' : IDL.Opt(IDL.Nat32),
  });
  const MergeMaturity = IDL.Record({ 'percentage_to_merge' : IDL.Nat32 });
  const Amount = IDL.Record({ 'e8s' : IDL.Nat64 });
  const Disburse = IDL.Record({
    'to_account' : IDL.Opt(AccountIdentifier),
    'amount' : IDL.Opt(Amount),
  });
  const ManageNeuronProposalCommand = IDL.Variant({
    'Spawn' : Spawn,
    'Split' : Split,
    'Follow' : Follow,
    'DisburseMaturity' : DisburseMaturity,
    'RefreshVotingPower' : RefreshVotingPower,
    'ClaimOrRefresh' : ClaimOrRefresh,
    'Configure' : Configure,
    'RegisterVote' : RegisterVote,
    'Merge' : Merge,
    'DisburseToNeuron' : DisburseToNeuron,
    'SetFollowing' : SetFollowing,
    'MakeProposal' : Proposal,
    'StakeMaturity' : StakeMaturity,
    'MergeMaturity' : MergeMaturity,
    'Disburse' : Disburse,
  });
  const NeuronIdOrSubaccount = IDL.Variant({
    'Subaccount' : IDL.Vec(IDL.Nat8),
    'NeuronId' : NeuronId,
  });
  const ManageNeuronProposal = IDL.Record({
    'id' : IDL.Opt(NeuronId),
    'command' : IDL.Opt(ManageNeuronProposalCommand),
    'neuron_id_or_subaccount' : IDL.Opt(NeuronIdOrSubaccount),
  });
  const Action = IDL.Variant({
    'RegisterKnownNeuron' : IDL.Reserved,
    'FulfillSubnetRentalRequest' : IDL.Reserved,
    'ManageNeuron' : ManageNeuronProposal,
    'LoadCanisterSnapshot' : IDL.Reserved,
    'BlessAlternativeGuestOsVersion' : IDL.Reserved,
    'UpdateCanisterSettings' : IDL.Reserved,
    'InstallCode' : IDL.Reserved,
    'DeregisterKnownNeuron' : IDL.Reserved,
    'TakeCanisterSnapshot' : IDL.Reserved,
    'StopOrStartCanister' : IDL.Reserved,
    'CreateServiceNervousSystem' : IDL.Reserved,
    'ExecuteNnsFunction' : IDL.Reserved,
    'CreateCanisterAndInstallCode' : IDL.Reserved,
    'RewardNodeProvider' : IDL.Reserved,
    'OpenSnsTokenSwap' : IDL.Reserved,
    'SetSnsTokenSwapOpenTimeWindow' : IDL.Reserved,
    'SetDefaultFollowees' : IDL.Reserved,
    'RewardNodeProviders' : IDL.Reserved,
    'ManageNetworkEconomics' : IDL.Reserved,
    'ApproveGenesisKyc' : IDL.Reserved,
    'AddOrRemoveNodeProvider' : IDL.Reserved,
    'Motion' : IDL.Reserved,
  });
  Proposal.fill(
    IDL.Record({
      'url' : IDL.Text,
      'title' : IDL.Opt(IDL.Text),
      'action' : IDL.Opt(Action),
      'summary' : IDL.Text,
    })
  );
  const ProposalInfo = IDL.Record({
    'id' : IDL.Opt(ProposalId),
    'status' : IDL.Int32,
    'topic' : IDL.Int32,
    'ballots' : IDL.Vec(IDL.Tuple(IDL.Nat64, Ballot)),
    'proposal_timestamp_seconds' : IDL.Nat64,
    'deadline_timestamp_seconds' : IDL.Opt(IDL.Nat64),
    'proposal' : IDL.Opt(Proposal),
    'proposer' : IDL.Opt(NeuronId),
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
  const KnownNeuronData = IDL.Record({
    'name' : IDL.Text,
    'committed_topics' : IDL.Reserved,
    'description' : IDL.Opt(IDL.Text),
    'links' : IDL.Opt(IDL.Vec(IDL.Text)),
  });
  const FullNeuron = IDL.Record({
    'id' : IDL.Opt(NeuronId),
    'controller' : IDL.Opt(IDL.Principal),
    'cached_neuron_stake_e8s' : IDL.Nat64,
    'hot_keys' : IDL.Vec(IDL.Principal),
    'followees' : IDL.Reserved,
    'neuron_fees_e8s' : IDL.Nat64,
    'known_neuron_data' : IDL.Opt(KnownNeuronData),
  });
  const ListNeuronsResponse = IDL.Record({
    'neuron_infos' : IDL.Reserved,
    'full_neurons' : IDL.Vec(FullNeuron),
    'total_pages_available' : IDL.Opt(IDL.Nat64),
  });
  const ListProposalInfoRequest = IDL.Record({
    'return_self_describing_action' : IDL.Opt(IDL.Bool),
    'include_reward_status' : IDL.Vec(IDL.Int32),
    'omit_large_fields' : IDL.Opt(IDL.Bool),
    'before_proposal' : IDL.Opt(ProposalId),
    'limit' : IDL.Nat32,
    'exclude_topic' : IDL.Vec(IDL.Int32),
    'include_all_manage_neuron_proposals' : IDL.Opt(IDL.Bool),
    'include_status' : IDL.Vec(IDL.Int32),
  });
  const ListProposalInfoResponse = IDL.Record({
    'proposal_info' : IDL.Vec(ProposalInfo),
  });
  const ProposalActionRequest = IDL.Variant({
    'RegisterKnownNeuron' : IDL.Reserved,
    'FulfillSubnetRentalRequest' : IDL.Reserved,
    'ManageNeuron' : ManageNeuronRequest,
    'LoadCanisterSnapshot' : IDL.Reserved,
    'BlessAlternativeGuestOsVersion' : IDL.Reserved,
    'UpdateCanisterSettings' : IDL.Reserved,
    'InstallCode' : IDL.Reserved,
    'DeregisterKnownNeuron' : IDL.Reserved,
    'TakeCanisterSnapshot' : IDL.Reserved,
    'StopOrStartCanister' : IDL.Reserved,
    'CreateServiceNervousSystem' : IDL.Reserved,
    'ExecuteNnsFunction' : IDL.Reserved,
    'CreateCanisterAndInstallCode' : IDL.Reserved,
    'RewardNodeProvider' : IDL.Reserved,
    'RewardNodeProviders' : IDL.Reserved,
    'ManageNetworkEconomics' : IDL.Reserved,
    'ApproveGenesisKyc' : IDL.Reserved,
    'AddOrRemoveNodeProvider' : IDL.Reserved,
    'Motion' : IDL.Reserved,
  });
  const MakeProposalRequest = IDL.Record({
    'url' : IDL.Text,
    'title' : IDL.Opt(IDL.Text),
    'action' : IDL.Opt(ProposalActionRequest),
    'summary' : IDL.Text,
  });
  const ManageNeuronCommandRequest = IDL.Variant({
    'Spawn' : Spawn,
    'Split' : Split,
    'Follow' : Follow,
    'DisburseMaturity' : DisburseMaturity,
    'RefreshVotingPower' : RefreshVotingPower,
    'ClaimOrRefresh' : ClaimOrRefresh,
    'Configure' : Configure,
    'RegisterVote' : RegisterVote,
    'Merge' : Merge,
    'DisburseToNeuron' : DisburseToNeuron,
    'SetFollowing' : SetFollowing,
    'MakeProposal' : MakeProposalRequest,
    'StakeMaturity' : StakeMaturity,
    'MergeMaturity' : MergeMaturity,
    'Disburse' : Disburse,
  });
  ManageNeuronRequest.fill(
    IDL.Record({
      'id' : IDL.Opt(NeuronId),
      'command' : IDL.Opt(ManageNeuronCommandRequest),
      'neuron_id_or_subaccount' : IDL.Opt(NeuronIdOrSubaccount),
    })
  );
  const GovernanceError = IDL.Record({
    'error_message' : IDL.Text,
    'error_type' : IDL.Int32,
  });
  const MakeProposalResponse = IDL.Record({
    'message' : IDL.Opt(IDL.Text),
    'proposal_id' : IDL.Opt(ProposalId),
  });
  const ManageNeuronResponseCommand = IDL.Variant({
    'Error' : GovernanceError,
    'Spawn' : IDL.Reserved,
    'Split' : IDL.Reserved,
    'Follow' : IDL.Record({}),
    'DisburseMaturity' : IDL.Reserved,
    'RefreshVotingPower' : IDL.Record({}),
    'ClaimOrRefresh' : IDL.Reserved,
    'Configure' : IDL.Record({}),
    'RegisterVote' : IDL.Record({}),
    'Merge' : IDL.Reserved,
    'DisburseToNeuron' : IDL.Reserved,
    'SetFollowing' : IDL.Record({}),
    'MakeProposal' : MakeProposalResponse,
    'StakeMaturity' : IDL.Reserved,
    'MergeMaturity' : IDL.Reserved,
    'Disburse' : IDL.Reserved,
  });
  const ManageNeuronResponse = IDL.Record({
    'command' : IDL.Opt(ManageNeuronResponseCommand),
  });
  return IDL.Service({
    'get_network_economics_parameters' : IDL.Func(
        [],
        [NetworkEconomics],
        [],
      ),
    'get_proposal_info' : IDL.Func(
        [IDL.Nat64],
        [IDL.Opt(ProposalInfo)],
        [],
      ),
    'list_neurons' : IDL.Func([ListNeurons], [ListNeuronsResponse], []),
    'list_proposals' : IDL.Func(
        [ListProposalInfoRequest],
        [ListProposalInfoResponse],
        [],
      ),
    'manage_neuron' : IDL.Func(
        [ManageNeuronRequest],
        [ManageNeuronResponse],
        [],
      ),
  });
};
