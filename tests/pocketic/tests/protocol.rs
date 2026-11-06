mod support;
use candid::{Principal, encode_one};
use quorum_ic_clients::{GOVERNANCE, LEDGER, governance as g, ledger as l};
use quorum_policy::TARGET;
use sha2::Digest;
use support::*;

// The legacy get_full_neuron endpoint is authority-gated even for public neurons.
// Use the same supported public list endpoint as the production client.

#[test]
#[ignore = "xtask protocol prepares pinned real Wasm first"]
fn canister_origin_reads_hotkey_permissions_manager_proposal_and_real_maturity() {
    let probe_wasm = wasm("quorum_mocks");
    let gov_wasm = artifact("governance-canister");
    let ledger_wasm = artifact("ledger-canister");
    let pic = real_pic();
    let probe = install_probe(&pic, probe_wasm);
    let controller = user(9);
    let at = now(&pic);
    let mut target = seed(TARGET, controller, at);
    target.hot_keys = vec![probe];
    target.followees = vec![fs(1, &[11, 12, 13])];
    target.known_neuron_data = Some(known(TARGET));
    target.maturity_e8s_equivalent = 5_000_000_000;
    let mut proposer = seed(11, probe, at);
    proposer.account = l::staking_subaccount(probe, d_quorum::state::BOOTSTRAP_NONCE);
    let m1 = seed(12, user(12), at);
    let m2 = seed(13, user(13), at);
    let mut depleted = seed(14, probe, at);
    depleted.cached_neuron_stake_e8s = 5_000;
    install_real(
        &pic,
        vec![target, proposer, m1, m2, depleted],
        vec![],
        gov_wasm,
        ledger_wasm,
    );
    let read: Result<quorum_mocks::ReadProbe, String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "read_probe",
        vec![TARGET],
    );
    println!("canister reads: {read:?}");
    let read = read.unwrap();
    assert!(read.known_count >= 1);
    assert!(read.index_ids.contains(&TARGET));
    assert_eq!(read.full_count, 1);
    assert_eq!(read.metadata_name, Some(format!("Test {TARGET}")));
    let ordinary: Result<(), String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "follow_probe",
        (TARGET, 4i32, vec![12u64]),
    );
    ordinary.unwrap();
    let nm: Result<(), String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "follow_probe",
        (TARGET, 1i32, vec![11u64]),
    );
    assert!(nm.is_err(), "hotkey changed management: {nm:?}");
    let direct: Result<String, String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "direct_maturity_probe",
        TARGET,
    );
    assert!(direct.unwrap().contains("Error"));
    let payload =
        d_quorum::proposal::maturity_payload("D-QUORUM real contract regression 1", probe);
    // These are actual pinned Governance refusals, before any proposal is created.
    for (proposer, code) in [(12u64, 3), (14, 14)] {
        let result: Result<g::ResponseCommand, String> = update(
            &pic,
            probe,
            Principal::anonymous(),
            "proposal_result_probe",
            (proposer, payload.clone()),
        );
        let g::ResponseCommand::Error(error) = result.unwrap() else {
            panic!("expected typed creation refusal");
        };
        assert_eq!(error.error_type, code);
        assert!(g::definite_proposal_rejection(&error));
        let n = public_neuron(&pic, proposer);
        assert_eq!(n.neuron_fees_e8s, 0, "refusal must not charge a fee");
    }
    let proposal: Result<u64, String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "proposal_probe",
        (11u64, payload),
    );
    let id = proposal.unwrap();
    assert_eq!(id, 1, "creation refusals must not insert proposals");
    let p: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", id);
    let p = p.unwrap();
    assert_eq!(p.status, 1, "creation must not adopt or execute");
    assert_eq!(p.executed_timestamp_seconds, 0);
    assert!(d_quorum::proposal::action_matches(&p, probe));
    let before: candid::Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: probe,
            subaccount: None,
        },
    );
    assert_eq!(l::nat(before).unwrap(), 0);
    let vote = VoteRequest {
        neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: 12 })),
        command: Some(VoteCommand::RegisterVote(Vote {
            vote: 1,
            proposal: Some(g::NeuronId { id }),
        })),
    };
    let _: RawResponse = update(&pic, GOVERNANCE, user(12), "manage_neuron", vote);
    drive(&pic, 60);
    let p: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", id);
    assert_eq!(p.unwrap().status, 4);
    let b: candid::Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: probe,
            subaccount: None,
        },
    );
    assert_eq!(
        l::nat(b).unwrap(),
        0,
        "execution does not finalize maturity"
    );
    drive(&pic, 6 * 86400);
    let b: candid::Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: probe,
            subaccount: None,
        },
    );
    assert_eq!(l::nat(b).unwrap(), 0, "finalization delay was bypassed");
    drive(&pic, 2 * 86400);
    for _ in 0..10 {
        drive(&pic, 60);
    }
    let balance: candid::Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: probe,
            subaccount: None,
        },
    );
    let amount = l::nat(balance).unwrap();
    assert!(
        (4_750_000_000..=5_250_000_000).contains(&amount),
        "maturity credit {amount}"
    );
    let history: l::History = query(
        &pic,
        LEDGER,
        "query_blocks",
        l::BlocksArgs {
            start: 0,
            length: 100,
        },
    );
    assert!(history.blocks.iter().any(|b|matches!(&b.transaction.operation,Some(l::Operation::Mint{to,amount:a}) if *to==l::account_id(probe,None) && a.e8s==amount)));
    println!(
        "real maturity proposal={id}, finalized default-account mint={amount}, not_for_profit=false"
    );
    let rejected: Result<u64, String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "proposal_probe",
        (
            11u64,
            d_quorum::proposal::maturity_payload("D-QUORUM real negative manager votes", probe),
        ),
    );
    let rejected = rejected.unwrap();
    for manager in [12u64, 13u64] {
        let _: RawResponse = update(
            &pic,
            GOVERNANCE,
            user(manager as u8),
            "manage_neuron",
            VoteRequest {
                neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: manager })),
                command: Some(VoteCommand::RegisterVote(Vote {
                    vote: 2,
                    proposal: Some(g::NeuronId { id: rejected }),
                })),
            },
        );
    }
    drive(&pic, 60);
    let rejected: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", rejected);
    assert_eq!(rejected.unwrap().status, 2);
}

