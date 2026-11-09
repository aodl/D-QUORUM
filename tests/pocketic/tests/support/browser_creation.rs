use crate::*;

#[derive(CandidType, Deserialize)]
struct CreationProposal {
    status: i32,
    topic: i32,
    executed_timestamp_seconds: u64,
    ballots: Vec<(u64, CreationBallot)>,
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
        assert_eq!(result.ballots.len(), count);
        assert!(result.ballots.iter().all(|(_, b)| b.voting_power == 1));
        assert!(result.ballots.iter().filter(|(_, b)| b.vote == 1).count() > count / 2);
    }
}

pub fn coordinate(
    pic: &pocket_ic::PocketIc,
    verifier: Principal,
    directory: &Path,
    scenario: &str,
    child: &mut Child,
) {
    let production = scenario == "creation-production";
    let principal = signal(directory, "creation-principal", child);
    let p = Principal::from_text(principal["principal"].as_str().unwrap()).unwrap();
    let at = now(pic);
    let managers: Vec<u64> = if production {
        (11..=15).collect()
    } else {
        vec![11]
    };
    let mut neurons = vec![];
    for id in &managers {
        let mut manager = seed(*id, p, at);
        manager.known_neuron_data = Some(known(*id));
        manager.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
        neurons.push(manager);
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
    publish(
        directory,
        "creation-funding-ready",
        serde_json::json!({"block":funding_block}),
    );
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
    let stake_block = transfer_external(
        pic,
        l::Account {
            owner: GOVERNANCE,
            subaccount: Some(subaccount.clone()),
        },
        stake,
    );
    publish(
        directory,
        "creation-stake-funded",
        serde_json::json!({"block":stake_block}),
    );
    let configured = signal(directory, "creation-configured", child);
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
    publish(
        directory,
        "creation-rehearsal-verified",
        serde_json::json!({"target":t}),
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
            matches!(&history.blocks[0].transaction.operation,Some(l::Operation::Transfer{from,to,amount,fee,..}) if *from==l::account_id(p,Some(&bucket)) && *to==l::account_id(p,None) && amount.e8s==399_990_000 && fee.e8s==10_000)
        );
        assert_eq!(public_neuron(pic, t).cached_neuron_stake_e8s, stake);
        assert_eq!(pic.get_controllers(c), vec![p]);
    } else {
        let removed = signal(directory, "creation-code-removed", child);
        assert_eq!(removed["canister_id"], c.to_text());
        assert_eq!(removed["neuron_id"], t.to_string());
        let system = pic.canister_status(c, Some(p)).unwrap();
        assert!(system.module_hash.is_none());
        assert_eq!(pic.get_controllers(c), vec![p]);
        publish(
            directory,
            "creation-code-removal-verified",
            serde_json::json!({}),
        );
        let finalised = signal(directory, "creation-finalised", child);
        assert_eq!(finalised["canister_id"], c.to_text());
        assert!(pic.get_controllers(c).is_empty());
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
        "external_workflow_funding_block":funding_block,"external_stake_funding_block":stake_block,
        "refund_scope":if production {"unused P-owned ICP/cycles remain; locked stake stays in T"}else{"unused workflow ICP returned; locked stake still waits actual seven-day recovery"}
    })).unwrap()).unwrap();
    publish(
        directory,
        "creation-browser-verified",
        serde_json::json!({"profile":scenario,"target":t,"controller":c.to_text(),"no_coordinator_creation_claim_configuration_or_finalisation":true}),
    );
}
