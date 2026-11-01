mod support;
use candid::{Principal, encode_one};
use d_quorum::state::{Init, Mode};
use quorum_ic_clients::{GOVERNANCE, LEDGER, governance as g};
use quorum_policy::{TARGET, TOPICS};
use sha2::{Digest, Sha256};
use support::*;
fn data(at: u64, empty: Principal, app: Principal, n: usize) -> quorum_mocks::Fixture {
    let mut neurons = Vec::new();
    for i in 0..n {
        let id = 1000 + 2 * i as u64;
        let managers: Vec<_> = (0..5 + 5 * (i % 3))
            .map(|j| 10000 + i as u64 * 15 + j as u64)
            .collect();
        let mut c = raw(id, empty, at);
        c.known_neuron_data = Some(known(id));
        c.followees = dendrite_types::RECOGNISED_TOPICS
            .into_iter()
            .map(|t| {
                if t == 1 || TOPICS.contains(&t) {
                    fs(t, &managers)
                } else {
                    fs(t, &[dendrite_types::ALPHA_VOTE_NEURON_ID])
                }
            })
            .collect();
        // A compliant lower-score contender shares the entire manager set.
        // Adjacent IDs force real reuse during discovery, then greedy conflict exclusion.
        let mut overlap = c.clone();
        overlap.id = Some(g::NeuronId { id: id + 1 });
        overlap.known_neuron_data = Some(known(id + 1));
        neurons.push(c);
        neurons.push(overlap);
        for id in managers {
            let mut m = raw(id, user((i % 220 + 1) as u8), at);
            m.known_neuron_data = Some(known(id));
            m.followees = TOPICS
                .iter()
                .map(|t| fs(*t, &[dendrite_types::OMEGA_REJECT_NEURON_ID]))
                .collect();
            neurons.push(m);
        }
        let mut source = raw(100000 + i as u64, user(2), at);
        source.followees = TOPICS.iter().map(|t| fs(*t, &[id, id + 1])).collect();
        source.deciding_voting_power = Some(1000);
        neurons.push(source);
    }
    for k in 0..16 {
        for j in 0..3 {
            let id = 50000 + k * 3 + j;
            let mut d = raw(id, user(3), at);
            d.known_neuron_data = Some(known(id));
            d.followees = TOPICS
                .iter()
                .map(|t| fs(*t, &[dendrite_types::OMEGA_REJECT_NEURON_ID]))
                .collect();
            neurons.push(d);
        }
    }
    // A >30-dependency, conclusively invalid contender must not stall valid ones.
    let mut invalid = neurons[0].clone();
    invalid.id = Some(g::NeuronId { id: 900_000 });
    invalid.known_neuron_data = Some(known(900_000));
    for (t, following) in &mut invalid.followees {
        if let Some(k) = TOPICS.iter().position(|x| x == t) {
            following.followees = (0..3)
                .map(|j| g::NeuronId {
                    id: 50000 + k as u64 * 3 + j,
                })
                .collect();
        }
    }
    neurons.push(invalid);
    for (k, t) in TOPICS.iter().enumerate() {
        let mut f = raw(200000 + k as u64, user(4), at);
        let group = (0..n)
            .filter(|i| i % 16 == k)
            .map(|i| 1000 + 2 * i as u64)
            .collect::<Vec<_>>();
        f.followees = vec![fs(*t, &group)];
        f.deciding_voting_power = Some(1_000_000);
        f.potential_voting_power = Some(1_000_000);
        neurons.push(f);
    }
    for id in [
        dendrite_types::ALPHA_VOTE_NEURON_ID,
        dendrite_types::OMEGA_REJECT_NEURON_ID,
    ] {
        neurons.push(raw(id, user(5), at));
    }
    let mut target = raw(TARGET, user(9), at);
    target.hot_keys = vec![app];
    target.followees = vec![fs(1, &[10, 11, 12])];
    neurons.push(target);
    for n in &mut neurons {
        let mut h = Sha256::new();
        h.update(b"arbitrary capacity fixture account");
        h.update(n.id.as_ref().unwrap().id.to_be_bytes());
        n.account = h.finalize().to_vec();
    }
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
            n.known_neuron_data.clone().map(|m| g::KnownNeuron {
                id: n.id.clone(),
                known_neuron_data: Some(m),
            })
        })
        .collect();
    quorum_mocks::Fixture {
        neurons,
        known,
        infos,
    }
}
#[test]
#[ignore = "xtask capacity prepares production Wasm"]
fn twenty_distinct_selected_with_shared_dependencies_and_latency() {
    exercise(20, 5);
}
#[test]
#[ignore = "xtask capacity prepares production Wasm"]
fn eighty_recipients_sixteen_topics_default_five() {
    exercise(80, 5);
}
#[test]
#[ignore = "xtask capacity prepares production Wasm"]
fn two_hundred_forty_recipients_fifteen_seats() {
    exercise(240, 15);
}
fn exercise(n: usize, seats: u8) {
    let production = wasm("d_quorum");
    let mock = wasm("quorum_mocks");
    let pic = builder().build();
    let app = pic.create_canister();
    pic.add_cycles(app, 500_000_000_000_000);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let fixture = data(now(&pic), empty, app, n);
    for id in [GOVERNANCE, LEDGER] {
        pic.create_canister_with_id(None, None, id).unwrap();
        pic.add_cycles(id, 500_000_000_000_000);
    }
    pic.install_canister(
        GOVERNANCE,
        mock.clone(),
        encode_one(Some(fixture)).unwrap(),
        None,
    );
    pic.install_canister(
        LEDGER,
        mock,
        encode_one(None::<quorum_mocks::Fixture>).unwrap(),
        None,
    );
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_init",
        1_000_000_003u64,
    );
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "pause_full_once",
        (1000u64, 3u32),
    );
    // A transient batch failure must retry without excluding a contender.
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "enqueue",
        quorum_mocks::Script {
            method: "list_neurons".into(),
            reply: None,
            reject: Some("transient capacity read".into()),
        },
    );
    pic.install_canister(
        app,
        production.clone(),
        encode_one(Some(Init {
            mode: Mode::Live,
            expected_target_controller: Some(user(9)),
        }))
        .unwrap(),
        None,
    );
    if seats != 5 {
        let r: Result<u64, String> =
            update(&pic, app, GOVERNANCE, "set_delegates_per_topic", seats);
        r.unwrap();
    }
    let start = now(&pic);
    let initial_cycles = pic.cycle_balance(app);
    let wall = std::time::Instant::now();
    let mut upgraded = false;
    let mut applied = None;
    for _ in 0..10000 {
        drive(&pic, 1);
        let p: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
        assert_ne!(p.phase, "failed", "{p:?}");
        if !upgraded && p.evaluated_candidates > 5 {
            pic.upgrade_canister(
                app,
                production.clone(),
                encode_one(None::<Mode>).unwrap(),
                None,
            )
            .unwrap();
            upgraded = true;
        }
        if p.phase == "complete" {
            applied = Some(now(&pic));
            break;
        }
    }
    let applied = applied.unwrap_or_else(|| {
        panic!(
            "capacity failed: {:?}",
            query_empty::<d_quorum::Health>(&pic, app, "health")
        )
    });
    let roster: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
    let validated = roster[0].candidate_validated_at.unwrap();
    let intended = roster[0].intended_at.unwrap();
    let readback = roster[0].readback_observed_at.unwrap();
    assert!(
        intended - validated <= 1800,
        "selected validation exceeded dispatch deadline"
    );
    assert!(roster.iter().all(|r| r.reward_eligible));
    let recipients = roster
        .iter()
        .flat_map(|r| r.applied.iter().copied())
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(
        recipients.len(),
        n,
        "outcomes={:?} roster={roster:?}",
        query2::<_, Vec<d_quorum::state::CandidateResult>>(
            &pic,
            app,
            "candidate_page",
            (None::<u64>, 100u16)
        )
    );
    let mut scores = Vec::new();
    let mut cursor = None;
    loop {
        let page: Vec<d_quorum::Score> = query2(&pic, app, "score_page", (cursor, 100u16));
        if page.is_empty() {
            break;
        }
        cursor = page.last().map(|s| (s.topic, s.neuron_id));
        scores.extend(page);
    }
    assert_eq!(scores.len(), 2 * n * 16);
    assert!(scores.iter().all(|s| s.complete && s.scaled_score > 0));
    let mut plan = None;
    let mut completed = false;
    for _ in 0..1800 {
        drive(&pic, 10);
        let ps: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        if let Some(p) = ps.first() {
            assert_eq!(p.recipient_count, n as u32);
            plan.get_or_insert(now(&pic));
            if p.complete && p.maintenance_complete {
                completed = true;
                break;
            }
        }
    }
    assert!(
        plan.unwrap() - applied < 1800,
        "destination planning exceeded freshness"
    );
    assert!(
        completed,
        "payout/maintenance did not complete: {:?}",
        query_empty::<d_quorum::Health>(&pic, app, "health")
    );
    let mut transfers = Vec::<quorum_accounting::Transfer>::new();
    loop {
        let page: Vec<quorum_accounting::Transfer> = query2(
            &pic,
            app,
            "transfer_page",
            (1u64, transfers.len() as u32, 100u16),
        );
        if page.is_empty() {
            break;
        }
        transfers.extend(page);
    }
    assert_eq!(transfers.len(), n);
    assert!(
        transfers
            .iter()
            .all(|t| t.amount == transfers[0].amount && t.attempt.as_ref().unwrap().number == 1)
    );
    let oldest_destination = transfers
        .iter()
        .map(|t| t.destination.validated_at)
        .min()
        .unwrap();
    assert!(
        plan.unwrap() - oldest_destination <= 1800,
        "destination observations exceeded admission deadline"
    );
    let before: d_quorum::Health = query_empty(&pic, app, "health");
    let stable = pic.get_stable_memory(app);
    for caller in [Principal::anonymous(), user(8)] {
        let denied: Result<u64, String> = update(&pic, app, caller, "set_delegates_per_topic", 3u8);
        assert!(denied.is_err());
    }
    let after: d_quorum::Health = query_empty(&pic, app, "health");
    assert_eq!(before.checkpoints.writes, after.checkpoints.writes);
    assert_eq!(before.checkpoints.mutations, after.checkpoints.mutations);
    assert_eq!(pic.get_stable_memory(app), stable);
    let status = pic.canister_status(app, None).unwrap();
    let recorded: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    let recorded_neuron_reads = recorded
        .iter()
        .filter(|m| {
            [
                "list_known_neurons",
                "list_neurons",
                "get_neuron_index",
                "get_neuron_info",
            ]
            .contains(&m.as_str())
        })
        .count();
    let ledger_stats: quorum_mocks::LedgerStats = query_empty(&pic, LEDGER, "ledger_stats");
    let governance_replies = recorded
        .iter()
        .filter(|m| {
            [
                "list_known_neurons",
                "get_neuron_index",
                "list_neurons",
                "get_neuron_info",
                "manage_neuron",
                "get_network_economics_parameters",
                "list_proposals",
                "get_proposal_info",
                "make_proposal_reply",
            ]
            .contains(&m.as_str())
        })
        .count();
    let financial_liabilities = transfers
        .iter()
        .filter(|t| {
            !matches!(
                t.status,
                quorum_accounting::TransferStatus::Confirmed { .. }
            )
        })
        .count();
    let metrics = serde_json::json!({"recipients":n,"governance_recorded_replies":governance_replies,"ledger_calls":{"balance":ledger_stats.balance_calls,"fee":ledger_stats.fee_calls,"history":ledger_stats.history_calls,"transfers":ledger_stats.transfer_calls},"pending_refreshes":after.pending_refreshes,"abandoned_refreshes":after.abandoned_refreshes,"pending_financial_liabilities":financial_liabilities,"cycle_delta":initial_cycles-pic.cycle_balance(app),"recorded_neuron_reads":recorded_neuron_reads,"call_measurement_scope":"public-neuron reads are a subset of recorded Governance endpoint completions; Ledger counters include all replicated fixture calls, including Governance refresh reads; management-canister calls are not instrumented; cycle delta covers all jobs","compliant_contenders":2*n,"manager_count_range":[5,15],"seats":seats,"selected_within_seconds":applied-start,"validation_to_intent_seconds":intended-validated,"validation_to_readback_seconds":readback-validated,"oldest_destination_age_at_plan_detection_seconds":plan.unwrap()-oldest_destination,"plan_started_after_applied_seconds":plan.unwrap()-applied,"total_virtual_seconds":now(&pic)-start,"wall_seconds":wall.elapsed().as_secs_f64(),"checkpoint_metrics":after.checkpoints,"stable_snapshot_bytes":after.stable_snapshot_bytes,"heap_bytes":status.memory_metrics.wasm_memory_size.to_string(),"stable_pages":after.stable_memory_pages,"dense_score_entries":scores.len(),"scope":"production constants and natural timers; discovery retry, latency and upgrade; all obligations paid once and refreshed"});
    std::fs::create_dir_all(root().join("dist/evidence")).unwrap();
    std::fs::write(
        root().join(format!("dist/evidence/capacity-{n}.json")),
        serde_json::to_string_pretty(&metrics).unwrap(),
    )
    .unwrap();
    println!("{metrics}");
    let stats: quorum_mocks::LedgerStats = query_empty(&pic, LEDGER, "ledger_stats");
    assert_eq!(stats.blocks, n as u64);
}
