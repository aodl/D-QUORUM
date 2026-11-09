export const idlFactory = ({ IDL }) => {
  const Metadata = IDL.Record({
    'name' : IDL.Text,
    'description' : IDL.Text,
    'links' : IDL.Vec(IDL.Text),
  });
  const Network = IDL.Variant({ 'Ic' : IDL.Null, 'Local' : IDL.Null });
  const Following = IDL.Record({
    'topic' : IDL.Int32,
    'followees' : IDL.Vec(IDL.Nat64),
  });
  const Profile = IDL.Variant({
    'ProductionCandidate' : IDL.Null,
    'RecoverableTest' : IDL.Null,
  });
  const Plan = IDL.Record({
    'return_account' : IDL.Vec(IDL.Nat8),
    'icp_fee_e8s' : IDL.Nat64,
    'dendrite_service' : IDL.Principal,
    'managers' : IDL.Vec(IDL.Nat64),
    'owner' : IDL.Principal,
    'metadata' : IDL.Opt(Metadata),
    'committed_topics' : IDL.Vec(IDL.Int32),
    'origin' : IDL.Text,
    'network' : Network,
    'creation_id' : IDL.Vec(IDL.Nat8),
    'version' : IDL.Nat16,
    'funding_budget_e8s' : IDL.Nat64,
    'stake_e8s' : IDL.Nat64,
    'nonce' : IDL.Nat64,
    'lock_seconds' : IDL.Nat64,
    'provision_cycles' : IDL.Nat64,
    'policy_version' : IDL.Text,
    'following' : IDL.Vec(Following),
    'policy_revision' : IDL.Text,
    'revision' : IDL.Nat64,
    'api_host' : IDL.Text,
    'cycle_reserve' : IDL.Nat64,
    'bootstrap_sha256' : IDL.Vec(IDL.Nat8),
    'profile' : Profile,
  });
  const ProposalKind = IDL.Variant({
    'Registration' : IDL.Null,
    'Rehearsal' : IDL.Null,
  });
  const ExternalProposal = IDL.Record({
    'request_id' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'kind' : ProposalKind,
    'dispatched' : IDL.Bool,
    'created_at' : IDL.Nat64,
    'proposal_id' : IDL.Opt(IDL.Nat64),
    'proposer' : IDL.Nat64,
    'request_digest' : IDL.Vec(IDL.Nat8),
    'revision' : IDL.Nat64,
    'intent_id' : IDL.Vec(IDL.Nat8),
  });
  const ProposalRefusalProof = IDL.Record({
    'argument' : IDL.Vec(IDL.Nat8),
    'certificate' : IDL.Vec(IDL.Nat8),
    'ingress_expiry' : IDL.Nat64,
    'nonce' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'intent_id' : IDL.Vec(IDL.Nat8),
  });
  const Step = IDL.Variant({
    'MarkProposalDispatched' : IDL.Vec(IDL.Nat8),
    'ResolveProposal' : IDL.Nat64,
    'CancelReservedProposal' : IDL.Vec(IDL.Nat8),
    'BeginRehearsal' : IDL.Null,
    'Seal' : IDL.Nat64,
    'Configure' : IDL.Null,
    'StartDissolving' : IDL.Null,
    'ReserveProposal' : ExternalProposal,
    'Unseal' : IDL.Null,
    'ResolveProposalRefusal' : ProposalRefusalProof,
    'Refresh' : IDL.Null,
    'ReconcileDisbursement' : IDL.Nat64,
    'CommitLock' : IDL.Null,
    'Claim' : IDL.Null,
    'Disburse' : IDL.Record({
      'expected_fee_e8s' : IDL.Nat64,
      'expected_amount_e8s' : IDL.Nat64,
    }),
  });
  const Advance = IDL.Record({ 'step' : Step, 'revision' : IDL.Nat64 });
  const ProposalRefusalAudit = IDL.Record({
    'request_id' : IDL.Vec(IDL.Nat8),
    'reply_digest' : IDL.Vec(IDL.Nat8),
    'reservation' : ExternalProposal,
    'certificate_digest' : IDL.Vec(IDL.Nat8),
    'error_type' : IDL.Int32,
  });
  const Effect = IDL.Variant({
    'Lock' : IDL.Nat64,
    'Following' : Following,
    'Refresh' : IDL.Null,
    'Dissolve' : IDL.Null,
    'Visibility' : IDL.Null,
    'Claim' : IDL.Null,
    'Disburse' : IDL.Null,
  });
  const Pending = IDL.Record({
    'dispatched_at' : IDL.Nat64,
    'expected_return_e8s' : IDL.Opt(IDL.Nat64),
    'step' : Step,
    'effect' : IDL.Opt(Effect),
    'expected_return_fee_e8s' : IDL.Opt(IDL.Nat64),
    'revision' : IDL.Nat64,
    'sequence' : IDL.Nat64,
  });
  const Phase = IDL.Variant({
    'RecoverableTestReady' : IDL.Null,
    'AwaitingStake' : IDL.Null,
    'AwaitingRegistration' : IDL.Null,
    'Rehearsing' : IDL.Null,
    'Configuring' : IDL.Null,
    'AwaitingLock' : IDL.Null,
    'Sealed' : IDL.Null,
    'Recovering' : IDL.Null,
    'Recovered' : IDL.Null,
  });
  const State = IDL.Record({
    'controller' : IDL.Principal,
    'last_error' : IDL.Opt(IDL.Text),
    'disbursement_block' : IDL.Opt(IDL.Nat64),
    'proposal_refusals' : IDL.Opt(IDL.Vec(ProposalRefusalAudit)),
    'plan_digest' : IDL.Vec(IDL.Nat8),
    'pending' : IDL.Opt(Pending),
    'plan' : Plan,
    'public_visibility_confirmed' : IDL.Bool,
    'version' : IDL.Nat16,
    'external_proposal' : IDL.Opt(ExternalProposal),
    'sealed_controller_changes' : IDL.Opt(IDL.Nat64),
    'staking_subaccount' : IDL.Vec(IDL.Nat8),
    'phase' : Phase,
    'module_binding' : IDL.Opt(IDL.Vec(IDL.Nat8)),
    'rehearsal_proposal' : IDL.Opt(IDL.Nat64),
    'sequence' : IDL.Nat64,
    'rehearsal_started_at' : IDL.Opt(IDL.Nat64),
    'neuron_id' : IDL.Opt(IDL.Nat64),
  });
  const Result = IDL.Variant({ 'Ok' : State, 'Err' : IDL.Text });
  return IDL.Service({
    'advance' : IDL.Func([Advance], [Result], []),
    'replace_plan' : IDL.Func([IDL.Nat64, Plan], [Result], []),
    'status' : IDL.Func([IDL.Nat64], [Result], []),
  });
};
export const init = ({ IDL }) => {
  const Metadata = IDL.Record({
    'name' : IDL.Text,
    'description' : IDL.Text,
    'links' : IDL.Vec(IDL.Text),
  });
  const Network = IDL.Variant({ 'Ic' : IDL.Null, 'Local' : IDL.Null });
  const Following = IDL.Record({
    'topic' : IDL.Int32,
    'followees' : IDL.Vec(IDL.Nat64),
  });
  const Profile = IDL.Variant({
    'ProductionCandidate' : IDL.Null,
    'RecoverableTest' : IDL.Null,
  });
  const Plan = IDL.Record({
    'return_account' : IDL.Vec(IDL.Nat8),
    'icp_fee_e8s' : IDL.Nat64,
    'dendrite_service' : IDL.Principal,
    'managers' : IDL.Vec(IDL.Nat64),
    'owner' : IDL.Principal,
    'metadata' : IDL.Opt(Metadata),
    'committed_topics' : IDL.Vec(IDL.Int32),
    'origin' : IDL.Text,
    'network' : Network,
    'creation_id' : IDL.Vec(IDL.Nat8),
    'version' : IDL.Nat16,
    'funding_budget_e8s' : IDL.Nat64,
    'stake_e8s' : IDL.Nat64,
    'nonce' : IDL.Nat64,
    'lock_seconds' : IDL.Nat64,
    'provision_cycles' : IDL.Nat64,
    'policy_version' : IDL.Text,
    'following' : IDL.Vec(Following),
    'policy_revision' : IDL.Text,
    'revision' : IDL.Nat64,
    'api_host' : IDL.Text,
    'cycle_reserve' : IDL.Nat64,
    'bootstrap_sha256' : IDL.Vec(IDL.Nat8),
    'profile' : Profile,
  });
  return [Plan];
};
