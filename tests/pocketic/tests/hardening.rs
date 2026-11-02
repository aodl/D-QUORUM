mod support;
use candid::{Principal, encode_one};
use d_quorum::state::{Init, Mode};
use quorum_accounting::{Transfer, TransferStatus};
use quorum_ic_clients::{GOVERNANCE, LEDGER, governance as g};
use support::*;
fn root_controller() -> Principal {
    Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()
}
fn setup(mode: Mode, three: bool, cycles: u128) -> (pocket_ic::PocketIc, Principal, Vec<u8>) {
    let w = wasm("d_quorum");
    let mock = wasm("quorum_mocks");
    let pic = builder().build();
    let app = pic
        .create_canister_with_params(
            None,
            pocket_ic::CreateCanisterParams {
                cycles: Some(cycles),
                ..Default::default()
            },
        )
        .unwrap();
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let mut f = fixture(now(&pic), empty, app);
    if three {
        add_candidates(
            &mut f,
            now(&pic),
            &[(106, 2010), (112, 2020)],
            &[100, 106, 112],
        );
    }
    for id in [GOVERNANCE, LEDGER] {
        pic.create_canister_with_id(None, None, id).unwrap();
        pic.add_cycles(id, 100_000_000_000_000);
    }
    pic.install_canister(GOVERNANCE, mock.clone(), encode_one(Some(f)).unwrap(), None);
    pic.set_controllers(GOVERNANCE, None, vec![root_controller()])
        .unwrap();
    pic.install_canister(
        LEDGER,
        mock,
        encode_one(None::<quorum_mocks::Fixture>).unwrap(),
        None,
    );
    pic.install_canister(
        app,
        w.clone(),
        encode_one(Some(Init {
            mode,
            expected_target_controller: Some(user(9)),
        }))
        .unwrap(),
        None,
    );
    (pic, app, w)
}
fn add_candidates(
    f: &mut quorum_mocks::Fixture,
    at: u64,
    additions: &[(u64, u64)],
    support: &[u64],
) {
    let base = f
        .neurons
        .iter()
        .find(|n| n.id.as_ref().unwrap().id == 100)
        .unwrap()
        .clone();
    for &(id, first) in additions {
        let mut c = base.clone();
        c.id = Some(g::NeuronId { id });
        c.account = vec![id as u8; 32];
        c.known_neuron_data = Some(known(id));
        c.followees.retain(|(t, _)| *t != 1 && *t != 4);
        c.followees
            .push(fs(1, &(first..first + 5).collect::<Vec<_>>()));
        c.followees
            .push(fs(4, &(first..first + 3).collect::<Vec<_>>()));
        f.neurons.push(c);
        for manager in first..first + 5 {
            let mut n = raw(manager, user(3), at);
            n.known_neuron_data = Some(known(manager));
            n.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
            f.neurons.push(n);
        }
    }
    f.neurons
        .iter_mut()
        .find(|n| n.id.as_ref().unwrap().id == 200)
        .unwrap()
        .followees = vec![fs(4, support)];
    f.infos = f
        .neurons
        .iter()
        .map(|n| g::NeuronInfo {
            id: n.id.clone(),
            retrieved_at_timestamp_seconds: at,
            known_neuron_data: n.known_neuron_data.clone(),
            visibility: n.visibility,
        })
        .collect();
    f.known = f
        .neurons
        .iter()
        .filter_map(|n| {
            n.known_neuron_data.clone().map(|m| g::KnownNeuron {
                id: n.id.clone(),
                known_neuron_data: Some(m),
            })
        })
        .collect();
    f.infos.sort_by_key(|n| n.id.as_ref().unwrap().id);
}
fn follow_support(pic: &pocket_ic::PocketIc, ids: &[u64]) {
    let r: g::ManageResponse = update(
        pic,
        GOVERNANCE,
        user(2),
        "manage_neuron",
        g::request(
            200,
            g::Command::SetFollowing(g::SetFollowing {
                topic_following: Some(vec![g::Following {
                    topic: Some(4),
                    followees: Some(ids.iter().map(|id| g::NeuronId { id: *id }).collect()),
                }]),
            }),
        ),
    );
    assert!(matches!(
        r.command,
        Some(g::ResponseCommand::SetFollowing(_))
    ));
}
fn plans(pic: &pocket_ic::PocketIc, app: Principal) -> Vec<d_quorum::PayoutSummary> {
    query2(pic, app, "payout_page", (None::<u64>, 100u16))
}
fn plan_transfers(pic: &pocket_ic::PocketIc, app: Principal, id: u64) -> Vec<Transfer> {
    query2(pic, app, "transfer_page", (id, 0u32, 100u16))
}
fn assert_exact_payment_blocks(pic: &pocket_ic::PocketIc, app: Principal, ts: &[Transfer]) {
    use quorum_ic_clients::ledger as l;
    let h: l::History = update(
        pic,
        LEDGER,
        Principal::anonymous(),
        "query_blocks",
        l::BlocksArgs {
            start: 0,
            length: 100,
        },
    );
    for t in ts {
        let TransferStatus::Confirmed { block } = t.status else {
            panic!("unsettled {t:?}")
        };
        let a = t.attempt.as_ref().unwrap();
        assert!(l::matches(
            &h.blocks[(block - h.first_block_index) as usize],
            app,
            &t.destination.subaccount,
            t.amount,
            a.fee,
            &a.memo,
            a.created_at_time
        ));
    }
}
fn progress(pic: &pocket_ic::PocketIc, app: Principal) -> d_quorum::ScanProgress {
    query_empty(pic, app, "scan_progress")
}
fn wait(pic: &pocket_ic::PocketIc, app: Principal, phase: &str) {
    for _ in 0..800 {
        drive(pic, 1);
        let p = progress(pic, app);
        if p.phase == phase {
            return;
        }
        assert_ne!(p.phase, "failed", "{p:?}");
    }
    panic!(
        "wait {phase}: {:?}",
        query_empty::<d_quorum::Health>(pic, app, "health")
    );
}
fn transfers(pic: &pocket_ic::PocketIc, app: Principal) -> Vec<Transfer> {
    query2(pic, app, "transfer_page", (1u64, 0u32, 100u16))
}
fn lost_write(pic: &pocket_ic::PocketIc, app: Principal) {
    let _: () = update(
        pic,
        GOVERNANCE,
        Principal::anonymous(),
        "enqueue",
        quorum_mocks::Script {
            method: "manage_neuron".into(),
            reply: Some(vec![0, 1, 2]),
            reject: None,
        },
    );
    for _ in 0..800 {
        drive(pic, 1);
        let h: d_quorum::Health = query_empty(pic, app, "health");
        if progress(pic, app).phase == "applying"
            && h.jobs[0]
                .last_error
                .as_ref()
                .is_some_and(|e| e.contains("decode"))
        {
            return;
        }
    }
    panic!("lost following reply was not reached");
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn setter_during_paused_sent_intent_readback_never_retries_obsolete_revision() {
    let (pic, app, _) = setup(Mode::Live, false, 100_000_000_000_000);
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "skip_follow_once",
        (),
    );
    for _ in 0..800 {
        drive(&pic, 1);
        let h: d_quorum::Health = query_empty(&pic, app, "health");
        if progress(&pic, app).phase == "applying" && h.jobs[0].last_error.is_some() {
            break;
        }
    }
    let old = progress(&pic, app).round;
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "pause_target_once",
        30u32,
    );
    drive(&pic, 120);
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert!(calls.iter().any(|s| s == "target_read_paused"));
    let before: d_quorum::Health = query_empty(&pic, app, "health");
    let r: Result<u64, String> = update(&pic, app, GOVERNANCE, "set_delegates_per_topic", 3u8);
    r.unwrap();
    let after: d_quorum::Health = query_empty(&pic, app, "health");
    assert_eq!(before.jobs[0].generation, after.jobs[0].generation);
    drive(&pic, 31);
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert_eq!(
        calls
            .iter()
            .filter(|s| s.as_str() == "set_following")
            .count(),
        1
    );
    let p = progress(&pic, app);
    assert!(p.round == old || p.revision == Some(1));
    for _ in 0..800 {
        drive(&pic, 1);
        let p = progress(&pic, app);
        if p.phase == "complete" && p.revision == Some(1) {
            return;
        }
    }
    panic!("current revision did not complete");
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn thirty_day_outage_and_upgrade_reconcile_history_without_reward_freshness() {
    let (pic, app, w) = setup(Mode::Live, false, 100_000_000_000_000);
    lost_write(&pic, app);
    let old = progress(&pic, app).round.unwrap();
    pic.stop_canister(GOVERNANCE, Some(root_controller()))
        .unwrap();
    drive(&pic, 30 * 86400);
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_init",
        1_000_000u64,
    );
    pic.start_canister(GOVERNANCE, Some(root_controller()))
        .unwrap();
    let mut recovered = false;
    for _ in 0..100 {
        drive(&pic, 1);
        let rows: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
        if rows[0].applied_round == Some(old) {
            assert!(!rows[0].reward_eligible);
            assert!(rows[0].reward_valid_until.unwrap() < now(&pic));
            assert!(
                rows[0].readback_observed_at.unwrap()
                    > rows[0].support_started_at.unwrap() + 29 * 86400
            );
            let plans: Vec<d_quorum::PayoutSummary> =
                query2(&pic, app, "payout_page", (None::<u64>, 100u16));
            assert!(plans.is_empty());
            recovered = true;
            break;
        }
    }
    assert!(recovered, "historical following was not recovered");
    for _ in 0..800 {
        drive(&pic, 1);
        let rows: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
        if rows[0].reward_eligible {
            assert_ne!(rows[0].applied_round, Some(old));
            return;
        }
    }
    panic!("fresh selection did not replace stale historical application");
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn cycle_reserve_outage_does_not_fabricate_observation_progress() {
    let (pic, app, w) = setup(Mode::Live, false, 1_900_000_000_000);
    drive(&pic, 30 * 86400);
    let h: d_quorum::Health = query_empty(&pic, app, "health");
    assert!(h.jobs.iter().all(|j| j.steps == 0));
    assert_eq!(progress(&pic, app).round, None);
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    pic.add_cycles(app, 100_000_000_000_000);
    wait(&pic, app, "complete");
    let p = progress(&pic, app);
    assert!(p.started_at.unwrap() > 1_800_000_000 + 29 * 86400);
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn economics_change_during_support_scan_blocks_publication_and_preserves_context() {
    let (pic, app, _) = setup(Mode::ObserveOnly, false, 100_000_000_000_000);
    for _ in 0..800 {
        drive(&pic, 1);
        if progress(&pic, app).phase == "index" {
            break;
        }
    }
    let old = progress(&pic, app).voting_context.unwrap();
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "voting_minimum",
        Some(21 * 86400u64),
    );
    for _ in 0..10 {
        drive(&pic, 10);
        let rows: Vec<d_quorum::Score> =
            query2(&pic, app, "score_page", (None::<(i32, u64)>, 100u16));
        assert!(rows.is_empty());
    }
    let p = progress(&pic, app);
    assert_eq!(p.voting_context, Some(old));
    assert!(
        p.last_failure
            .as_ref()
            .is_some_and(|e| e.contains("economics"))
    );
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn expired_a_is_confirmed_from_history_then_never_sent_b_c_get_fresh_attempts_and_fees() {
    financial(false);
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn genuinely_unresolved_a_retains_all_liabilities_and_never_receives_new_identity() {
    financial(true);
}
fn financial(unresolved: bool) {
    let (pic, app, w) = setup(Mode::Live, true, 100_000_000_000_000);
    wait(&pic, app, "complete");
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_init",
        3_000_005u64,
    );
    let fault = if unresolved {
        quorum_mocks::LedgerFault::LoseReplyWithoutCommit
    } else {
        quorum_mocks::LedgerFault::LoseReplyAfterCommit
    };
    let _: () = update(&pic, LEDGER, Principal::anonymous(), "ledger_fault", fault);
    drive(&pic, 86400);
    let mut unknown = None;
    for _ in 0..100 {
        drive(&pic, 1);
        let ts = transfers(&pic, app);
        if ts
            .first()
            .is_some_and(|t| matches!(t.status, TransferStatus::Unknown { .. }))
        {
            unknown = Some(ts);
            break;
        }
    }
    let original = unknown.expect("first transfer not dispatched");
    assert!(original[1..].iter().all(|t| t.attempt.is_none()));
    let a = original[0].attempt.clone();
    pic.stop_canister(LEDGER, None).unwrap();
    drive(&pic, 2 * 86400);
    pic.upgrade_canister(app, w.clone(), encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    pic.start_canister(LEDGER, None).unwrap();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_fee",
        12_000u64,
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_deposit",
        4_000u64,
    );
    if unresolved {
        for _ in 0..3 {
            drive(&pic, 3600);
        }
        let ts = transfers(&pic, app);
        assert_eq!(ts[0].attempt, a);
        assert!(ts[1..].iter().all(|t| t.attempt.is_none()));
        let plans: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        assert_eq!(plans[0].reserved, 3_000_003);
        assert!(!plans[0].complete);
        let s: quorum_mocks::LedgerStats = query_empty(&pic, LEDGER, "ledger_stats");
        assert_eq!(s.blocks, 0);
        return;
    }
    let mut confirmed = false;
    for _ in 0..100 {
        drive(&pic, 10);
        let ts = transfers(&pic, app);
        if matches!(ts[0].status, TransferStatus::Confirmed { .. }) {
            assert!(ts[1].attempt.is_none());
            confirmed = true;
            break;
        }
    }
    assert!(confirmed);
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    for _ in 0..100 {
        drive(&pic, 10);
        let ps: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        if ps[0].complete && ps[0].maintenance_complete {
            break;
        }
    }
    let ts = transfers(&pic, app);
    assert!(
        ts.iter()
            .all(|t| matches!(t.status, TransferStatus::Confirmed { .. }))
    );
    assert_eq!(ts[0].attempt, a);
    for (old, t) in original.iter().zip(&ts) {
        assert_eq!(old.amount, t.amount);
    }
    assert!(
        ts[1..]
            .iter()
            .all(|t| t.attempt.as_ref().unwrap().created_at_time
                > a.as_ref().unwrap().created_at_time + 86400 * 1_000_000_000)
    );
    let ps: Vec<d_quorum::PayoutSummary> = query2(&pic, app, "payout_page", (None::<u64>, 100u16));
    assert_eq!(ps[0].additional_fee_funding, 4000);
    assert!(ps[0].maintenance_complete);
    let stats: quorum_mocks::LedgerStats = query_empty(&pic, LEDGER, "ledger_stats");
    assert_eq!(stats.blocks, 3);
    assert_eq!(stats.balance, 2);
}

fn owned_setup() -> (pocket_ic::PocketIc, Principal, Vec<u8>) {
    let (pic, app, w) = setup(Mode::Live, false, 100_000_000_000_000);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let mut f = fixture(now(&pic), empty, app);
    let mut n = raw(300, app, now(&pic));
    n.account =
        quorum_ic_clients::ledger::staking_subaccount(app, d_quorum::state::BOOTSTRAP_NONCE);
    n.visibility = Some(1);
    n.cached_neuron_stake_e8s = 100_000_000;
    n.neuron_fees_e8s = 90_000_000;
    f.infos.push(g::NeuronInfo {
        id: n.id.clone(),
        retrieved_at_timestamp_seconds: now(&pic),
        known_neuron_data: None,
        visibility: Some(1),
    });
    f.neurons.push(n);
    f.infos.sort_by_key(|n| n.id.as_ref().unwrap().id);
    let target = f
        .neurons
        .iter_mut()
        .find(|n| n.id.as_ref().unwrap().id == quorum_policy::TARGET)
        .unwrap();
    target.maturity_e8s_equivalent = 5_000_000_000;
    target.followees.retain(|(t, _)| *t != 1);
    target.followees.push(fs(1, &[101, 102, 103, 300]));
    let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "replace", f);
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_staking_fund",
        100_000_000u64,
    );
    (pic, app, w)
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn depleted_proposer_topup_refreshes_and_definite_creation_refusals_back_off_then_recover() {
    let (pic, app, _) = owned_setup();
    let mut depleted = false;
    for _ in 0..900 {
        drive(&pic, 1);
        let h: d_quorum::Health = query_empty(&pic, app, "health");
        if h.proposer == Some(300)
            && h.jobs[1]
                .last_error
                .as_ref()
                .is_some_and(|e| e.contains("minimum stake"))
        {
            depleted = true;
            break;
        }
    }
    assert!(depleted);
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_staking_fund",
        1_000_000_000u64,
    );
    for code in [14, 3] {
        let _: () = update(
            &pic,
            GOVERNANCE,
            Principal::anonymous(),
            "reject_proposal_once",
            code,
        );
    }
    let mut marker = None;
    for code in [14, 3] {
        let mut found = None;
        for _ in 0..200 {
            drive(&pic, 10);
            let j: Option<d_quorum::state::ProposalJob> =
                query_empty(&pic, app, "proposal_progress");
            if let Some(j) = j
                && matches!(j.phase,d_quorum::state::ProposalPhase::CreationRejected{error_type,..} if error_type==code)
            {
                found = Some(j);
                break;
            }
        }
        let j = found.unwrap_or_else(|| {
            panic!(
                "creation rejection {code} not classified: {:?}",
                query_empty::<d_quorum::Health>(&pic, app, "health")
            )
        });
        assert!(j.retry_after > now(&pic));
        assert_ne!(marker.as_ref(), Some(&j.marker));
        marker = Some(j.marker);
        let ps: g::Proposals = update(
            &pic,
            GOVERNANCE,
            Principal::anonymous(),
            "list_proposals",
            g::ListProposals {
                limit: 100,
                before_proposal: None,
                include_reward_status: vec![],
                exclude_topic: vec![],
                include_all_manage_neuron_proposals: Some(true),
                include_status: vec![],
                return_self_describing_action: Some(false),
                omit_large_fields: Some(true),
            },
        );
        assert!(ps.proposal_info.is_empty());
        drive(&pic, 3601);
    }
    let mut opened = false;
    for _ in 0..200 {
        drive(&pic, 10);
        let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(j) = j
            && matches!(j.phase, d_quorum::state::ProposalPhase::Open(1))
        {
            assert_ne!(Some(j.marker), marker);
            opened = true;
            break;
        }
    }
    assert!(opened);
    let n: g::ListNeuronsResponse = update(
        &pic,
        GOVERNANCE,
        app,
        "list_neurons",
        g::ListNeurons {
            neuron_ids: vec![300],
            include_neurons_readable_by_caller: false,
            include_empty_neurons_readable_by_caller: Some(false),
            include_public_neurons_in_full_neurons: Some(true),
            page_number: Some(0),
            page_size: Some(50),
            neuron_subaccounts: None,
        },
    );
    assert_eq!(n.full_neurons[0].cached_neuron_stake_e8s, 1_000_000_000);
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert_eq!(
        calls
            .iter()
            .filter(|s| s.as_str() == "make_proposal")
            .count(),
        1
    );
    assert_eq!(
        calls
            .iter()
            .filter(|s| s.as_str() == "proposal_rejected_before_creation")
            .count(),
        2
    );
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn malformed_success_without_id_is_durable_ambiguity_not_creation_rejection() {
    malformed_success(None);
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn zero_proposal_success_id_is_ambiguous_and_recovers_exact_history() {
    malformed_success(Some(g::NeuronId { id: 0 }));
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn unbound_proposal_success_id_is_ambiguous_and_recovers_exact_history() {
    malformed_success(Some(g::NeuronId { id: 9999 }));
}
fn malformed_success(success_id: Option<g::NeuronId>) {
    let (pic, app, w) = owned_setup();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_staking_fund",
        1_000_000_000u64,
    );
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "enqueue",
        quorum_mocks::Script {
            method: "make_proposal_reply".into(),
            reply: Some(
                encode_one(g::ManageResponse {
                    command: Some(g::ResponseCommand::MakeProposal(g::ProposalResponse {
                        proposal_id: success_id,
                    })),
                })
                .unwrap(),
            ),
            reject: None,
        },
    );
    let mut ambiguous = None;
    for _ in 0..600 {
        drive(&pic, 1);
        let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(j) = j
            && matches!(j.phase, d_quorum::state::ProposalPhase::Ambiguous)
        {
            ambiguous = Some(j);
            break;
        }
    }
    let j = ambiguous.expect("malformed success ID must remain ambiguous");
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    for _ in 0..80 {
        drive(&pic, 10);
        let x: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(x) = x
            && matches!(x.phase, d_quorum::state::ProposalPhase::Open(1))
        {
            assert_eq!(x.marker, j.marker);
            assert_eq!(x.fingerprint, j.fingerprint);
            let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
            assert_eq!(
                calls
                    .iter()
                    .filter(|s| s.as_str() == "make_proposal")
                    .count(),
                1
            );
            return;
        }
    }
    panic!("exact history did not recover malformed success");
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn confirmed_payment_refresh_failure_survives_upgrade_without_resending() {
    let (pic, app, w) = setup(Mode::Live, false, 100_000_000_000_000);
    wait(&pic, app, "complete");
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "fail_recipient_refresh_once",
        (),
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_init",
        1_000_000u64,
    );
    drive(&pic, 86400);
    let mut failed = false;
    for _ in 0..100 {
        drive(&pic, 10);
        let ts = transfers(&pic, app);
        if ts.first().is_some_and(|t| {
            matches!(
                t.refresh,
                Some(quorum_accounting::RefreshState::RetryAt { .. })
            )
        }) {
            assert!(matches!(ts[0].status, TransferStatus::Confirmed { .. }));
            failed = true;
            break;
        }
    }
    assert!(failed);
    let identity = transfers(&pic, app)[0].attempt.clone();
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    drive(&pic, 3601);
    for _ in 0..20 {
        drive(&pic, 10);
        if transfers(&pic, app)
            .first()
            .is_some_and(|t| t.refresh == Some(quorum_accounting::RefreshState::Complete))
        {
            break;
        }
    }
    let ts = transfers(&pic, app);
    assert_eq!(ts[0].attempt, identity);
    assert_eq!(
        ts[0].refresh,
        Some(quorum_accounting::RefreshState::Complete)
    );
    let stats: quorum_mocks::LedgerStats = query_empty(&pic, LEDGER, "ledger_stats");
    assert_eq!(stats.blocks, 1);
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn submitted_proposal_voted_down_is_distinct_from_creation_refusal() {
    let (pic, app, w) = owned_setup();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_staking_fund",
        1_000_000_000u64,
    );
    let mut open = None;
    for _ in 0..300 {
        drive(&pic, 10);
        let job: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(job) = job
            && matches!(job.phase, d_quorum::state::ProposalPhase::Open(1))
        {
            open = Some(job);
            break;
        }
    }
    let open = open.expect("proposal was not submitted");
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "proposal_status",
        (1u64, 2i32),
    );
    pic.upgrade_canister(app, w, encode_one(Some(Mode::Live)).unwrap(), None)
        .unwrap();
    for _ in 0..100 {
        drive(&pic, 1);
        let job: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(job) = job
            && matches!(job.phase, d_quorum::state::ProposalPhase::Rejected(1))
        {
            assert_eq!(job.marker, open.marker);
            assert_eq!(job.fingerprint, open.fingerprint);
            assert!(job.retry_after >= now(&pic) + 86_390);
            let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
            assert_eq!(
                calls
                    .iter()
                    .filter(|s| s.as_str() == "make_proposal")
                    .count(),
                1
            );
            return;
        }
    }
    panic!("submitted proposal rejection was not reconciled");
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn eligible_direct_support_keeps_19000_despite_positive_raw_ineligible_and_transitive_vp() {
    let (pic, app, _) = setup(Mode::ObserveOnly, false, 100_000_000_000_000);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let at = now(&pic);
    let mut f = fixture(at, empty, app);
    let minimum = 14 * 86400;
    for (id, vp, delay, followee) in [
        (202, 1_000_000, minimum - 1, 100),
        (203, 7_000, minimum, 100),
        (204, 2_000_000, 0, 100),
        (205, 3_000_000, minimum, 200),
    ] {
        let mut n = raw(id, user(2), at);
        n.followees = vec![fs(4, &[followee])];
        n.deciding_voting_power = Some(vp);
        n.potential_voting_power = Some(vp);
        if delay == 0 {
            n.dissolve_state = Some(g::DissolveState::WhenDissolvedTimestampSeconds(at - 1));
            n.aging_since_timestamp_seconds = u64::MAX;
        } else {
            n.dissolve_state = Some(g::DissolveState::DissolveDelaySeconds(delay));
        }
        f.infos.push(g::NeuronInfo {
            id: n.id.clone(),
            retrieved_at_timestamp_seconds: at,
            known_neuron_data: None,
            visibility: Some(2),
        });
        f.neurons.push(n);
    }
    f.infos.sort_by_key(|n| n.id.as_ref().unwrap().id);
    let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "replace", f);
    wait(&pic, app, "ready");
    let scores: Vec<d_quorum::Score> =
        query2(&pic, app, "score_page", (None::<(i32, u64)>, 100u16));
    let score = scores
        .iter()
        .find(|s| s.topic == 4 && s.neuron_id == 100)
        .unwrap();
    assert!(score.complete);
    assert_eq!(score.scaled_score, 19_000 * quorum_policy::SCALE);
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn reviewed_v1_snapshot_upgrades_to_v2_and_survives_a_second_upgrade() {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let compressed = include_bytes!("../fixtures/rc1-v1-initial-stable.bin.gz");
    let provenance: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/rc1-v1-initial-stable.json")).unwrap();
    assert_eq!(
        provenance["module_sha256"],
        "1cac858b906c615c1cb9444b3177cf1a04b3a52e9e46b0c4adc32a455eb9a3e1"
    );
    assert_eq!(
        hex::encode(Sha256::digest(compressed)),
        provenance["gzip_sha256"].as_str().unwrap()
    );
    let mut raw = Vec::new();
    flate2::read::GzDecoder::new(compressed.as_slice())
        .read_to_end(&mut raw)
        .unwrap();
    assert_eq!(
        raw.len() as u64,
        provenance["stable_bytes"].as_u64().unwrap()
    );
    assert_eq!(
        hex::encode(Sha256::digest(&raw)),
        provenance["stable_sha256"].as_str().unwrap()
    );
    let w = wasm("d_quorum");
    let pic = builder().build();
    let app = pic.create_canister();
    pic.install_canister(app, w.clone(), encode_one(None::<Init>).unwrap(), None);
    pic.set_stable_memory(
        app,
        compressed.to_vec(),
        pocket_ic::common::rest::BlobCompression::Gzip,
    );
    for _ in 0..2 {
        pic.upgrade_canister(app, w.clone(), encode_one(None::<Mode>).unwrap(), None)
            .unwrap();
        let c: d_quorum::Configuration = query_empty(&pic, app, "configuration");
        assert_eq!(c.config.mode, Mode::ObserveOnly);
        assert_eq!(c.config.revision, 1);
        assert_eq!(c.config.delegates_per_topic, 5);
        assert_eq!(c.config.expected_target_controller, Some(user(9)));
        assert!(
            c.policy_revision
                .starts_with(quorum_policy::POLICY_REVISION)
        );
        let ps: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        assert!(ps.is_empty());
    }
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn setter_during_original_following_write_preserves_intent_then_starts_current_revision() {
    let (pic, app, _) = setup(Mode::Live, false, 100_000_000_000_000);
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "pause_follow_once",
        60u32,
    );
    let mut paused = false;
    for _ in 0..800 {
        drive(&pic, 1);
        let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
        if calls.iter().any(|s| s == "following_write_paused") {
            paused = true;
            break;
        }
    }
    assert!(paused, "original following write await was not reached");
    let old = progress(&pic, app);
    assert_eq!(old.phase, "applying");
    assert_eq!(old.revision, Some(0));
    let before: d_quorum::Health = query_empty(&pic, app, "health");
    let result: Result<u64, String> = update(&pic, app, GOVERNANCE, "set_delegates_per_topic", 3u8);
    assert_eq!(result.unwrap(), 1);
    let after: d_quorum::Health = query_empty(&pic, app, "health");
    assert_eq!(before.jobs[0].generation, after.jobs[0].generation);
    assert_eq!(progress(&pic, app).round, old.round);
    drive(&pic, 61);
    let mut historical = false;
    let mut current = false;
    for _ in 0..800 {
        drive(&pic, 1);
        let p = progress(&pic, app);
        assert_ne!(p.phase, "failed", "{p:?}");
        if p.phase == "complete" && p.round == old.round {
            assert_eq!(p.revision, Some(0));
            let rows: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
            assert!(rows.iter().all(|r| !r.reward_eligible));
            historical = true;
        }
        if p.phase == "complete" && p.revision == Some(1) {
            assert!(p.round > old.round);
            current = true;
            break;
        }
    }
    assert!(
        historical,
        "dispatched old intent was not reconciled historically"
    );
    assert!(current, "current revision did not complete promptly");
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert_eq!(
        calls
            .iter()
            .filter(|s| s.as_str() == "set_following")
            .count(),
        1,
        "the already-dispatched old write must never be retried"
    );
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn settled_payments_and_later_rosters_progress_despite_permanent_refresh_rejection() {
    maintenance_does_not_block(None);
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn settled_payments_and_later_rosters_progress_despite_private_recipient() {
    maintenance_does_not_block(Some(false));
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn settled_payments_and_later_rosters_progress_despite_missing_recipient() {
    maintenance_does_not_block(Some(true));
}
fn maintenance_does_not_block(hidden: Option<bool>) {
    use quorum_accounting::RefreshState;
    let (pic, app, w) = setup(Mode::Live, false, 200_000_000_000_000);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let mut f = fixture(now(&pic), empty, app);
    add_candidates(
        &mut f,
        now(&pic),
        &[(106, 2010), (112, 2020), (118, 2030)],
        &[100, 106],
    );
    let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "replace", f);
    wait(&pic, app, "complete");
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "reject_refresh_for",
        Some(100u64),
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_init",
        2_000_000u64,
    );
    drive(&pic, 86400);
    for _ in 0..150 {
        drive(&pic, 10);
        if plans(&pic, app).first().is_some_and(|p| p.complete)
            && plan_transfers(&pic, app, 1)
                .get(1)
                .is_some_and(|t| t.refresh == Some(RefreshState::Complete))
        {
            break;
        }
    }
    let original = plan_transfers(&pic, app, 1);
    assert_eq!(original.len(), 2);
    assert_eq!(
        original
            .iter()
            .map(|t| t.destination.neuron_id)
            .collect::<Vec<_>>(),
        vec![100, 106]
    );
    assert!(original.iter().all(|t| t.amount == 990_000));
    assert_exact_payment_blocks(&pic, app, &original);
    assert!(matches!(
        original[0].refresh,
        Some(RefreshState::RetryAt { .. })
    ));
    assert_eq!(original[1].refresh, Some(RefreshState::Complete));
    let settled_at = now(&pic);
    assert_eq!(plans(&pic, app)[0].reserved, 0);
    if let Some(missing) = hidden {
        let _: () = update(
            &pic,
            GOVERNANCE,
            Principal::anonymous(),
            "hide_neuron",
            (100u64, missing),
        );
    }
    follow_support(&pic, &[112, 118]);
    drive(&pic, 3 * 86400);
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    drive(&pic, 5 * 86400);
    for _ in 0..1000 {
        drive(&pic, 1);
        let rows: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
        if rows
            .iter()
            .any(|r| r.topic == 4 && r.applied == vec![112, 118] && r.reward_eligible)
        {
            break;
        }
    }
    let rows: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
    assert!(
        rows.iter()
            .any(|r| r.topic == 4 && r.applied == vec![112, 118] && r.reward_eligible),
        "{rows:?}"
    );
    assert_eq!(plans(&pic, app).len(), 1);
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_deposit",
        2_000_000u64,
    );
    // A deposit is observed only through the existing daily admission schedule.
    let deadline = query_empty::<d_quorum::Health>(&pic, app, "health").jobs[2].next_at;
    assert!(deadline > settled_at + 86400);
    if deadline > now(&pic) + 10 {
        drive(&pic, deadline - now(&pic) - 10);
        assert_eq!(plans(&pic, app).len(), 1);
    }
    drive(&pic, 20);
    for _ in 0..200 {
        drive(&pic, 10);
        if plans(&pic, app).iter().any(|p| p.id == 2 && p.complete) {
            break;
        }
    }
    let later = plan_transfers(&pic, app, 2);
    assert_eq!(
        later
            .iter()
            .map(|t| t.destination.neuron_id)
            .collect::<Vec<_>>(),
        vec![112, 118]
    );
    assert!(later.iter().all(|t| t.amount == 990_000));
    assert_exact_payment_blocks(&pic, app, &later);
    let retained = plan_transfers(&pic, app, 1);
    for (a, b) in original.iter().zip(&retained) {
        assert_eq!(a.destination, b.destination);
        assert_eq!(a.amount, b.amount);
        assert_eq!(a.attempt, b.attempt);
        assert_eq!(a.status, b.status);
    }
    assert_ne!(retained[0].refresh, Some(RefreshState::Complete));
    assert_eq!(retained[1].refresh, Some(RefreshState::Complete));
    assert_eq!(
        query_empty::<quorum_mocks::LedgerStats>(&pic, LEDGER, "ledger_stats").blocks,
        4
    );
    assert!(
        plans(&pic, app)
            .iter()
            .all(|p| p.complete && p.reserved == 0)
    );
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn fourteen_definite_transfer_refusals_recover_after_cooldown_upgrade_fee_and_funding() {
    let (pic, app, w) = setup(Mode::Live, true, 200_000_000_000_000);
    wait(&pic, app, "complete");
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_init",
        3_000_000u64,
    );
    for _ in 0..14 {
        let _: () = update(
            &pic,
            LEDGER,
            Principal::anonymous(),
            "ledger_fault",
            quorum_mocks::LedgerFault::InsufficientFunds,
        );
    }
    drive(&pic, 86400);
    let mut cooldown = None;
    for _ in 0..500 {
        drive(&pic, 120);
        let ts = transfers(&pic, app);
        if ts
            .first()
            .is_some_and(|t| matches!(t.status, TransferStatus::Cooldown { .. }))
        {
            cooldown = Some(ts);
            break;
        }
    }
    let original = cooldown.expect("twelve refusals must enter recoverable cooldown");
    let a = original[0].attempt.as_ref().unwrap();
    assert_eq!(a.number, 12);
    assert!(!a.may_have_executed);
    assert_eq!(
        query_empty::<quorum_mocks::LedgerStats>(&pic, LEDGER, "ledger_stats").transfer_calls,
        12
    );
    assert!(original[1..].iter().all(|t| t.attempt.is_none()));
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_fee",
        12_000u64,
    );
    drive(&pic, 3600);
    assert_eq!(
        query_empty::<quorum_mocks::LedgerStats>(&pic, LEDGER, "ledger_stats").transfer_calls,
        12
    );
    // Existing reservations forbid reducing any net entitlement to pay the extra fees.
    drive(&pic, 86400);
    for _ in 0..20 {
        drive(&pic, 10);
    }
    assert_eq!(
        query_empty::<quorum_mocks::LedgerStats>(&pic, LEDGER, "ledger_stats").transfer_calls,
        12
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_deposit",
        6_000u64,
    );
    for _ in 0..500 {
        drive(&pic, 120);
        if plans(&pic, app).first().is_some_and(|p| p.complete) {
            break;
        }
    }
    let ts = transfers(&pic, app);
    assert_exact_payment_blocks(&pic, app, &ts);
    assert_eq!(ts[0].attempt.as_ref().unwrap().number, 15);
    assert_eq!(
        ts[0].rejected_attempts.len(),
        quorum_accounting::REFUSAL_HISTORY
    );
    assert_eq!(ts[0].rejected_attempts.first().unwrap().number, 3);
    assert_eq!(ts[0].rejected_attempts.last().unwrap().number, 14);
    for (old, t) in original.iter().zip(&ts) {
        assert_eq!(old.destination, t.destination);
        assert_eq!(old.amount, t.amount);
        assert_eq!(t.amount, 990_000);
    }
    assert_eq!(plans(&pic, app)[0].additional_fee_funding, 6_000);
    let stats = query_empty::<quorum_mocks::LedgerStats>(&pic, LEDGER, "ledger_stats");
    assert_eq!(stats.blocks, 3);
    assert_eq!(stats.transfer_calls, 17);
    assert_eq!(stats.balance, 0);
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn executed_maturity_without_transient_progress_requires_lock_barrier_and_never_attributes_deposits()
 {
    use d_quorum::state::ProposalPhase as P;
    let (pic, app, w) = owned_setup();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_staking_fund",
        1_000_000_000u64,
    );
    let mut first = None;
    for _ in 0..400 {
        drive(&pic, 10);
        let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(j) = j
            && matches!(j.phase, P::Open(1))
        {
            first = Some(j);
            break;
        }
    }
    let original = first.expect("exact operation not submitted");
    // Adopted is durable but must never be interpreted as Executed.
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "proposal_status",
        (1u64, 3i32),
    );
    drive(&pic, 3601);
    assert!(matches!(
        query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
            .unwrap()
            .phase,
        P::Adopted(1)
    ));
    pic.stop_canister(app, None).unwrap();
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "proposal_status",
        (1u64, 4i32),
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_deposit",
        12345u64,
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_mint",
        (app, 45678u64),
    );
    drive(&pic, 30 * 86400);
    pic.upgrade_canister(app, w.clone(), encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "reject_refresh_for",
        Some(quorum_policy::TARGET),
    );
    pic.start_canister(app, None).unwrap();
    for _ in 0..100 {
        drive(&pic, 120);
        let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
            .unwrap();
        if matches!(j.phase, P::Executed(1) | P::AwaitingFinalization(1)) {
            assert!(j.executed_at.is_some());
            break;
        }
    }
    // Persisted exact execution proof remains usable even if proposal history is pruned later.
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "prune_proposals",
        (),
    );
    drive(&pic, 3601);
    let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
        .unwrap();
    assert!(!matches!(j.phase, P::TerminalExecutionVerified(_)));
    assert!(j.terminal_observed_at.is_none() && j.receipt.is_none());
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "reject_refresh_for",
        None::<u64>,
    );
    for _ in 0..100 {
        drive(&pic, 120);
        let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
            .unwrap();
        if matches!(j.phase, P::TerminalExecutionVerified(1)) {
            assert_eq!(j.marker, original.marker);
            assert_eq!(j.fingerprint, original.fingerprint);
            assert!(!j.saw_disbursement && j.earliest_finalization.is_none());
            assert!(j.terminal_observed_at.is_some());
            assert!(j.receipt.is_none());
            assert_eq!(
                query_empty::<Vec<String>>(&pic, GOVERNANCE, "recordings")
                    .iter()
                    .filter(|s| *s == "make_proposal")
                    .count(),
                1
            );
            return;
        }
    }
    panic!("durable exact execution plus lock barrier and empty progress did not recover");
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn maturity_barrier_adapter_decodes_typed_results_without_relaxing_ordinary_refresh() {
    let (pic, _, _) = setup(Mode::ObserveOnly, false, 100_000_000_000_000);
    let probe = install_probe(&pic, wasm("quorum_mocks"));
    let target = quorum_policy::TARGET;
    let error = |code| {
        g::ResponseCommand::Error(g::GovernanceError {
            error_type: code,
            error_message: "InsufficientFunds Governance 14".into(),
        })
    };
    for (command, accepted) in [
        (
            Some(g::ResponseCommand::ClaimOrRefresh(g::ClaimResponse {
                refreshed_neuron_id: Some(g::NeuronId { id: target }),
            })),
            true,
        ),
        (
            Some(g::ResponseCommand::ClaimOrRefresh(g::ClaimResponse {
                refreshed_neuron_id: Some(g::NeuronId { id: target + 1 }),
            })),
            false,
        ),
        (
            Some(g::ResponseCommand::ClaimOrRefresh(g::ClaimResponse {
                refreshed_neuron_id: None,
            })),
            false,
        ),
        (Some(error(14)), true),
        (Some(error(5)), false),
        (None, false),
        (Some(g::ResponseCommand::SetFollowing(g::Empty {})), false),
    ] {
        let _: () = update(
            &pic,
            GOVERNANCE,
            Principal::anonymous(),
            "enqueue",
            quorum_mocks::Script {
                method: "manage_neuron".into(),
                reply: Some(encode_one(g::ManageResponse { command }).unwrap()),
                reject: None,
            },
        );
        let result: Result<(), String> = update(
            &pic,
            probe,
            Principal::anonymous(),
            "maturity_barrier_probe",
            target,
        );
        assert_eq!(result.is_ok(), accepted, "{result:?}");
    }
    for script in [
        quorum_mocks::Script {
            method: "manage_neuron".into(),
            reply: None,
            reject: Some("execution unknown; Governance 14".into()),
        },
        quorum_mocks::Script {
            method: "manage_neuron".into(),
            reply: Some(vec![0, 1, 2]),
            reject: None,
        },
    ] {
        let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "enqueue", script);
        let result: Result<(), String> = update(
            &pic,
            probe,
            Principal::anonymous(),
            "maturity_barrier_probe",
            target,
        );
        assert!(result.is_err(), "{result:?}");
    }
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "enqueue",
        quorum_mocks::Script {
            method: "manage_neuron".into(),
            reply: Some(
                encode_one(g::ManageResponse {
                    command: Some(error(14)),
                })
                .unwrap(),
            ),
            reject: None,
        },
    );
    let ordinary: Result<g::ResponseCommand, String> =
        update(&pic, probe, Principal::anonymous(), "refresh_probe", target);
    assert!(ordinary.unwrap_err().starts_with("Governance 14:"));
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn executed_maturity_typed_insufficient_funds_barrier_recovers_but_uncertain_barriers_do_not() {
    use d_quorum::state::ProposalPhase as P;
    let (pic, app, w) = owned_setup();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_staking_fund",
        1_000_000_000u64,
    );
    let original = (0..400)
        .find_map(|_| {
            drive(&pic, 10);
            query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
                .filter(|j| matches!(j.phase, P::Open(1)))
        })
        .expect("exact operation not submitted");
    pic.stop_canister(app, None).unwrap();
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "proposal_status",
        (1u64, 4i32),
    );
    // These unrelated credits must never become an attributed maturity receipt.
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_deposit",
        12345u64,
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_mint",
        (app, 45678u64),
    );
    drive(&pic, 30 * 86400);
    let typed = |command| quorum_mocks::Script {
        method: "manage_neuron".into(),
        reply: Some(encode_one(g::ManageResponse { command }).unwrap()),
        reject: None,
    };
    let error = |code| {
        Some(g::ResponseCommand::Error(g::GovernanceError {
            error_type: code,
            error_message: "InsufficientFunds Governance 14".into(),
        }))
    };
    let refreshes = || {
        query_empty::<Vec<String>>(&pic, GOVERNANCE, "recordings")
            .iter()
            .filter(|s| *s == &format!("refresh:{}", quorum_policy::TARGET))
            .count()
    };
    for script in [
        typed(error(5)),
        typed(Some(g::ResponseCommand::ClaimOrRefresh(g::ClaimResponse {
            refreshed_neuron_id: Some(g::NeuronId {
                id: quorum_policy::TARGET + 1,
            }),
        }))),
        typed(None),
        typed(Some(g::ResponseCommand::RefreshVotingPower(g::Empty {}))),
        quorum_mocks::Script {
            method: "manage_neuron".into(),
            reply: None,
            reject: Some("execution unknown".into()),
        },
        quorum_mocks::Script {
            method: "manage_neuron".into(),
            reply: Some(vec![0, 1, 2]),
            reject: None,
        },
    ] {
        let count = refreshes();
        let _: () = update(
            &pic,
            GOVERNANCE,
            Principal::anonymous(),
            "refresh_reply_for",
            (quorum_policy::TARGET, script),
        );
        pic.start_canister(app, None).unwrap();
        for _ in 0..100 {
            drive(&pic, 120);
            if refreshes() > count {
                break;
            }
        }
        assert!(
            refreshes() > count,
            "must exercise the actual barrier await"
        );
        drive(&pic, 3601);
        let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
            .unwrap();
        assert!(matches!(
            j.phase,
            P::Executed(1) | P::AwaitingFinalization(1)
        ));
        assert!(j.executed_at.is_some());
        assert!(j.terminal_observed_at.is_none() && j.receipt.is_none());
        assert_eq!(j.marker, original.marker);
        assert_eq!(
            query_empty::<Vec<String>>(&pic, GOVERNANCE, "recordings")
                .iter()
                .filter(|s| *s == "make_proposal")
                .count(),
            1
        );
        pic.stop_canister(app, None).unwrap();
    }
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "refresh_reply_for",
        (quorum_policy::TARGET, typed(error(14))),
    );
    pic.start_canister(app, None).unwrap();
    for _ in 0..100 {
        drive(&pic, 120);
        let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
            .unwrap();
        if matches!(j.phase, P::TerminalExecutionVerified(1)) {
            assert_eq!(j.marker, original.marker);
            assert_eq!(j.fingerprint, original.fingerprint);
            assert!(!j.saw_disbursement && j.earliest_finalization.is_none());
            assert!(j.executed_at.is_some() && j.terminal_observed_at.is_some());
            assert!(j.receipt.is_none());
            assert_eq!(
                query_empty::<Vec<String>>(&pic, GOVERNANCE, "recordings")
                    .iter()
                    .filter(|s| *s == "make_proposal")
                    .count(),
                1
            );
            return;
        }
    }
    panic!("typed InsufficientFunds must reach the terminal barrier caller");
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn bound_open_proposal_with_pruned_history_remains_unresolved_across_upgrade() {
    use d_quorum::state::ProposalPhase as P;
    let (pic, app, w) = owned_setup();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_staking_fund",
        1_000_000_000u64,
    );
    let mut original = None;
    for _ in 0..400 {
        drive(&pic, 10);
        let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(j) = j
            && matches!(j.phase, P::Open(1))
            && j.found == vec![1]
        {
            original = Some(j);
            break;
        }
    }
    let original = original.expect("proposal not bound");
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "prune_proposals",
        (),
    );
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    drive(&pic, 30 * 86400);
    for _ in 0..3 {
        drive(&pic, 3601);
    }
    let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
        .unwrap();
    assert_eq!(j.phase, P::Open(1));
    assert_eq!(j.found, vec![1]);
    assert_eq!(j.marker, original.marker);
    assert_eq!(j.fingerprint, original.fingerprint);
    assert!(j.terminal_observed_at.is_none());
    assert_eq!(
        query_empty::<Vec<String>>(&pic, GOVERNANCE, "recordings")
            .iter()
            .filter(|s| *s == "make_proposal")
            .count(),
        1
    );
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn reviewed_v2_financial_snapshot_migrates_without_duplicate_payment_or_proposal() {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let provenance: serde_json::Value = serde_json::from_slice(
        &std::fs::read(
            root().join("tests/pocketic/fixtures/rc2-v2-financial-maturity-stable.json"),
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        provenance["source_commit"],
        "e14c9cb2fcc511472dfe273f9cee355c5d9f4a83"
    );
    assert_eq!(
        provenance["module_sha256"],
        "867a31ec9a95b68b2d8a983d1e3ed406119b67a67b96270c3ef666093dc57019"
    );
    let compressed = std::fs::read(
        root().join("tests/pocketic/fixtures/rc2-v2-financial-maturity-stable.bin.gz"),
    )
    .unwrap();
    assert_eq!(
        hex::encode(Sha256::digest(&compressed)),
        provenance["gzip_sha256"].as_str().unwrap()
    );
    let mut stable = Vec::new();
    flate2::read::GzDecoder::new(compressed.as_slice())
        .read_to_end(&mut stable)
        .unwrap();
    assert_eq!(
        hex::encode(Sha256::digest(&stable)),
        provenance["stable_sha256"].as_str().unwrap()
    );
    let blocks_bytes =
        std::fs::read(root().join("tests/pocketic/fixtures/rc2-v2-ledger-blocks.candid")).unwrap();
    assert_eq!(
        hex::encode(Sha256::digest(&blocks_bytes)),
        provenance["ledger_history_sha256"].as_str().unwrap()
    );
    let blocks: Vec<quorum_ic_clients::ledger::Block> = candid::decode_one(&blocks_bytes).unwrap();
    let (pic, app, w) = owned_setup();
    assert_eq!(app.to_text(), provenance["app"].as_str().unwrap());
    pic.stop_canister(app, None).unwrap();
    pic.set_time(pocket_ic::Time::from_nanos_since_unix_epoch(
        provenance["time_seconds"].as_u64().unwrap() * 1_000_000_000,
    ));
    let _: () = update(&pic, LEDGER, Principal::anonymous(), "ledger_init", 0u64);
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_staking_fund",
        1_000_000_000u64,
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_restore_history",
        blocks,
    );
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "reject_refresh_for",
        Some(100u64),
    );
    pic.set_stable_memory(
        app,
        stable,
        pocket_ic::common::rest::BlobCompression::NoCompression,
    );
    pic.upgrade_canister(app, w.clone(), encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    pic.start_canister(app, None).unwrap();
    let original = transfers(&pic, app);
    assert_eq!(original.len(), 1);
    assert_eq!(original[0].amount, 1_990_000);
    assert_eq!(original[0].status, TransferStatus::Confirmed { block: 0 });
    assert_exact_payment_blocks(&pic, app, &original);
    let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
        .unwrap();
    assert!(matches!(
        j.phase,
        d_quorum::state::ProposalPhase::Executed(1)
    ));
    assert!(j.executed_at.is_none() && !j.saw_disbursement && j.earliest_finalization.is_none());
    for _ in 0..100 {
        drive(&pic, 120);
        let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
            .unwrap();
        if matches!(
            j.phase,
            d_quorum::state::ProposalPhase::TerminalExecutionVerified(1)
        ) && query_empty::<d_quorum::Health>(&pic, app, "health").pending_refreshes == 1
        {
            break;
        }
    }
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let retained = transfers(&pic, app);
    assert_eq!(retained[0].destination, original[0].destination);
    assert_eq!(retained[0].amount, original[0].amount);
    assert_eq!(retained[0].attempt, original[0].attempt);
    assert_eq!(retained[0].status, original[0].status);
    assert_ne!(
        retained[0].refresh,
        Some(quorum_accounting::RefreshState::Complete)
    );
    assert_eq!(plans(&pic, app)[0].reserved, 0);
    let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
        .unwrap();
    assert!(matches!(
        j.phase,
        d_quorum::state::ProposalPhase::TerminalExecutionVerified(1)
    ));
    assert!(j.executed_at.is_none() && j.receipt.is_none() && j.terminal_observed_at.is_some());
    assert_eq!(
        query_empty::<quorum_mocks::LedgerStats>(&pic, LEDGER, "ledger_stats").transfer_calls,
        0
    );
    assert!(
        !query_empty::<Vec<String>>(&pic, GOVERNANCE, "recordings")
            .iter()
            .any(|s| s == "make_proposal")
    );
    assert_eq!(
        query_empty::<d_quorum::Configuration>(&pic, app, "configuration")
            .config
            .mode,
        Mode::Live
    );
}
#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn twelve_ambiguous_transfer_replies_remain_bound_after_cooldown_and_upgrade() {
    let (pic, app, w) = setup(Mode::Live, true, 200_000_000_000_000);
    wait(&pic, app, "complete");
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_init",
        3_000_000u64,
    );
    for _ in 0..12 {
        let _: () = update(
            &pic,
            LEDGER,
            Principal::anonymous(),
            "ledger_fault",
            quorum_mocks::LedgerFault::LoseReplyWithoutCommit,
        );
    }
    drive(&pic, 86400);
    let mut original = None;
    for _ in 0..100 {
        drive(&pic, 10);
        let ts = transfers(&pic, app);
        if ts
            .first()
            .is_some_and(|t| matches!(t.status, TransferStatus::Held { .. }))
        {
            original = Some(ts);
            break;
        }
    }
    let original = original.expect("ambiguous retries not bounded");
    assert_eq!(original[0].attempt.as_ref().unwrap().number, 1);
    assert!(original[0].attempt.as_ref().unwrap().may_have_executed);
    assert_eq!(
        query_empty::<quorum_mocks::LedgerStats>(&pic, LEDGER, "ledger_stats").transfer_calls,
        12
    );
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_fee",
        12_000u64,
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_deposit",
        6_000u64,
    );
    drive(&pic, 3 * 86400);
    for _ in 0..3 {
        drive(&pic, 3601);
    }
    let retained = transfers(&pic, app);
    assert_eq!(retained[0].attempt, original[0].attempt);
    assert!(retained[0].rejected_attempts.is_empty());
    assert!(retained[1..].iter().all(|t| t.attempt.is_none()));
    assert_eq!(plans(&pic, app)[0].reserved, 3_000_000);
    assert!(!plans(&pic, app)[0].complete);
    let stats = query_empty::<quorum_mocks::LedgerStats>(&pic, LEDGER, "ledger_stats");
    assert_eq!(stats.transfer_calls, 12);
    assert_eq!(stats.blocks, 0);
}

