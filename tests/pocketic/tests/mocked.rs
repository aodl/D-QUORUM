mod support;
use candid::{Principal, encode_one};
use d_quorum::state::{Init, Mode};
use quorum_ic_clients::{GOVERNANCE, governance as g};
use quorum_policy::{SCALE, TARGET};
use support::*;
fn setup(mode: Mode) -> (pocket_ic::PocketIc, Principal, Vec<u8>) {
    let production = wasm("d_quorum");
    let mock = wasm("quorum_mocks");
    let pic = builder().build();
    let app = pic.create_canister();
    pic.add_cycles(app, 100_000_000_000_000);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    pic.create_canister_with_id(None, None, GOVERNANCE).unwrap();
    pic.add_cycles(GOVERNANCE, 100_000_000_000_000);
    pic.install_canister(
        GOVERNANCE,
        mock,
        encode_one(Some(fixture(now(&pic), empty, app))).unwrap(),
        None,
    );
    pic.install_canister(
        app,
        production.clone(),
        encode_one(Some(Init {
            mode,
            expected_target_controller: Some(user(9)),
        }))
        .unwrap(),
        None,
    );
    (pic, app, production)
}
fn wait_ready(pic: &pocket_ic::PocketIc, app: Principal, desired: &str) {
    for _ in 0..260 {
        drive(pic, 10);
        let p: d_quorum::ScanProgress = query_empty(pic, app, "scan_progress");
        if p.phase == desired {
            return;
        }
        if p.phase == "failed" {
            let h: d_quorum::Health = query_empty(pic, app, "health");
            panic!("scan failed: {h:?}");
        }
    }
    let h: d_quorum::Health = query_empty(pic, app, "health");
    panic!("scan did not reach {desired}: {h:?}")
}
#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn production_timers_ignore_private_support_and_recover_upgrade_configuration() {
    let (pic, app, production) = setup(Mode::ObserveOnly);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let mut f = fixture(now(&pic), empty, app);
    let mut owned = raw(300, app, now(&pic));
    owned.account =
        quorum_ic_clients::ledger::staking_subaccount(app, d_quorum::state::BOOTSTRAP_NONCE);
    owned.followees = vec![fs(4, &[100])];
    owned.deciding_voting_power = Some(u64::MAX);
    owned.potential_voting_power = Some(u64::MAX);
    f.infos.push(g::NeuronInfo {
        id: owned.id.clone(),
        retrieved_at_timestamp_seconds: now(&pic),
        known_neuron_data: None,
        visibility: Some(2),
    });
    f.neurons.push(owned);
    f.infos.sort_by_key(|n| n.id.as_ref().unwrap().id);
    let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "replace", f);
    wait_ready(&pic, app, "ready");
    let completed: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    drive(&pic, 60);
    let held: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    assert_eq!(held.round, completed.round);
    assert_eq!(held.phase, "ready");
    let scores: Vec<d_quorum::Score> =
        query2(&pic, app, "score_page", (None::<(i32, u64)>, 100u16));
    assert_eq!(scores.len(), 1);
    assert_eq!(scores[0].scaled_score, 12000 * SCALE);
    assert!(scores[0].complete);
    let roster: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
    assert_eq!(
        roster.iter().find(|r| r.topic == 4).unwrap().planned,
        vec![100]
    );
    assert!(roster.iter().all(|r| r.applied.is_empty()));
    let rejects: Result<u64, String> = update(
        &pic,
        app,
        Principal::anonymous(),
        "set_delegates_per_topic",
        3u8,
    );
    assert!(rejects.is_err());
    let before: d_quorum::Health = query_empty(&pic, app, "health");
    assert!(
        before.proposer.is_none(),
        "account binding must exclude support even before bootstrap"
    );
    pic.upgrade_canister(app, production, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let after: d_quorum::Health = query_empty(&pic, app, "health");
    assert_eq!(before.stable_snapshot_bytes, after.stable_snapshot_bytes);
    assert!(after.jobs[0].generation > before.jobs[0].generation);
    let revision: Result<u64, String> =
        update(&pic, app, GOVERNANCE, "set_delegates_per_topic", 3u8);
    assert_eq!(revision.unwrap(), 1);
    let progress: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    assert_eq!(progress.round, None);
}
#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn lost_set_following_reply_is_read_back_once_and_preserves_management() {
    let (pic, app, _) = setup(Mode::Live);
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "enqueue",
        quorum_mocks::Script {
            method: "manage_neuron".into(),
            reply: Some(vec![0, 1, 2]),
            reject: None,
        },
    );
    let mut pending_round = None;
    for _ in 0..260 {
        drive(&pic, 10);
        let p: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
        let h: d_quorum::Health = query_empty(&pic, app, "health");
        if p.phase == "applying"
            && h.jobs[0]
                .last_error
                .as_ref()
                .is_some_and(|e| e.contains("decode"))
        {
            pending_round = p.round;
            break;
        }
    }
    let pending_round = pending_round.expect("lost reply must leave a dispatched intent");
    let revision: Result<u64, String> =
        update(&pic, app, GOVERNANCE, "set_delegates_per_topic", 3u8);
    assert_eq!(revision.unwrap(), 1);
    drive(&pic, 10); // Read back the old revision before beginning the new one.
    let reconciled: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    assert_eq!(reconciled.phase, "complete");
    assert_eq!(reconciled.round, Some(pending_round));
    drive(&pic, 10);
    wait_ready(&pic, app, "complete");
    let new: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    assert_eq!(new.revision, Some(1));
    assert!(new.round.unwrap() > pending_round);
    let roster: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
    assert_eq!(
        roster.iter().find(|r| r.topic == 4).unwrap().applied,
        vec![100]
    );
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert_eq!(
        calls
            .iter()
            .filter(|x| x.as_str() == "manage_neuron")
            .count(),
        1
    );
    let n: g::ListNeuronsResponse = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "list_neurons",
        g::ListNeurons {
            neuron_ids: vec![TARGET],
            include_neurons_readable_by_caller: false,
            include_empty_neurons_readable_by_caller: Some(false),
            include_public_neurons_in_full_neurons: Some(true),
            page_number: Some(0),
            page_size: Some(50),
            neuron_subaccounts: None,
        },
    );
    assert_eq!(
        n.full_neurons[0]
            .followees
            .iter()
            .find(|(t, _)| *t == 1)
            .unwrap()
            .1
            .followees
            .iter()
            .map(|n| n.id)
            .collect::<Vec<_>>(),
        vec![101, 102, 103]
    );
}
#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn malformed_page_retries_without_zeroing_or_duplicate_counting() {
    let (pic, app, _) = setup(Mode::ObserveOnly);
    let bad = g::IndexPage {
        neurons: vec![g::NeuronInfo {
            id: Some(g::NeuronId { id: 0 }),
            retrieved_at_timestamp_seconds: now(&pic),
            known_neuron_data: None,
            visibility: Some(2),
        }],
    };
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "enqueue",
        quorum_mocks::Script {
            method: "get_neuron_index".into(),
            reply: Some(encode_one(Result::<_, g::GovernanceError>::Ok(bad)).unwrap()),
            reject: None,
        },
    );
    wait_ready(&pic, app, "ready");
    let scores: Vec<d_quorum::Score> =
        query2(&pic, app, "score_page", (None::<(i32, u64)>, 100u16));
    assert_eq!(scores[0].scaled_score, 12000 * SCALE);
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert_eq!(
        calls
            .iter()
            .filter(|x| x.as_str() == "get_neuron_index")
            .count(),
        3
    );
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn lost_transfer_reply_upgrade_and_deposit_preserve_one_obligation() {
    let (pic, app, production) = setup(Mode::Live);
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
    let ledger = quorum_ic_clients::LEDGER;
    pic.create_canister_with_id(None, None, ledger).unwrap();
    pic.add_cycles(ledger, 100_000_000_000_000);
    pic.install_canister(
        ledger,
        wasm("quorum_mocks"),
        encode_one(None::<quorum_mocks::Fixture>).unwrap(),
        None,
    );
    // The staged-account balance check is independently daily. Seed only after the complete roster exists.
    wait_ready(&pic, app, "complete");
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_init",
        1_000_003u64,
    );
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_fault",
        quorum_mocks::LedgerFault::LoseReplyAfterCommit,
    );
    drive(&pic, 86400);
    let mut first = None;
    for _ in 0..15 {
        drive(&pic, 10);
        let ps: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        if let Some(p) = ps.first() {
            first = Some(p.id);
            let bytes = pic
                .query_call(
                    app,
                    Principal::anonymous(),
                    "transfer_page",
                    candid::encode_args((p.id, 0u32, 100u16)).unwrap(),
                )
                .unwrap();
            let ts: Vec<quorum_accounting::Transfer> = candid::decode_one(&bytes).unwrap();
            if matches!(
                ts[0].status,
                quorum_accounting::TransferStatus::Unknown { .. }
            ) {
                break;
            }
        }
    }
    let id = first.expect("payout did not start");
    pic.upgrade_canister(app, production, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_deposit",
        500_000u64,
    );
    for _ in 0..8 {
        drive(&pic, 10);
    }
    let ps: Vec<d_quorum::PayoutSummary> = query2(&pic, app, "payout_page", (None::<u64>, 100u16));
    assert_eq!(ps[0].id, id);
    assert!(ps[0].complete);
    assert_eq!(ps[0].observed_balance, 1_000_003);
    let stats: quorum_mocks::LedgerStats = query_empty(&pic, ledger, "ledger_stats");
    assert_eq!(
        stats.blocks, 1,
        "lost reply caused duplicate value movement"
    );
    assert_eq!(stats.balance, 500_000);
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn partial_payment_bad_fee_roster_change_and_deposit_never_rebuild_plan() {
    let (pic, app, production) = setup(Mode::Live);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let mut f = fixture(now(&pic), empty, app);
    let mut added = vec![];
    for id in 100..=105 {
        let mut n = f
            .neurons
            .iter()
            .find(|n| n.id.as_ref().unwrap().id == id)
            .unwrap()
            .clone();
        n.id = Some(g::NeuronId { id: id + 10 });
        n.account = vec![(id + 10) as u8; 32];
        n.known_neuron_data = Some(known(id + 10));
        for (_, fs) in &mut n.followees {
            for n in &mut fs.followees {
                if (101..=105).contains(&n.id) {
                    n.id += 10;
                }
            }
        }
        added.push(n);
    }
    f.neurons.extend(added);
    let mut follower = raw(202, user(2), now(&pic));
    follower.followees = vec![fs(4, &[110])];
    f.neurons.push(follower);
    f.neurons.sort_by_key(|n| n.id.as_ref().unwrap().id);
    f.infos = f
        .neurons
        .iter()
        .map(|n| g::NeuronInfo {
            id: n.id.clone(),
            retrieved_at_timestamp_seconds: now(&pic),
            known_neuron_data: n.known_neuron_data.clone(),
            visibility: n.visibility,
        })
        .collect();
    f.known = f
        .neurons
        .iter()
        .filter_map(|n| {
            n.known_neuron_data.as_ref().map(|m| g::KnownNeuron {
                id: n.id.clone(),
                known_neuron_data: Some(m.clone()),
            })
        })
        .collect();
    let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "replace", f);
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
    let ledger = quorum_ic_clients::LEDGER;
    pic.create_canister_with_id(None, None, ledger).unwrap();
    pic.add_cycles(ledger, 100_000_000_000_000);
    pic.install_canister(
        ledger,
        wasm("quorum_mocks"),
        encode_one(None::<quorum_mocks::Fixture>).unwrap(),
        None,
    );
    wait_ready(&pic, app, "complete");
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_init",
        1_000_003u64,
    );
    drive(&pic, 86400);
    let mut id = None;
    for _ in 0..30 {
        drive(&pic, 10);
        let ps: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        if let Some(p) = ps.first() {
            assert_eq!(p.recipient_count, 2);
            id = Some(p.id);
            if p.confirmed_count == 1 {
                break;
            }
        }
    }
    let id = id.unwrap();
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_fault",
        quorum_mocks::LedgerFault::BadFee(10_001),
    );
    drive(&pic, 10);
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_deposit",
        500_000u64,
    );
    let _: Result<u64, String> = update(&pic, app, GOVERNANCE, "set_delegates_per_topic", 1u8);
    pic.upgrade_canister(app, production, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    for _ in 0..5 {
        drive(&pic, 10);
    }
    let bytes = pic
        .query_call(
            app,
            Principal::anonymous(),
            "transfer_page",
            candid::encode_args((id, 0u32, 100u16)).unwrap(),
        )
        .unwrap();
    let ts: Vec<quorum_accounting::Transfer> = candid::decode_one(&bytes).unwrap();
    assert_eq!(ts.len(), 2);
    assert_eq!(ts[0].amount, 490_001);
    assert_eq!(ts[1].amount, 490_001);
    assert!(matches!(
        ts[0].status,
        quorum_accounting::TransferStatus::Confirmed { .. }
    ));
    assert!(matches!(
        ts[1].status,
        quorum_accounting::TransferStatus::Held { .. }
    ));
    let stats: quorum_mocks::LedgerStats = query_empty(&pic, ledger, "ledger_stats");
    assert_eq!(stats.blocks, 1);
    let ps: Vec<d_quorum::PayoutSummary> = query2(&pic, app, "payout_page", (None::<u64>, 100u16));
    assert_eq!(ps[0].id, id);
    assert_eq!(ps[0].confirmed_count, 1);
    assert_eq!(ps[0].reserved, 500_001);
    assert_eq!(ps[0].dust, 1);
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn expired_dedup_and_missing_history_hold_until_authoritative_match() {
    let (pic, app, production) = setup(Mode::Live);
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
    let ledger = quorum_ic_clients::LEDGER;
    pic.create_canister_with_id(None, None, ledger).unwrap();
    pic.add_cycles(ledger, 100_000_000_000_000);
    pic.install_canister(
        ledger,
        wasm("quorum_mocks"),
        encode_one(None::<quorum_mocks::Fixture>).unwrap(),
        None,
    );
    wait_ready(&pic, app, "complete");
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_init",
        1_000_003u64,
    );
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_fault",
        quorum_mocks::LedgerFault::LoseReplyAfterCommit,
    );
    drive(&pic, 86400);
    let mut id = None;
    for _ in 0..20 {
        drive(&pic, 10);
        let ps: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        if let Some(p) = ps.first() {
            let bytes = pic
                .query_call(
                    app,
                    Principal::anonymous(),
                    "transfer_page",
                    candid::encode_args((p.id, 0u32, 100u16)).unwrap(),
                )
                .unwrap();
            let ts: Vec<quorum_accounting::Transfer> = candid::decode_one(&bytes).unwrap();
            if matches!(
                ts[0].status,
                quorum_accounting::TransferStatus::Unknown { .. }
            ) {
                id = Some(p.id);
                break;
            }
        }
    }
    let id = id.expect("lost reply was not persisted");
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_fault",
        quorum_mocks::LedgerFault::LagHistory,
    );
    pic.stop_canister(ledger, None).unwrap();
    drive(&pic, 25 * 3600);
    pic.upgrade_canister(app, production, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    pic.start_canister(ledger, None).unwrap();
    drive(&pic, 120);
    let bytes = pic
        .query_call(
            app,
            Principal::anonymous(),
            "transfer_page",
            candid::encode_args((id, 0u32, 100u16)).unwrap(),
        )
        .unwrap();
    let held: Vec<quorum_accounting::Transfer> = candid::decode_one(&bytes).unwrap();
    assert!(matches!(
        held[0].status,
        quorum_accounting::TransferStatus::Held { .. }
    ));
    let p: Vec<d_quorum::PayoutSummary> = query2(&pic, app, "payout_page", (None::<u64>, 100u16));
    assert_eq!(p[0].reserved, 1_000_003);
    assert_eq!(p[0].confirmed_count, 0);
    drive(&pic, 10);
    let p: Vec<d_quorum::PayoutSummary> = query2(&pic, app, "payout_page", (None::<u64>, 100u16));
    assert_eq!(p[0].confirmed_count, 1);
    let stats: quorum_mocks::LedgerStats = query_empty(&pic, ledger, "ledger_stats");
    assert_eq!(stats.blocks, 1);
    assert_eq!(stats.balance, 0);
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn lost_proposal_reply_recovers_exact_history_after_upgrade_without_resubmission() {
    let (pic, app, production) = setup(Mode::Live);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let mut f = fixture(now(&pic), empty, app);
    let mut owned = raw(300, app, now(&pic));
    owned.visibility = Some(1);
    owned.account =
        quorum_ic_clients::ledger::staking_subaccount(app, d_quorum::state::BOOTSTRAP_NONCE);
    f.neurons.push(owned.clone());
    f.infos.push(g::NeuronInfo {
        id: owned.id.clone(),
        retrieved_at_timestamp_seconds: now(&pic),
        known_neuron_data: None,
        visibility: Some(1),
    });
    f.infos.sort_by_key(|i| i.id.as_ref().unwrap().id);
    let target = f
        .neurons
        .iter_mut()
        .find(|n| n.id.as_ref().unwrap().id == TARGET)
        .unwrap();
    target.maturity_e8s_equivalent = 5_000_000_000;
    target.followees.retain(|(t, _)| *t != 1);
    target.followees.push(fs(1, &[101, 102, 103, 300]));
    let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "replace", f);
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
    let ledger = quorum_ic_clients::LEDGER;
    pic.create_canister_with_id(None, None, ledger).unwrap();
    pic.add_cycles(ledger, 100_000_000_000_000);
    pic.install_canister(
        ledger,
        wasm("quorum_mocks"),
        encode_one(None::<quorum_mocks::Fixture>).unwrap(),
        None,
    );
    let _: () = update(&pic, ledger, Principal::anonymous(), "ledger_init", 0u64);
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_staking_fund",
        10_000_000_000u64,
    );
    let mut before = None;
    for _ in 0..100 {
        drive(&pic, 10);
        let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(j) = j
            && matches!(j.phase, d_quorum::state::ProposalPhase::Preflight)
        {
            before = Some(j);
            break;
        }
    }
    let before = before.expect("specific proposal did not reach preflight");
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "enqueue",
        quorum_mocks::Script {
            method: "manage_neuron".into(),
            reply: Some(vec![0, 1, 2]),
            reject: None,
        },
    );
    drive(&pic, 10);
    let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
    assert!(matches!(
        j.unwrap().phase,
        d_quorum::state::ProposalPhase::Ambiguous
    ));
    pic.upgrade_canister(app, production, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let mut recovered = None;
    for _ in 0..20 {
        drive(&pic, 10);
        let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(j) = j
            && matches!(j.phase, d_quorum::state::ProposalPhase::Open(1))
        {
            recovered = Some(j);
            break;
        }
    }
    let recovered =
        recovered.expect("lost proposal was not recovered from exact authorized history");
    assert_eq!(recovered.operation, before.operation);
    assert_eq!(recovered.fingerprint, before.fingerprint);
    assert_eq!(recovered.marker, before.marker);
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert_eq!(
        calls
            .iter()
            .filter(|x| x.as_str() == "make_proposal")
            .count(),
        1
    );
    let stats: quorum_mocks::LedgerStats = query_empty(&pic, ledger, "ledger_stats");
    assert_eq!(
        stats.blocks, 0,
        "proposal creation must not be treated as a receipt"
    );
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "proposal_status",
        (1u64, 2i32),
    );
    drive(&pic, 3600);
    let rejected: Option<d_quorum::state::ProposalJob> =
        query_empty(&pic, app, "proposal_progress");
    let rejected = rejected.unwrap();
    assert!(matches!(
        rejected.phase,
        d_quorum::state::ProposalPhase::Rejected(1)
    ));
    assert!(rejected.retry_after > now(&pic));
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert_eq!(
        calls
            .iter()
            .filter(|x| x.as_str() == "make_proposal")
            .count(),
        1
    );
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn selected_manager_change_and_downstream_cycle_invalidate_before_writing() {
    for cycle in [false, true] {
        let (pic, app, _) = setup(Mode::Live);
        pic.set_controllers(
            GOVERNANCE,
            None,
            vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
        )
        .unwrap();
        let empty = pic.create_canister();
        pic.set_controllers(empty, None, vec![]).unwrap();
        if !cycle {
            for _ in 0..200 {
                drive(&pic, 10);
                let p: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
                if p.phase == "revalidation" {
                    break;
                }
            }
        }
        let mut f = fixture(now(&pic), empty, app);
        if cycle {
            f.neurons
                .iter_mut()
                .find(|n| n.id.as_ref().unwrap().id == dendrite_types::OMEGA_REJECT_NEURON_ID)
                .unwrap()
                .followees = vec![fs(4, &[TARGET])];
        } else {
            let mut manager = raw(106, user(106), now(&pic));
            manager.known_neuron_data = Some(known(106));
            f.neurons.push(manager.clone());
            f.infos.push(g::NeuronInfo {
                id: manager.id.clone(),
                retrieved_at_timestamp_seconds: now(&pic),
                known_neuron_data: manager.known_neuron_data.clone(),
                visibility: Some(2),
            });
            let n = f
                .neurons
                .iter_mut()
                .find(|n| n.id.as_ref().unwrap().id == 100)
                .unwrap();
            n.followees.retain(|(t, _)| *t != 1);
            n.followees.push(fs(1, &[101, 102, 103, 104, 106]));
        }
        f.infos.sort_by_key(|i| i.id.as_ref().unwrap().id);
        let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "replace", f);
        let mut failed = false;
        for _ in 0..240 {
            drive(&pic, 10);
            let p: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
            if p.phase == "failed" {
                failed = true;
                break;
            }
        }
        assert!(failed, "material change/cycle was not rejected");
        let progress: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
        assert!(
            progress
                .last_failure
                .as_ref()
                .is_some_and(|s| s.contains(if cycle { "cycle" } else { "candidate changed" }))
        );
        let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
        assert!(!calls.iter().any(|x| x == "manage_neuron"));
        let r: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
        assert!(r.iter().all(|r| r.applied.is_empty()));
    }
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn failed_complete_discovery_round_retains_previous_applied_roster() {
    let (pic, app, _) = setup(Mode::Live);
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
    wait_ready(&pic, app, "complete");
    let previous: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
    for _ in 0..5 {
        let _: () = update(
            &pic,
            GOVERNANCE,
            Principal::anonymous(),
            "enqueue",
            quorum_mocks::Script {
                method: "list_known_neurons".into(),
                reply: None,
                reject: Some("temporary discovery outage".into()),
            },
        );
    }
    drive(&pic, 7 * 86400);
    for delay in [120, 240, 480, 960] {
        drive(&pic, delay);
    }
    let scan: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    assert_eq!(scan.phase, "failed");
    assert_eq!(scan.failures, 5);
    let after: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
    for (a, b) in after.iter().zip(&previous) {
        assert_eq!(a.applied, b.applied);
        assert_eq!(a.applied_round, b.applied_round);
    }
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn delayed_expired_callback_cannot_restore_an_older_discovery_result() {
    let (pic, app, _) = setup(Mode::ObserveOnly);
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "delay_known_once",
        1200u32,
    );
    // Do not use await_ingress here: it may drive enough rounds to finish the delayed call.
    pic.advance_time(std::time::Duration::from_secs(10));
    for _ in 0..10 {
        pic.tick();
        let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
        if calls.iter().any(|x| x == "known_delay_started") {
            break;
        }
    }
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert!(calls.iter().any(|x| x == "known_delay_started"));
    assert!(!calls.iter().any(|x| x == "list_known_neurons"));
    let mut changed = fixture(now(&pic), Principal::anonymous(), app);
    changed.known.clear();
    for n in &mut changed.neurons {
        n.known_neuron_data = None;
    }
    for n in &mut changed.infos {
        n.known_neuron_data = None;
    }
    pic.submit_call(
        GOVERNANCE,
        Principal::anonymous(),
        "replace",
        encode_one(changed).unwrap(),
    )
    .unwrap();
    for _ in 0..5 {
        pic.tick();
    }
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    assert!(calls.iter().any(|x| x == "fixture_replaced"));
    assert!(!calls.iter().any(|x| x == "list_known_neurons"));
    drive(&pic, 601);
    wait_ready(&pic, app, "ready");
    let before: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    drive(&pic, 601); // Deliver the old response after the replacement discovery has finished.
    let p: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    assert_eq!(p.round, before.round);
    assert_eq!(p.discovered_candidates, 0);
    assert_eq!(p.evaluated_candidates, 0);
    let h: d_quorum::Health = query_empty(&pic, app, "health");
    assert!(h.jobs[0].generation > 1);
    let scores: Vec<d_quorum::Score> =
        query2(&pic, app, "score_page", (None::<(i32, u64)>, 100u16));
    assert!(scores.is_empty());
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn partial_full_batch_failure_and_scan_upgrade_count_each_public_neuron_once() {
    let (pic, app, production) = setup(Mode::ObserveOnly);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let mut f = fixture(now(&pic), empty, app);
    for id in 202..=290 {
        let mut n = raw(id, user(2), now(&pic));
        n.followees = vec![fs(4, &[100])];
        f.infos.push(g::NeuronInfo {
            id: n.id.clone(),
            retrieved_at_timestamp_seconds: now(&pic),
            known_neuron_data: None,
            visibility: Some(2),
        });
        f.neurons.push(n);
    }
    f.infos.sort_by_key(|n| n.id.as_ref().unwrap().id);
    let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "replace", f);
    let mut interrupted = false;
    for _ in 0..200 {
        drive(&pic, 10);
        let p: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
        if p.phase == "index" && p.full_batches == 1 {
            interrupted = true;
            break;
        }
    }
    assert!(interrupted);
    let partial: Vec<d_quorum::Score> =
        query2(&pic, app, "score_page", (None::<(i32, u64)>, 100u16));
    assert!(partial.is_empty(), "partial rankings must not be published");
    pic.upgrade_canister(app, production, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "enqueue",
        quorum_mocks::Script {
            method: "list_neurons".into(),
            reply: Some(vec![0, 1, 2]),
            reject: None,
        },
    );
    wait_ready(&pic, app, "ready");
    let scores: Vec<d_quorum::Score> =
        query2(&pic, app, "score_page", (None::<(i32, u64)>, 100u16));
    assert_eq!(scores.len(), 1);
    assert_eq!(scores[0].scaled_score, 1_080_000 * SCALE);
    let p: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    assert_eq!(p.full_batches, 2);
    assert_eq!(p.failures, 1);
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn valid_empty_round_clears_ordinary_following_and_nonempty_catchall_blocks_writes() {
    for catchall in [false, true] {
        let (pic, app, _) = setup(Mode::Live);
        let empty = pic.create_canister();
        pic.set_controllers(empty, None, vec![]).unwrap();
        let mut f = fixture(now(&pic), empty, app);
        if catchall {
            f.neurons
                .iter_mut()
                .find(|n| n.id.as_ref().unwrap().id == TARGET)
                .unwrap()
                .followees
                .push(fs(0, &[100]));
        } else {
            f.known.clear();
            for n in &mut f.neurons {
                n.known_neuron_data = None;
            }
            for n in &mut f.infos {
                n.known_neuron_data = None;
            }
        }
        let _: () = update(&pic, GOVERNANCE, Principal::anonymous(), "replace", f);
        pic.set_controllers(
            GOVERNANCE,
            None,
            vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
        )
        .unwrap();
        if catchall {
            wait_ready(&pic, app, "ready");
            drive(&pic, 10);
            let first: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
            assert!(
                first
                    .last_failure
                    .as_ref()
                    .is_some_and(|e| e.contains("CatchAll")),
                "{first:?}"
            );
            for delay in [120, 240, 480, 960] {
                drive(&pic, delay);
            }
            let p: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
            assert_eq!(p.phase, "failed");
            let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
            assert!(!calls.iter().any(|c| c == "manage_neuron"));
        } else {
            wait_ready(&pic, app, "complete");
            let rosters: Vec<d_quorum::RosterView> =
                query2(&pic, app, "roster_page", (0u16, 100u16));
            assert!(
                rosters
                    .iter()
                    .all(|r| r.applied_round.is_some() && r.applied.is_empty())
            );
        }
    }
}

#[test]
#[ignore = "xtask mock prepares production Wasm first"]
fn insufficient_funds_reply_holds_original_entitlement_across_upgrade() {
    let (pic, app, production) = setup(Mode::Live);
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
    let ledger = quorum_ic_clients::LEDGER;
    pic.create_canister_with_id(None, None, ledger).unwrap();
    pic.add_cycles(ledger, 100_000_000_000_000);
    pic.install_canister(
        ledger,
        wasm("quorum_mocks"),
        encode_one(None::<quorum_mocks::Fixture>).unwrap(),
        None,
    );
    wait_ready(&pic, app, "complete");
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_init",
        1_000_000u64,
    );
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_fault",
        quorum_mocks::LedgerFault::InsufficientFunds,
    );
    drive(&pic, 86400);
    let mut held = None;
    for _ in 0..20 {
        drive(&pic, 10);
        let plans: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        if let Some(p) = plans.first() {
            let transfers: Vec<quorum_accounting::Transfer> =
                query2(&pic, app, "transfer_page", (p.id, 0u32, 100u16));
            if matches!(&transfers[0].status, quorum_accounting::TransferStatus::Held { reason } if reason.contains("InsufficientFunds"))
            {
                held = Some((p.id, transfers));
                break;
            }
        }
    }
    let (id, transfers) =
        held.expect("typed insufficient-funds response must retain an unpaid obligation");
    pic.upgrade_canister(app, production, encode_one(None::<Mode>).unwrap(), None)
        .unwrap();
    let _: () = update(
        &pic,
        ledger,
        Principal::anonymous(),
        "ledger_deposit",
        100_000u64,
    );
    drive(&pic, 3600);
    let after: Vec<quorum_accounting::Transfer> =
        query2(&pic, app, "transfer_page", (id, 0u32, 100u16));
    assert_eq!(after, transfers);
    let plans: Vec<d_quorum::PayoutSummary> =
        query2(&pic, app, "payout_page", (None::<u64>, 100u16));
    assert_eq!(plans[0].reserved, 1_000_000);
    assert_eq!(plans[0].observed_balance, 1_000_000);
    let stats: quorum_mocks::LedgerStats = query_empty(&pic, ledger, "ledger_stats");
    assert_eq!(stats.blocks, 0);
    assert_eq!(stats.balance, 1_100_000);
}