#[test]
#[ignore = "xtask protocol prepares pinned artifacts first"]
fn real_ledger_duplicate_archive_staking_destination_and_cache_refresh() {
    let probe_wasm = wasm("quorum_mocks");
    let gw = artifact("governance-canister");
    let lw = artifact("ledger-canister");
    let pic = real_pic();
    let probe = install_probe(&pic, probe_wasm);
    let recipient = seed(99, user(99), now(&pic));
    let sub = recipient.account.clone();
    let cached = recipient.cached_neuron_stake_e8s;
    install_real(
        &pic,
        vec![recipient],
        vec![(
            l::Account {
                owner: probe,
                subaccount: None,
            },
            10_000_000_000,
        )],
        gw,
        lw,
    );
    let created = pic.get_time().as_nanos_since_unix_epoch();
    let arg = l::TransferArg {
        from_subaccount: None,
        to: l::Account {
            owner: GOVERNANCE,
            subaccount: Some(sub.clone()),
        },
        fee: Some(10_000u64.into()),
        created_at_time: Some(created),
        memo: Some(b"exact-identity".to_vec()),
        amount: 1_000_000u64.into(),
    };
    let first: Result<Result<u64, String>, String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "ledger_probe",
        arg.clone(),
    );
    let block = first.unwrap().unwrap();
    let second: Result<Result<u64, String>, String> =
        update(&pic, probe, Principal::anonymous(), "ledger_probe", arg);
    assert!(second.unwrap().unwrap_err().contains("Duplicate"));
    let bal: candid::Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: GOVERNANCE,
            subaccount: Some(sub),
        },
    );
    assert_eq!(l::nat(bal).unwrap(), cached + 1_000_000);
    let r: g::ListNeuronsResponse = query(
        &pic,
        GOVERNANCE,
        "list_neurons",
        g::ListNeurons {
            neuron_ids: vec![99],
            include_neurons_readable_by_caller: false,
            include_empty_neurons_readable_by_caller: Some(false),
            include_public_neurons_in_full_neurons: Some(true),
            page_number: Some(0),
            page_size: Some(50),
            neuron_subaccounts: None,
        },
    );
    assert_eq!(r.full_neurons[0].cached_neuron_stake_e8s, cached);
    let _: RawResponse = update(
        &pic,
        GOVERNANCE,
        user(99),
        "manage_neuron",
        RefreshRequest {
            neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: 99 })),
            command: Some(RefreshCommand::ClaimOrRefresh(g::Claim {
                by: Some(g::By::NeuronIdOrSubaccount(g::Empty {})),
            })),
        },
    );
    let r: g::ListNeuronsResponse = query(
        &pic,
        GOVERNANCE,
        "list_neurons",
        g::ListNeurons {
            neuron_ids: vec![99],
            include_neurons_readable_by_caller: false,
            include_empty_neurons_readable_by_caller: Some(false),
            include_public_neurons_in_full_neurons: Some(true),
            page_number: Some(0),
            page_size: Some(50),
            neuron_subaccounts: None,
        },
    );
    assert_eq!(
        r.full_neurons[0].cached_neuron_stake_e8s,
        cached + 1_000_000
    );
    let h: l::History = query(
        &pic,
        LEDGER,
        "query_blocks",
        l::BlocksArgs {
            start: block,
            length: 1,
        },
    );
    assert!(l::matches(
        &h.blocks[0],
        probe,
        &r.full_neurons[0].account,
        1_000_000,
        10_000,
        b"exact-identity",
        created
    ));
    for i in 0..40u64 {
        let arg = l::TransferArg {
            from_subaccount: None,
            to: l::Account {
                owner: user(8),
                subaccount: None,
            },
            fee: Some(10_000u64.into()),
            created_at_time: Some(created + i + 1),
            memo: Some(i.to_be_bytes().to_vec()),
            amount: 1u64.into(),
        };
        let r: Result<Result<u64, String>, String> =
            update(&pic, probe, Principal::anonymous(), "ledger_probe", arg);
        r.unwrap().unwrap();
    }
    drive(&pic, 60);
    let h: l::History = query(
        &pic,
        LEDGER,
        "query_blocks",
        l::BlocksArgs {
            start: 0,
            length: 10,
        },
    );
    assert!(
        !h.archived_blocks.is_empty(),
        "real archive was not exercised"
    );
    let archive = h.archived_blocks[0].callback.0.principal;
    let status = pic.canister_status(archive, None).unwrap();
    let _validated_raw = artifact("ledger-archive-node-canister");
    // Ledger installs the gzip bytes; IC module_hash preserves that installation digest.
    let expected = sha2::Sha256::digest(
        std::fs::read(root().join(".cache/protocol/ledger-archive-node-canister.wasm.gz")).unwrap(),
    );
    assert_eq!(
        status.module_hash,
        Some(expected.to_vec()),
        "actual archive must match its artifact pin"
    );
    let count: Result<u64, String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "history_probe",
        (0u64, 10u64),
    );
    assert_eq!(count.unwrap(), 10);
    let b = pic.get_stable_memory(probe);
    println!(
        "real transfer block={block}; archive count=10; probe stable bytes={}",
        b.len()
    );
}

#[test]
#[ignore = "xtask protocol prepares production and pinned real artifacts"]
fn production_bootstrap_roster_manager_maturity_payout_upgrade_natural_timers() {
    let production = wasm("d_quorum");
    let gw = artifact("governance-canister");
    let lw = artifact("ledger-canister");
    let pic = real_pic();
    let app = pic.create_canister();
    pic.add_cycles(app, 200_000_000_000_000);
    let blackhole = pic.create_canister();
    pic.set_controllers(blackhole, None, vec![]).unwrap();
    let at = now(&pic);
    let mut candidate = seed(100, blackhole, at);
    candidate.known_neuron_data = Some(known(100));
    candidate.followees = dendrite_types::RECOGNISED_TOPICS
        .into_iter()
        .map(|topic| {
            if topic == 1 {
                fs(topic, &[101, 102, 103, 104, 105])
            } else if topic == 4 {
                fs(topic, &[101, 102, 103])
            } else {
                fs(topic, &[dendrite_types::ALPHA_VOTE_NEURON_ID])
            }
        })
        .collect();
    let candidate_sub = candidate.account.clone();
    let old_stake = candidate.cached_neuron_stake_e8s;
    let mut neurons = vec![candidate];
    for id in 101..=105 {
        let mut n = seed(id, user(id as u8), at);
        n.known_neuron_data = Some(known(id));
        n.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
        neurons.push(n);
    }
    for id in [
        dendrite_types::ALPHA_VOTE_NEURON_ID,
        dendrite_types::OMEGA_REJECT_NEURON_ID,
    ] {
        neurons.push(seed(id, user(1), at));
    }
    let mut follower = seed(200, user(2), at);
    follower.followees = vec![fs(4, &[100])];
    neurons.push(follower);
    let mut target = seed(TARGET, user(9), at);
    target.hot_keys = vec![app];
    target.followees = vec![fs(1, &[12, 13])];
    target.maturity_e8s_equivalent = 5_000_000_000;
    neurons.push(target);
    neurons.push(seed(12, user(12), at));
    neurons.push(seed(13, user(13), at));
    let bootstrap = l::Account {
        owner: GOVERNANCE,
        subaccount: Some(l::staking_subaccount(app, d_quorum::state::BOOTSTRAP_NONCE)),
    };
    install_real(&pic, neurons, vec![(bootstrap, 10_000_000_000)], gw, lw);
    let probe = install_probe(&pic, wasm("quorum_mocks"));
    let report: Result<dendrite_types::ComplianceReport, String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "evaluate_probe",
        100u64,
    );
    let report = report.unwrap();
    assert_eq!(
        report.overall_status,
        dendrite_types::ComplianceStatus::Compliant,
        "{report:#?}"
    );

    pic.install_canister(
        app,
        production.clone(),
        encode_one(Some(d_quorum::state::Init {
            mode: d_quorum::state::Mode::Live,
            expected_target_controller: Some(user(9)),
        }))
        .unwrap(),
        None,
    );
    let mut proposer = None;
    for _ in 0..20 {
        drive(&pic, 10);
        let h: d_quorum::Health = query_empty(&pic, app, "health");
        if h.proposer.is_some() {
            proposer = h.proposer;
            break;
        }
    }
    let proposer = proposer.expect("deterministic separately funded bootstrap failed");
    let response: g::ManageResponse = update(
        &pic,
        GOVERNANCE,
        user(9),
        "manage_neuron",
        g::request(
            TARGET,
            g::Command::SetFollowing(g::SetFollowing {
                topic_following: Some(vec![g::Following {
                    topic: Some(1),
                    followees: Some(
                        vec![proposer, 12, 13]
                            .into_iter()
                            .map(|id| g::NeuronId { id })
                            .collect(),
                    ),
                }]),
            }),
        ),
    );
    assert!(matches!(
        response.command,
        Some(g::ResponseCommand::SetFollowing(_))
    ));
    let mut proposal_id = None;
    let mut roster_done = false;
    for _ in 0..300 {
        drive(&pic, 10);
        let progress: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
        assert_ne!(progress.phase, "failed", "real production scan failed");
        roster_done |= progress.phase == "complete";
        let job: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(job) = job
            && let d_quorum::state::ProposalPhase::Open(id) = job.phase
        {
            proposal_id = Some(id);
        }
        if proposal_id.is_some() && roster_done {
            break;
        }
    }
    assert!(roster_done);
    let id = proposal_id.expect("exact manager proposal did not reach open state");
    let rosters: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
    assert_eq!(
        rosters.iter().find(|r| r.topic == 4).unwrap().applied,
        vec![100]
    );
    assert!(
        rosters
            .iter()
            .filter(|r| r.topic != 4)
            .all(|r| r.applied.is_empty())
    );
    let _: RawResponse = update(
        &pic,
        GOVERNANCE,
        user(12),
        "manage_neuron",
        VoteRequest {
            neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: 12 })),
            command: Some(VoteCommand::RegisterVote(Vote {
                vote: 1,
                proposal: Some(g::NeuronId { id }),
            })),
        },
    );
    drive(&pic, 60);
    let info: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", id);
    assert_eq!(info.unwrap().status, 4);
    // Keep resumable jobs progressing between virtual-day jumps; inspect each financial transition.
    let mut planned = None;
    'days: for _ in 0..10 {
        drive(&pic, 86400);
        for _ in 0..150 {
            drive(&pic, 10);
            let ps: Vec<d_quorum::PayoutSummary> =
                query2(&pic, app, "payout_page", (None::<u64>, 100u16));
            if let Some(p) = ps.first() {
                planned = Some((p.id, p.observed_balance));
                assert_eq!(
                    p.confirmed_count, 0,
                    "observe and upgrade the persisted plan before sending"
                );
                pic.upgrade_canister(
                    app,
                    production.clone(),
                    encode_one(None::<d_quorum::state::Mode>).unwrap(),
                    None,
                )
                .unwrap();
                break 'days;
            }
        }
    }
    if planned.is_none() {
        let h: d_quorum::Health = query_empty(&pic, app, "health");
        let r: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
        panic!("payout waiting: health={h:?} scan={r:?}");
    }
    let (payout, balance) = planned.expect("independent staged-balance payout was not planned");
    for _ in 0..20 {
        drive(&pic, 10);
        let ps: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        if ps
            .first()
            .is_some_and(|p| p.complete && p.maintenance_complete)
        {
            break;
        }
    }
    let ps: Vec<d_quorum::PayoutSummary> = query2(&pic, app, "payout_page", (None::<u64>, 100u16));
    assert_eq!(ps[0].id, payout);
    assert!(
        ps[0].complete && ps[0].maintenance_complete,
        "payout={ps:?} health={:?} transfers={:?}",
        query_empty::<d_quorum::Health>(&pic, app, "health"),
        query2::<_, Vec<quorum_accounting::Transfer>>(
            &pic,
            app,
            "transfer_page",
            (payout, 0u32, 100u16)
        )
    );
    let refreshed = public_neuron(&pic, 100);
    assert_eq!(
        refreshed.cached_neuron_stake_e8s,
        old_stake + balance - 10_000
    );
    assert_eq!(ps[0].fee, 10_000);
    let recipient: candid::Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: GOVERNANCE,
            subaccount: Some(candidate_sub),
        },
    );
    assert_eq!(l::nat(recipient).unwrap(), old_stake + balance - 10_000);
    let staged: candid::Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: app,
            subaccount: None,
        },
    );
    assert_eq!(l::nat(staged).unwrap(), 0);
    let info: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", id);
    assert_eq!(info.unwrap().status, 4);
    let health: d_quorum::Health = query_empty(&pic, app, "health");
    println!(
        "production lifecycle proposer={proposer}, proposal={id}, payout={payout}, balance={balance}, stable_bytes={}, stable_pages={}, instruction_sample={}",
        health.stable_snapshot_bytes,
        health.stable_memory_pages,
        health.jobs[2].measured_instructions
    );
}

