use candid::{CandidType, Principal};
use dendrite_types::ComplianceStatus;
use ic_stable_structures::{
    DefaultMemoryImpl, StableCell,
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
};
use quorum_accounting::{Destination, Plan};
use quorum_ic_clients::evidence::Collection;
use quorum_policy::{Candidate, Roster, Scores};
use serde::{Deserialize, Serialize};
use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
};
pub const DAY: u64 = 86_400;
pub const MAX_ROUND_AGE: u64 = 3 * DAY;
pub const ROSTER_MAX_AGE: u64 = 8 * DAY;
pub const BOOTSTRAP_NONCE: u64 = 0x4451554f52554d31;
#[derive(Clone, Copy, Debug, CandidType, Serialize, Deserialize, PartialEq, Eq)]
pub enum Mode {
    ObserveOnly,
    BootstrapInactive,
    Live,
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct Init {
    pub mode: Mode,
    pub expected_target_controller: Option<Principal>,
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
impl State {
    pub fn new(i: Init, now: u64) -> Result<Self, String> {
        if i.mode != Mode::ObserveOnly && i.expected_target_controller.is_none() {
            return Err("write modes require the reviewed target controller".into());
        }
        Ok(Self {
            config: Config {
                mode: i.mode,
                expected_target_controller: i.expected_target_controller,
                delegates_per_topic: 5,
                revision: 0,
            },
            jobs: vec![Job::default(); 4],
            round_nonce: 0,
            round: None,
            applied: None,
            last_complete_scan: None,
            bootstrap: Bootstrap::Inactive,
            proposer: None,
            proposal_nonce: 0,
            proposal: None,
            payout_nonce: 0,
            draft: None,
            payout: None,
            completed_payouts: vec![],
            observed_balance: None,
            balance_observed_at: None,
            initialized_at: now,
        })
    }
    pub fn set_count(&mut self, caller: Principal, count: u8) -> Result<u64, String> {
        if caller != quorum_ic_clients::GOVERNANCE {
            return Err("only NNS Governance may set roster size".into());
        }
        if !(1..=15).contains(&count) {
            return Err("count must be 1..=15".into());
        }
        self.config.revision = self
            .config
            .revision
            .checked_add(1)
            .ok_or("revision overflow")?;
        self.config.delegates_per_topic = count;
        // A dispatched write must first be reconciled; all other old computations are invalidated.
        if !self
            .round
            .as_ref()
            .is_some_and(|r| matches!(r.phase, ScanPhase::Applying { sent: true }))
        {
            self.round = None;
            self.jobs[0].generation += 1;
            self.jobs[0].busy_until = 0;
        }
        self.jobs[0].next_at = 0;
        self.draft = None;
        Ok(self.config.revision)
    }
    pub fn recover(&mut self) {
        for j in &mut self.jobs {
            j.generation = j.generation.checked_add(1).expect("generation overflow");
            j.busy_until = 0;
        }
        if self
            .proposal
            .as_ref()
            .is_some_and(|p| matches!(p.phase, ProposalPhase::Intent))
        {
            self.proposal.as_mut().unwrap().phase = ProposalPhase::Ambiguous;
        }
    }
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
enum Versioned {
    V1(State),
}
type Memory = VirtualMemory<DefaultMemoryImpl>;
thread_local! {
 static MANAGER:RefCell<MemoryManager<DefaultMemoryImpl>>=RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));
 static CELL:RefCell<Option<StableCell<Vec<u8>,Memory>>>=const{RefCell::new(None)};
 static STATE:RefCell<Option<State>>=const{RefCell::new(None)};
}
fn stable<R>(f: impl FnOnce(&mut StableCell<Vec<u8>, Memory>) -> R) -> R {
    CELL.with(|c| {
        if c.borrow().is_none() {
            let mem = MANAGER.with(|m| m.borrow().get(MemoryId::new(0)));
            *c.borrow_mut() = Some(StableCell::init(mem, vec![]));
        }
        f(c.borrow_mut().as_mut().unwrap())
    })
}
pub fn encode(s: &State) -> Vec<u8> {
    let b = candid::encode_one(Versioned::V1(s.clone())).expect("stable encode");
    assert!(b.len() <= 64 * 1024 * 1024, "stable state limit");
    b
}
pub fn decode(b: &[u8]) -> Result<State, String> {
    let v: Versioned = candid::decode_one(b).map_err(|e| e.to_string())?;
    if candid::encode_one(&v).map_err(|e| e.to_string())? != b {
        return Err("stable schema did not roundtrip losslessly".into());
    }
    let Versioned::V1(s) = v;
    if s.jobs.len() != 4
        || !(1..=15).contains(&s.config.delegates_per_topic)
        || s.payout.as_ref().is_some_and(|p| !p.invariant())
    {
        return Err("stable invariants".into());
    }
    Ok(s)
}
pub fn install(s: State) {
    stable(|c| {
        c.set(encode(&s));
    });
    STATE.with(|x| *x.borrow_mut() = Some(s));
}
pub fn restore() {
    let b = stable(|c| c.get().clone());
    let mut s = decode(&b).expect("unsupported or corrupted stable state");
    s.recover();
    install(s);
}
pub fn read<R>(f: impl FnOnce(&State) -> R) -> R {
    STATE.with(|s| f(s.borrow().as_ref().expect("initialized")))
}
pub fn change<R>(f: impl FnOnce(&mut State) -> R) -> R {
    STATE.with(|s| {
        let mut b = s.borrow_mut();
        let s = b.as_mut().expect("initialized");
        let r = f(s);
        stable(|c| {
            c.set(encode(s));
        });
        r
    })
}
#[derive(Clone, Copy)]
pub struct Token {
    pub job: usize,
    pub generation: u64,
}
pub fn current(t: Token) -> bool {
    read(|s| s.jobs[t.job].generation == t.generation)
}
pub fn guarded<R>(t: Token, f: impl FnOnce(&mut State) -> R) -> Option<R> {
    if !current(t) {
        return None;
    }
    Some(change(f))
}
pub fn snapshot_size() -> u64 {
    read(|s| encode(s).len() as u64)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn setter_only_governance_and_recovery() {
        let mut s = State::new(
            Init {
                mode: Mode::ObserveOnly,
                expected_target_controller: None,
            },
            1,
        )
        .unwrap();
        for p in [
            Principal::anonymous(),
            Principal::management_canister(),
            Principal::from_slice(&[1, 2, 3]),
        ] {
            assert!(s.set_count(p, 5).is_err());
        }
        assert!(s.set_count(quorum_ic_clients::GOVERNANCE, 0).is_err());
        assert!(s.set_count(quorum_ic_clients::GOVERNANCE, 16).is_err());
        s.round = Some(Round::new(1, 0, 1));
        s.set_count(quorum_ic_clients::GOVERNANCE, 15).unwrap();
        assert!(s.round.is_none());
        assert_eq!(s.config.revision, 1);
        let mut restored = decode(&encode(&s)).unwrap();
        restored.recover();
        assert_eq!(restored.config.delegates_per_topic, 15);
        assert!(decode(b"bad").is_err());
    }
    #[test]
    fn observe_is_default_boundary() {
        assert!(
            State::new(
                Init {
                    mode: Mode::Live,
                    expected_target_controller: None
                },
                1
            )
            .is_err()
        );
    }
    #[test]
    fn upgrade_fences_workers_and_keeps_ambiguous_proposal_identity() {
        let mut s = State::new(
            Init {
                mode: Mode::ObserveOnly,
                expected_target_controller: None,
            },
            1,
        )
        .unwrap();
        s.proposal = Some(ProposalJob {
            operation: 7,
            proposer: 9,
            created_at: 1,
            marker: "unique operation 7".into(),
            fingerprint: vec![4; 32],
            phase: ProposalPhase::Intent,
            history_before: None,
            history_pages: 0,
            found: vec![],
            saw_disbursement: false,
            earliest_finalization: None,
            ledger_cursor: 0,
            receipt: None,
            retry_after: 0,
        });
        install(s);
        let t = Token {
            job: 0,
            generation: 0,
        };
        change(State::recover);
        assert!(guarded(t, |s| s.proposal = None).is_none());
        let encoded = read(encode);
        let restored = decode(&encoded).unwrap();
        let intent = restored.proposal.unwrap();
        assert!(matches!(intent.phase, ProposalPhase::Ambiguous));
        assert_eq!(intent.operation, 7);
        assert_eq!(intent.fingerprint, vec![4; 32]);
        assert_eq!(intent.marker, "unique operation 7");
    }
}
