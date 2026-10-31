//! Exact V1 wire schema retained solely for lossless migration.
use self::accounting::{Destination, Plan};
use candid::{CandidType, Principal};
use dendrite_types::ComplianceStatus;
use dendrite_types::EvaluationEvidence;
use quorum_policy::{Candidate, Roster, Scores};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
#[derive(Clone, Debug, CandidType, Serialize, Deserialize, PartialEq, Eq)]
pub enum Phase {
    Target,
    TargetMetadata,
    Dependencies(u32),
    DependencyMetadata(u32),
    Controller,
    Done,
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct Collection {
    pub id: u64,
    pub phase: Phase,
    pub evidence: EvaluationEvidence,
    pub dependencies: Vec<u64>,
    pub dependency_timestamps: BTreeMap<u64, u64>,
}
#[derive(Clone, Copy, Debug, CandidType, Serialize, Deserialize, PartialEq, Eq)]
pub enum Mode {
    ObserveOnly,
    BootstrapInactive,
    Live,
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct Config {
    pub mode: Mode,
    pub expected_target_controller: Option<Principal>,
    pub delegates_per_topic: u8,
    pub revision: u64,
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize, Default)]
pub struct Job {
    pub generation: u64,
    pub busy_until: u64,
    pub next_at: u64,
    pub failures: u32,
    pub last_error: Option<String>,
    pub steps: u64,
    pub measured_instructions: u64,
    pub maximum_step_instructions: u64,
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct CandidateResult {
    pub id: u64,
    pub status: ComplianceStatus,
    pub checked_at: u64,
    pub admitted: Option<Candidate>,
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub enum ScanPhase {
    Discover,
    Candidates {
        offset: u32,
        work: Option<Collection>,
    },
    Index {
        cursor: Option<u64>,
        pending: Vec<u64>,
        end_cursor: Option<u64>,
    },
    Select,
    Revalidate {
        ids: Vec<u64>,
        offset: u32,
        work: Option<Collection>,
    },
    Cycles {
        topic: u32,
        todo: Vec<u64>,
        visited: BTreeSet<u64>,
    },
    Ready,
    Applying {
        sent: bool,
    },
    Complete,
    Failed(String),
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct Round {
    pub id: u64,
    pub revision: u64,
    pub started_at: u64,
    pub scan_ended_at: Option<u64>,
    pub phase: ScanPhase,
    pub known: Vec<u64>,
    pub candidates: BTreeMap<u64, Candidate>,
    pub outcomes: BTreeMap<u64, CandidateResult>,
    pub scores: Scores,
    pub pages: u64,
    pub full_batches: u64,
    pub public_observations: u64,
    pub failures: u64,
    pub last_failure: Option<String>,
    pub rosters: Vec<Roster>,
    pub validated_at: Option<u64>,
    pub intended: BTreeMap<i32, Vec<u64>>,
    pub original_managers: Vec<u64>,
    pub apply_attempts: u32,
}
#[cfg(test)]
impl Round {
    pub fn new(id: u64, revision: u64, now: u64) -> Self {
        Self {
            id,
            revision,
            started_at: now,
            scan_ended_at: None,
            phase: ScanPhase::Discover,
            known: vec![],
            candidates: BTreeMap::new(),
            outcomes: BTreeMap::new(),
            scores: BTreeMap::new(),
            pages: 0,
            full_batches: 0,
            public_observations: 0,
            failures: 0,
            last_failure: None,
            rosters: vec![],
            validated_at: None,
            intended: BTreeMap::new(),
            original_managers: vec![],
            apply_attempts: 0,
        }
    }
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct Applied {
    pub round: u64,
    pub revision: u64,
    pub reconciled_at: u64,
    pub scan_start: u64,
    pub scan_end: u64,
    pub rosters: Vec<Roster>,
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub enum Bootstrap {
    Inactive,
    WaitingFunding,
    Claiming,
    Verifying(u64),
    Ready(u64),
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub enum ProposalPhase {
    Checking,
    Preflight,
    Intent,
    Ambiguous,
    Open(u64),
    Adopted(u64),
    Executed(u64),
    AwaitingFinalization(u64),
    FinalizedReceiptUnattributed(u64),
    Rejected(u64),
    Failed(u64),
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct ProposalJob {
    pub operation: u64,
    pub proposer: u64,
    pub created_at: u64,
    pub marker: String,
    pub fingerprint: Vec<u8>,
    pub phase: ProposalPhase,
    pub history_before: Option<u64>,
    pub history_pages: u64,
    pub found: Vec<u64>,
    pub saw_disbursement: bool,
    pub earliest_finalization: Option<u64>,
    pub ledger_cursor: u64,
    pub receipt: Option<(u64, u64)>,
    pub retry_after: u64,
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct PayoutDraft {
    pub roster: Applied,
    pub ids: Vec<u64>,
    pub destinations: Vec<Destination>,
    pub offset: u32,
    pub started_at: u64,
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct State {
    pub policy_pin: String,
    pub config: Config,
    pub jobs: Vec<Job>,
    pub round_nonce: u64,
    pub round: Option<Round>,
    pub applied: Option<Applied>,
    pub last_complete_scan: Option<(u64, u64)>,
    pub bootstrap: Bootstrap,
    pub proposer: Option<u64>,
    pub proposal_nonce: u64,
    pub proposal: Option<ProposalJob>,
    pub payout_nonce: u64,
    pub draft: Option<PayoutDraft>,
    pub payout: Option<Plan>,
    pub completed_payouts: Vec<Plan>,
    pub observed_balance: Option<u64>,
    pub balance_observed_at: Option<u64>,
    pub initialized_at: u64,
}

pub mod accounting {
    use super::*;
    #[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
    pub struct Destination {
        pub neuron_id: u64,
        pub subaccount: Vec<u8>,
        pub validated_at: u64,
    }
    #[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
    pub enum TransferStatus {
        Prepared,
        Unknown { attempts: u32 },
        Verifying { block: u64 },
        Confirmed { block: u64 },
        Held { reason: String },
    }
    #[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
    pub struct Transfer {
        pub destination: Destination,
        pub amount: u64,
        pub memo: Vec<u8>,
        pub created_at_time: u64,
        pub status: TransferStatus,
        pub history_cursor: u64,
    }
    #[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
    pub struct Plan {
        pub id: u64,
        pub roster_round: u64,
        pub balance: u64,
        pub observed_at: u64,
        pub fee: u64,
        pub dust: u64,
        pub ledger_anchor: u64,
        pub transfers: Vec<Transfer>,
    }
}
