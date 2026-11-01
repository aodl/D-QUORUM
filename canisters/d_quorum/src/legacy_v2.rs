//! Exact RC2 V2 financial/proposal wire shapes, frozen from e14c9cb.
//! Unchanged observation/configuration types are shared; no current financial type is used here.
use self::accounting::Plan;
pub use crate::state::{Applied, Bootstrap, Checkpoints, Config, Job, PayoutDraft, Round};
use candid::CandidType;
use serde::{Deserialize, Serialize};
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
    CreationRejected { error_type: i32, reason: String },
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
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct State {
    pub metrics: Checkpoints,
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
    use candid::CandidType;
    use serde::{Deserialize, Serialize};
    #[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
    pub struct Destination {
        pub neuron_id: u64,
        pub subaccount: Vec<u8>,
        pub validated_at: u64,
    }
    #[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
    pub enum TransferStatus {
        Prepared,
        Rejected { reason: String },
        Unknown { attempts: u32 },
        Verifying { block: u64 },
        Confirmed { block: u64 },
        Held { reason: String },
    }
    #[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
    pub enum RefreshState {
        Pending,
        Complete,
        Waiting { reason: String },
    }
    #[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
    pub struct Attempt {
        pub number: u32,
        pub fee: u64,
        pub memo: Vec<u8>,
        pub created_at_time: u64,
        pub may_have_executed: bool,
    }
    #[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
    pub struct Transfer {
        pub destination: Destination,
        pub amount: u64,
        /// Compatibility views of the current attempt. Zero time means never dispatched.
        pub memo: Vec<u8>,
        pub created_at_time: u64,
        pub status: TransferStatus,
        pub history_cursor: u64,
        pub attempt: Option<Attempt>,
        pub rejected_attempts: Vec<Attempt>,
        pub refresh: Option<RefreshState>,
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
        pub initial_fee: u64,
        pub additional_fee_funding: u64,
    }
}
