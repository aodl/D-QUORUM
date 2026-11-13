use super::{
    engine::{self, CreationClient},
    model::*,
    protocol::*,
};
use candid::{Principal, Reserved};
use ic_clients::{
    CanisterInfoResponse, DissolveState, Followees, GovernanceError, KnownNeuronData, NeuronId,
    NeuronInfo,
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
        icp_fee_e8s: 10_000,
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
    changes: Cell<u64>,
    next_response: RefCell<Option<Response>>,
    suppress_effect: Cell<bool>,
    voting_minimum: Cell<u64>,
    balance_override: Cell<Option<u64>>,
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
            changes: Cell::new(2),
            next_response: RefCell::new(None),
            suppress_effect: Cell::new(false),
            voting_minimum: Cell::new(15_778_800),
            balance_override: Cell::new(None),
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
        Ok(self.balance_override.get().unwrap_or_else(|| {
            self.neuron
                .borrow()
                .as_ref()
                .map_or(self.s.plan.stake_e8s, |n| n.cached_neuron_stake_e8s)
        }))
    }
    async fn economics(&self) -> Result<Economics, String> {
        Ok(Economics {
            neuron_minimum_stake_e8s: 100_000_000,
            transaction_fee_e8s: 10_000,
            voting_power_economics: Some(VotingEconomics {
                neuron_minimum_dissolve_delay_to_vote_seconds: Some(self.voting_minimum.get()),
            }),
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
        let prior = self.neuron.borrow().clone();
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
        if self.suppress_effect.replace(false) {
            *self.neuron.borrow_mut() = prior;
        }
        if let Some(response) = self.next_response.borrow_mut().take() {
            return decode_mutation_response(ManageResponse {
                command: Some(response),
            });
        }
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
            total_num_changes: self.changes.get(),
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
    async fn verify_external_proposal(&self, _: &State, id: u64, _: bool) -> Result<(), String> {
        if id == 51 {
            Ok(())
        } else {
            Err("unrelated recorded proposal".into())
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
fn fresh_bootstrap_cannot_adopt_an_existing_neuron_without_its_original_claim_intent() {
    let mut s = state(false);
    let c = Recording::new(&s);
    c.neuron.replace(Some(c.seed()));
    assert!(run(&c, &mut s, Step::Claim).is_err());
    assert_eq!(s.neuron_id, None);
    assert_eq!(c.count("claim"), 0);
}
#[test]
fn proposal_reservation_survives_upgrade_and_grants_only_one_financial_dispatch() {
    let mut s = state(false);
    let c = Recording::new(&s);
    setup(&c, &mut s);
    let proposal = ExternalProposal {
        request_id: None,
        kind: ProposalKind::Rehearsal,
        intent_id: vec![5; 32],
        request_digest: vec![6; 32],
        proposer: 11,
        revision: 1,
        created_at: 0,
        proposal_id: None,
        dispatched: false,
    };
    run(&c, &mut s, Step::ReserveProposal(proposal.clone())).unwrap();
    let mut replaced_ingress = proposal.clone();
    replaced_ingress.request_id = Some(vec![8; 32]);
    assert!(run(&c, &mut s, Step::ReserveProposal(replaced_ingress)).is_err());
    let mut competing = proposal.clone();
    competing.intent_id = vec![7; 32];
    assert!(run(&c, &mut s, Step::ReserveProposal(competing)).is_err());
    let mut next = s.plan.clone();
    next.revision = 2;
    assert!(s.replace(next).is_err());
    run(
        &c,
        &mut s,
        Step::MarkProposalDispatched(proposal.intent_id.clone()),
    )
    .unwrap();
    let mut restored = c.restored();
    restored.validate_restored(s.controller).unwrap();
    assert!(restored.external_proposal.as_ref().unwrap().dispatched);
    assert!(
        run(
            &c,
            &mut restored,
            Step::MarkProposalDispatched(proposal.intent_id.clone())
        )
        .is_err()
    );
    assert!(
        run(
            &c,
            &mut restored,
            Step::CancelReservedProposal(proposal.intent_id.clone())
        )
        .is_err()
    );
    assert!(run(&c, &mut restored, Step::ResolveProposal(52)).is_err());
    run(&c, &mut restored, Step::ResolveProposal(51)).unwrap();
    assert_eq!(restored.external_proposal.unwrap().proposal_id, Some(51));
}
#[test]
fn only_a_reservation_proven_undispatched_can_be_cancelled() {
    let mut s = state(false);
    let c = Recording::new(&s);
    setup(&c, &mut s);
    let proposal = ExternalProposal {
        request_id: None,
        kind: ProposalKind::Rehearsal,
        intent_id: vec![5; 32],
        request_digest: vec![6; 32],
        proposer: 11,
        revision: 1,
        created_at: 0,
        proposal_id: None,
        dispatched: false,
    };
    run(&c, &mut s, Step::ReserveProposal(proposal.clone())).unwrap();
    assert!(run(&c, &mut s, Step::CancelReservedProposal(vec![7; 32])).is_err());
    run(&c, &mut s, Step::CancelReservedProposal(proposal.intent_id)).unwrap();
    assert!(s.external_proposal.is_none());
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
    let sealed_marker = s.readiness_marker();
    assert_eq!(c.restored().readiness_marker(), sealed_marker);
    assert!(s.begin(Step::Configure, 2).is_err());
    assert!(run(&c, &mut s, Step::Unseal).is_err());
    assert_eq!(s.sealed_controller_changes, Some(2));
    c.changes.set(3); // Explicit management upgrade, not an application flag.
    run(&c, &mut s, Step::Unseal).unwrap();
    assert_eq!(s.sealed_controller_changes, None);
    assert_ne!(
        s.readiness_marker(),
        sealed_marker,
        "an old sealed receipt cannot authorise teardown after unsealing"
    );
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
    assert!(
        run(
            &c,
            &mut s,
            Step::Disburse {
                expected_amount_e8s: 199_990_000,
                expected_fee_e8s: 10_000
            }
        )
        .is_err()
    );
    assert_eq!(c.count("disburse"), 1);
    assert!(
        run(
            &c,
            &mut s,
            Step::Disburse {
                expected_amount_e8s: 199_990_000,
                expected_fee_e8s: 10_000
            }
        )
        .is_err()
    );
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
    assert!(
        run(
            &c,
            &mut s,
            Step::Disburse {
                expected_amount_e8s: 199_990_000,
                expected_fee_e8s: 10_000
            }
        )
        .is_err()
    );
    run(&c, &mut s, Step::StartDissolving).unwrap();
    assert_eq!(c.count("dissolve"), 1);
    assert!(
        run(
            &c,
            &mut s,
            Step::Disburse {
                expected_amount_e8s: 199_990_000,
                expected_fee_e8s: 10_000
            }
        )
        .is_err()
    );
    c.clock.set(c.now() + s.plan.lock_seconds + 1);
    run(
        &c,
        &mut s,
        Step::Disburse {
            expected_amount_e8s: 199_990_000,
            expected_fee_e8s: 10_000,
        },
    )
    .unwrap();
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

#[test]
fn neuron_wire_records_reject_conflicting_bindings_and_collection_shapes() {
    let s = state(false);
    let c = Recording::new(&s);
    let n = c.seed();
    assert!(validate_neuron_response(&s, vec![]).unwrap().is_none());
    assert_eq!(
        validate_neuron_response(&s, vec![n.clone()])
            .unwrap()
            .unwrap()
            .id
            .unwrap()
            .id,
        600
    );
    assert!(validate_neuron_response(&s, vec![n.clone(), n.clone()]).is_err());
    let mutations: [fn(&mut Neuron); 8] = [
        |n| n.controller = Some(Principal::anonymous()),
        |n| n.account[0] ^= 1,
        |n| n.id = None,
        |n| n.id = Some(NeuronId { id: 0 }),
        |n| n.hot_keys = vec![Principal::anonymous(); 11],
        |n| {
            n.followees = (0..65)
                .map(|topic| (topic, Followees { followees: vec![] }))
                .collect()
        },
        |n| {
            n.followees = vec![(
                1,
                Followees {
                    followees: vec![NeuronId { id: 11 }; 16],
                },
            )]
        },
        |n| {
            n.followees = vec![
                (1, Followees { followees: vec![] }),
                (1, Followees { followees: vec![] }),
            ]
        },
    ];
    for mutate in mutations {
        let mut bad = n.clone();
        mutate(&mut bad);
        assert!(validate_neuron_response(&s, vec![bad]).is_err());
    }
    let mut bound = s;
    bound.neuron_id = Some(601);
    assert!(validate_neuron_response(&bound, vec![n]).is_err());
}

fn operation_fixture(operation: &str) -> (State, Recording, Step) {
    let mut s = state(operation == "lock");
    let c = Recording::new(&s);
    let step = match operation {
        "claim" => Step::Claim,
        "visibility" => {
            run(&c, &mut s, Step::Claim).unwrap();
            Step::Configure
        }
        "following" => {
            run(&c, &mut s, Step::Claim).unwrap();
            run(&c, &mut s, Step::Configure).unwrap();
            Step::Configure
        }
        "lock" => {
            run(&c, &mut s, Step::Claim).unwrap();
            while s.phase == Phase::Configuring {
                run(&c, &mut s, Step::Configure).unwrap();
            }
            Step::CommitLock
        }
        "refresh" => {
            setup(&c, &mut s);
            c.clock.set(c.now() + 100);
            Step::Refresh
        }
        "dissolution" => {
            setup(&c, &mut s);
            Step::StartDissolving
        }
        "disbursement" => {
            setup(&c, &mut s);
            run(&c, &mut s, Step::StartDissolving).unwrap();
            c.clock.set(c.now() + s.plan.lock_seconds + 1);
            Step::Disburse {
                expected_amount_e8s: 199_990_000,
                expected_fee_e8s: 10_000,
            }
        }
        _ => panic!("unknown recording scenario"),
    };
    (s, c, step)
}

#[test]
fn unexpected_governance_reply_variants_preserve_the_dispatched_effect() {
    for operation in [
        "claim",
        "visibility",
        "following",
        "lock",
        "refresh",
        "dissolution",
        "disbursement",
    ] {
        let (mut s, c, step) = operation_fixture(operation);
        *c.next_response.borrow_mut() =
            Some(if operation == "claim" || operation == "disbursement" {
                Response::Follow(Reserved)
            } else {
                Response::ClaimOrRefresh(ClaimResponse {
                    refreshed_neuron_id: None,
                })
            });
        let before = c.calls.borrow().len();
        let error = run(&c, &mut s, step.clone()).unwrap_err();
        assert!(error.contains("Unexpected"), "{operation}: {error}");
        assert!(s.pending.as_ref().unwrap().effect.is_some());
        assert_eq!(c.calls.borrow().len(), before + 1);
        if operation == "disbursement" {
            assert!(run(&c, &mut s, step).is_err());
            run(&c, &mut s, Step::ReconcileDisbursement(77)).unwrap();
            assert_eq!(c.count("disburse"), 1);
        } else {
            run(&c, &mut s, step).unwrap();
            if operation != "refresh" {
                assert_eq!(c.calls.borrow().len(), before + 1);
            }
        }
    }
}

#[test]
fn success_without_matching_configuration_readback_cannot_advance() {
    for operation in ["visibility", "following", "lock", "refresh", "dissolution"] {
        let (mut s, c, step) = operation_fixture(operation);
        c.suppress_effect.set(true);
        let error = run(&c, &mut s, step).unwrap_err();
        assert!(
            error.contains("readback") || error.contains("not confirmed"),
            "{operation}: {error}"
        );
        assert!(s.pending.as_ref().unwrap().effect.is_some());
        assert_ne!(s.phase, Phase::Sealed);
        assert_ne!(s.phase, Phase::Recovered);
    }
}

#[test]
fn reviewed_pre_dispatch_rejection_does_not_poison_a_later_claim() {
    let mut s = state(false);
    let c = Recording::new(&s);
    c.reject.set(true);
    assert!(
        run(&c, &mut s, Step::Claim)
            .unwrap_err()
            .contains("rejected")
    );
    assert!(s.pending.is_none());
    assert_eq!(c.count("claim"), 0);
    run(&c, &mut s, Step::Claim).unwrap();
    assert_eq!(c.count("claim"), 1);
}

#[test]
fn only_reviewed_pre_dispatch_governance_errors_prove_non_execution() {
    for code in [3, 4, 5, 6, 7, 8, 11, 13, 14] {
        assert!(matches!(
            decode_mutation_response(ManageResponse {
                command: Some(Response::Error(GovernanceError {
                    error_type: code,
                    error_message: "rejected before dispatch".into()
                }))
            }),
            Err(Failure::Known(_))
        ));
    }
    for code in [0, 1, 2, 9, 10, 12, 15, 16, 99] {
        assert!(matches!(
            decode_mutation_response(ManageResponse {
                command: Some(Response::Error(GovernanceError {
                    error_type: code,
                    error_message: "not execution evidence".into()
                }))
            }),
            Err(Failure::Unknown(_))
        ));
    }
    assert!(matches!(
        decode_mutation_response(ManageResponse { command: None }),
        Err(Failure::Unknown(_))
    ));
}

#[test]
fn a_typed_external_error_after_disbursement_retains_its_original_effect() {
    let (mut s, c, step) = operation_fixture("disbursement");
    *c.next_response.borrow_mut() = Some(Response::Error(GovernanceError {
        error_type: 12,
        error_message: "Ledger response unavailable after transfer".into(),
    }));
    assert!(
        run(&c, &mut s, step.clone())
            .unwrap_err()
            .contains("not proof of non-execution")
    );
    assert_eq!(c.count("disburse"), 1);
    assert!(s.pending.as_ref().unwrap().effect == Some(Effect::Disburse));
    assert!(run(&c, &mut s, step).is_err());
    assert_eq!(c.count("disburse"), 1);
    run(&c, &mut s, Step::ReconcileDisbursement(77)).unwrap();
    assert_eq!(s.phase, Phase::Recovered);
    assert_eq!(c.count("disburse"), 1);
}

#[test]
fn unavailable_bound_neuron_and_stake_mismatch_never_create_a_replacement() {
    for amount in [199_999_999, 200_000_001] {
        let mut s = state(false);
        let c = Recording::new(&s);
        c.balance_override.set(Some(amount));
        assert!(run(&c, &mut s, Step::Claim).is_err());
        assert_eq!(c.count("claim"), 0);
        assert!(s.neuron_id.is_none());
    }
    let mut s = state(false);
    let c = Recording::new(&s);
    run(&c, &mut s, Step::Claim).unwrap();
    *c.neuron.borrow_mut() = None;
    assert!(
        run(&c, &mut s, Step::Claim)
            .unwrap_err()
            .contains("never claim a replacement")
    );
    assert_eq!(c.count("claim"), 1);
}

#[test]
fn network_voting_minimum_is_separate_from_the_fixed_standard_lock() {
    let economic = |value| Economics {
        neuron_minimum_stake_e8s: 1,
        transaction_fee_e8s: 1,
        voting_power_economics: value,
    };
    assert_eq!(economic(None).minimum_voting_delay(), 15_778_800);
    assert_eq!(
        economic(Some(VotingEconomics {
            neuron_minimum_dissolve_delay_to_vote_seconds: None
        }))
        .minimum_voting_delay(),
        1_209_600
    );
    let (mut s, c, step) = operation_fixture("lock");
    c.voting_minimum.set(s.plan.lock_seconds + 1);
    assert!(
        run(&c, &mut s, step)
            .unwrap_err()
            .contains("exceeds the fixed Standard")
    );
    assert_eq!(c.count("lock"), 0);
    assert_eq!(s.plan.lock_seconds, 63_115_200);
}

#[test]
fn configuration_repairs_reviewed_extra_topics_but_refuses_unknown_ones() {
    for topic in [4, 99] {
        let mut s = state(false);
        let c = Recording::new(&s);
        setup(&c, &mut s);
        c.neuron.borrow_mut().as_mut().unwrap().followees.push((
            topic,
            Followees {
                followees: vec![NeuronId { id: 11 }],
            },
        ));
        let result = run(&c, &mut s, Step::Configure);
        if topic == 4 {
            result.unwrap();
            assert_eq!(c.count("follow:4"), 1);
        } else {
            assert!(result.unwrap_err().contains("unsupported following"));
            assert_eq!(c.count("follow:99"), 0);
        }
    }
}

fn executed_rehearsal() -> Rehearsal {
    Rehearsal {
        status: 4,
        topic: 1,
        proposal_timestamp_seconds: 100,
        executed_timestamp_seconds: 101,
        latest_tally: Some(Tally {
            yes: 3,
            no: 2,
            total: 5,
        }),
        proposal: Some(Proposal {
            action: Some(Action::ManageNeuron(Managed {
                id: None,
                neuron_id_or_subaccount: Some(ReadId::NeuronId(NeuronId { id: 600 })),
                command: Some(RehearsalCommand::RefreshVotingPower(Reserved)),
            })),
        }),
    }
}

fn rehearsal_management(p: &mut Rehearsal) -> &mut Managed {
    let Some(Action::ManageNeuron(m)) = p.proposal.as_mut().unwrap().action.as_mut() else {
        panic!("invalid test fixture");
    };
    m
}

#[test]
fn rehearsal_requires_exact_executed_refresh_freshness_and_consistent_quorum() {
    let mut s = state(true);
    s.neuron_id = Some(600);
    s.rehearsal_started_at = Some(100);
    validate_rehearsal_response(&s, Some(executed_rehearsal())).unwrap();
    let mut legacy = executed_rehearsal();
    let m = rehearsal_management(&mut legacy);
    m.neuron_id_or_subaccount = None;
    m.id = Some(NeuronId { id: 600 });
    validate_rehearsal_response(&s, Some(legacy)).unwrap();
    assert!(validate_rehearsal_response(&s, None).is_err());
    let mutations: [fn(&mut Rehearsal); 20] = [
        |p| p.latest_tally = None,
        |p| p.proposal = None,
        |p| p.proposal.as_mut().unwrap().action = None,
        |p| p.proposal.as_mut().unwrap().action = Some(Action::Motion(Reserved)),
        |p| p.proposal.as_mut().unwrap().action = Some(Action::RegisterKnownNeuron(Reserved)),
        |p| {
            rehearsal_management(p).neuron_id_or_subaccount =
                Some(ReadId::NeuronId(NeuronId { id: 601 }))
        },
        |p| rehearsal_management(p).neuron_id_or_subaccount = Some(ReadId::Subaccount(vec![0; 32])),
        |p| rehearsal_management(p).command = None,
        |p| rehearsal_management(p).command = Some(RehearsalCommand::Follow(Reserved)),
        |p| rehearsal_management(p).command = Some(RehearsalCommand::Configure(Reserved)),
        |p| p.status = 3,
        |p| p.topic = 4,
        |p| p.executed_timestamp_seconds = 0,
        |p| p.proposal_timestamp_seconds = 99,
        |p| p.latest_tally.as_mut().unwrap().total = 6,
        |p| p.latest_tally.as_mut().unwrap().yes = 2,
        |p| p.latest_tally.as_mut().unwrap().no = 6,
        |p| p.latest_tally.as_mut().unwrap().yes = 6,
        |p| p.latest_tally.as_mut().unwrap().no = 3,
        |p| {
            let m = rehearsal_management(p);
            m.neuron_id_or_subaccount = None;
            m.id = None;
        },
    ];
    for mutate in mutations {
        let mut p = executed_rehearsal();
        mutate(&mut p);
        assert!(validate_rehearsal_response(&s, Some(p)).is_err());
    }
    s.rehearsal_started_at = None;
    assert!(validate_rehearsal_response(&s, Some(executed_rehearsal())).is_err());
}

#[test]
fn proposal_refusal_proof_cannot_release_a_dispatched_reservation_without_authentic_evidence() {
    let mut state = State::new(plan(false), Principal::from_slice(&[1, 1])).unwrap();
    state.external_proposal = Some(ExternalProposal {
        request_id: None,
        kind: ProposalKind::Rehearsal,
        intent_id: vec![3; 32],
        request_digest: vec![4; 32],
        proposer: 11,
        revision: 1,
        created_at: 1_800_000_000,
        proposal_id: None,
        dispatched: true,
    });
    let original = state.clone();
    let proof = ProposalRefusalProof {
        intent_id: vec![3; 32],
        argument: vec![1],
        certificate: vec![0],
        ingress_expiry: 1_800_000_001_000_000_000,
        nonce: None,
    };
    assert!(crate::proposal_refusal::verify(&state, &proof, 1_800_000_001_000_000_000).is_err());
    assert_eq!(
        state, original,
        "a forged or malformed proof grants no clearing authority"
    );
    let mut oversized = proof;
    oversized.certificate = vec![0; 8193];
    assert!(
        state
            .begin(Step::ResolveProposalRefusal(oversized), 1_800_000_000)
            .is_err()
    );
    assert_eq!(
        state, original,
        "bounds are checked before retaining an asynchronous intent"
    );
}

#[test]
fn explicit_upgrade_binding_cannot_be_mistaken_for_empty_candid_arguments() {
    let argument = candid::encode_one(UpgradeBinding {
        previous_module_sha256: vec![1; 32],
        module_sha256: vec![2; 32],
    })
    .unwrap();
    assert!(
        candid::decode_args::<()>(&argument).is_ok(),
        "negative control: Candid permits unused arguments, so decoding unit is not an arity test"
    );
    let decoded = decode_upgrade_binding(&argument).unwrap().unwrap();
    assert_eq!(decoded.previous_module_sha256, vec![1; 32]);
    assert_eq!(decoded.module_sha256, vec![2; 32]);
    assert!(
        decode_upgrade_binding(&candid::encode_args(()).unwrap())
            .unwrap()
            .is_none()
    );
    assert!(
        decode_upgrade_binding(&candid::encode_one(()).unwrap())
            .unwrap()
            .is_none()
    );
    assert!(decode_upgrade_binding(&[1, 2, 3]).is_err());
}

#[test]
fn genuine_reviewed_v1_image_migrates_without_replacing_pending_claim_identity() {
    use sha2::{Digest, Sha256};
    let image = include_bytes!("../fixtures/reviewed-v1-ambiguous-claim.bin");
    assert_eq!(
        format!("{:x}", Sha256::digest(image)),
        "25e96694cd2984f061f3781cb0bc7f3d128a36d20acf67c7851faa99b16b94a5"
    );
    // Match stable_restore: stable memory is page padded; decode the one value.
    let mut decoder = candid::de::IDLDeserialize::new(image).unwrap();
    let mut original: State = decoder.get_value().unwrap();
    assert_eq!(original.version, 1);
    assert_eq!(original.plan.nonce, 9041);
    assert!(original.pending.is_some());
    assert!(original.module_binding.is_none());
    assert!(original.proposal_refusals.is_none());
    let pending = original.pending.clone();
    let mut refused = original.clone();
    assert!(migrate_checkpoint(&mut refused, None).is_err());
    assert_eq!(refused, original);
    let previous = original.plan.bootstrap_sha256.clone();
    let mut expected = original.clone();
    expected.version = STATE_VERSION;
    expected.module_binding = Some(vec![42; 32]);
    migrate_checkpoint(
        &mut original,
        Some(UpgradeBinding {
            previous_module_sha256: previous,
            module_sha256: vec![42; 32],
        }),
    )
    .unwrap();
    assert_eq!(original, expected);
    assert_eq!(original.pending, pending);
    original.validate_restored(original.controller).unwrap();
}

#[test]
fn real_browser_registration_refusal_verifies_without_discarding_ambiguous_requests() {
    #[derive(candid::CandidType, candid::Deserialize)]
    struct Fixture {
        owner: Principal,
        reservation: ExternalProposal,
        proof: ProposalRefusalProof,
        now_ns: u64,
    }
    let fixture: Fixture = candid::decode_one(include_bytes!(
        "../fixtures/real-registration-name-refusal.bin"
    ))
    .unwrap();
    // This reservation is reconstructed from the exported original request, not
    // represented as an independently captured stable checkpoint.
    let mut p = plan(true);
    p.owner = fixture.owner;
    let mut state = State::new(p, Principal::from_slice(&[1, 1])).unwrap();
    state.external_proposal = Some(fixture.reservation);
    let verify = |s: &State, proof: &ProposalRefusalProof| {
        crate::proposal_refusal::verify(s, proof, fixture.now_ns)
    };
    let audit = verify(&state, &fixture.proof).unwrap();
    assert_eq!(audit.error_type, 11); // pinned PreconditionFailed, not 6
    let mut changed = state.clone();
    changed.plan.owner = Principal::anonymous();
    assert!(verify(&changed, &fixture.proof).is_err());
    changed = state.clone();
    changed.external_proposal.as_mut().unwrap().request_id = Some(vec![0; 32]);
    assert!(verify(&changed, &fixture.proof).is_err());
    changed.external_proposal.as_mut().unwrap().request_id = None;
    assert!(verify(&changed, &fixture.proof).is_err());
    let mut forged = fixture.proof.clone();
    forged.nonce = Some(vec![0; 32]);
    assert!(verify(&state, &forged).is_err());
    let mut cert: ic_certification::Certificate =
        serde_cbor::from_slice(&fixture.proof.certificate).unwrap();
    cert.signature[0] ^= 1;
    forged = fixture.proof;
    forged.certificate = serde_cbor::to_vec(&cert).unwrap();
    assert!(verify(&state, &forged).is_err());
    state.external_proposal = None;
    state.proposal_refusals = Some(vec![audit]);
    assert!(
        state
            .validate_restored(Principal::from_slice(&[1, 1]))
            .is_ok()
    );
}