#[test]
#[ignore = "xtask protocol prepares pinned real artifacts"]
fn raw_positive_deciding_vp_is_distinct_from_real_ballot_eligibility_and_feature_default() {
    for inner_default in [false, true] {
        let pic = real_pic();
        let probe = install_probe(&pic, wasm("quorum_mocks"));
        let at = now(&pic);
        let minimum = if inner_default {
            14 * 86400
        } else {
            6 * 2_629_800
        };
        let mut neurons = vec![];
        for (id, delay) in [
            (401, 0),
            (402, minimum - 1),
            (403, minimum),
            (404, minimum + 86400),
        ] {
            let mut n = seed(id, user(id as u8), at);
            n.hot_keys = vec![probe];
            if delay == 0 {
                n.dissolve_state = Some(g::DissolveState::WhenDissolvedTimestampSeconds(at - 1));
                n.aging_since_timestamp_seconds = u64::MAX;
            } else {
                n.dissolve_state = Some(g::DissolveState::DissolveDelaySeconds(delay));
            }
            neurons.push(n);
        }
        neurons.push(seed(499, probe, at));
        let voting = inner_default.then_some(g::VotingPowerEconomics {
            start_reducing_voting_power_after_seconds: None,
            clear_following_after_seconds: None,
            neuron_minimum_dissolve_delay_to_vote_seconds: None,
        });
        install_real_with_voting(
            &pic,
            neurons,
            vec![],
            artifact("governance-canister"),
            artifact("ledger-canister"),
            voting,
        );
        let observed: Result<quorum_mocks::EligibilityRead, String> = update(
            &pic,
            probe,
            Principal::anonymous(),
            "eligibility_probe",
            vec![401u64, 402, 403, 404],
        );
        let observed = observed.unwrap();
        assert_eq!(observed.context.minimum_delay, minimum);
        assert!(
            observed.observations.iter().all(|(_, vp, _)| *vp > 0),
            "raw VP is separately computed: {observed:?}"
        );
        for (id, _, eligible) in &observed.observations {
            assert_eq!(*eligible, *id >= 403);
        }
        let proposal: Result<u64, String> =
            update(&pic, probe, Principal::anonymous(), "motion_probe", 499u64);
        let proposal = proposal.unwrap();
        let ballots: Result<Vec<u64>, String> = update(
            &pic,
            probe,
            Principal::anonymous(),
            "ballot_probe",
            proposal,
        );
        let ballots = ballots.unwrap();
        assert!(!ballots.contains(&401));
        assert!(!ballots.contains(&402));
        assert!(ballots.contains(&403));
        assert!(ballots.contains(&404));
        println!(
            "real eligibility minimum={minimum} inner_default={inner_default} raw={:?} ballots={ballots:?}",
            observed.observations
        );
    }
}

#[test]
#[ignore = "xtask protocol prepares pinned real artifacts"]
fn production_owned_proposer_recovers_after_real_staking_topup() {
    let pic = real_pic();
    let app = pic.create_canister();
    pic.add_cycles(app, 200_000_000_000_000);
    let at = now(&pic);
    let mut owned = seed(300, app, at);
    owned.account = l::staking_subaccount(app, d_quorum::state::BOOTSTRAP_NONCE);
    owned.cached_neuron_stake_e8s = 100_000_000;
    owned.neuron_fees_e8s = 90_000_000;
    let destination = l::Account {
        owner: GOVERNANCE,
        subaccount: Some(owned.account.clone()),
    };
    let mut target = seed(TARGET, user(9), at);
    target.hot_keys = vec![app];
    target.followees = vec![fs(1, &[300, 12, 13])];
    target.maturity_e8s_equivalent = 5_000_000_000;
    install_real(
        &pic,
        vec![
            owned,
            target,
            seed(12, user(12), at),
            seed(13, user(13), at),
        ],
        vec![(
            l::Account {
                owner: user(7),
                subaccount: None,
            },
            1_000_020_000,
        )],
        artifact("governance-canister"),
        artifact("ledger-canister"),
    );
    pic.install_canister(
        app,
        wasm("d_quorum"),
        encode_one(Some(d_quorum::state::Init {
            mode: d_quorum::state::Mode::Live,
            expected_target_controller: Some(user(9)),
        }))
        .unwrap(),
        None,
    );
    let mut waiting = false;
    for _ in 0..100 {
        drive(&pic, 10);
        let h: d_quorum::Health = query_empty(&pic, app, "health");
        if h.proposer == Some(300)
            && h.jobs[1]
                .last_error
                .as_ref()
                .is_some_and(|e| e.contains("stake does not cover"))
        {
            waiting = true;
            break;
        }
    }
    assert!(waiting);
    pic.stop_canister(app, None).unwrap();
    let result: Result<candid::Nat, l::TransferError> = update(
        &pic,
        LEDGER,
        user(7),
        "icrc1_transfer",
        l::TransferArg {
            from_subaccount: None,
            to: destination,
            amount: 1_000_000_000u64.into(),
            fee: Some(10_000u64.into()),
            memo: None,
            created_at_time: None,
        },
    );
    result.unwrap();
    let before = public_neuron(&pic, 300);
    assert_eq!(
        before.cached_neuron_stake_e8s, 100_000_000,
        "Ledger topup alone must not be described as a cache refresh"
    );
    pic.start_canister(app, None).unwrap();
    let mut opened = false;
    for _ in 0..100 {
        drive(&pic, 120);
        let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if j.is_some_and(|j| matches!(j.phase, d_quorum::state::ProposalPhase::Open(_))) {
            opened = true;
            break;
        }
    }
    assert!(
        opened,
        "production preflight must refresh separately funded stake"
    );
    let after = public_neuron(&pic, 300);
    assert_eq!(after.cached_neuron_stake_e8s, 1_100_000_000);
}

