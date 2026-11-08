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
  const Step = IDL.Variant({
    'BeginRehearsal' : IDL.Null,
    'Seal' : IDL.Nat64,
    'Configure' : IDL.Null,
    'StartDissolving' : IDL.Null,
    'Unseal' : IDL.Null,
    'Refresh' : IDL.Null,
    'ReconcileDisbursement' : IDL.Nat64,
    'CommitLock' : IDL.Null,
    'Claim' : IDL.Null,
    'Disburse' : IDL.Null,
  });
  const Advance = IDL.Record({ 'step' : Step, 'revision' : IDL.Nat64 });
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
    'plan_digest' : IDL.Vec(IDL.Nat8),
    'pending' : IDL.Opt(Pending),
    'plan' : Plan,
    'version' : IDL.Nat16,
    'staking_subaccount' : IDL.Vec(IDL.Nat8),
    'phase' : Phase,
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