#[test]
#[ignore = "xtask hardening prepares production Wasm"]
fn maintenance_last_attempt_lost_during_upgrade_remains_bounded_and_never_resends_payment() {
    use quorum_accounting::RefreshState as R;
    let (pic, app, w) = setup(Mode::Live, false, 200_000_000_000_000);
    wait(&pic, app, "complete");
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "reject_refresh_for",
        Some(100u64),
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_init",
        1_000_000u64,
    );
    drive(&pic, 86400);
    for expected in 1..=7 {
        let mut due = None;
        for _ in 0..100 {
            drive(&pic, 10);
            if let Some(t) = transfers(&pic, app).first()
                && let Some(R::RetryAt {
                    attempts,
                    next_at,
                    reason,
                }) = &t.refresh
                && *attempts == expected
                && !reason.contains("not yet verified")
            {
                due = Some(*next_at);
                break;
            }
        }
        let due = due.unwrap_or_else(|| panic!("maintenance attempt {expected} not reached"));
        if expected == 7 {
            let _: () = update(
                &pic,
                GOVERNANCE,
                Principal::anonymous(),
                "pause_full_once",
                (100u64, 3600u32),
            );
        }
        drive(&pic, due.saturating_sub(now(&pic)) + 1);
    }
    let original = transfers(&pic, app)[0].clone();
    assert!(matches!(
        original.refresh,
        Some(R::RetryAt { attempts: 8, .. })
    ));
    assert!(
        query_empty::<Vec<String>>(&pic, GOVERNANCE, "recordings")
            .iter()
            .any(|s| s == "full_read_paused")
    );
    pic.upgrade_canister(app, w, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    drive(&pic, 86401);
    for _ in 0..20 {
        drive(&pic, 10);
    }
    let t = transfers(&pic, app)[0].clone();
    assert!(matches!(t.refresh, Some(R::Abandoned { .. })));
    assert_eq!(t.attempt, original.attempt);
    assert_eq!(t.status, original.status);
    assert_eq!(
        query_empty::<quorum_mocks::LedgerStats>(&pic, LEDGER, "ledger_stats").blocks,
        1
    );
    assert_eq!(
        query_empty::<Vec<String>>(&pic, GOVERNANCE, "recordings")
            .iter()
            .filter(|s| s.as_str() == "refresh:100")
            .count(),
        7
    );
}
