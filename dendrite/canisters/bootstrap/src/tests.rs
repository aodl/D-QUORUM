use super::{
    engine::{self, CreationClient},
    model::*,
    protocol::*,
};
use candid::{Principal, Reserved};
use ic_clients::{
    CanisterInfoResponse, DissolveState, Followees, KnownNeuronData, NeuronId, NeuronInfo,
};
use std::{
    cell::{Cell, RefCell},
    future::Future,
    pin::pin,
    sync::Arc,
    task::{Context, Poll, Wake, Waker},
};

fn block<F: Future>(future: F) -> F::Output {
    struct Noop;
    impl Wake for Noop {
        fn wake(self: Arc<Self>) {}
    }
    let waker = Waker::from(Arc::new(Noop));
    let mut cx = Context::from_waker(&waker);
    let mut future = pin!(future);
    match future.as_mut().poll(&mut cx) {
        Poll::Ready(value) => value,
        Poll::Pending => panic!("recording client unexpectedly yielded"),
    }
}
fn plan(production: bool) -> Plan {
    let owner = Principal::self_authenticating([7; 32]);
    let managers = if production {
        vec![11, 12, 13, 14, 15]
    } else {
        vec![11]
    };
    let following = if production {
        dendrite_types::RECOGNISED_TOPICS
            .into_iter()
            .map(|topic| Following {
                topic,
                followees: match topic {
                    1 => managers.clone(),
                    4 => vec![11, 12, 13],
                    _ => vec![dendrite_types::ALPHA_VOTE_NEURON_ID],
                },
            })
            .collect()
    } else {
        vec![Following {
            topic: 1,
            followees: managers.clone(),
        }]
    };
    Plan {
        version: VERSION,
        profile: if production {
            Profile::ProductionCandidate
        } else {
            Profile::RecoverableTest
        },
        owner,
        network: Network::Local,
        dendrite_service: candid::Principal::from_text("pi33i-pt777-77776-aaaaa-cai").unwrap(),
        origin: "http://pi33i-pt777-77776-aaaaa-cai.localhost:4943".into(),
        api_host: "http://127.0.0.1:4943".into(),
        funding_budget_e8s: 200_010_000,
        provision_cycles: 2_000_000_000_000,
        policy_version: dendrite_types::STANDARD_VERSION.into(),
        creation_id: vec![3; 32],
        nonce: 42,
        revision: 1,
        policy_revision: dendrite_types::SOURCE_REVISION.into(),
        bootstrap_sha256: vec![8; 32],
        managers,
        committed_topics: if production { vec![4] } else { vec![] },
        following,
        stake_e8s: 200_000_000,
        lock_seconds: if production {
            dendrite_types::MAX_DISSOLVE_DELAY_SECONDS
        } else {
            INITIAL_CLAIM_LOCK_SECONDS
        },
        cycle_reserve: MIN_RESERVE,
        return_account: legacy_account(owner, &[0; 32]),
        metadata: Some(Metadata {
            name: "Provisional creation".into(),
            description: "Creator retains recoverable control".into(),
            links: vec![],
        }),
    }
}
fn state(production: bool) -> State {
    State::new(
        plan(production),
        Principal::from_slice(&[0, 0, 0, 0, 0, 0, 0, 9, 1, 1]),
    )
    .unwrap()
}
struct Recording {
    s: State,
    neuron: RefCell<Option<Neuron>>,
    checkpoints: RefCell<Vec<State>>,
    calls: RefCell<Vec<String>>,
    lose: Cell<bool>,
    reject: Cell<bool>,
    unavailable: Cell<bool>,
    registered: Cell<bool>,
    rehearsal_valid: Cell<bool>,
    controllers_valid: Cell<bool>,
    return_block: Cell<Option<u64>>,
    clock: Cell<u64>,
}
impl Recording {
    fn new(s: &State) -> Self {
        Self {
            s: s.clone(),
            neuron: RefCell::new(None),
            checkpoints: RefCell::new(vec![]),
            calls: RefCell::new(vec![]),
            lose: Cell::new(false),
            reject: Cell::new(false),
            unavailable: Cell::new(false),
            registered: Cell::new(false),
            rehearsal_valid: Cell::new(true),
            controllers_valid: Cell::new(true),
            return_block: Cell::new(None),
            clock: Cell::new(1_800_000_000),
        }
    }
    fn seed(&self) -> Neuron {
        Neuron {
            id: Some(NeuronId { id: 600 }),
            account: self.s.staking_subaccount.clone(),
            controller: Some(self.s.controller),
            hot_keys: vec![],
            not_for_profit: false,
            visibility: Some(1),
            cached_neuron_stake_e8s: self.s.plan.stake_e8s,
            neuron_fees_e8s: 0,
            dissolve_state: Some(DissolveState::DissolveDelaySeconds(
                INITIAL_CLAIM_LOCK_SECONDS,
            )),
            followees: vec![],
            voting_power_refreshed_timestamp_seconds: Some(self.now()),
            potential_voting_power: Some(1),
            deciding_voting_power: Some(1),
        }
    }
    fn count(&self, prefix: &str) -> usize {
        self.calls
            .borrow()
            .iter()
            .filter(|s| s.starts_with(prefix))
            .count()
    }
    fn restored(&self) -> State {
        candid::decode_one(&candid::encode_one(self.checkpoints.borrow().last().unwrap()).unwrap())
            .unwrap()
    }
}
impl CreationClient for Recording {
    fn now(&self) -> u64 {
        self.clock.get()
    }
    fn checkpoint(&self, s: &State) {
        self.checkpoints.borrow_mut().push(s.clone());
    }
    async fn neuron(&self, _: &State) -> Result<Option<Neuron>, String> {
        if self.unavailable.get() {
            Err("unavailable readback".into())
        } else {
            Ok(self.neuron.borrow().clone())
        }
    }
    async fn stake_balance(&self, _: Vec<u8>) -> Result<u64, String> {
        Ok(self
            .neuron
            .borrow()
            .as_ref()
            .map_or(self.s.plan.stake_e8s, |n| n.cached_neuron_stake_e8s))
    }
    async fn economics(&self) -> Result<Economics, String> {
        Ok(Economics {
            neuron_minimum_stake_e8s: 100_000_000,
            transaction_fee_e8s: 10_000,
        })
    }
    async fn managers(&self, _: &State) -> Result<(), String> {
        if self.unavailable.get() {
            Err("manager evidence unavailable".into())
        } else {
            Ok(())
        }
    }
    async fn mutate(&self, _: Option<u64>, command: Command) -> Result<Response, Failure> {
        if self.reject.replace(false) {
            return Err(Failure::Known("not executed".into()));
        }
        let result = match command {
            Command::ClaimOrRefresh(_) => {
                self.calls.borrow_mut().push("claim".into());
                *self.neuron.borrow_mut() = Some(self.seed());
                Response::ClaimOrRefresh(ClaimResponse {
                    refreshed_neuron_id: Some(NeuronId { id: 600 }),
                })
            }
            Command::Configure(c) => {
                let mut n = self.neuron.borrow_mut();
                let n = n.as_mut().unwrap();
                match c.operation.unwrap() {
                    Operation::SetVisibility(v) => {
                        self.calls.borrow_mut().push("visibility".into());
                        n.visibility = v.visibility;
                    }
                    Operation::IncreaseDissolveDelay(v) => {
                        self.calls.borrow_mut().push("lock".into());
                        let Some(DissolveState::DissolveDelaySeconds(current)) = n.dissolve_state
                        else {
                            panic!("wrong lock precondition")
                        };
                        n.dissolve_state = Some(DissolveState::DissolveDelaySeconds(
                            current + u64::from(v.additional_dissolve_delay_seconds),
                        ));
                    }
                    Operation::StartDissolving(_) => {
                        self.calls.borrow_mut().push("dissolve".into());
                        let Some(DissolveState::DissolveDelaySeconds(current)) = n.dissolve_state
                        else {
                            panic!("wrong dissolve precondition")
                        };
                        n.dissolve_state = Some(DissolveState::WhenDissolvedTimestampSeconds(
                            self.now() + current,
                        ));
                    }
                }
                Response::Configure(Reserved)
            }
            Command::Follow(f) => {
                self.calls.borrow_mut().push(format!("follow:{}", f.topic));
                let mut n = self.neuron.borrow_mut();
                let n = n.as_mut().unwrap();
                n.followees.retain(|(t, _)| *t != f.topic);
                if !f.followees.is_empty() {
                    n.followees.push((
                        f.topic,
                        Followees {
                            followees: f.followees,
                        },
                    ));
                }
                Response::Follow(Reserved)
            }
            Command::RefreshVotingPower(_) => {
                self.calls.borrow_mut().push("refresh".into());
                let mut n = self.neuron.borrow_mut();
                let n = n.as_mut().unwrap();
                n.voting_power_refreshed_timestamp_seconds = Some(self.now());
                n.deciding_voting_power = n.potential_voting_power;
                Response::RefreshVotingPower(Reserved)
            }
            Command::Disburse(d) => {
                assert_eq!(d.to_account.unwrap().hash, self.s.plan.return_account);
                self.calls.borrow_mut().push("disburse".into());
                self.neuron
                    .borrow_mut()
                    .as_mut()
                    .unwrap()
                    .cached_neuron_stake_e8s = 0;
                self.return_block.set(Some(77));
                Response::Disburse(DisburseResponse {
                    transfer_block_height: 77,
                })
            }
        };
        if self.lose.replace(false) {
            Err(Failure::Unknown(
                "scripted lost reply after real effect in recording client".into(),
            ))
        } else {
            Ok(result)
        }
    }
    async fn known(&self, id: u64) -> Result<NeuronInfo, String> {
        let m = self.s.plan.metadata.as_ref().unwrap();
        Ok(NeuronInfo {
            id: Some(NeuronId { id }),
            retrieved_at_timestamp_seconds: self.now(),
            visibility: Some(2),
            known_neuron_data: self.registered.get().then(|| KnownNeuronData {
                name: m.name.clone(),
                description: Some(m.description.clone()),
                links: Some(m.links.clone()),
                committed_topics: None,
            }),
        })
    }
    async fn system(&self, _: Principal) -> Result<CanisterInfoResponse, String> {
        Ok(CanisterInfoResponse {
            total_num_changes: 1,
            recent_changes: vec![],
            module_hash: Some(self.s.plan.bootstrap_sha256.clone()),
            controllers: if self.controllers_valid.get() {
                vec![self.s.plan.owner]
            } else {
                vec![]
            },
        })
    }
    async fn rehearsal(&self, s: &State, _: u64) -> Result<(), String> {
        if self.rehearsal_valid.get() && s.rehearsal_started_at.is_some() {
            Ok(())
        } else {
            Err("no executed exact-target rehearsal".into())
        }
    }
    async fn verify_return(&self, s: &State, block: u64) -> Result<(), String> {
        if self.return_block.get() == Some(block)
            && s.pending.as_ref().unwrap().expected_return_e8s
                == Some(self.s.plan.stake_e8s - 10_000)
        {
            Ok(())
        } else {
            Err("wrong return block".into())
        }
    }
}
fn run(c: &Recording, s: &mut State, step: Step) -> Result<(), String> {
    let sequence = s.begin(step.clone(), c.now() * 1_000_000_000)?;
    c.checkpoint(s);
    let result = block(engine::perform(c, s, step));
    if result.is_ok() {
        s.finish(sequence)?;
        c.checkpoint(s);
    } else if s.pending.as_ref().is_some_and(|p| p.effect.is_none()) {
        s.pending = None;
    }
    result
}
fn setup(c: &Recording, s: &mut State) {
    run(c, s, Step::Claim).unwrap();
    for _ in 0..22 {
        if s.phase != Phase::Configuring {
            break;
        }
        run(c, s, Step::Configure).unwrap();
    }
    if s.phase == Phase::AwaitingLock {
        run(c, s, Step::CommitLock).unwrap();
    }
}

