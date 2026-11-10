use crate::*;

#[derive(CandidType, Deserialize)]
struct CreationProposal {
    status: i32,
    topic: i32,
    executed_timestamp_seconds: u64,
    ballots: Vec<(u64, CreationBallot)>,
    latest_tally: Option<CreationTally>,
}
#[derive(CandidType, Deserialize)]
struct CreationTally {
    yes: u64,
    no: u64,
    total: u64,
}
#[derive(CandidType, Deserialize)]
struct CreationBallot {
    vote: i32,
    voting_power: u64,
}
#[derive(CandidType, Deserialize)]
struct RegisteredInfo {
    known_neuron_data: Option<RegisteredMetadata>,
}
#[derive(CandidType, Deserialize)]
struct RegisteredMetadata {
    name: String,
    committed_topics: Option<Vec<Option<RegisteredTopic>>>,
}
#[derive(CandidType, Deserialize, Debug, PartialEq, Eq)]
enum RegisteredTopic {
    Governance,
}
#[derive(CandidType, Deserialize, Debug, PartialEq, Eq)]
struct RefusalReservation {
    intent_id: Vec<u8>,
    request_digest: Vec<u8>,
    request_id: Option<Vec<u8>>,
    proposer: u64,
    revision: u64,
    dispatched: bool,
    proposal_id: Option<u64>,
}
#[derive(CandidType, Deserialize, Debug, PartialEq, Eq)]
struct RefusalAudit {
    reservation: RefusalReservation,
    request_id: Vec<u8>,
    error_type: i32,
    certificate_digest: Vec<u8>,
    reply_digest: Vec<u8>,
}
#[derive(CandidType, Deserialize, Debug)]
struct RefusalState {
    version: u16,
    proposal_refusals: Option<Vec<RefusalAudit>>,
    external_proposal: Option<RefusalReservation>,
}
// Native, real-Governance fault injection only. Browser authority for the
// creation, registration, rehearsal and finalisation remains independently tested.
#[derive(CandidType)]
struct FeeEconomics {
    neuron_minimum_stake_e8s: u64,
    max_proposals_to_keep_per_topic: u32,
    neuron_management_fee_per_proposal_e8s: u64,
    reject_cost_e8s: u64,
    transaction_fee_e8s: u64,
    neuron_spawn_dissolve_delay_seconds: u64,
    minimum_icp_xdr_rate: u64,
    maximum_node_provider_rewards_e8s: u64,
}
#[derive(CandidType)]
enum FeeAction {
    ManageNetworkEconomics(FeeEconomics),
    RegisterKnownNeuron(CatalogEntry),
}
#[derive(CandidType)]
struct CatalogEntry {
    id: Option<g::NeuronId>,
    known_neuron_data: Option<g::KnownNeuronData>,
}
#[derive(CandidType)]
struct FeeProposal {
    title: Option<String>,
    summary: String,
    url: String,
    action: Option<FeeAction>,
}
#[derive(CandidType)]
enum FeeCommand {
    MakeProposal(FeeProposal),
}
#[derive(CandidType)]
struct FeeRequest {
    neuron_id_or_subaccount: Option<g::Id>,
    command: Option<FeeCommand>,
}
#[derive(CandidType, Deserialize)]
struct FeeResult {
    status: i32,
    executed_timestamp_seconds: u64,
}
fn management_fee_fault(pic: &pocket_ic::PocketIc, identities: &[Principal], fee: u64) {
    fixture_global_action(
        pic,
        identities,
        FeeAction::ManageNetworkEconomics(FeeEconomics {
            neuron_minimum_stake_e8s: 100_000_000,
            max_proposals_to_keep_per_topic: 100,
            neuron_management_fee_per_proposal_e8s: fee,
            reject_cost_e8s: 100_000_000,
            transaction_fee_e8s: 10_000,
            neuron_spawn_dissolve_delay_seconds: 86_400,
            minimum_icp_xdr_rate: 100,
            maximum_node_provider_rewards_e8s: 100_000_000,
        }),
    );
}
fn catalogue_name_fault(pic: &pocket_ic::PocketIc, identities: &[Principal], name: &str) {
    let mut metadata = known(16);
    metadata.name = name.into();
    fixture_global_action(
        pic,
        identities,
        FeeAction::RegisterKnownNeuron(CatalogEntry {
            id: Some(g::NeuronId { id: 16 }),
            known_neuron_data: Some(metadata),
        }),
    );
}
fn fixture_global_action(pic: &pocket_ic::PocketIc, identities: &[Principal], action: FeeAction) {
    let response:g::ManageResponse=update(pic,GOVERNANCE,identities[0],"manage_neuron",FeeRequest{
        neuron_id_or_subaccount:Some(g::Id::NeuronId(g::NeuronId{id:11})),
        command:Some(FeeCommand::MakeProposal(FeeProposal{title:Some("Isolated creation precondition fault".into()),
            summary:"Native real-protocol fault between the browser's exact review and original signed dispatch; not a browser authority claim".into(),url:String::new(),action:Some(action)}))});
    let Some(g::ResponseCommand::MakeProposal(result)) = response.command else {
        panic!("fee-change proposal refused: {:?}", response.command)
    };
    let id = result.proposal_id.unwrap().id;
    for (index, owner) in identities.iter().enumerate().take(4).skip(1) {
        let result: g::ManageResponse = update(
            pic,
            GOVERNANCE,
            *owner,
            "manage_neuron",
            VoteRequest {
                neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId {
                    id: 11 + index as u64,
                })),
                command: Some(VoteCommand::RegisterVote(Vote {
                    vote: 1,
                    proposal: Some(g::NeuronId { id }),
                })),
            },
        );
        assert!(matches!(
            result.command,
            Some(g::ResponseCommand::RegisterVote(_))
        ));
    }
    let executed: Option<FeeResult> =
        update(pic, GOVERNANCE, identities[0], "get_proposal_info", id);
    let executed = executed.unwrap();
    assert_eq!(executed.status, 4);
    assert!(executed.executed_timestamp_seconds > 0);
}
fn receipt_id(receipt: &serde_json::Value, name: &str) -> u64 {
    receipt[name].as_str().unwrap().parse().unwrap()
}
fn transfer_external(pic: &pocket_ic::PocketIc, to: l::Account, amount: u64) -> u64 {
    let result: Result<candid::Nat, l::TransferError> = update(
        pic,
        LEDGER,
        user(41),
        "icrc1_transfer",
        l::TransferArg {
            from_subaccount: None,
            to,
            amount: amount.into(),
            fee: Some(10_000u64.into()),
            memo: None,
            created_at_time: Some(pic.get_time().as_nanos_since_unix_epoch()),
        },
    );
    result.unwrap().0.try_into().unwrap()
}
fn verify_proposal(pic: &pocket_ic::PocketIc, p: Principal, id: u64, count: usize, topic: i32) {
    let result: Option<CreationProposal> = update(pic, GOVERNANCE, p, "get_proposal_info", id);
    let result = result.expect("genuine proposal must be readable by the authenticated creator");
    assert_eq!(result.status, 4);
    assert_eq!(result.topic, topic);
    assert!(result.executed_timestamp_seconds > 0);
    if topic == 1 {
        // Ballots are filtered by caller authority; the replicated aggregate
        // refers to the actual historical electorate, whose IDs are not public.
        assert_eq!(result.ballots.len(), 1);
        let tally = result.latest_tally.unwrap();
        assert_eq!(tally.total, count as u64);
        assert!(tally.yes > tally.total / 2);
        assert!(tally.yes + tally.no <= tally.total);
        assert!(result.ballots.iter().all(|(_, b)| b.voting_power == 1));
        assert!(
            result
                .ballots
                .iter()
                .all(|(_, b)| (0..=2).contains(&b.vote))
        );
    }
}

