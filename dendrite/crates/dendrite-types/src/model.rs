use candid::{CandidType, Principal};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(
    Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, CandidType, Deserialize, Serialize,
)]
pub enum RuleStatus {
    Pass,
    Fail,
    Warning,
    Indeterminate,
    StandardUpdateRequired,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub enum ComplianceStatus {
    Compliant,
    NonCompliant,
    Indeterminate,
    StandardUpdateRequired,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct RuleResult {
    pub rule_id: String,
    pub status: RuleStatus,
    pub message: String,
    pub observed: Option<String>,
    pub expected: Option<String>,
    pub related_neuron_ids: Vec<u64>,
    pub relevant_topic: Option<i32>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct KnownNeuron {
    pub id: u64,
    pub name: String,
    pub description: Option<String>,
    pub links: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub enum SourceFailureKind {
    Rejected,
    DecodeFailed,
    InvalidResponse,
    ResponseTooLarge,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct SourceFailure {
    pub method: String,
    pub kind: SourceFailureKind,
    pub message: String,
    pub affected_neuron_ids: Vec<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct NeuronEvidence {
    pub id: u64,
    pub controller: Option<Principal>,
    pub known_data: Option<KnownNeuron>,
    pub hot_keys: Vec<Principal>,
    pub not_for_profit: Option<bool>,
    pub dissolve_delay_seconds: Option<u64>,
    pub dissolving: Option<bool>,
    pub effective_stake_e8s: Option<u64>,
    pub minted_stake_e8s: Option<u64>,
    pub voting_power_refreshed_timestamp_seconds: Option<u64>,
    pub potential_voting_power: Option<u64>,
    pub deciding_voting_power: Option<u64>,
    pub committed_topics: Vec<i32>,
    pub followees: BTreeMap<i32, Vec<u64>>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub enum NeuronLookup {
    Found(Box<NeuronEvidence>),
    ConfirmedMissing,
    Unavailable,
}

impl NeuronLookup {
    pub fn as_ref(&self) -> Option<&NeuronEvidence> {
        match self {
            Self::Found(neuron) => Some(neuron),
            Self::ConfirmedMissing | Self::Unavailable => None,
        }
    }

    pub fn as_mut(&mut self) -> Option<&mut NeuronEvidence> {
        match self {
            Self::Found(neuron) => Some(neuron),
            Self::ConfirmedMissing | Self::Unavailable => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct ControllerEvidence {
    pub call_succeeded: bool,
    pub module_hash: Option<Vec<u8>>,
    pub controllers: Vec<Principal>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct EvaluationEvidence {
    pub now_seconds: u64,
    pub target: NeuronLookup,
    pub dependencies: BTreeMap<u64, NeuronLookup>,
    pub controller: Option<ControllerEvidence>,
    pub source_failures: Vec<SourceFailure>,
    pub unknown_committed_topics: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct TargetSummary {
    pub neuron_id: u64,
    pub known_neuron: Option<KnownNeuron>,
    pub controller: Option<Principal>,
    pub hot_keys: Vec<Principal>,
    pub not_for_profit: Option<bool>,
    pub dissolve_delay_seconds: Option<u64>,
    pub dissolving: Option<bool>,
    pub effective_stake_e8s: Option<u64>,
    pub voting_power_refreshed_timestamp_seconds: Option<u64>,
    pub potential_voting_power: Option<u64>,
    pub deciding_voting_power: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub enum ManagerEvidenceStatus {
    Found,
    ConfirmedMissing,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct ManagerSummary {
    pub neuron_id: u64,
    pub evidence_status: ManagerEvidenceStatus,
    pub known_neuron: Option<KnownNeuron>,
    pub controller: Option<Principal>,
    pub hot_keys: Vec<Principal>,
    pub minted_stake_e8s: Option<u64>,
    pub neuron_management_followees: Vec<u64>,
    pub omega_ready_topics: Vec<i32>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct TopicSummary {
    pub topic: i32,
    pub delegate_ids: Vec<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct NonCommittedTopicCheck {
    pub topic: i32,
    pub followee_ids: Vec<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct ControllerSummary {
    pub principal: Option<Principal>,
    pub call_succeeded: bool,
    pub module_hash: Option<Vec<u8>>,
    pub controllers: Vec<Principal>,
}

#[derive(Clone, Debug, Eq, PartialEq, CandidType, Deserialize, Serialize)]
pub struct ComplianceReport {
    pub standard_version: String,
    pub neuron_id: u64,
    pub checked_at_timestamp_seconds: u64,
    pub overall_status: ComplianceStatus,
    pub target: Option<TargetSummary>,
    pub managers: Vec<ManagerSummary>,
    pub committed_topics: Vec<TopicSummary>,
    pub non_committed_topics: Vec<NonCommittedTopicCheck>,
    pub controller: Option<ControllerSummary>,
    pub rules: Vec<RuleResult>,
    pub quorum_threshold: Option<u8>,
    pub source_revision: String,
    pub source_failures: Vec<SourceFailure>,
}
