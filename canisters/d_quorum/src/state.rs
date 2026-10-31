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
#[derive(Clone, Debug, CandidType, Deserialize)]
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
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct Round {
    pub cache: quorum_ic_clients::evidence::Cache,
    pub economics: Option<quorum_ic_clients::governance::VotingContext>,
    pub intent_at: Option<u64>,
    pub last_readback_at: Option<u64>,
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
            cache: Default::default(),
            economics: None,
            intent_at: None,
            last_readback_at: None,
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
    pub readback_observed_at: Option<u64>,
    pub candidate_validated_at: Option<u64>,
    pub intended_at: Option<u64>,
    pub reward_valid_until: Option<u64>,
    pub economics: Option<quorum_ic_clients::governance::VotingContext>,
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
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct PayoutDraft {
    pub roster: Applied,
    pub ids: Vec<u64>,
    pub destinations: Vec<Destination>,
    pub offset: u32,
    pub started_at: u64,
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
#[derive(Clone, Debug, Default, CandidType, Serialize, Deserialize)]
pub struct Checkpoints {
    pub mutations: u64,
    pub writes: u64,
    pub bytes: u64,
    pub last_instructions: u64,
    pub maximum_instructions: u64,
    pub total_instructions: u64,
}
impl Applied {
    pub fn reward_eligible(&self, revision: u64, now: u64) -> bool {
        self.revision == revision
            && self.reward_valid_until.is_some_and(|t| now <= t)
            && self.candidate_validated_at.is_some()
            && self.economics.is_some()
    }
}
impl State {
    fn current_policy_pin() -> String {
        format!(
            "{}:{}:{}",
            quorum_policy::POLICY_REVISION,
            quorum_policy::EVALUATOR_COMMIT,
            quorum_policy::PROTOCOL_COMMIT
        )
    }
    pub fn new(i: Init, now: u64) -> Result<Self, String> {
        if i.mode != Mode::ObserveOnly && i.expected_target_controller.is_none() {
            return Err("write modes require the reviewed target controller".into());
        }
        Ok(Self {
            metrics: Default::default(),
            policy_pin: Self::current_policy_pin(),
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
        let pin = Self::current_policy_pin();
        if self.policy_pin != pin {
            self.policy_pin = pin;
            self.config.revision = self
                .config
                .revision
                .checked_add(1)
                .expect("revision overflow");
            self.config.mode = Mode::ObserveOnly;
            self.draft = None;
            // Preserve a dispatched write for readback, as with a configuration change.
            if !self
                .round
                .as_ref()
                .is_some_and(|r| matches!(r.phase, ScanPhase::Applying { sent: true }))
            {
                self.round = None;
            }
            for j in &mut self.jobs {
                j.next_at = 0;
            }
        }
        if self
            .round
            .as_ref()
            .is_some_and(|r| matches!(r.phase, ScanPhase::Applying { sent: true }))
        {
            self.jobs[0].next_at = 0; // Reconcile dispatched intent promptly after an upgrade.
        }
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
#[derive(Clone, Debug, CandidType, Deserialize)]
enum Versioned {
    V1(Box<crate::legacy::State>),
    V2(Box<State>),
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
    let b = candid::encode_one(Versioned::V2(Box::new(s.clone()))).expect("stable encode");
    assert!(b.len() <= 64 * 1024 * 1024, "stable state limit");
    b
}
pub fn decode(b: &[u8]) -> Result<State, String> {
    let v: Versioned = candid::decode_one(b).map_err(|e| e.to_string())?;
    if candid::encode_one(&v).map_err(|e| e.to_string())? != b {
        return Err("stable schema did not roundtrip losslessly".into());
    }
    let s = match v {
        Versioned::V2(s) => *s,
        Versioned::V1(s) => migrate_v1(*s)?,
    };
    if s.jobs.len() != 4
        || !(1..=15).contains(&s.config.delegates_per_topic)
        || s.payout.as_ref().is_some_and(|p| !p.invariant())
        || s.completed_payouts.iter().any(|p| !p.invariant())
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
        s.metrics.mutations = s
            .metrics
            .mutations
            .checked_add(1)
            .expect("mutation overflow");
        s.metrics.writes = s
            .metrics
            .writes
            .checked_add(1)
            .expect("checkpoint overflow");
        let before = instructions();
        let bytes = encode(s);
        s.metrics.bytes = bytes.len() as u64;
        stable(|c| {
            c.set(bytes);
        });
        let cost = instructions().saturating_sub(before);
        s.metrics.last_instructions = cost;
        s.metrics.maximum_instructions = s.metrics.maximum_instructions.max(cost);
        s.metrics.total_instructions = s.metrics.total_instructions.saturating_add(cost);
        r
    })
}
#[derive(Clone, Copy)]
pub struct Token {
    pub job: usize,
    pub generation: u64,
}
pub fn current(t: Token) -> bool {
    #[cfg(target_arch = "wasm32")]
    let now = ic_cdk::api::time() / 1_000_000_000;
    #[cfg(not(target_arch = "wasm32"))]
    let now = 0;
    read(|s| s.jobs[t.job].generation == t.generation && now < s.jobs[t.job].busy_until)
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
    fn policy_upgrade_invalidates_computation_but_preserves_obligations() {
        let mut s = State::new(
            Init {
                mode: Mode::Live,
                expected_target_controller: Some(Principal::anonymous()),
            },
            1,
        )
        .unwrap();
        s.policy_pin = "older-policy".into();
        s.round = Some(Round::new(1, 0, 1));
        let mut plan = Plan::build(
            1,
            1,
            100_000,
            10,
            1,
            0,
            vec![Destination {
                neuron_id: 10,
                subaccount: vec![1; 32],
                validated_at: 1,
            }],
        )
        .unwrap();
        plan.dispatch(0, 1).unwrap();
        let before = candid::encode_one(&plan).unwrap();
        s.payout = Some(plan);
        let mut restored = decode(&encode(&s)).unwrap();
        restored.recover();
        assert_eq!(restored.config.mode, Mode::ObserveOnly);
        assert_eq!(restored.config.revision, 1);
        assert_eq!(restored.policy_pin, State::current_policy_pin());
        assert!(restored.round.is_none());
        assert_eq!(
            candid::encode_one(restored.payout.unwrap()).unwrap(),
            before
        );
    }
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
        for phase in [
            ProposalPhase::Checking,
            ProposalPhase::Preflight,
            ProposalPhase::Intent,
            ProposalPhase::Ambiguous,
            ProposalPhase::Open(11),
            ProposalPhase::Adopted(11),
            ProposalPhase::Executed(11),
            ProposalPhase::AwaitingFinalization(11),
            ProposalPhase::FinalizedReceiptUnattributed(11),
            ProposalPhase::Rejected(11),
            ProposalPhase::Failed(11),
        ] {
            let mut staged = s.clone();
            staged.proposal.as_mut().unwrap().phase = phase.clone();
            let mut restored = decode(&encode(&staged)).unwrap();
            restored.recover();
            let expected = if matches!(phase, ProposalPhase::Intent) {
                ProposalPhase::Ambiguous
            } else {
                phase
            };
            let job = restored.proposal.unwrap();
            assert_eq!(
                candid::encode_one(job.phase).unwrap(),
                candid::encode_one(expected).unwrap()
            );
            assert_eq!(job.marker, "unique operation 7");
            assert_eq!(job.fingerprint, vec![4; 32]);
        }
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

fn instructions() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        ic_cdk::api::performance_counter(0)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        0
    }
}
pub fn guarded_if<R>(
    t: Token,
    p: impl FnOnce(&State) -> bool,
    f: impl FnOnce(&mut State) -> R,
) -> Option<R> {
    if !current(t) || !read(p) {
        return None;
    }
    Some(change(f))
}
fn migrate_v1(old: crate::legacy::State) -> Result<State, String> {
    fn wire<T: candid::CandidType + for<'d> serde::Deserialize<'d>>(
        x: impl candid::CandidType,
    ) -> Result<T, String> {
        candid::decode_one(&candid::encode_one(x).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())
    }
    let mut s = State::new(
        Init {
            mode: Mode::ObserveOnly,
            expected_target_controller: old.config.expected_target_controller,
        },
        old.initialized_at,
    )?;
    s.config.delegates_per_topic = old.config.delegates_per_topic;
    s.config.revision = old
        .config
        .revision
        .checked_add(1)
        .ok_or("revision overflow")?;
    s.jobs = wire(old.jobs)?;
    s.round_nonce = old.round_nonce;
    s.last_complete_scan = old.last_complete_scan;
    s.bootstrap = wire(old.bootstrap)?;
    s.proposer = old.proposer;
    s.proposal_nonce = old.proposal_nonce;
    s.proposal = wire(old.proposal)?;
    s.payout_nonce = old.payout_nonce;
    s.observed_balance = old.observed_balance;
    s.balance_observed_at = old.balance_observed_at;
    if let Some(a) = old.applied {
        s.applied = Some(Applied {
            round: a.round,
            revision: a.revision,
            reconciled_at: a.reconciled_at,
            scan_start: a.scan_start,
            scan_end: a.scan_end,
            rosters: a.rosters,
            readback_observed_at: None,
            candidate_validated_at: None,
            intended_at: None,
            reward_valid_until: Some(0),
            economics: None,
        });
    }
    if let Some(r) = old.round
        && matches!(r.phase, crate::legacy::ScanPhase::Applying { sent: true })
    {
        let mut n = Round::new(r.id, r.revision, r.started_at);
        n.phase = ScanPhase::Applying { sent: true };
        n.scan_ended_at = r.scan_ended_at;
        n.rosters = r.rosters;
        n.intended = r.intended;
        n.original_managers = r.original_managers;
        n.apply_attempts = r.apply_attempts;
        n.validated_at = r.validated_at;
        s.round = Some(n);
    }
    s.payout = old.payout.map(migrate_plan).transpose()?;
    s.completed_payouts = old
        .completed_payouts
        .into_iter()
        .map(migrate_plan)
        .collect::<Result<_, _>>()?;
    for j in &mut s.jobs {
        j.next_at = 0;
        j.busy_until = 0;
    }
    Ok(s)
}
fn migrate_plan(p: crate::legacy::accounting::Plan) -> Result<Plan, String> {
    use crate::legacy::accounting::TransferStatus as O;
    use quorum_accounting::{Attempt, RefreshState, Transfer, TransferStatus as N};
    let mut transfers = Vec::new();
    for t in p.transfers {
        let dispatched = !matches!(t.status, O::Prepared);
        let status = match t.status {
            O::Prepared => N::Prepared,
            O::Unknown { attempts } => N::Unknown { attempts },
            O::Verifying { block } => N::Verifying { block },
            O::Confirmed { block } => N::Confirmed { block },
            O::Held { reason } => N::Held {
                reason: format!("legacy execution ambiguity: {reason}"),
            },
        };
        let attempt = dispatched.then(|| Attempt {
            number: 1,
            fee: p.fee,
            memo: t.memo.clone(),
            created_at_time: t.created_at_time,
            may_have_executed: true,
        });
        let refresh = matches!(status, N::Confirmed { .. }).then_some(RefreshState::Pending);
        transfers.push(Transfer {
            destination: Destination {
                neuron_id: t.destination.neuron_id,
                subaccount: t.destination.subaccount,
                validated_at: t.destination.validated_at,
            },
            amount: t.amount,
            memo: t.memo,
            created_at_time: if dispatched { t.created_at_time } else { 0 },
            status,
            history_cursor: t.history_cursor,
            attempt,
            rejected_attempts: vec![],
            refresh,
        });
    }
    let n = Plan {
        id: p.id,
        roster_round: p.roster_round,
        balance: p.balance,
        observed_at: p.observed_at,
        fee: p.fee,
        dust: p.dust,
        ledger_anchor: p.ledger_anchor,
        transfers,
        initial_fee: p.fee,
        additional_fee_funding: 0,
    };
    if !n.invariant() {
        return Err("legacy financial invariant".into());
    }
    Ok(n)
}

#[cfg(test)]
mod migration_regressions {
    use super::*;
    fn old_state() -> crate::legacy::State {
        use crate::legacy as l;
        let jobs = (0..4)
            .map(|_| l::Job {
                generation: 4,
                busy_until: 99,
                next_at: 88,
                failures: 0,
                last_error: None,
                steps: 0,
                measured_instructions: 0,
                maximum_step_instructions: 0,
            })
            .collect();
        let mut r = l::Round::new(3, 0, 1);
        r.phase = l::ScanPhase::Applying { sent: true };
        r.scan_ended_at = Some(20);
        r.validated_at = Some(25);
        r.intended.insert(4, vec![100]);
        r.apply_attempts = 1;
        let states = [
            l::accounting::TransferStatus::Prepared,
            l::accounting::TransferStatus::Unknown { attempts: 2 },
            l::accounting::TransferStatus::Verifying { block: 20 },
            l::accounting::TransferStatus::Confirmed { block: 21 },
            l::accounting::TransferStatus::Held {
                reason: "BadFee or expired uncertainty".into(),
            },
        ];
        let transfers = states
            .into_iter()
            .enumerate()
            .map(|(i, status)| {
                let mut memo = b"DQUORUM1".to_vec();
                memo.extend(1u64.to_be_bytes());
                memo.extend((i as u64).to_be_bytes());
                l::accounting::Transfer {
                    destination: l::accounting::Destination {
                        neuron_id: i as u64 + 1,
                        subaccount: vec![i as u8 + 1; 32],
                        validated_at: 1,
                    },
                    amount: 100,
                    memo,
                    created_at_time: 1,
                    status,
                    history_cursor: 10,
                }
            })
            .collect();
        l::State {
            policy_pin: "selection-1/reward-roster-equal-1".into(),
            config: l::Config {
                mode: l::Mode::Live,
                expected_target_controller: Some(Principal::anonymous()),
                delegates_per_topic: 5,
                revision: 0,
            },
            jobs,
            round_nonce: 3,
            round: Some(r),
            applied: Some(l::Applied {
                round: 2,
                revision: 0,
                reconciled_at: 40,
                scan_start: 1,
                scan_end: 20,
                rosters: vec![],
            }),
            last_complete_scan: Some((1, 20)),
            bootstrap: l::Bootstrap::Ready(90),
            proposer: Some(90),
            proposal_nonce: 7,
            proposal: Some(l::ProposalJob {
                operation: 7,
                proposer: 90,
                created_at: 1,
                marker: "legacy_op".into(),
                fingerprint: vec![17; 32],
                phase: l::ProposalPhase::Intent,
                history_before: None,
                history_pages: 0,
                found: vec![],
                saw_disbursement: false,
                earliest_finalization: None,
                ledger_cursor: 10,
                receipt: None,
                retry_after: 0,
            }),
            payout_nonce: 1,
            draft: None,
            payout: Some(l::accounting::Plan {
                id: 1,
                roster_round: 2,
                balance: 550,
                observed_at: 1,
                fee: 10,
                dust: 0,
                ledger_anchor: 10,
                transfers,
            }),
            completed_payouts: vec![],
            observed_balance: Some(440),
            balance_observed_at: Some(1),
            initialized_at: 1,
        }
    }
    #[test]
    fn exact_v1_wire_migration_preserves_intents_and_ambiguous_held_liabilities() {
        let old = old_state();
        let bytes = candid::encode_one(Versioned::V1(Box::new(old))).unwrap();
        let mut new = decode(&bytes).unwrap();
        new.recover();
        assert_eq!(new.config.mode, Mode::ObserveOnly);
        assert_eq!(new.config.revision, 1);
        assert!(matches!(
            new.round.unwrap().phase,
            ScanPhase::Applying { sent: true }
        ));
        assert!(!new.applied.unwrap().reward_eligible(1, 40));
        let proposal = new.proposal.unwrap();
        assert!(matches!(proposal.phase, ProposalPhase::Ambiguous));
        assert_eq!(proposal.marker, "legacy_op");
        let p = new.payout.unwrap();
        assert!(p.invariant());
        assert_eq!(p.reserved().unwrap(), 440);
        assert!(p.transfers[0].attempt.is_none());
        assert_eq!(p.transfers[0].created_at_time, 0);
        for i in [1, 2, 3, 4] {
            assert_eq!(p.transfers[i].attempt.as_ref().unwrap().created_at_time, 1);
            assert!(p.transfers[i].attempt.as_ref().unwrap().may_have_executed);
        }
        assert!(matches!(
            p.transfers[4].status,
            quorum_accounting::TransferStatus::Held { .. }
        ));
        let mut again = p.clone();
        assert!(
            again
                .dispatch(4, 10 * quorum_accounting::RETRY_WINDOW_NS)
                .is_err()
        );
        assert_eq!(again.transfers[4], p.transfers[4]);
    }
    #[test]
    fn historical_readback_time_never_renews_underlying_observations() {
        let e = quorum_ic_clients::governance::Economics {
            neuron_minimum_stake_e8s: 1,
            neuron_management_fee_per_proposal_e8s: 1,
            voting_power_economics: Some(quorum_ic_clients::governance::VotingPowerEconomics {
                neuron_minimum_dissolve_delay_to_vote_seconds: Some(1_209_600),
                start_reducing_voting_power_after_seconds: None,
                clear_following_after_seconds: None,
            }),
        };
        let a = Applied {
            round: 1,
            revision: 0,
            reconciled_at: 30 * DAY,
            readback_observed_at: Some(30 * DAY),
            candidate_validated_at: Some(100),
            intended_at: Some(110),
            reward_valid_until: Some(1 + ROSTER_MAX_AGE),
            scan_start: 1,
            scan_end: 90,
            rosters: vec![],
            economics: Some(
                quorum_ic_clients::governance::VotingContext::resolve(&e, None).unwrap(),
            ),
        };
        assert!(!a.reward_eligible(0, 30 * DAY));
    }
}
