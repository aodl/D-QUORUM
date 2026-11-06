export const idlFactory = ({ IDL }) => {
  const ControllerSummary = IDL.Record({
    'principal' : IDL.Opt(IDL.Principal),
    'controllers' : IDL.Vec(IDL.Principal),
    'call_succeeded' : IDL.Bool,
    'module_hash' : IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const KnownNeuron = IDL.Record({
    'id' : IDL.Nat64,
    'name' : IDL.Text,
    'description' : IDL.Opt(IDL.Text),
    'links' : IDL.Vec(IDL.Text),
  });
  const ManagerEvidenceStatus = IDL.Variant({
    'Unavailable' : IDL.Null,
    'ConfirmedMissing' : IDL.Null,
    'Found' : IDL.Null,
  });
  const ManagerSummary = IDL.Record({
    'controller' : IDL.Opt(IDL.Principal),
    'evidence_status' : ManagerEvidenceStatus,
    'hot_keys' : IDL.Vec(IDL.Principal),
    'known_neuron' : IDL.Opt(KnownNeuron),
    'neuron_id' : IDL.Nat64,
    'minted_stake_e8s' : IDL.Opt(IDL.Nat64),
    'neuron_management_followees' : IDL.Vec(IDL.Nat64),
    'omega_ready_topics' : IDL.Vec(IDL.Int32),
  });
  const TopicSummary = IDL.Record({
    'topic' : IDL.Int32,
    'delegate_ids' : IDL.Vec(IDL.Nat64),
  });
  const ComplianceStatus = IDL.Variant({
    'Indeterminate' : IDL.Null,
    'NonCompliant' : IDL.Null,
    'StandardUpdateRequired' : IDL.Null,
    'Compliant' : IDL.Null,
  });
  const SourceFailureKind = IDL.Variant({
    'ResponseTooLarge' : IDL.Null,
    'InvalidResponse' : IDL.Null,
    'Rejected' : IDL.Null,
    'DecodeFailed' : IDL.Null,
  });
  const SourceFailure = IDL.Record({
    'method' : IDL.Text,
    'kind' : SourceFailureKind,
    'affected_neuron_ids' : IDL.Vec(IDL.Nat64),
    'message' : IDL.Text,
  });
  const TargetSummary = IDL.Record({
    'controller' : IDL.Opt(IDL.Principal),
    'dissolve_delay_seconds' : IDL.Opt(IDL.Nat64),
    'voting_power_refreshed_timestamp_seconds' : IDL.Opt(IDL.Nat64),
    'potential_voting_power' : IDL.Opt(IDL.Nat64),
    'not_for_profit' : IDL.Opt(IDL.Bool),
    'deciding_voting_power' : IDL.Opt(IDL.Nat64),
    'hot_keys' : IDL.Vec(IDL.Principal),
    'effective_stake_e8s' : IDL.Opt(IDL.Nat64),
    'known_neuron' : IDL.Opt(KnownNeuron),
    'dissolving' : IDL.Opt(IDL.Bool),
    'neuron_id' : IDL.Nat64,
  });
  const RuleStatus = IDL.Variant({
    'Fail' : IDL.Null,
    'Pass' : IDL.Null,
    'Indeterminate' : IDL.Null,
    'Warning' : IDL.Null,
    'StandardUpdateRequired' : IDL.Null,
  });
  const RuleResult = IDL.Record({
    'status' : RuleStatus,
    'related_neuron_ids' : IDL.Vec(IDL.Nat64),
    'observed' : IDL.Opt(IDL.Text),
    'expected' : IDL.Opt(IDL.Text),
    'message' : IDL.Text,
    'rule_id' : IDL.Text,
    'relevant_topic' : IDL.Opt(IDL.Int32),
  });
  const NonCommittedTopicCheck = IDL.Record({
    'topic' : IDL.Int32,
    'followee_ids' : IDL.Vec(IDL.Nat64),
  });
  const ComplianceReport = IDL.Record({
    'controller' : IDL.Opt(ControllerSummary),
    'managers' : IDL.Vec(ManagerSummary),
    'source_revision' : IDL.Text,
    'committed_topics' : IDL.Vec(TopicSummary),
    'overall_status' : ComplianceStatus,
    'source_failures' : IDL.Vec(SourceFailure),
    'target' : IDL.Opt(TargetSummary),
    'rules' : IDL.Vec(RuleResult),
    'quorum_threshold' : IDL.Opt(IDL.Nat8),
    'checked_at_timestamp_seconds' : IDL.Nat64,
    'non_committed_topics' : IDL.Vec(NonCommittedTopicCheck),
    'standard_version' : IDL.Text,
    'neuron_id' : IDL.Nat64,
  });
  const DendriteError = IDL.Variant({
    'GlobalRateLimit' : IDL.Record({ 'retry_after_seconds' : IDL.Nat64 }),
    'InvalidNeuronId' : IDL.Text,
    'AnalysisFailed' : IDL.Text,
    'LowCycles' : IDL.Null,
    'ConcurrencyLimit' : IDL.Null,
    'DuplicateInFlight' : IDL.Null,
  });
  const HeaderField = IDL.Tuple(IDL.Text, IDL.Text);
  const HttpRequest = IDL.Record({
    'url' : IDL.Text,
    'method' : IDL.Text,
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HeaderField),
    'certificate_version' : IDL.Opt(IDL.Nat16),
  });
  const HttpResponse = IDL.Record({
    'body' : IDL.Vec(IDL.Nat8),
    'headers' : IDL.Vec(HeaderField),
    'upgrade' : IDL.Opt(IDL.Bool),
    'status_code' : IDL.Nat16,
  });
  return IDL.Service({
    'check_neuron' : IDL.Func(
        [IDL.Nat64],
        [IDL.Variant({ 'Ok' : ComplianceReport, 'Err' : DendriteError })],
        [],
      ),
    'http_request' : IDL.Func([HttpRequest], [HttpResponse], ['query']),
  });
};
export const init = ({ IDL }) => { return []; };