#[test]
fn production_plan_uses_shared_policy_and_rejects_invalid_mutations() {
    let p = plan(true);
    p.validate().unwrap();
    type PlanMutation = Box<dyn Fn(&mut Plan)>;
    let mutations: Vec<PlanMutation> = vec![
        Box::new(|p| p.managers.push(11)),
        Box::new(|p| p.managers[0] = 0),
        Box::new(|p| p.managers.truncate(4)),
        Box::new(|p| p.lock_seconds += 1),
        Box::new(|p| p.committed_topics.clear()),
        Box::new(|p| p.committed_topics.push(1)),
        Box::new(|p| p.following.pop().map(|_| ()).unwrap()),
        Box::new(|p| p.following[0].followees = vec![42]),
        Box::new(|p| p.following.push(p.following[0].clone())),
        Box::new(|p| {
            p.following
                .iter_mut()
                .find(|f| f.topic == 4)
                .unwrap()
                .followees = vec![11, 12]
        }),
        Box::new(|p| p.owner = Principal::anonymous()),
        Box::new(|p| p.policy_revision = "other".into()),
        Box::new(|p| p.metadata.as_mut().unwrap().links = vec!["javascript:bad".into()]),
        Box::new(|p| p.cycle_reserve = 0),
    ];
    for mutate in mutations {
        let mut invalid = p.clone();
        mutate(&mut invalid);
        assert!(invalid.validate().is_err());
    }
}
#[test]
fn test_profile_does_not_duplicate_managers_or_allow_production_lock() {
    let p = plan(false);
    p.validate().unwrap();
    for lock in [1, 63_115_200] {
        let mut bad = p.clone();
        bad.lock_seconds = lock;
        assert!(bad.validate().is_err());
    }
    let mut one_day = p.clone();
    one_day.lock_seconds = INITIAL_CLAIM_LOCK_SECONDS;
    one_day.validate().unwrap();
    let mut bad = p;
    bad.managers = vec![11, 11];
    assert!(bad.validate().is_err());
}
#[test]
fn plan_edits_preserve_binding_and_invalidate_readiness() {
    let mut s = state(true);
    s.rehearsal_started_at = Some(1);
    s.rehearsal_proposal = Some(9);
    let mut next = s.plan.clone();
    next.revision += 1;
    next.metadata.as_mut().unwrap().name = "Reviewed change".into();
    s.replace(next.clone()).unwrap();
    assert!(s.rehearsal_started_at.is_none() && s.rehearsal_proposal.is_none());
    for change in [0, 1, 2, 3] {
        let mut bad = next.clone();
        bad.revision += 1;
        match change {
            0 => bad.profile = Profile::RecoverableTest,
            1 => bad.nonce += 1,
            2 => bad.return_account[0] ^= 1,
            _ => bad.network = Network::Ic,
        };
        assert!(s.replace(bad).is_err());
    }
    assert!(
        s.authorize(Principal::anonymous(), s.plan.revision)
            .is_err()
    );
    assert!(s.authorize(s.plan.owner, 1).is_err());
}
#[test]
fn stable_checkpoint_rejects_corruption_and_stale_completion() {
    let mut s = state(true);
    let id = s.begin(Step::Claim, 7).unwrap();
    let bytes = candid::encode_one(&s).unwrap();
    let restored: State = candid::decode_one(&bytes).unwrap();
    restored.validate_restored(s.controller).unwrap();
    let mut corrupt = restored.clone();
    corrupt.version += 1;
    assert!(corrupt.validate_restored(s.controller).is_err());
    let mut corrupt = restored;
    corrupt.staking_subaccount[0] ^= 1;
    assert!(corrupt.validate_restored(s.controller).is_err());
    assert!(s.begin(Step::Configure, 8).is_err());
    assert!(s.replace(s.plan.clone()).is_err());
    assert!(s.finish(id + 1).is_err());
    s.finish(id).unwrap();
}
#[test]
fn lost_claim_reply_and_upgrade_recover_exact_account_without_second_claim() {
    let mut s = state(false);
    let c = Recording::new(&s);
    c.lose.set(true);
    assert!(run(&c, &mut s, Step::Claim).is_err());
    let mut restored = c.restored();
    restored.validate_restored(s.controller).unwrap();
    assert!(restored.neuron_id.is_none());
    run(&c, &mut restored, Step::Claim).unwrap();
    assert_eq!(restored.neuron_id, Some(600));
    assert_eq!(c.count("claim"), 1);
}
#[test]
fn lost_following_reply_keeps_original_effect_and_reconciles() {
    let mut s = state(false);
    let c = Recording::new(&s);
    run(&c, &mut s, Step::Claim).unwrap();
    run(&c, &mut s, Step::Configure).unwrap();
    c.lose.set(true);
    assert!(run(&c, &mut s, Step::Configure).is_err());
    assert_eq!(c.count("follow:1"), 1);
    let mut restored = c.restored();
    run(&c, &mut restored, Step::Configure).unwrap();
    assert_eq!(c.count("follow:1"), 1);
    run(&c, &mut restored, Step::Configure).unwrap();
    assert_eq!(restored.phase, Phase::RecoverableTestReady);
}
#[test]
fn additive_lock_lost_reply_is_never_blindly_repeated() {
    let mut s = state(true);
    let c = Recording::new(&s);
    run(&c, &mut s, Step::Claim).unwrap();
    while s.phase == Phase::Configuring {
        run(&c, &mut s, Step::Configure).unwrap();
    }
    c.lose.set(true);
    assert!(run(&c, &mut s, Step::CommitLock).is_err());
    let mut restored = c.restored();
    run(&c, &mut restored, Step::CommitLock).unwrap();
    assert_eq!(c.count("lock"), 1);
    let mut uncertain = state(true);
    uncertain.neuron_id = Some(600);
    uncertain.begin(Step::CommitLock, 1).unwrap();
    uncertain.pending.as_mut().unwrap().effect = Some(Effect::Lock(uncertain.plan.lock_seconds));
    c.neuron.borrow_mut().as_mut().unwrap().dissolve_state = Some(
        DissolveState::DissolveDelaySeconds(INITIAL_CLAIM_LOCK_SECONDS),
    );
    assert!(run(&c, &mut uncertain, Step::CommitLock).is_err());
    assert_eq!(c.count("lock"), 1);
}
#[test]
fn registration_rehearsal_and_controller_readback_gate_sealing() {
    let mut s = state(true);
    let c = Recording::new(&s);
    setup(&c, &mut s);
    run(&c, &mut s, Step::Refresh).unwrap();
    assert!(run(&c, &mut s, Step::BeginRehearsal).is_err());
    c.registered.set(true);
    run(&c, &mut s, Step::BeginRehearsal).unwrap();
    c.rehearsal_valid.set(false);
    assert!(run(&c, &mut s, Step::Seal(9)).is_err());
    c.rehearsal_valid.set(true);
    c.controllers_valid.set(false);
    assert!(run(&c, &mut s, Step::Seal(9)).is_err());
    c.controllers_valid.set(true);
    run(&c, &mut s, Step::Seal(9)).unwrap();
    assert_eq!(s.phase, Phase::Sealed);
    assert!(s.begin(Step::Configure, 2).is_err());
    run(&c, &mut s, Step::Unseal).unwrap();
    assert!(s.rehearsal_started_at.is_none());
}
#[test]
fn recoverable_test_has_no_sealing_path_and_real_return_intent_is_fixed() {
    let mut s = state(false);
    let c = Recording::new(&s);
    setup(&c, &mut s);
    run(&c, &mut s, Step::StartDissolving).unwrap();
    c.clock.set(c.now() + s.plan.lock_seconds + 1);
    assert!(s.begin(Step::Seal(9), 1).is_err());
    c.lose.set(true);
    assert!(run(&c, &mut s, Step::Disburse).is_err());
    assert_eq!(c.count("disburse"), 1);
    assert!(run(&c, &mut s, Step::Disburse).is_err());
    assert!(run(&c, &mut s, Step::ReconcileDisbursement(78)).is_err());
    run(&c, &mut s, Step::ReconcileDisbursement(77)).unwrap();
    assert_eq!(s.phase, Phase::Recovered);
    assert_eq!(c.count("disburse"), 1);
}
#[test]
fn locked_recovery_requires_separate_dissolution_and_actual_wait() {
    let mut s = state(true);
    let c = Recording::new(&s);
    setup(&c, &mut s);
    assert!(run(&c, &mut s, Step::Disburse).is_err());
    run(&c, &mut s, Step::StartDissolving).unwrap();
    assert_eq!(c.count("dissolve"), 1);
    assert!(run(&c, &mut s, Step::Disburse).is_err());
    c.clock.set(c.now() + s.plan.lock_seconds + 1);
    run(&c, &mut s, Step::Disburse).unwrap();
    assert_eq!(s.phase, Phase::Recovered);
}
#[test]
fn changed_self_manager_hotkeys_and_stake_cannot_advance() {
    let mut s = state(false);
    let c = Recording::new(&s);
    run(&c, &mut s, Step::Claim).unwrap();
    c.neuron
        .borrow_mut()
        .as_mut()
        .unwrap()
        .hot_keys
        .push(s.plan.owner);
    assert!(run(&c, &mut s, Step::Configure).is_err());
    c.neuron.borrow_mut().as_mut().unwrap().hot_keys.clear();
    c.neuron.borrow_mut().as_mut().unwrap().not_for_profit = true;
    assert!(run(&c, &mut s, Step::Configure).is_err());
    c.neuron.borrow_mut().as_mut().unwrap().not_for_profit = false;
    c.neuron
        .borrow_mut()
        .as_mut()
        .unwrap()
        .cached_neuron_stake_e8s += 1;
    assert!(run(&c, &mut s, Step::Configure).is_err());
}