// Local real-protocol lifecycle fixture. The production Wasm uses only its natural timers.
fn lifecycle_real(
    maturity: u64,
    rewards: u64,
    cycles: u128,
) -> (pocket_ic::PocketIc, Principal, Principal) {
    lifecycle_real_with_target_stake(maturity, rewards, cycles, 10_000_000_000)
}
fn lifecycle_real_with_target_stake(
    maturity: u64,
    rewards: u64,
    cycles: u128,
    target_stake: u64,
) -> (pocket_ic::PocketIc, Principal, Principal) {
    let pic = real_pic();
    let app = pic
        .create_canister_with_params(
            None,
            pocket_ic::CreateCanisterParams {
                cycles: Some(cycles),
                settings: Some(pocket_ic::CanisterSettings {
                    freezing_threshold: Some(0u64.into()),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .unwrap();
    let blackhole = pic.create_canister();
    pic.set_controllers(blackhole, None, vec![]).unwrap();
    let probe = install_probe(&pic, wasm("quorum_mocks"));
    let at = now(&pic);
    let mut neurons = vec![];
    for (id, first) in [(100, 101), (106, 2010), (112, 2020), (118, 2030)] {
        let mut c = seed(id, blackhole, at);
        if id == 100 {
            c.cached_neuron_stake_e8s = 50_000;
        }
        c.known_neuron_data = Some(known(id));
        c.followees = dendrite_types::RECOGNISED_TOPICS
            .into_iter()
            .map(|t| {
                if t == 1 {
                    fs(t, &(first..first + 5).collect::<Vec<_>>())
                } else if t == 4 {
                    fs(t, &(first..first + 3).collect::<Vec<_>>())
                } else {
                    fs(t, &[dendrite_types::ALPHA_VOTE_NEURON_ID])
                }
            })
            .collect();
        neurons.push(c);
        for manager in first..first + 5 {
            let mut n = seed(manager, user((manager % 200) as u8), at);
            n.known_neuron_data = Some(known(manager));
            n.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
            neurons.push(n);
        }
    }
    for id in [
        dendrite_types::ALPHA_VOTE_NEURON_ID,
        dendrite_types::OMEGA_REJECT_NEURON_ID,
    ] {
        neurons.push(seed(id, user(1), at));
    }
    let mut follower = seed(200, user(2), at);
    follower.followees = vec![fs(4, &[100, 106])];
    neurons.push(follower);
    let mut target = seed(TARGET, user(9), at);
    target.cached_neuron_stake_e8s = target_stake;
    target.hot_keys = vec![app];
    target.followees = vec![fs(1, &[300, 12, 13])];
    target.maturity_e8s_equivalent = maturity;
    neurons.push(target);
    let mut proposer = seed(300, app, at);
    proposer.account = l::staking_subaccount(app, d_quorum::state::BOOTSTRAP_NONCE);
    neurons.extend([
        proposer,
        seed(12, user(12), at),
        seed(13, user(13), at),
        seed(499, probe, at),
    ]);
    let mut unrelated = seed(301, user(8), at);
    unrelated.maturity_e8s_equivalent = 3_000_000_000;
    neurons.push(unrelated);
    let mut funds = vec![(
        l::Account {
            owner: user(7),
            subaccount: None,
        },
        10_000_000_000_000,
    )];
    if rewards > 0 {
        funds.push((
            l::Account {
                owner: app,
                subaccount: None,
            },
            rewards,
        ));
    }
    install_real(
        &pic,
        neurons,
        funds,
        artifact("governance-canister"),
        artifact("ledger-canister"),
    );
    pic.install_canister(
        app,
        wasm("d_quorum"),
        encode_one(Some(d_quorum::state::Init {
            mode: d_quorum::state::Mode::Live,
            expected_target_controller: Some(user(9)),
        }))
        .unwrap(),
        None,
    );
    (pic, app, probe)
}
fn wait_real_reward_roster(pic: &pocket_ic::PocketIc, app: Principal) {
    // Establish ordinary following before testing new voting-reward accrual.
    // Also let natural continuations finish before the next virtual-day jump.
    for _ in 0..800 {
        let rows: Vec<d_quorum::RosterView> = query2(pic, app, "roster_page", (0u16, 100u16));
        if query_empty::<d_quorum::ScanProgress>(pic, app, "scan_progress").phase == "complete"
            && rows
                .iter()
                .any(|r| r.topic == 4 && r.applied == vec![100, 106] && r.reward_eligible)
        {
            return;
        }
        drive(pic, 10);
    }
    panic!(
        "real voting fixture lacks a fresh completed roster: {:?}",
        query_empty::<d_quorum::Health>(pic, app, "health")
    );
}

fn real_vote(pic: &pocket_ic::PocketIc, manager: u64, controller: Principal, id: u64) {
    let _: RawResponse = update(
        pic,
        GOVERNANCE,
        controller,
        "manage_neuron",
        VoteRequest {
            neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: manager })),
            command: Some(VoteCommand::RegisterVote(Vote {
                vote: 1,
                proposal: Some(g::NeuronId { id }),
            })),
        },
    );
}
fn real_fund(pic: &pocket_ic::PocketIc, to: Principal, amount: u64) {
    let r: Result<candid::Nat, l::TransferError> = update(
        pic,
        LEDGER,
        user(7),
        "icrc1_transfer",
        l::TransferArg {
            from_subaccount: None,
            to: l::Account {
                owner: to,
                subaccount: None,
            },
            amount: amount.into(),
            fee: Some(10_000u64.into()),
            memo: None,
            created_at_time: None,
        },
    );
    r.unwrap();
}

#[test]
#[ignore = "xtask protocol prepares pinned real artifacts and production Wasm"]
fn financially_settled_real_payments_allow_later_roster_despite_unrefreshable_stake() {
    use quorum_accounting::RefreshState as R;
    let wall = std::time::Instant::now();
    let (pic, app, _) = lifecycle_real(0, 2_000_000, 200_000_000_000_000);
    let start = now(&pic);
    let initial_cycles = pic.cycle_balance(app);
    for _ in 0..800 {
        drive(&pic, 10);
        let ts = real_transfers(&pic, app, 1);
        if ts.len() == 2 && ts[1].refresh == Some(R::Complete) {
            break;
        }
    }
    let original = real_transfers(&pic, app, 1);
    assert_eq!(original.len(), 2);
    real_confirmed_evidence(&pic, app, &original);
    assert_eq!(
        original
            .iter()
            .map(|t| t.destination.neuron_id)
            .collect::<Vec<_>>(),
        vec![100, 106]
    );
    assert!(matches!(original[0].refresh, Some(R::RetryAt { .. })));
    assert_eq!(original[1].refresh, Some(R::Complete));
    // The pinned refresh rejects A's still-positive stake below its one-ICP minimum.
    let a = public_neuron(&pic, 100);
    assert_eq!(a.cached_neuron_stake_e8s, 50_000);
    let balance: candid::Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: GOVERNANCE,
            subaccount: Some(a.account),
        },
    );
    assert_eq!(l::nat(balance).unwrap(), 1_040_000);
    let b = public_neuron(&pic, 106);
    assert_eq!(b.cached_neuron_stake_e8s, 10_000_990_000);
    real_set_support(&pic, &[112, 118]);
    drive(&pic, 3 * 86400);
    pic.upgrade_canister(
        app,
        wasm("d_quorum"),
        encode_one(None::<d_quorum::state::Mode>).unwrap(),
        None,
    )
    .unwrap();
    drive(&pic, 5 * 86400);
    for _ in 0..1200 {
        drive(&pic, 1);
        let rs: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
        if rs
            .iter()
            .any(|r| r.topic == 4 && r.applied == vec![112, 118] && r.reward_eligible)
        {
            break;
        }
    }
    let rs: Vec<d_quorum::RosterView> = query2(&pic, app, "roster_page", (0u16, 100u16));
    assert!(
        rs.iter()
            .any(|r| r.topic == 4 && r.applied == vec![112, 118] && r.reward_eligible)
    );
    real_fund(&pic, app, 2_000_000);
    let due = query_empty::<d_quorum::Health>(&pic, app, "health").jobs[2].next_at;
    if due > now(&pic) + 10 {
        drive(&pic, due - now(&pic) - 10);
        assert_eq!(real_plans(&pic, app).len(), 1);
    }
    drive(&pic, 20);
    for _ in 0..100 {
        drive(&pic, 10);
        if real_plans(&pic, app)
            .iter()
            .any(|p| p.id == 2 && p.complete && p.maintenance_complete)
        {
            break;
        }
    }
    let later = real_transfers(&pic, app, 2);
    assert_eq!(
        later
            .iter()
            .map(|t| t.destination.neuron_id)
            .collect::<Vec<_>>(),
        vec![112, 118]
    );
    assert!(later.iter().all(|t| t.amount == 990_000));
    real_confirmed_evidence(&pic, app, &later);
    let retained = real_transfers(&pic, app, 1);
    for (x, y) in original.iter().zip(&retained) {
        assert_eq!(x.amount, y.amount);
        assert_eq!(x.destination, y.destination);
        assert_eq!(x.attempt, y.attempt);
        assert_eq!(x.status, y.status);
    }
    let h: d_quorum::Health = query_empty(&pic, app, "health");
    assert_eq!(h.pending_refreshes + h.abandoned_refreshes, 1);
    let metrics = serde_json::json!({"scenario":"A","virtual_seconds":now(&pic)-start,"wall_seconds":wall.elapsed().as_secs_f64(),"cycle_delta":initial_cycles-pic.cycle_balance(app),"checkpoints":h.checkpoints,"stable_bytes":h.stable_snapshot_bytes,"pending_refreshes":h.pending_refreshes,"abandoned_refreshes":h.abandoned_refreshes,"unpaid_obligations":real_plans(&pic,app).iter().map(|p|p.recipient_count-p.confirmed_count).sum::<u32>(),"exact_payments":4,"production_natural_timers":true});
    std::fs::write(
        root().join("dist/evidence/lifecycle-real-A.json"),
        serde_json::to_string_pretty(&metrics).unwrap(),
    )
    .unwrap();
    println!("{metrics}");
}
#[test]
#[ignore = "xtask protocol prepares pinned real artifacts and production Wasm"]
fn missed_entire_maturity_window_recovers_real_execution_and_later_distinct_harvest() {
    missed_real_maturity_window(MaturityOutage::Open);
}
#[test]
#[ignore = "xtask protocol prepares pinned real artifacts and production Wasm"]
fn missed_entire_maturity_window_recovers_across_real_upgrade() {
    missed_real_maturity_window(MaturityOutage::Upgrade);
}
#[test]
#[ignore = "xtask protocol prepares pinned real artifacts and production Wasm"]
fn missed_real_maturity_window_accepts_only_typed_post_lock_insufficient_funds_barrier() {
    use d_quorum::state::ProposalPhase as P;
    let (pic, app, probe) =
        lifecycle_real_with_target_stake(5_000_000_000, 0, 200_000_000_000_000, 50_000);
    // The actual pinned Governance/Ledger pair produces the reviewed enum variant.
    let refused: g::ManageResponse = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "manage_neuron",
        g::request(
            TARGET,
            g::Command::ClaimOrRefresh(g::Claim {
                by: Some(g::By::NeuronIdOrSubaccount(g::Empty {})),
            }),
        ),
    );
    assert!(matches!(
        refused.command,
        Some(g::ResponseCommand::Error(g::GovernanceError {
            error_type: 14,
            ..
        }))
    ));
    let ordinary: Result<g::ResponseCommand, String> =
        update(&pic, probe, Principal::anonymous(), "refresh_probe", TARGET);
    assert!(ordinary.is_err());
    let barrier: Result<(), String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "maturity_barrier_probe",
        TARGET,
    );
    barrier.unwrap();
    let original = (0..3000)
        .find_map(|_| {
            drive(&pic, 10);
            query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
                .filter(|j| matches!(j.phase, P::Open(_)))
        })
        .expect("real exact maturity proposal not submitted");
    let P::Open(id) = original.phase else {
        unreachable!()
    };
    pic.stop_canister(app, None).unwrap();
    real_vote(&pic, 12, user(12), id);
    drive(&pic, 60);
    let executed: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", id);
    let executed = executed.unwrap();
    assert_eq!(executed.status, 4);
    assert!(executed.executed_timestamp_seconds > 0);
    assert!(d_quorum::proposal::exact_matches(&executed, &original, app));
    assert!(
        !public_neuron(&pic, TARGET)
            .maturity_disbursements_in_progress
            .unwrap()
            .is_empty()
    );
    drive(&pic, 9 * 86400);
    for _ in 0..20 {
        drive(&pic, 60);
    }
    assert!(
        public_neuron(&pic, TARGET)
            .maturity_disbursements_in_progress
            .unwrap()
            .is_empty()
    );
    // A separate authoritative deposit remains funds, not a receipt for this command.
    real_fund(&pic, app, 12345);
    pic.upgrade_canister(
        app,
        wasm("d_quorum"),
        encode_one(None::<d_quorum::state::Mode>).unwrap(),
        None,
    )
    .unwrap();
    pic.start_canister(app, None).unwrap();
    for _ in 0..800 {
        drive(&pic, 10);
        let j = query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
            .unwrap();
        if matches!(j.phase, P::TerminalExecutionVerified(x) if x == id) {
            assert_eq!(j.marker, original.marker);
            assert_eq!(j.fingerprint, original.fingerprint);
            assert_eq!(j.executed_at, Some(executed.executed_timestamp_seconds));
            assert!(j.terminal_observed_at.is_some());
            assert!(!j.saw_disbursement && j.earliest_finalization.is_none());
            assert!(j.receipt.is_none());
            let repeated: g::ManageResponse = update(
                &pic,
                GOVERNANCE,
                Principal::anonymous(),
                "manage_neuron",
                g::request(
                    TARGET,
                    g::Command::ClaimOrRefresh(g::Claim {
                        by: Some(g::By::NeuronIdOrSubaccount(g::Empty {})),
                    }),
                ),
            );
            assert!(matches!(
                repeated.command,
                Some(g::ResponseCommand::Error(g::GovernanceError {
                    error_type: 14,
                    ..
                }))
            ));
            let history: g::Proposals = update(
                &pic,
                GOVERNANCE,
                app,
                "list_proposals",
                g::ListProposals {
                    limit: 100,
                    before_proposal: None,
                    include_reward_status: vec![],
                    exclude_topic: vec![],
                    include_status: vec![],
                    include_all_manage_neuron_proposals: Some(true),
                    omit_large_fields: Some(false),
                    return_self_describing_action: Some(false),
                },
            );
            assert_eq!(
                history
                    .proposal_info
                    .iter()
                    .filter(|p| d_quorum::proposal::exact_matches(p, &original, app))
                    .count(),
                1
            );
            return;
        }
    }
    panic!("actual typed InsufficientFunds barrier must terminate exact executed operation");
}
#[derive(Clone, Copy, Debug)]
enum MaturityOutage {
    Open,
    Upgrade,
    Executed,
    CycleReserve,
    LostCreationReply,
}
#[test]
#[ignore = "xtask protocol prepares pinned real artifacts and production Wasm"]
fn missed_maturity_window_resumes_from_real_executed_state() {
    missed_real_maturity_window(MaturityOutage::Executed);
}
#[test]
#[ignore = "xtask protocol prepares pinned real artifacts and production Wasm"]
fn missed_maturity_window_recovers_after_real_cycle_reserve_interruption() {
    missed_real_maturity_window(MaturityOutage::CycleReserve);
}
#[test]
#[ignore = "xtask protocol prepares pinned real artifacts and production Wasm"]
fn lost_real_maturity_creation_reply_recovers_exact_history_and_missed_window() {
    missed_real_maturity_window(MaturityOutage::LostCreationReply);
}
fn missed_real_maturity_window(outage: MaturityOutage) {
    missed_real_maturity_window_with_verifier(outage, false);
}
#[test]
#[ignore = "xtask system_protocol prepares both applications and pinned protocols"]
fn connected_real_maturity_rewards_and_later_harvest() {
    missed_real_maturity_window_with_verifier(MaturityOutage::Upgrade, true);
}
fn missed_real_maturity_window_with_verifier(outage: MaturityOutage, connected: bool) {
    let upgrade = matches!(
        outage,
        MaturityOutage::Upgrade | MaturityOutage::CycleReserve
    );
    let mut lost_identity = None;
    use d_quorum::state::ProposalPhase as P;
    let wall = std::time::Instant::now();
    let (pic, app, probe) = lifecycle_real(
        5_000_000_000,
        0,
        if matches!(outage, MaturityOutage::CycleReserve) {
            2_500_000_000_000
        } else {
            200_000_000_000_000
        },
    );
    if connected {
        let verifier = pic.create_canister();
        pic.add_cycles(verifier, 100_000_000_000_000);
        pic.install_canister(verifier, dendrite_wasm(), encode_one(()).unwrap(), None);
        let report: Result<dendrite_types::ComplianceReport, candid::Reserved> = update(
            &pic,
            verifier,
            Principal::anonymous(),
            "check_neuron",
            106u64,
        );
        assert_eq!(
            report.unwrap().overall_status,
            dendrite_types::ComplianceStatus::Compliant
        );
    }
    let start = now(&pic);
    let initial_cycles = pic.cycle_balance(app);
    let mut original = None;
    for _ in 0..3000 {
        if matches!(outage, MaturityOutage::LostCreationReply) {
            pic.advance_time(std::time::Duration::from_secs(1));
            pic.tick();
        } else {
            drive(&pic, 10);
        }
        let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(j) = j {
            if matches!(outage, MaturityOutage::LostCreationReply)
                && matches!(j.phase, P::Intent)
                && lost_identity.is_none()
            {
                lost_identity = Some((j.marker.clone(), j.fingerprint.clone()));
                // Capture the real persisted pre-await image. PocketIC's management
                // upgrade helper otherwise drains the successful callback first.
                // Discard that callback by restoring this exact crash checkpoint;
                // Governance retains its actual created proposal throughout.
                let crash_checkpoint = pic.get_stable_memory(app);
                pic.stop_canister(app, None).unwrap();
                pic.set_stable_memory(
                    app,
                    crash_checkpoint,
                    pocket_ic::common::rest::BlobCompression::NoCompression,
                );
                pic.upgrade_canister(
                    app,
                    wasm("d_quorum"),
                    encode_one(None::<d_quorum::state::Mode>).unwrap(),
                    None,
                )
                .unwrap();
                pic.start_canister(app, None).unwrap();
                let retained = query_empty::<Option<d_quorum::state::ProposalJob>>(
                    &pic,
                    app,
                    "proposal_progress",
                )
                .unwrap();
                assert!(
                    matches!(retained.phase, P::Ambiguous),
                    "the actual durable Intent image must recover as ambiguous"
                );
            } else if matches!(j.phase, P::Open(_)) {
                original = Some(j);
                break;
            }
        }
    }
    let original = original.expect("real maturity proposal not submitted");
    let P::Open(id) = original.phase else {
        unreachable!()
    };
    wait_real_reward_roster(&pic, app);
    println!(
        "maturity {outage:?}: exact proposal {id}, ordinary roster established, cycles={}",
        pic.cycle_balance(app)
    );
    if matches!(outage, MaturityOutage::LostCreationReply) {
        assert_eq!(
            lost_identity,
            Some((original.marker.clone(), original.fingerprint.clone()))
        );
    }
    if matches!(outage, MaturityOutage::Executed) {
        real_vote(&pic, 12, user(12), id);
        let mut observed = false;
        for _ in 0..800 {
            drive(&pic, 10);
            let j =
                query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
                    .unwrap();
            if matches!(j.phase,P::Executed(x) if x==id) {
                assert!(!j.saw_disbursement);
                observed = true;
                break;
            }
        }
        assert!(observed, "must suspend before observing transient progress");
        pic.stop_canister(app, None).unwrap();
    } else {
        pic.stop_canister(app, None).unwrap();
        if matches!(outage, MaturityOutage::CycleReserve) {
            // Consume the explicit setup margin before manager approval, using
            // actual local allocation charges. No disbursement is pending yet.
            pic.start_canister(app, None).unwrap();
            pic.update_canister_settings(
                app,
                None,
                pocket_ic::CanisterSettings {
                    compute_allocation: Some(99u64.into()),
                    freezing_threshold: Some(0u64.into()),
                    ..Default::default()
                },
            )
            .unwrap();
            for _ in 0..100 {
                if pic.cycle_balance(app) < 2_000_000_000_000 {
                    break;
                }
                drive(&pic, 60);
            }
            pic.update_canister_settings(
                app,
                None,
                pocket_ic::CanisterSettings {
                    compute_allocation: Some(0u64.into()),
                    ..Default::default()
                },
            )
            .unwrap();
            assert!(
                pic.cycle_balance(app) < 2_000_000_000_000,
                "allocation charges did not reach reserve: {}",
                pic.cycle_balance(app)
            );
            println!(
                "maturity CycleReserve: measured cycles below reserve={}",
                pic.cycle_balance(app)
            );
        }
        real_vote(&pic, 12, user(12), id);
    }
    drive(&pic, 60);
    let p: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", id);
    let p = p.unwrap();
    assert_eq!(p.status, 4);
    assert!(p.executed_timestamp_seconds > 0);
    assert!(d_quorum::proposal::exact_matches(&p, &original, app));
    assert!(
        !public_neuron(&pic, TARGET)
            .maturity_disbursements_in_progress
            .unwrap()
            .is_empty()
    );
    // An independent real maturity command produces an unrelated mint to this account.
    let unrelated: g::ManageResponse = update(
        &pic,
        GOVERNANCE,
        user(8),
        "manage_neuron",
        g::ManagedMaturity {
            id: None,
            neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: 301 })),
            command: Some(g::MaturityCommand::DisburseMaturity(g::DisburseMaturity {
                percentage_to_disburse: 100,
                to_account: Some(g::Account {
                    owner: Some(app),
                    subaccount: None,
                }),
                to_account_identifier: None,
            })),
        },
    );
    assert!(matches!(
        unrelated.command,
        Some(g::ResponseCommand::DisburseMaturity(_))
    ));
    // The automation misses every observation while Governance finalizes the real mint.
    drive(&pic, 9 * 86400);
    for _ in 0..20 {
        drive(&pic, 60);
    }
    assert!(
        public_neuron(&pic, TARGET)
            .maturity_disbursements_in_progress
            .unwrap()
            .is_empty()
    );
    let credit: candid::Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: app,
            subaccount: None,
        },
    );
    let credited = l::nat(credit).unwrap();
    assert!((7_600_000_000..=8_400_000_000).contains(&credited));
    let anchor: l::History = query(
        &pic,
        LEDGER,
        "query_blocks",
        l::BlocksArgs {
            start: 0,
            length: 0,
        },
    );
    let mint_history: l::History = query(
        &pic,
        LEDGER,
        "query_blocks",
        l::BlocksArgs {
            start: anchor.chain_length - 2,
            length: 2,
        },
    );
    assert_eq!(mint_history.blocks.len(), 2);
    let mut mint_amounts = Vec::new();
    for b in &mint_history.blocks {
        let Some(l::Operation::Mint { to, amount }) = &b.transaction.operation else {
            panic!("expected actual mints");
        };
        assert_eq!(*to, l::account_id(app, None));
        mint_amounts.push(amount.e8s);
    }
    mint_amounts.sort();
    assert_eq!(mint_amounts.iter().sum::<u64>(), credited);
    assert!((2_850_000_000..=3_150_000_000).contains(&mint_amounts[0]));
    assert!((4_750_000_000..=5_250_000_000).contains(&mint_amounts[1]));
    // A separate deposit is authoritative money but never receipt attribution for this proposal.
    real_fund(&pic, app, 12345);
    if upgrade {
        if matches!(outage, MaturityOutage::CycleReserve) {
            pic.stop_canister(app, None).unwrap();
        }
        pic.upgrade_canister(
            app,
            wasm("d_quorum"),
            encode_one(None::<d_quorum::state::Mode>).unwrap(),
            None,
        )
        .unwrap();
    }
    pic.start_canister(app, None).unwrap();
    if matches!(outage, MaturityOutage::CycleReserve) {
        let before = query_empty::<d_quorum::Health>(&pic, app, "health");
        drive(&pic, 3601);
        let after = query_empty::<d_quorum::Health>(&pic, app, "health");
        assert_eq!(before.jobs[1].steps, after.jobs[1].steps);
        assert!(!matches!(
            query_empty::<Option<d_quorum::state::ProposalJob>>(&pic, app, "proposal_progress")
                .unwrap()
                .phase,
            P::TerminalExecutionVerified(_)
        ));
        pic.add_cycles(app, 100_000_000_000_000);
    }
    let mut terminal = None;
    for _ in 0..800 {
        drive(&pic, 10);
        let j: Option<d_quorum::state::ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if let Some(j) = j
            && matches!(j.phase,P::TerminalExecutionVerified(x) if x==id)
        {
            terminal = Some(j);
            break;
        }
    }
    let terminal = terminal.unwrap_or_else(|| {
        panic!(
            "missed real window stuck: {:?}",
            query_empty::<d_quorum::Health>(&pic, app, "health")
        )
    });
    assert_eq!(terminal.marker, original.marker);
    assert_eq!(terminal.fingerprint, original.fingerprint);
    assert!(!terminal.saw_disbursement && terminal.earliest_finalization.is_none());
    assert!(terminal.receipt.is_none());
    assert_eq!(terminal.executed_at, Some(p.executed_timestamp_seconds));
    wait_real_reward_roster(&pic, app);
    let mut next = None;
    // Accrue actual Governance voting rewards; no fixture edit or fabricated maturity top-up.
    for day in 0..60 {
        wait_real_reward_roster(&pic, app);
        let motion: Result<u64, String> =
            update(&pic, probe, Principal::anonymous(), "motion_probe", 499u64);
        let motion = motion.unwrap();
        real_vote(
            &pic,
            dendrite_types::OMEGA_REJECT_NEURON_ID,
            user(1),
            motion,
        );
        drive(&pic, 86400);
        for _ in 0..12 {
            drive(&pic, 10);
            let j: Option<d_quorum::state::ProposalJob> =
                query_empty(&pic, app, "proposal_progress");
            if let Some(j) = j
                && let P::Open(next_id) = j.phase
                && next_id != id
            {
                assert!(j.operation > original.operation);
                assert_ne!(j.marker, original.marker);
                next = Some(next_id);
                break;
            }
            let h: d_quorum::Health = query_empty(&pic, app, "health");
            if h.jobs[1].busy_until == 0 && h.jobs[1].next_at > now(&pic) {
                let waiting: Option<d_quorum::state::ProposalJob> =
                    query_empty(&pic, app, "proposal_progress");
                if waiting
                    .as_ref()
                    .is_none_or(|j| matches!(j.phase, P::TerminalExecutionVerified(_)))
                {
                    break;
                }
            }
        }
        if next.is_some() {
            break;
        }
        if day % 10 == 0 {
            println!(
                "real subsequent accrual day={day} maturity={}",
                public_neuron(&pic, TARGET).maturity_e8s_equivalent
            );
        }
    }
    let next = next.expect("later naturally accrued maturity did not reach a distinct proposal");
    let history: g::Proposals = update(
        &pic,
        GOVERNANCE,
        app,
        "list_proposals",
        g::ListProposals {
            limit: 100,
            before_proposal: None,
            include_reward_status: vec![],
            exclude_topic: vec![],
            include_all_manage_neuron_proposals: Some(true),
            include_status: vec![],
            return_self_describing_action: Some(false),
            omit_large_fields: Some(false),
        },
    );
    assert_eq!(
        history
            .proposal_info
            .iter()
            .filter(|p| d_quorum::proposal::exact_matches(p, &original, app))
            .count(),
        1
    );
    if connected {
        let plans = real_plans(&pic, app);
        assert!(!plans.is_empty());
        assert!(plans[0].complete);
        let paid = real_transfers(&pic, app, plans[0].id);
        assert_eq!(paid.len(), 2);
        assert_eq!(paid[0].amount, paid[1].amount);
        real_confirmed_evidence(&pic, app, &paid);
        // Execute the later operation funded by actual voting rewards, then let
        // ordinary weekly selection and daily payout admit a different roster.
        real_set_support(&pic, &[112, 118]);
        real_vote(&pic, 12, user(12), next);
        drive(&pic, 60);
        let executed: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", next);
        assert_eq!(executed.unwrap().status, 4);
        drive(&pic, 9 * 86400);
        let mut later = None;
        for _ in 0..1200 {
            drive(&pic, 10);
            later = real_plans(&pic, app)
                .into_iter()
                .find(|p| p.id > plans[0].id && p.complete);
            if later.is_some() {
                break;
            }
        }
        let later =
            later.expect("genuinely accrued maturity must fund a later complete distribution");
        let later_paid = real_transfers(&pic, app, later.id);
        assert_eq!(
            later_paid
                .iter()
                .map(|t| t.destination.neuron_id)
                .collect::<Vec<_>>(),
            vec![112, 118]
        );
        assert_eq!(later_paid[0].amount, later_paid[1].amount);
        real_confirmed_evidence(&pic, app, &later_paid);
        assert_eq!(real_transfers(&pic, app, plans[0].id), paid);
        std::fs::write(root().join("dist/evidence/connected-economic-lifecycle.json"), serde_json::to_string_pretty(&serde_json::json!({"classification":"real protocol, no browser authentication claim","original_proposal":id,"later_distinct_proposal":next,"actual_minted_e8s":credited,"receipts_attributed":false,"recipients":paid.iter().map(|t|t.destination.neuron_id).collect::<Vec<_>>(),"transfer_confirmations":paid.iter().map(|t|format!("{:?}",t.status)).collect::<Vec<_>>(),"seeded_initial_maturity":true,"later_maturity":"actual NNS voting rewards, executed and paid to new roster","later_payout_id":later.id,"later_recipients":[112,118]})).unwrap()).unwrap();
    }
    let health: d_quorum::Health = query_empty(&pic, app, "health");
    let status = pic.canister_status(app, None).unwrap();
    let added_cycles = if matches!(outage, MaturityOutage::CycleReserve) {
        100_000_000_000_000u128
    } else {
        0
    };
    let metrics = serde_json::json!({"scenario":"B","creation_reply_fault":if matches!(outage,MaturityOutage::LostCreationReply) {"actual Intent checkpoint restored after discarding callback; real Governance creation"} else {"none"},"cycle_delta":initial_cycles+added_cycles-pic.cycle_balance(app),"cycle_funding_added":added_cycles,"checkpoints":health.checkpoints,"stable_bytes":health.stable_snapshot_bytes,"heap_bytes":status.memory_metrics.wasm_memory_size.to_string(),"stable_pages":health.stable_memory_pages,"pending_refreshes":health.pending_refreshes,"abandoned_refreshes":health.abandoned_refreshes,"fixture_nonvoting_treasury_e8s":10_000_000_000_000u64,"outage":format!("{outage:?}"),"upgrade_during_disbursement_outage":upgrade,"original_proposal":id,"next_proposal":next,"actual_minted_e8s":credited,"receipt_attribution":"unresolved; no proposal identity in mint","missed_progress_observation":true,"virtual_seconds":now(&pic)-start,"wall_seconds":wall.elapsed().as_secs_f64(),"production_natural_timers":true});
    std::fs::write(
        root().join(format!("dist/evidence/lifecycle-real-B-{outage:?}.json")),
        serde_json::to_string_pretty(&metrics).unwrap(),
    )
    .unwrap();
    println!("{metrics}");
}

