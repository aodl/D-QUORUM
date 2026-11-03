import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface ComplianceReport {
  'controller' : [] | [ControllerSummary],
  'managers' : Array<ManagerSummary>,
  'source_revision' : string,
  'committed_topics' : Array<TopicSummary>,
  'overall_status' : ComplianceStatus,
  'source_failures' : Array<SourceFailure>,
  'target' : [] | [TargetSummary],
  'rules' : Array<RuleResult>,
  'quorum_threshold' : [] | [number],
  'checked_at_timestamp_seconds' : bigint,
  'non_committed_topics' : Array<NonCommittedTopicCheck>,
  'standard_version' : string,
  'neuron_id' : bigint,
  'minted_stake_e8s' : [] | [bigint],
  'neuron_management_followees' : BigUint64Array | bigint[],
  'omega_ready_topics' : Int32Array | number[],
}
export type ComplianceStatus = { 'Indeterminate' : null } |
  { 'NonCompliant' : null } |
  { 'StandardUpdateRequired' : null } |
  { 'Compliant' : null };
export interface ControllerSummary {
  'principal' : [] | [Principal],
  'controllers' : Array<Principal>,
  'call_succeeded' : boolean,
  'module_hash' : [] | [Uint8Array | number[]],
}
export type DendriteError = { 'GlobalRateLimit' : { 'retry_after_seconds' : bigint } } |
  { 'InvalidNeuronId' : string } |
  { 'AnalysisFailed' : string } |
  { 'LowCycles' : null } |
  { 'ConcurrencyLimit' : null } |
  { 'DuplicateInFlight' : null };
export type HeaderField = [string, string];
export interface HttpRequest {
  'url' : string,
  'method' : string,
  'body' : Uint8Array | number[],
  'headers' : Array<HeaderField>,
  'certificate_version' : [] | [number],
}
export interface HttpResponse {
  'body' : Uint8Array | number[],
  'headers' : Array<HeaderField>,
  'upgrade' : [] | [boolean],
  'status_code' : number,
}
export interface KnownNeuron {
  'id' : bigint,
  'name' : string,
  'description' : [] | [string],
  'links' : Array<string>,
}
export interface ManagerSummary {
  'controller' : [] | [Principal],
  'evidence_status' : ManagerEvidenceStatus,
  'hot_keys' : Array<Principal>,
  'known_neuron' : [] | [KnownNeuron],
  'neuron_id' : bigint,
}
export type ManagerEvidenceStatus = { 'Unavailable' : null } |
  { 'ConfirmedMissing' : null } |
  { 'Found' : null };
export interface NonCommittedTopicCheck {
  'topic' : number,
  'followee_ids' : BigUint64Array | bigint[],
}
export interface RuleResult {
  'status' : RuleStatus,
  'related_neuron_ids' : BigUint64Array | bigint[],
  'observed' : [] | [string],
  'expected' : [] | [string],
  'message' : string,
  'rule_id' : string,
  'relevant_topic' : [] | [number],
}
export type RuleStatus = { 'Fail' : null } |
  { 'Pass' : null } |
  { 'Indeterminate' : null } |
  { 'Warning' : null } |
  { 'StandardUpdateRequired' : null };
export interface SourceFailure {
  'method' : string,
  'kind' : SourceFailureKind,
  'affected_neuron_ids' : BigUint64Array | bigint[],
  'message' : string,
}
export type SourceFailureKind = { 'ResponseTooLarge' : null } |
  { 'InvalidResponse' : null } |
  { 'Rejected' : null } |
  { 'DecodeFailed' : null };
export interface TargetSummary {
  'controller' : [] | [Principal],
  'dissolve_delay_seconds' : [] | [bigint],
  'voting_power_refreshed_timestamp_seconds' : [] | [bigint],
  'potential_voting_power' : [] | [bigint],
  'not_for_profit' : [] | [boolean],
  'deciding_voting_power' : [] | [bigint],
  'hot_keys' : Array<Principal>,
  'effective_stake_e8s' : [] | [bigint],
  'known_neuron' : [] | [KnownNeuron],
  'dissolving' : [] | [boolean],
  'neuron_id' : bigint,
}
export interface TopicSummary {
  'topic' : number,
  'delegate_ids' : BigUint64Array | bigint[],
}
export interface _SERVICE {
  'check_neuron' : ActorMethod<
    [bigint],
    { 'Ok' : ComplianceReport } |
      { 'Err' : DendriteError }
  >,
  'http_request' : ActorMethod<[HttpRequest], HttpResponse>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