pub fn coordinate(
    pic: &pocket_ic::PocketIc,
    verifier: Principal,
    directory: &Path,
    scenario: &str,
    child: &mut Child,
    upgraded_frontend: Option<&[u8]>,
) {
    let production = scenario == "creation-production";
    let principal = signal(directory, "creation-principal", child);
    let p = Principal::from_text(principal["principal"].as_str().unwrap()).unwrap();
    let identities: Vec<Principal> = principal["participants"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| Principal::from_text(p.as_str().unwrap()).unwrap())
        .collect();
    assert_eq!(identities.len(), if production { 5 } else { 1 });
    assert_eq!(
        identities
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        identities.len()
    );
    let at = now(pic);
    let managers: Vec<u64> = if production {
        (11..=15).collect()
    } else {
        vec![11]
    };
    let mut neurons = vec![];
    for (index, id) in managers.iter().enumerate() {
        let mut manager = seed(*id, identities[index], at);
        manager.known_neuron_data = Some(known(*id));
        manager.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
        neurons.push(manager);
    }
    if production {
        let mut unrelated = seed(16, user(1), at);
        unrelated.known_neuron_data = Some(known(16));
        unrelated.dissolve_state = Some(g::DissolveState::DissolveDelaySeconds(1));
        neurons.push(unrelated);
    }
    for id in [
        dendrite_types::ALPHA_VOTE_NEURON_ID,
        dendrite_types::OMEGA_REJECT_NEURON_ID,
    ] {
        neurons.push(seed(id, user(1), at));
    }
    install_real(
        pic,
        neurons,
        vec![(
            l::Account {
                owner: user(41),
                subaccount: None,
            },
            10_000_000_000,
        )],
        artifact("governance-canister"),
        artifact("ledger-canister"),
    );
    creation::install_provisioning(pic);
    publish(
        directory,
        "creation-provisioned",
        serde_json::json!({"managers":managers}),
    );
    let plan = signal(directory, "creation-plan", child);
    assert_eq!(plan["plan"]["owner"], p.to_text());
    assert_eq!(plan["plan"]["dendrite_service"], verifier.to_text());
    assert_eq!(
        plan["plan"]["profile"],
        if production {
            "ProductionCandidate"
        } else {
            "RecoverableTest"
        }
    );
    let bucket = hex::decode(plan["funding_subaccount"].as_str().unwrap()).unwrap();
    let funding_block = transfer_external(
        pic,
        l::Account {
            owner: p,
            subaccount: Some(bucket.clone()),
        },
        500_000_000,
    );
    if production {
        browser_clock::advance(pic, directory, Duration::from_secs(48 * 3600));
        creation::refresh_provisioning_quote(pic);
    }
    publish(
        directory,
        "creation-funding-ready",
        serde_json::json!({"block":funding_block,"now_ms":pic.get_time().as_nanos_since_unix_epoch()/1_000_000}),
    );
    if production {
        let converted = signal(directory, "creation-converted-before-first-create", child);
        assert!(converted["canister_id"].is_null());
        browser_clock::advance(pic, directory, Duration::from_secs(48 * 3600));
        publish(
            directory,
            "creation-first-create-clock",
            serde_json::json!({"now_ms":pic.get_time().as_nanos_since_unix_epoch()/1_000_000}),
        );
    }
    let installed = signal(directory, "creation-controller-installed", child);
    let c = Principal::from_text(installed["canister_id"].as_str().unwrap()).unwrap();
    assert_eq!(pic.get_controllers(c), vec![p]);
    let system = pic.canister_status(c, Some(p)).unwrap();
    let installed_cycles = pic.cycle_balance(c);
    if let Ok(path) = std::env::var("DENDRITE_BOOTSTRAP_TEST_WASM") {
        assert_eq!(
            system.module_hash.as_ref().unwrap(),
            &Sha256::digest(fs::read(path).unwrap()).to_vec(),
            "signed creation must install the selected exact canonical bootstrap"
        );
    }
    assert_eq!(
        system.module_hash,
        Some(hex::decode(installed["plan"]["bootstrap_sha256"].as_str().unwrap()).unwrap())
    );
    assert_eq!(system.settings.compute_allocation, candid::Nat::from(0u8));
    assert_eq!(system.settings.memory_allocation, candid::Nat::from(0u8));
    let nonce = receipt_id(&installed["plan"], "nonce");
    let subaccount = l::staking_subaccount(c, nonce);
    let stake = receipt_id(&installed["plan"], "stake_e8s");
    if production {
        browser_clock::advance(pic, directory, Duration::from_secs(48 * 3600));
    }
    let mut stake_block = if production {
        transfer_external(
            pic,
            l::Account {
                owner: GOVERNANCE,
                subaccount: Some(subaccount.clone()),
            },
            stake,
        )
    } else {
        0
    };
    if !production {
        browser_clock::advance(pic, directory, Duration::from_secs(31 * 86_400));
        let next = upgraded_frontend
            .expect("reviewed V1 browser creation requires an actual frontend rollover");
        let controller = pic.get_controllers(verifier)[0];
        pic.upgrade_canister(
            verifier,
            next.to_vec(),
            encode_one(()).unwrap(),
            Some(controller),
        )
        .unwrap();
        assert_eq!(pic.get_controllers(c), vec![p]);
        assert_eq!(
            hex::encode(
                pic.canister_status(c, Some(p))
                    .unwrap()
                    .module_hash
                    .unwrap()
            ),
            "fef1735bb08b92bad58ec761f199741fa459292b81864c219aff5442e7423265"
        );
    }
    publish(
        directory,
        if production {
            "creation-stake-funded"
        } else {
            "creation-stake-ready"
        },
        serde_json::json!({"external_block":production.then_some(stake_block),"now_ms":pic.get_time().as_nanos_since_unix_epoch()/1_000_000}),
    );
    let uncertain_payment = if !production {
        let receipt = signal(directory, "creation-stake-payment-unknown", child);
        let intent = receipt["intents"]
            .as_array()
            .unwrap()
            .last()
            .unwrap()
            .clone();
        assert_eq!(intent["kind"], "PayStake");
        assert_eq!(intent["state"], "Unknown");
        let balance: candid::Nat = query(
            pic,
            LEDGER,
            "icrc1_balance_of",
            l::Account {
                owner: GOVERNANCE,
                subaccount: Some(subaccount.clone()),
            },
        );
        assert_eq!(
            balance,
            candid::Nat::from(stake),
            "lost signed payment actually funded the original staking account"
        );
        browser_clock::advance(pic, directory, Duration::from_secs(59 * 86_400));
        publish(
            directory,
            "creation-financial-90-day-clock",
            serde_json::json!({"now_ms":pic.get_time().as_nanos_since_unix_epoch()/1_000_000}),
        );
        Some(intent)
    } else {
        None
    };
    let configured = signal(directory, "creation-configured", child);
    if let Some(original) = uncertain_payment {
        let confirmed = configured["intents"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["id"] == original["id"])
            .unwrap();
        for field in [
            "id",
            "argument",
            "created_at_time",
            "request_binding",
            "reservation_binding",
        ] {
            assert_eq!(confirmed[field], original[field]);
        }
        assert_eq!(confirmed["state"], "Confirmed");
        stake_block = receipt_id(&confirmed["references"], "block_id");
        let history: l::History = query(
            pic,
            LEDGER,
            "query_blocks",
            l::BlocksArgs {
                start: 0,
                length: 100,
            },
        );
        assert!(history.chain_length <= 100);
        let destination = l::account_id(GOVERNANCE, Some(&subaccount));
        assert_eq!(history.blocks.iter().filter(|b| matches!(&b.transaction.operation, Some(l::Operation::Transfer { to, .. }) if *to == destination)).count(), 1, "late recovery and a second authenticated tab did not stake twice");
    }
    let t = receipt_id(&configured, "neuron_id");
    let n = public_neuron(pic, t);
    assert_eq!(n.controller, Some(c));
    assert_eq!(n.account, subaccount);
    assert!(n.hot_keys.is_empty());
    assert!(!n.not_for_profit);
    assert_eq!(n.visibility, Some(2));
    assert_eq!(n.cached_neuron_stake_e8s, stake);
    assert_eq!(
        n.followees
            .iter()
            .find(|(topic, _)| *topic == 1)
            .unwrap()
            .1
            .followees
            .iter()
            .map(|id| id.id)
            .collect::<Vec<_>>(),
        managers
    );
    if production {
        browser_clock::advance(pic, directory, Duration::from_secs(31 * 86_400));
        publish(
            directory,
            "creation-31-day-clock",
            serde_json::json!({"now_ms":pic.get_time().as_nanos_since_unix_epoch()/1_000_000}),
        );
        let resumed = signal(directory, "creation-31-day-resumed", child);
        assert_eq!(resumed["credentials_renewed"], true);
        assert_eq!(public_neuron(pic, t).account, subaccount);
        assert_eq!(pic.get_controllers(c), vec![p]);
    }
    if production {
        let held = signal(directory, "creation-registration-reserved", child);
        assert_eq!(held["canister"], c.to_text());
        catalogue_name_fault(pic, &identities, "Local creation candidate");
        publish(
            directory,
            "creation-registration-name-conflicted",
            serde_json::json!({"classification":"real native Governance adoption after browser preflight; unrelated neuron 16, no target or manager authority change"}),
        );
        let refused = signal(directory, "creation-registration-refused", child);
        let intent = refused["intents"].as_array().unwrap().last().unwrap();
        assert_eq!(intent["state"], "Rejected");
        let revision = refused["plan"]["revision"]
            .as_str()
            .unwrap()
            .parse::<u64>()
            .unwrap();
        let state: Result<RefusalState, String> = update(pic, c, p, "status", revision);
        let state = state.unwrap();
        assert_eq!(state.version, 2);
        assert!(state.external_proposal.is_none());
        let audit = state.proposal_refusals.unwrap();
        assert_eq!(audit.len(), 1);
        assert_eq!(audit[0].error_type, 11);
        assert_eq!(
            audit[0].request_id,
            hex::decode(intent["request_binding"]["request_id"].as_str().unwrap()).unwrap()
        );
        assert_eq!(
            audit[0].reservation.request_digest,
            hex::decode(intent["argument_digest"].as_str().unwrap()).unwrap()
        );
        assert_eq!(
            audit[0].certificate_digest,
            Sha256::digest(
                hex::decode(intent["reply_witness"]["certificate"].as_str().unwrap()).unwrap()
            )
            .to_vec()
        );
        assert_eq!(
            public_neuron(pic, 11).neuron_fees_e8s,
            0,
            "refused creation did not charge a proposal fee"
        );
        let image = pic.get_stable_memory(c);
        std::fs::write(directory.join("creation-refusal-v2-stable.bin"), &image).unwrap();
        let proof =
            std::fs::read(directory.join("creation-registration-refusal-step.bin")).unwrap();
        std::fs::write(directory.join("creation-refusal-provenance.json"),serde_json::to_vec_pretty(&serde_json::json!({
            "classification":"genuine browser-signed Governance refusal accepted by the actual approved bootstrap; public stable state and proof only; this checkpoint alone is not full browser qualification",
            "controller":c.to_text(),"creator":p.to_text(),"neuron":t,"image_sha256":hex::encode(Sha256::digest(&image)),
            "proof_sha256":hex::encode(Sha256::digest(&proof)),"bootstrap_sha256":hex::encode(pic.canister_status(c,Some(p)).unwrap().module_hash.unwrap()),
            "now_ns":pic.get_time().as_nanos_since_unix_epoch(),"error_type":11
        })).unwrap()).unwrap();
        // Explicitly labelled native upgrade fault, after browser-created C and
        // an actual signed Governance refusal. No provisioning/finalisation substitution.
        let module_path = std::env::var_os("DENDRITE_BOOTSTRAP_TEST_WASM")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| root().join("dendrite/target/bootstrap-release/bootstrap.wasm"));
        let module = std::fs::read(module_path).unwrap();
        assert_eq!(
            pic.canister_status(c, Some(p))
                .unwrap()
                .module_hash
                .unwrap(),
            Sha256::digest(&module).to_vec()
        );
        pic.upgrade_canister(c, module, encode_one(()).unwrap(), Some(p))
            .unwrap();
        let after: Result<RefusalState, String> = update(pic, c, p, "status", revision);
        let after = after.unwrap();
        assert_eq!(after.proposal_refusals.unwrap(), audit);
        assert!(after.external_proposal.is_none());
        assert_eq!(pic.get_controllers(c), vec![p]);
        catalogue_name_fault(pic, &identities, "Test 16");
        publish(
            directory,
            "creation-refusal-upgrade-verified",
            serde_json::json!({"audit_retained":true,"classification":"native same-module upgrade of browser-created C; real signed proposal refusal"}),
        );
    }
    if production {
        let held = signal(directory, "creation-rehearsal-fee-held", child);
        assert_eq!(held["canister"], c.to_text());
        management_fee_fault(pic, &identities, 10_100_000_000);
        publish(
            directory,
            "creation-rehearsal-fee-raised",
            serde_json::json!({"classification":"actual native Governance economics proposal, isolated precondition fault"}),
        );
        let refused = signal(directory, "creation-rehearsal-refused", child);
        let intent = refused["intents"].as_array().unwrap().last().unwrap();
        assert_eq!(intent["state"], "Rejected");
        let revision = refused["plan"]["revision"]
            .as_str()
            .unwrap()
            .parse::<u64>()
            .unwrap();
        let state: Result<RefusalState, String> = update(pic, c, p, "status", revision);
        let state = state.unwrap();
        assert!(state.external_proposal.is_none());
        let audits = state.proposal_refusals.unwrap();
        assert_eq!(audits.len(), 2);
        assert_eq!(audits[1].error_type, 14);
        assert_eq!(
            audits[1].request_id,
            hex::decode(intent["request_binding"]["request_id"].as_str().unwrap()).unwrap()
        );
        assert_eq!(
            public_neuron(pic, 11).neuron_fees_e8s,
            0,
            "refusal did not charge a new proposal fee"
        );
        management_fee_fault(pic, &identities, 10_000);
        publish(
            directory,
            "creation-rehearsal-fee-restored",
            serde_json::json!({"fee":10_000,"original_request_retained":true}),
        );
    }
    if production {
        let unknown = signal(directory, "creation-rehearsal-unknown", child);
        let intent = unknown["intents"].as_array().unwrap().last().unwrap();
        assert_eq!(intent["state"], "Unknown");
        let revision = unknown["plan"]["revision"]
            .as_str()
            .unwrap()
            .parse::<u64>()
            .unwrap();
        let state: Result<RefusalState, String> = update(pic, c, p, "status", revision);
        let reservation = state.unwrap().external_proposal.unwrap();
        assert!(reservation.dispatched);
        assert!(reservation.proposal_id.is_none());
        assert_eq!(
            reservation.request_id.unwrap(),
            hex::decode(intent["request_binding"]["request_id"].as_str().unwrap()).unwrap()
        );
        assert_eq!(
            public_neuron(pic, 11).neuron_fees_e8s,
            10_000,
            "exactly one accepted management proposal fee before reconciliation"
        );
        publish(
            directory,
            "creation-rehearsal-unknown-verified",
            serde_json::json!({"unknown_retained":true,"proposal_fee_e8s":10_000}),
        );
    }
    let rehearsal = signal(directory, "creation-rehearsal", child);
    verify_proposal(
        pic,
        p,
        receipt_id(&rehearsal, "proposal"),
        managers.len(),
        1,
    );
    if production {
        verify_proposal(
            pic,
            p,
            receipt_id(&rehearsal, "registration"),
            managers.len(),
            4,
        );
        let registered: Result<RegisteredInfo, g::GovernanceError> =
            update(pic, GOVERNANCE, p, "get_neuron_info", t);
        let metadata = registered.unwrap().known_neuron_data.unwrap();
        assert_eq!(metadata.name, "Local creation candidate");
        assert_eq!(
            metadata.committed_topics,
            Some(vec![Some(RegisteredTopic::Governance)])
        );
    }
    if production {
        // Unsolicited funds are neither T stake nor P workflow funds.
        transfer_external(
            pic,
            l::Account {
                owner: c,
                subaccount: None,
            },
            100_000_000,
        );
    }
    publish(
        directory,
        "creation-rehearsal-verified",
        serde_json::json!({"target":t,"now_ms":pic.get_time().as_nanos_since_unix_epoch()/1_000_000}),
    );
    if !production {
        let _: serde_json::Value = signal(directory, "creation-dissolving", child);
        let n = public_neuron(pic, t);
        let g::DissolveState::WhenDissolvedTimestampSeconds(until) = n.dissolve_state.unwrap()
        else {
            panic!("separate browser consent did not start dissolution")
        };
        assert!(until >= at + 7 * 86_400);
        assert_eq!(pic.get_controllers(c), vec![p]);
        // This browser journey returns unused user-owned workflow ICP while
        // preserving the locked stake and controller. The independent native
        // real-protocol lane covers the actual seven-day disbursement wait.
        let recovered = signal(directory, "creation-recovered", child);
        assert!(
            recovered["receipt"]["creation_witness"].is_null(),
            "the signed recovery-only journey must establish current bindings without historical creation evidence"
        );
        let block = receipt_id(&recovered, "return_block");
        assert!(block > stake_block);
        let history: l::History = query(
            pic,
            LEDGER,
            "query_blocks",
            l::BlocksArgs {
                start: block,
                length: 1,
            },
        );
        assert_eq!(history.blocks.len(), 1);
        assert!(
            matches!(&history.blocks[0].transaction.operation,Some(l::Operation::Transfer{from,to,amount,fee,..}) if *from==l::account_id(p,Some(&bucket)) && *to==l::account_id(p,None) && amount.e8s==500_000_000-receipt_id(&plan["plan"], "funding_budget_e8s")-stake-30_000 && fee.e8s==10_000)
        );
        assert_eq!(public_neuron(pic, t).cached_neuron_stake_e8s, stake);
        assert_eq!(pic.get_controllers(c), vec![p]);
    } else {
        let sealed = signal(directory, "creation-sealed", child);
        assert_eq!(sealed["canister_id"], c.to_text());
        assert!(sealed["sealed_witness"].is_object());
        assert!(
            pic.canister_status(c, Some(p))
                .unwrap()
                .module_hash
                .is_some()
        );
        assert_eq!(pic.get_controllers(c), vec![p]);
        transfer_external(
            pic,
            l::Account {
                owner: c,
                subaccount: None,
            },
            2,
        );
        publish(
            directory,
            "creation-sealed-dust-injected",
            serde_json::json!({}),
        );
        let removed = signal(directory, "creation-code-removed", child);
        assert_eq!(removed["canister_id"], c.to_text());
        assert_eq!(removed["neuron_id"], t.to_string());
        let system = pic.canister_status(c, Some(p)).unwrap();
        assert!(system.module_hash.is_none());
        assert_eq!(pic.get_controllers(c), vec![p]);
        // New dust after uninstall must not veto the second teardown step.
        transfer_external(
            pic,
            l::Account {
                owner: c,
                subaccount: None,
            },
            1,
        );
        browser_clock::advance(pic, directory, Duration::from_secs(59 * 86_400));
        publish(
            directory,
            "creation-code-removal-verified",
            serde_json::json!({"now_ms":pic.get_time().as_nanos_since_unix_epoch()/1_000_000}),
        );
        let resumed = signal(directory, "creation-90-day-resumed", child);
        assert!(resumed["now_ms"].as_u64().is_some());
        assert_eq!(public_neuron(pic, t).account, subaccount);
        assert_eq!(pic.get_controllers(c), vec![p]);
        let held = signal(directory, "creation-controller-removal-held", child);
        assert_eq!(held["canister"], c.to_text());
        assert_eq!(held["neuron"], t.to_string());
        assert!(
            pic.canister_status(c, Some(p))
                .unwrap()
                .module_hash
                .is_none()
        );
        assert_eq!(pic.get_controllers(c), vec![p]);
        // The exact signed request is held inside Chrome after final preflight.
        // No envelope or reusable delegation crosses this coordinator boundary.
        transfer_external(
            pic,
            l::Account {
                owner: c,
                subaccount: None,
            },
            4,
        );
        publish(
            directory,
            "creation-final-dust-injected",
            serde_json::json!({}),
        );
        let finalised = signal(directory, "creation-finalised", child);
        assert_eq!(finalised["canister_id"], c.to_text());
        assert!(pic.get_controllers(c).is_empty());
        let stranded: candid::Nat = query(
            pic,
            LEDGER,
            "icrc1_balance_of",
            l::Account {
                owner: c,
                subaccount: None,
            },
        );
        assert_eq!(
            stranded,
            candid::Nat::from(100_000_007u64),
            "acknowledged funds remain; no sweep or invented refund"
        );
        assert_eq!(public_neuron(pic, t).cached_neuron_stake_e8s, stake);
        let result: Result<dendrite_types::ComplianceReport, candid::Reserved> =
            update(pic, verifier, Principal::anonymous(), "check_neuron", t);
        assert_eq!(
            result.unwrap().overall_status,
            dendrite_types::ComplianceStatus::Compliant
        );
        assert!(
            pic.update_call(c, p, "advance", candid::encode_args(((),)).unwrap())
                .is_err()
        );
        publish(
            directory,
            "creation-finalisation-verified",
            serde_json::json!({}),
        );
        let after = signal(directory, "creation-post-final-management", child);
        verify_proposal(pic, p, receipt_id(&after, "proposal"), managers.len(), 1);
    }
    let mut authority_rows = Vec::new();
    for (index, id) in managers.iter().enumerate() {
        // Read as each actual owner so a public-field projection cannot hide a
        // hotkey. This is a native independent state oracle, not browser signing proof.
        let response: g::ListNeuronsResponse = update(
            pic,
            GOVERNANCE,
            identities[index],
            "list_neurons",
            g::ListNeurons {
                neuron_ids: vec![*id],
                include_neurons_readable_by_caller: false,
                include_empty_neurons_readable_by_caller: Some(false),
                include_public_neurons_in_full_neurons: Some(false),
                page_number: Some(0),
                page_size: Some(1),
                neuron_subaccounts: None,
            },
        );
        g::validate_batch(&[*id], &response).unwrap();
        let manager = &response.full_neurons[0];
        assert_eq!(manager.controller, Some(identities[index]));
        assert!(
            manager.hot_keys.is_empty(),
            "no extra creator hotkey may be added"
        );
        authority_rows.push(serde_json::json!({"manager":id,"controller":identities[index].to_text(),"hotkeys":Vec::<String>::new(),"creator_authority":identities[index]==p}));
    }
    assert_eq!(
        authority_rows
            .iter()
            .filter(|r| r["creator_authority"] == true)
            .count(),
        1
    );
    std::fs::write(directory.join("creation-manager-authority-matrix.json"),serde_json::to_vec_pretty(&serde_json::json!({
        "creator":p.to_text(),"rows":authority_rows,"oracle":"native owner-authorised readback; independent principals originate in real II browser sessions, not substituted signing proof"
    })).unwrap()).unwrap();
    let remaining_cycles = pic.cycle_balance(c);
    assert!(
        remaining_cycles >= u128::from(receipt_id(&installed["plan"], "cycle_reserve")),
        "observed journey exhausted its reviewed finishing reserve"
    );
    let provision_cycles = receipt_id(&installed["plan"], "provision_cycles");
    let pool_cycles = creation::cycles_balance(pic, p, Some(bucket.clone()));
    let ledger_balance: candid::Nat = query(
        pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: p,
            subaccount: Some(bucket),
        },
    );
    fs::write(directory.join("creation-resources.json"),serde_json::to_vec_pretty(&serde_json::json!({
        "classification":"independent synthetic-local protocol observations; execution/storage costs are not universal promises",
        "profile":if production {"ProductionCandidate"}else{"RecoverableTest"},"controller":c.to_text(),"neuron":t,
        "authorised_creation_cycles":provision_cycles.to_string(),"cycles_after_install":installed_cycles.to_string(),
        "cycles_after_journey":remaining_cycles.to_string(),"observed_execution_and_storage_cycles":installed_cycles.saturating_sub(remaining_cycles).to_string(),
        "reviewed_reserve":installed["plan"]["cycle_reserve"],"remaining_P_cycles_ledger_balance":pool_cycles.to_string(),
        "remaining_P_workflow_ICP_e8s":ledger_balance.to_string(),"stake_e8s":stake.to_string(),
        "external_workflow_funding_block":funding_block,"external_stake_funding_block":production.then_some(stake_block),
        "browser_stake_funding_block":(!production).then_some(stake_block),
        "stake_funding_route":if production {"external-wallet fixture"} else {"real scoped browser transfer; reply lost; permanent-block reconciliation after 90-day pause"},
        "refund_scope":if production {"unused P-owned ICP/cycles remain; locked stake stays in T"}else{"unused workflow ICP returned; locked stake still waits actual seven-day recovery"}
    })).unwrap()).unwrap();
    publish(
        directory,
        "creation-browser-verified",
        serde_json::json!({"profile":scenario,"target":t,"controller":c.to_text(),"no_coordinator_creation_claim_configuration_or_finalisation":true}),
    );
}