#[test]
#[ignore = "xtask protocol prepares pinned real artifacts and production Wasm"]
fn repeated_real_ledger_refusals_recover_after_durable_cooldown() {
    use quorum_accounting::TransferStatus as T;
    let (pic, app, _) = lifecycle_real(0, 2_000_000, 200_000_000_000_000);
    let wall = std::time::Instant::now();
    let start = now(&pic);
    let mut rejected = 0;
    let mut prior = None;
    let mut upgraded = false;
    for _ in 0..20000 {
        // Single natural rounds expose the real cross-subnet dispatch boundary.
        pic.advance_time(std::time::Duration::from_secs(1));
        pic.tick();
        let ts = real_transfers(&pic, app, 1);
        let Some(t) = ts.first() else { continue };
        if let T::Cooldown { until_ns, .. } = t.status {
            assert_eq!(t.attempt.as_ref().unwrap().number, 12);
            if !upgraded {
                let exact = t.attempt.clone();
                pic.upgrade_canister(
                    app,
                    wasm("d_quorum"),
                    encode_one(None::<d_quorum::state::Mode>).unwrap(),
                    None,
                )
                .unwrap();
                assert_eq!(real_transfers(&pic, app, 1)[0].attempt, exact);
                real_fund(&pic, app, 2_000);
                upgraded = true;
            }
            pic.advance_time(std::time::Duration::from_secs(
                until_ns.div_ceil(1_000_000_000).saturating_sub(now(&pic)) + 1,
            ));
            continue;
        }
        if matches!(t.status, T::Unknown { attempts: 1 })
            && t.attempt.as_ref().is_some_and(|a| a.number > rejected)
            && rejected < 14
        {
            let a = t.attempt.clone().unwrap();
            let balance: candid::Nat = query(
                &pic,
                LEDGER,
                "icrc1_balance_of",
                l::Account {
                    owner: app,
                    subaccount: None,
                },
            );
            let balance = l::nat(balance).unwrap();
            // Test-only adversarial debit at the validated-balance/transfer boundary.
            // PocketIC impersonates this LOCAL fixture canister; production has no such endpoint.
            let debit = pic
                .submit_call(
                    LEDGER,
                    app,
                    "icrc1_transfer",
                    encode_one(l::TransferArg {
                        from_subaccount: None,
                        to: l::Account {
                            owner: user(7),
                            subaccount: None,
                        },
                        amount: (balance - 10_000).into(),
                        fee: Some(10_000u64.into()),
                        memo: None,
                        created_at_time: None,
                    })
                    .unwrap(),
                )
                .unwrap();
            let bytes = pic.await_call(debit).unwrap();
            let debited: Result<candid::Nat, l::TransferError> =
                candid::decode_one(&bytes).unwrap();
            debited.expect("fault debit missed dispatch boundary");
            for _ in 0..20 {
                pic.tick();
            }
            let after = real_transfers(&pic, app, 1);
            assert!(
                matches!(after[0].status, T::Rejected { .. } | T::Cooldown { .. }),
                "real typed refusal boundary was not reached: {:?}",
                after[0]
            );
            assert!(!after[0].attempt.as_ref().unwrap().may_have_executed);
            assert_eq!(after[0].attempt.as_ref().unwrap().memo, a.memo);
            assert_eq!(after[0].amount, 990_000);
            prior = Some(after[0].clone());
            rejected += 1;
            real_fund(&pic, app, balance);
            if rejected != 12 {
                pic.advance_time(std::time::Duration::from_secs(120));
            }
        }
        if real_plans(&pic, app).first().is_some_and(|p| p.complete) {
            break;
        }
    }
    assert_eq!(rejected, 14);
    assert!(upgraded);
    let ts = real_transfers(&pic, app, 1);
    real_confirmed_evidence(&pic, app, &ts);
    assert_eq!(ts.len(), 2);
    assert_eq!(ts[0].attempt.as_ref().unwrap().number, 15);
    assert_eq!(
        ts[0].rejected_attempts.len(),
        quorum_accounting::REFUSAL_HISTORY
    );
    assert_eq!(ts[0].rejected_attempts.first().unwrap().number, 3);
    assert_eq!(ts[0].rejected_attempts.last().unwrap().number, 14);
    let prior = prior.unwrap();
    assert_eq!(ts[0].amount, prior.amount);
    assert_eq!(ts[0].destination, prior.destination);
    assert_eq!(ts[1].attempt.as_ref().unwrap().number, 1);
    let h = query_empty::<d_quorum::Health>(&pic, app, "health");
    let metrics = serde_json::json!({"scenario":"C","real_typed_refusals":rejected,"successful_payment_attempt":15,"adversary":"local PocketIC impersonated debit between validated balance and dispatch; actual pinned Ledger InsufficientFunds","virtual_seconds":now(&pic)-start,"wall_seconds":wall.elapsed().as_secs_f64(),"checkpoints":h.checkpoints,"stable_bytes":h.stable_snapshot_bytes,"production_natural_timers":true});
    std::fs::write(
        root().join("dist/evidence/lifecycle-real-C.json"),
        serde_json::to_string_pretty(&metrics).unwrap(),
    )
    .unwrap();
    println!("{metrics}");
}

