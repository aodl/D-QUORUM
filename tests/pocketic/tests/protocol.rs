mod support;
use candid::{Principal, encode_one};
use quorum_ic_clients::{GOVERNANCE, LEDGER, governance as g, ledger as l};
use quorum_policy::TARGET;
use support::*;

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
    install_real(
        &pic,
        vec![target, proposer, m1, m2],
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
    let proposal: Result<u64, String> = update(
        &pic,
        probe,
        Principal::anonymous(),
        "proposal_probe",
        (11u64, payload),
    );
    let id = proposal.unwrap();
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
        if ps.first().is_some_and(|p| p.complete) {
            break;
        }
    }
    let ps: Vec<d_quorum::PayoutSummary> = query2(&pic, app, "payout_page", (None::<u64>, 100u16));
    assert_eq!(ps[0].id, payout);
    assert!(ps[0].complete);
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
