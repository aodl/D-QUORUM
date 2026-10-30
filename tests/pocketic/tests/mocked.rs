mod support;
use candid::{Principal, encode_one};
use d_quorum::state::{Init, Mode};
use quorum_ic_clients::{GOVERNANCE, governance as g};
use quorum_policy::{SCALE, TARGET};
use support::*;
fn raw(id: u64, controller: Principal, at: u64) -> g::Neuron {
    g::Neuron {
        id: Some(g::NeuronId { id }),
        account: vec![(id % 251) as u8; 32],
        controller: Some(controller),
        not_for_profit: false,
        maturity_e8s_equivalent: 0,
        cached_neuron_stake_e8s: 1_000_000_000,
        created_timestamp_seconds: at - 100,
        auto_stake_maturity: Some(false),
        aging_since_timestamp_seconds: at - 100,
        hot_keys: vec![],
        dissolve_state: Some(g::DissolveState::DissolveDelaySeconds(
            dendrite_types::MAX_DISSOLVE_DELAY_SECONDS,
        )),
        followees: vec![],
        neuron_fees_e8s: 0,
        visibility: Some(2),
        known_neuron_data: None,
        voting_power_refreshed_timestamp_seconds: Some(at),
        deciding_voting_power: Some(12000),
        potential_voting_power: Some(12000),
        staked_maturity_e8s_equivalent: None,
        maturity_disbursements_in_progress: Some(vec![]),
    }
}
fn fixture(at: u64, empty: Principal, app: Principal) -> quorum_mocks::Fixture {
    let mut candidate = raw(100, empty, at);
    candidate.known_neuron_data = Some(known(100));
    candidate.followees = dendrite_types::RECOGNISED_TOPICS
        .into_iter()
        .map(|t| {
            if t == 1 {
                fs(t, &[101, 102, 103, 104, 105])
            } else if t == 4 {
                fs(t, &[101, 102, 103])
            } else {
                fs(t, &[dendrite_types::ALPHA_VOTE_NEURON_ID])
            }
        })
        .collect();
    let mut neurons = vec![candidate];
    for id in 101..=105 {
        let mut n = raw(id, user(id as u8), at);
        n.known_neuron_data = Some(known(id));
        n.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
        neurons.push(n);
    }
    for id in [
        dendrite_types::ALPHA_VOTE_NEURON_ID,
        dendrite_types::OMEGA_REJECT_NEURON_ID,
    ] {
        neurons.push(raw(id, user(1), at));
    }
    let mut follower = raw(200, user(2), at);
    follower.followees = vec![fs(4, &[100])];
    neurons.push(follower);
    let mut private = raw(201, app, at);
    private.visibility = Some(1);
    private.followees = vec![fs(4, &[100])];
    private.deciding_voting_power = Some(u64::MAX);
    private.potential_voting_power = Some(u64::MAX);
    neurons.push(private);
    let mut target = raw(TARGET, user(9), at);
    target.hot_keys = vec![app];
    target.followees = vec![
        fs(1, &[101, 102, 103]),
        fs(4, &[dendrite_types::ALPHA_VOTE_NEURON_ID]),
    ];
    neurons.push(target);
    neurons.sort_by_key(|n| n.id.as_ref().unwrap().id);
    let infos = neurons
        .iter()
        .map(|n| g::NeuronInfo {
            id: n.id.clone(),
            retrieved_at_timestamp_seconds: at,
            known_neuron_data: n.known_neuron_data.clone(),
            visibility: n.visibility,
        })
        .collect();
    let known = neurons
        .iter()
        .filter_map(|n| {
            n.known_neuron_data.as_ref().map(|m| g::KnownNeuron {
                id: n.id.clone(),
                known_neuron_data: Some(m.clone()),
            })
        })
        .collect();
    quorum_mocks::Fixture {
        neurons,
        known,
        infos,
    }
}
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
    wait_ready(&pic, app, "complete");
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