#[test]
#[ignore = "xtask system_protocol builds both production-feature applications"]
fn connected_dendrite_and_automation_use_one_real_governance_and_ledger() {
    let wall = std::time::Instant::now();
    let (pic, app, _) = lifecycle_real(0, 2_000_000, 200_000_000_000_000);
    let manager_batch: g::ListNeuronsResponse = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "list_neurons",
        g::ListNeurons {
            neuron_ids: (2010..2015).collect(),
            include_neurons_readable_by_caller: false,
            include_empty_neurons_readable_by_caller: Some(false),
            include_public_neurons_in_full_neurons: Some(true),
            page_number: Some(0),
            page_size: Some(50),
            neuron_subaccounts: None,
        },
    );
    assert_eq!(manager_batch.full_neurons.len(), 5);
    let mut metadata = Vec::new();
    for id in 2010..2015 {
        let scalar: Result<g::NeuronInfo, g::GovernanceError> = update(
            &pic,
            GOVERNANCE,
            Principal::anonymous(),
            "get_neuron_info",
            id,
        );
        let info = scalar.unwrap();
        assert!(info.known_neuron_data.is_some());
        metadata.push(serde_json::json!({"id":id,"full_list_has_metadata":manager_batch.full_neurons.iter().find(|n|n.id.as_ref().unwrap().id==id).unwrap().known_neuron_data.is_some(),"scalar_has_metadata":true}));
    }
    std::fs::write(
        root().join("dist/evidence/real-known-manager-metadata.json"),
        serde_json::to_string_pretty(&metadata).unwrap(),
    )
    .unwrap();
    let verifier = pic.create_canister();
    pic.add_cycles(verifier, 100_000_000_000_000);
    let verifier_wasm = dendrite_wasm();
    pic.install_canister(
        verifier,
        verifier_wasm.clone(),
        encode_one(()).unwrap(),
        None,
    );
    // Decode the error opaquely: an error can never be interpreted as compliance.
    let report: Result<dendrite_types::ComplianceReport, candid::Reserved> = update(
        &pic,
        verifier,
        Principal::anonymous(),
        "check_neuron",
        106u64,
    );
    let report = report.expect("replicated verifier failed against actual Governance");
    assert_eq!(
        report.overall_status,
        dendrite_types::ComplianceStatus::Compliant
    );
    assert_eq!(report.neuron_id, 106);
    wait_real_reward_roster(&pic, app);
    let candidates: Vec<d_quorum::state::CandidateResult> =
        query2(&pic, app, "candidate_page", (None::<u64>, 100u16));
    let candidate = candidates.iter().find(|c| c.id == 106).unwrap();
    assert_eq!(candidate.status, report.overall_status);
    let admitted = candidate.admitted.as_ref().unwrap();
    let mut managers: Vec<_> = report.managers.iter().map(|m| m.neuron_id).collect();
    managers.sort_unstable();
    assert_eq!(
        admitted.managers.iter().copied().collect::<Vec<_>>(),
        managers
    );
    for _ in 0..800 {
        drive(&pic, 10);
        if real_plans(&pic, app).first().is_some_and(|p| p.complete) {
            break;
        }
    }
    let plans = real_plans(&pic, app);
    assert!(plans[0].complete);
    let transfers = real_transfers(&pic, app, plans[0].id);
    assert_eq!(transfers.len(), 2);
    assert_eq!(transfers[0].amount, transfers[1].amount);
    real_confirmed_evidence(&pic, app, &transfers);
    let target = public_neuron(&pic, TARGET);
    assert!(target.followees.iter().any(|(topic, ids)| *topic == 4
        && ids.followees.iter().map(|n| n.id).collect::<Vec<_>>() == vec![100, 106]));
    let evidence = serde_json::json!({"classification":"real pinned protocol; no browser or II claim","same_instance":true,"dquorum_module_sha256":hex::encode(sha2::Sha256::digest(wasm("d_quorum"))),"dendrite_module_sha256":hex::encode(sha2::Sha256::digest(verifier_wasm)),"recipients":transfers.iter().map(|t| t.destination.neuron_id).collect::<Vec<_>>(),"wall_seconds":wall.elapsed().as_secs_f64()});
    std::fs::write(
        root().join("dist/evidence/connected-applications.json"),
        serde_json::to_string_pretty(&evidence).unwrap(),
    )
    .unwrap();
}
