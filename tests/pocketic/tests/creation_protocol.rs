#[allow(dead_code)]
#[path = "../../../dendrite/canisters/bootstrap/src/model.rs"]
mod bootstrap_model;
#[path = "support/creation.rs"]
mod creation;
#[path = "support/creation_automation.rs"]
mod creation_automation;
mod support;
use candid::{CandidType, Deserialize, Nat, encode_one};
use creation::*;
use quorum_ic_clients::{LEDGER, ledger as l};
use support::*;

#[derive(CandidType)]
struct Advance {
    revision: u64,
    step: bootstrap_model::Step,
}
// Permission probes use the actual Governance decoder, separate from the
// automation client's deliberately narrower public command subset.
#[derive(CandidType)]
struct SetupRequest {
    neuron_id_or_subaccount: Option<quorum_ic_clients::governance::Id>,
    command: Option<SetupCommand>,
}
#[derive(CandidType)]
enum SetupCommand {
    Configure(SetupConfiguration),
}
#[derive(CandidType)]
struct SetupConfiguration {
    operation: Option<SetupOperation>,
}
#[derive(CandidType)]
enum SetupOperation {
    IncreaseDissolveDelay {
        additional_dissolve_delay_seconds: u32,
    },
    SetVisibility {
        visibility: Option<i32>,
    },
    StartDissolving(quorum_ic_clients::governance::Empty),
}
#[derive(CandidType)]
struct SetupProposal {
    title: Option<String>,
    summary: String,
    url: String,
    action: Option<SetupAction>,
}
#[derive(CandidType)]
enum SetupAction {
    ManageNeuron(SetupRequest),
}
#[derive(CandidType)]
enum SetupProposalCommand {
    MakeProposal(SetupProposal),
}
#[derive(CandidType)]
struct SetupProposalRequest {
    neuron_id_or_subaccount: Option<quorum_ic_clients::governance::Id>,
    command: Option<SetupProposalCommand>,
}
fn setup_request(id: u64, operation: SetupOperation) -> SetupRequest {
    SetupRequest {
        neuron_id_or_subaccount: Some(quorum_ic_clients::governance::Id::NeuronId(
            quorum_ic_clients::governance::NeuronId { id },
        )),
        command: Some(SetupCommand::Configure(SetupConfiguration {
            operation: Some(operation),
        })),
    }
}
fn advance(
    pic: &pocket_ic::PocketIc,
    c: candid::Principal,
    owner: candid::Principal,
    step: bootstrap_model::Step,
) -> Result<bootstrap_model::State, String> {
    update(pic, c, owner, "advance", Advance { revision: 1, step })
}

fn checkpoint_fault(
    pic: &pocket_ic::PocketIc,
    c: candid::Principal,
    owner: candid::Principal,
    step: bootstrap_model::Step,
    bytes: &[u8],
) -> bootstrap_model::State {
    let call = pic
        .submit_call(
            c,
            owner,
            "advance",
            encode_one(Advance { revision: 1, step }).unwrap(),
        )
        .unwrap();
    let mut checkpoint = None;
    for _ in 0..200 {
        pic.tick();
        let image = pic.get_stable_memory(c);
        let mut decoder = candid::de::IDLDeserialize::new(&image).unwrap();
        let (state,): (bootstrap_model::State,) =
            candid::utils::ArgumentDecoder::decode(&mut decoder).unwrap();
        if state.pending.as_ref().is_some_and(|p| p.effect.is_some()) {
            checkpoint = Some((image, state));
            break;
        }
        assert!(
            pic.ingress_status(call.clone()).is_none(),
            "missed the required actual pre-await checkpoint; this fault gate did not execute"
        );
    }
    let (image, original) =
        checkpoint.expect("actual dispatched bootstrap effect checkpoint required");
    // Reuse the existing financial-hardening fixture pattern: stop drains the
    // real successful callback, then restore its observed pre-await image to
    // model a lost callback. Governance/Ledger effects are never rolled back.
    pic.stop_canister(c, Some(owner)).unwrap();
    let completed: Result<bootstrap_model::State, String> =
        candid::decode_one(&pic.await_call(call).unwrap()).unwrap();
    let completed = completed.unwrap();
    pic.set_stable_memory(
        c,
        image,
        pocket_ic::common::rest::BlobCompression::NoCompression,
    );
    pic.upgrade_canister(
        c,
        bytes.to_vec(),
        candid::encode_args(()).unwrap(),
        Some(owner),
    )
    .unwrap();
    pic.start_canister(c, Some(owner)).unwrap();
    let restored: Result<bootstrap_model::State, String> = update(pic, c, owner, "status", 1u64);
    assert_eq!(
        restored.unwrap(),
        original,
        "same-code upgrade must retain the exact observed outstanding intent and binding"
    );
    println!(
        "restored actual pre-await checkpoint C={c}, sequence={}, effect={:?}; remote effect retained",
        original.sequence,
        original.pending.as_ref().unwrap().effect
    );
    completed
}
fn transfer(
    pic: &pocket_ic::PocketIc,
    owner: candid::Principal,
    to: l::Account,
    amount: u64,
    memo: Option<Vec<u8>>,
) -> u64 {
    let fee: Nat = query_empty(pic, LEDGER, "icrc1_fee");
    let result: Result<Nat, l::TransferError> = update(
        pic,
        LEDGER,
        owner,
        "icrc1_transfer",
        l::TransferArg {
            from_subaccount: None,
            to,
            fee: Some(fee),
            created_at_time: Some(pic.get_time().as_nanos_since_unix_epoch()),
            memo,
            amount: amount.into(),
        },
    );
    l::nat(result.unwrap()).unwrap()
}
fn create_through_cycles_ledger(
    pic: &pocket_ic::PocketIc,
    owner: candid::Principal,
) -> candid::Principal {
    let block = transfer(
        pic,
        owner,
        l::Account {
            owner: cmc(),
            subaccount: Some(principal_subaccount(owner)),
        },
        200_000_000,
        Some(0x544e494du64.to_le_bytes().to_vec()),
    );
    let minted: Result<MintSuccess, NotifyError> = update(
        pic,
        cmc(),
        owner,
        "notify_mint_cycles",
        NotifyMint {
            block_index: block,
            to_subaccount: None,
            deposit_memo: None,
        },
    );
    minted.unwrap();
    let result: Result<Created, CreateError> = update(
        pic,
        cycles_ledger(),
        owner,
        "create_canister",
        creation_args(pic, owner, None),
    );
    result.unwrap().canister_id
}
#[derive(CandidType, Deserialize)]
struct ProposalOracle {
    status: i32,
    topic: i32,
    executed_timestamp_seconds: u64,
    deadline_timestamp_seconds: Option<u64>,
    ballots: Vec<(u64, BallotOracle)>,
}
#[derive(CandidType, Deserialize)]
struct BallotOracle {
    vote: i32,
    voting_power: u64,
}

#[derive(CandidType, Deserialize, Debug)]
struct ControllerOracle {
    neuron_id: u64,
    controller: candid::Principal,
    total_num_changes: u64,
    module_hash: Option<Vec<u8>>,
    controllers: Vec<candid::Principal>,
}
fn controller_oracle(
    pic: &pocket_ic::PocketIc,
    service: candid::Principal,
    t: u64,
) -> ControllerOracle {
    let result: Result<ControllerOracle, candid::Reserved> = update(
        pic,
        service,
        candid::Principal::anonymous(),
        "controller_observation",
        t,
    );
    let result = result.unwrap();
    assert_eq!(result.neuron_id, t);
    assert_eq!(result.controller.as_slice().last(), Some(&1));
    assert!(result.controllers.len() <= 10);
    assert!(
        result
            .module_hash
            .as_ref()
            .is_none_or(|hash| hash.len() == 32)
    );
    result
}

fn bootstrap_bytes() -> Vec<u8> {
    std::fs::read(
        std::env::var("DENDRITE_BOOTSTRAP_TEST_WASM")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| {
                root()
                    .join("dendrite/target/wasm32-unknown-unknown/release/dendrite_bootstrap.wasm")
            }),
    )
    .expect("build the bound bootstrap before creation gates")
}
#[derive(CandidType)]
struct RegistrationMetadata {
    name: String,
    description: Option<String>,
    links: Option<Vec<String>>,
    committed_topics: Option<Vec<Option<RegistrationTopic>>>,
}
#[derive(CandidType)]
enum RegistrationTopic {
    Governance,
}
#[derive(CandidType)]
struct Registration {
    id: Option<quorum_ic_clients::governance::NeuronId>,
    known_neuron_data: Option<RegistrationMetadata>,
}
#[derive(CandidType)]
enum RegistrationAction {
    RegisterKnownNeuron(Registration),
}
#[derive(CandidType)]
struct RegistrationProposal {
    title: Option<String>,
    summary: String,
    url: String,
    action: Option<RegistrationAction>,
}
#[derive(CandidType)]
enum RegistrationCommand {
    MakeProposal(RegistrationProposal),
}
#[derive(CandidType)]
struct RegistrationRequest {
    neuron_id_or_subaccount: Option<quorum_ic_clients::governance::Id>,
    command: Option<RegistrationCommand>,
}
fn vote_yes(pic: &pocket_ic::PocketIc, owner: candid::Principal, manager: u64, proposal: u64) {
    cast_vote(pic, owner, manager, proposal, 1);
}
fn cast_vote(
    pic: &pocket_ic::PocketIc,
    owner: candid::Principal,
    manager: u64,
    proposal: u64,
    vote: i32,
) {
    use quorum_ic_clients::{GOVERNANCE, governance as g};
    let r: g::ManageResponse = update(
        pic,
        GOVERNANCE,
        owner,
        "manage_neuron",
        VoteRequest {
            neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: manager })),
            command: Some(VoteCommand::RegisterVote(Vote {
                vote,
                proposal: Some(g::NeuronId { id: proposal }),
            })),
        },
    );
    assert!(matches!(
        r.command,
        Some(g::ResponseCommand::RegisterVote(_))
    ));
}
fn propose_refresh(
    pic: &pocket_ic::PocketIc,
    owner: candid::Principal,
    manager: u64,
    target: u64,
) -> u64 {
    use quorum_ic_clients::{GOVERNANCE, governance as g};
    let r: g::ManageResponse = update(
        pic,
        GOVERNANCE,
        owner,
        "manage_neuron",
        g::request(
            manager,
            g::Command::MakeProposal(Box::new(g::MakeProposal {
                title: Some("Refresh the exact new neuron".into()),
                summary: "Benign management rehearsal; controller authority is reported separately"
                    .into(),
                url: String::new(),
                action: Some(g::ActionRequest::ManageNeuron(Box::new(g::request(
                    target,
                    g::Command::RefreshVotingPower(g::Empty {}),
                )))),
            })),
        ),
    );
    match r.command {
        Some(g::ResponseCommand::MakeProposal(p)) => p.proposal_id.unwrap().id,
        other => panic!("management proposal failed {other:?}"),
    }
}

#[test]
#[ignore = "creation_protocol real registration-first production candidate and teardown"]
fn real_production_creation_registration_rehearsal_teardown_and_post_final_management() {
    production_creation(CreationCase::Production);
}

#[test]
#[ignore = "creation_protocol new real creation, unchanged direct-only selection and actual reward transfer"]
fn newly_created_dendrite_enters_direct_only_election_and_receives_reward() {
    production_creation(CreationCase::Automation);
}

#[test]
#[ignore = "creation_protocol irreversible-order negative control on a separate synthetic creation"]
fn real_premature_controller_removal_retains_executable_neuron_authority_and_fails_evaluation() {
    production_creation(CreationCase::PrematureRemoval);
}

enum CreationCase {
    Production,
    Automation,
    PrematureRemoval,
}

fn production_creation(case: CreationCase) {
    let with_automation = matches!(case, CreationCase::Automation);
    use bootstrap_model::{Following, Metadata, Network, Phase, Plan, Profile, Step};
    use quorum_ic_clients::{GOVERNANCE, governance as g};
    use sha2::{Digest, Sha256};
    let pic = real_pic();
    let owner = user(41);
    let at = now(&pic);
    let mut neurons = vec![];
    for id in 11..=15 {
        let mut n = seed(id, owner, at);
        n.known_neuron_data = Some(known(id));
        n.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
        neurons.push(n);
    }
    for id in [
        dendrite_types::ALPHA_VOTE_NEURON_ID,
        dendrite_types::OMEGA_REJECT_NEURON_ID,
    ] {
        let mut n = seed(id, user(42), at);
        n.known_neuron_data = Some(known(id));
        neurons.push(n);
    }
    let automation = with_automation.then(|| creation_automation::Fixture::new(&pic, &mut neurons));
    let balances = vec![(
        l::Account {
            owner,
            subaccount: None,
        },
        1_000_000_000,
    )];
    install_real(
        &pic,
        neurons,
        balances,
        artifact("governance-canister"),
        artifact("ledger-canister"),
    );
    install_provisioning(&pic);
    let service = pic.create_canister();
    pic.add_cycles(service, 50_000_000_000_000);
    pic.install_canister(
        service,
        dendrite_wasm(),
        candid::encode_args(()).unwrap(),
        None,
    );
    let c = create_through_cycles_ledger(&pic, owner);
    let bytes = bootstrap_bytes();
    let plan = Plan {
        version: 1,
        profile: Profile::ProductionCandidate,
        owner,
        network: Network::Local,
        dendrite_service: candid::Principal::from_text("pi33i-pt777-77776-aaaaa-cai").unwrap(),
        origin: "http://pi33i-pt777-77776-aaaaa-cai.localhost:4943".into(),
        api_host: "http://127.0.0.1:4943".into(),
        funding_budget_e8s: 200_010_000,
        icp_fee_e8s: 10_000,
        provision_cycles: 2_000_000_000_000,
        policy_version: dendrite_types::STANDARD_VERSION.into(),
        creation_id: vec![42; 32],
        nonce: 9042,
        revision: 1,
        policy_revision: dendrite_types::SOURCE_REVISION.into(),
        bootstrap_sha256: Sha256::digest(&bytes).to_vec(),
        managers: vec![11, 12, 13, 14, 15],
        committed_topics: vec![4],
        following: dendrite_types::RECOGNISED_TOPICS
            .into_iter()
            .map(|topic| Following {
                topic,
                followees: match topic {
                    1 => vec![11, 12, 13, 14, 15],
                    4 => vec![11, 12, 13],
                    _ => vec![dendrite_types::ALPHA_VOTE_NEURON_ID],
                },
            })
            .collect(),
        stake_e8s: 200_000_000,
        lock_seconds: dendrite_types::MAX_DISSOLVE_DELAY_SECONDS,
        cycle_reserve: bootstrap_model::MIN_RESERVE,
        return_account: l::account_id(owner, None),
        metadata: Some(Metadata {
            name: "New provisional production candidate".into(),
            description: "Creator retains bootstrap control until explicit finalisation".into(),
            links: vec![],
        }),
    };
    pic.install_canister(
        c,
        bytes.clone(),
        encode_one(plan.clone()).unwrap(),
        Some(owner),
    );
    assert_eq!(
        pic.canister_status(c, Some(owner)).unwrap().module_hash,
        Some(Sha256::digest(&bytes).to_vec())
    );
    let sub = l::staking_subaccount(c, plan.nonce);
    transfer(
        &pic,
        owner,
        l::Account {
            owner: GOVERNANCE,
            subaccount: Some(sub.clone()),
        },
        plan.stake_e8s,
        None,
    );
    let mut state = advance(&pic, c, owner, Step::Claim).unwrap();
    let t = state.neuron_id.unwrap();
    assert!(!plan.managers.contains(&t));
    for _ in 0..24 {
        if state.phase != Phase::Configuring {
            break;
        }
        state = advance(&pic, c, owner, Step::Configure).unwrap();
    }
    assert_eq!(state.phase, Phase::AwaitingLock);
    if matches!(case, CreationCase::Production) {
        let committed = checkpoint_fault(&pic, c, owner, Step::CommitLock, &bytes);
        state = advance(&pic, c, owner, Step::CommitLock).unwrap();
        assert_eq!(
            state.phase, committed.phase,
            "restored additive-lock intent must read back the existing effect rather than add it again"
        );
        assert_eq!(state.neuron_id, committed.neuron_id);
    } else {
        state = advance(&pic, c, owner, Step::CommitLock).unwrap();
    }
    assert_eq!(state.phase, Phase::AwaitingRegistration);
    advance(&pic, c, owner, Step::Refresh).unwrap();
    assert!(advance(&pic, c, owner, Step::BeginRehearsal).is_err());
    let metadata = plan.metadata.as_ref().unwrap();
    let registration_request = |name: String| RegistrationRequest {
        neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: 11 })),
        command: Some(RegistrationCommand::MakeProposal(RegistrationProposal {
            title: Some("Register a still-provisional neuron".into()),
            summary: format!(
                "T={t}, controller C={c}; P retains recoverable authority. Registration is not a claim of immutability or current full compliance."
            ),
            url: String::new(),
            action: Some(RegistrationAction::RegisterKnownNeuron(Registration {
                id: Some(g::NeuronId { id: t }),
                known_neuron_data: Some(RegistrationMetadata {
                    name,
                    description: Some(metadata.description.clone()),
                    links: Some(vec![]),
                    committed_topics: Some(vec![Some(RegistrationTopic::Governance)]),
                }),
            })),
        })),
    };
    if matches!(case, CreationCase::Production) {
        let collision: g::ManageResponse = update(
            &pic,
            GOVERNANCE,
            owner,
            "manage_neuron",
            registration_request(known(11).name),
        );
        assert!(
            matches!(collision.command, Some(g::ResponseCommand::Error(_))),
            "real Governance must reject an already registered name before submission"
        );
        for expired in [false, true] {
            let response: g::ManageResponse = update(
                &pic,
                GOVERNANCE,
                owner,
                "manage_neuron",
                registration_request(metadata.name.clone()),
            );
            let id = match response.command {
                Some(g::ResponseCommand::MakeProposal(p)) => p.proposal_id.unwrap().id,
                other => panic!("registration fault fixture did not submit: {other:?}"),
            };
            if expired {
                cast_vote(&pic, owner, 12, id, 2);
                let open: Option<ProposalOracle> =
                    update(&pic, GOVERNANCE, owner, "get_proposal_info", id);
                let open = open.unwrap();
                assert_eq!(open.status, 1);
                let deadline = open
                    .deadline_timestamp_seconds
                    .expect("actual Governance deadline required");
                pic.advance_time(std::time::Duration::from_secs(
                    deadline.saturating_sub(now(&pic)) + 1,
                ));
                for _ in 0..20 {
                    pic.tick();
                }
            } else {
                for manager in [12, 13, 14, 15] {
                    cast_vote(&pic, owner, manager, id, 2);
                }
            }
            let rejected: Option<ProposalOracle> =
                update(&pic, GOVERNANCE, owner, "get_proposal_info", id);
            let rejected = rejected.unwrap();
            assert_eq!(rejected.status, 2);
            assert_eq!(rejected.executed_timestamp_seconds, 0);
            let info: Result<g::NeuronInfo, g::GovernanceError> =
                update(&pic, GOVERNANCE, owner, "get_neuron_info", t);
            assert!(info.unwrap().known_neuron_data.is_none());
            assert!(advance(&pic, c, owner, Step::BeginRehearsal).is_err());
        }
        println!(
            "real registration name collision, explicit rejection and actual-deadline expiry remain unregistered and block progression"
        );
    }
    let registration: g::ManageResponse = update(
        &pic,
        GOVERNANCE,
        owner,
        "manage_neuron",
        registration_request(metadata.name.clone()),
    );
    let registration = match registration.command {
        Some(g::ResponseCommand::MakeProposal(p)) => p.proposal_id.unwrap().id,
        other => panic!("registration proposal refused: {other:?}"),
    };
    let before: Option<ProposalOracle> =
        update(&pic, GOVERNANCE, owner, "get_proposal_info", registration);
    assert_eq!(before.unwrap().status, 1);
    for id in [12, 13, 14] {
        vote_yes(&pic, owner, id, registration);
    }
    if with_automation {
        vote_yes(&pic, owner, 15, registration);
    }
    let executed: Option<ProposalOracle> =
        update(&pic, GOVERNANCE, owner, "get_proposal_info", registration);
    let executed = executed.unwrap();
    assert_eq!(executed.status, 4);
    assert_eq!(executed.topic, 4);
    assert!(executed.executed_timestamp_seconds > 0);
    let info: Result<g::NeuronInfo, g::GovernanceError> =
        update(&pic, GOVERNANCE, owner, "get_neuron_info", t);
    assert_eq!(info.unwrap().known_neuron_data.unwrap().name, metadata.name);
    advance(&pic, c, owner, Step::BeginRehearsal).unwrap();
    let rehearsal = propose_refresh(&pic, owner, 11, t);
    for id in [12, 13] {
        vote_yes(&pic, owner, id, rehearsal);
    }
    let oracle: Option<ProposalOracle> =
        update(&pic, GOVERNANCE, owner, "get_proposal_info", rehearsal);
    let oracle = oracle.unwrap();
    assert_eq!(oracle.status, 4);
    let electorate: std::collections::BTreeSet<_> =
        oracle.ballots.iter().map(|(id, _)| *id).collect();
    assert_eq!(electorate, plan.managers.iter().copied().collect());
    assert_eq!(
        oracle.ballots.iter().filter(|(_, b)| b.vote == 1).count(),
        3
    );
    let filtered: Option<ProposalOracle> =
        update(&pic, GOVERNANCE, c, "get_proposal_info", rehearsal);
    assert!(
        filtered.unwrap().ballots.is_empty(),
        "C cannot independently see manager identities; browser electorate proof remains necessary"
    );
    let before: Result<dendrite_types::ComplianceReport, candid::Reserved> = update(
        &pic,
        service,
        candid::Principal::anonymous(),
        "check_neuron",
        t,
    );
    let before = before.unwrap();
    let failures: std::collections::BTreeSet<_> = before
        .rules
        .iter()
        .filter(|r| r.status != dendrite_types::RuleStatus::Pass)
        .map(|r| r.rule_id.as_str())
        .collect();
    assert_eq!(
        failures,
        ["DENDRITE-CONTROL-002", "DENDRITE-CONTROL-003"]
            .into_iter()
            .collect()
    );
    if let Some(a) = &automation {
        a.provisional(&pic, owner, t);
    }
    if matches!(case, CreationCase::PrematureRemoval) {
        // Deliberately wrong order in this isolated negative world only. The
        // normal production/browser path must uninstall before this call.
        pic.set_controllers(c, Some(owner), vec![]).unwrap();
        let observation = controller_oracle(&pic, service, t);
        assert!(observation.controllers.is_empty());
        assert!(observation.module_hash.is_some());
        let report: Result<dendrite_types::ComplianceReport, candid::Reserved> = update(
            &pic,
            service,
            candid::Principal::anonymous(),
            "check_neuron",
            t,
        );
        let report = report.unwrap();
        assert_eq!(
            report.overall_status,
            dendrite_types::ComplianceStatus::NonCompliant
        );
        assert!(
            report
                .rules
                .iter()
                .any(|r| r.rule_id == "DENDRITE-CONTROL-002"
                    && r.status == dendrite_types::RuleStatus::Fail)
        );
        assert!(pic.uninstall_canister(c, Some(owner)).is_err());
        assert_eq!(
            advance(&pic, c, owner, Step::Refresh).unwrap().neuron_id,
            Some(t),
            "removing canister controllers alone retains P's installed application authority over T"
        );
        println!(
            "negative control: empty controllers with installed code remains NonCompliant and executable; ordinary P uninstall is denied"
        );
        return;
    }
    let sealed = advance(&pic, c, owner, Step::Seal(rehearsal)).unwrap();
    assert_eq!(sealed.phase, Phase::Sealed);
    let sealed_changes = controller_oracle(&pic, service, t).total_num_changes;
    assert_eq!(sealed.sealed_controller_changes, Some(sealed_changes));
    assert!(
        advance(&pic, c, owner, Step::Unseal).is_err(),
        "an application call alone cannot invalidate a stopped seal/version proof"
    );
    assert!(advance(&pic, c, owner, Step::Configure).is_err());
    // A stale receipt must not survive another tab's legitimate unseal. The
    // application's Unseal alone was refused above; a real controller upgrade
    // advances the independently observable management version first.
    pic.upgrade_canister(
        c,
        bytes.clone(),
        candid::encode_args(()).unwrap(),
        Some(owner),
    )
    .unwrap();
    let upgraded_changes = controller_oracle(&pic, service, t).total_num_changes;
    assert!(upgraded_changes > sealed_changes);
    let restored: Result<bootstrap_model::State, String> = update(&pic, c, owner, "status", 1u64);
    assert_eq!(
        restored.unwrap().sealed_controller_changes,
        Some(sealed_changes)
    );
    assert_eq!(
        advance(&pic, c, owner, Step::Unseal).unwrap().phase,
        Phase::AwaitingRegistration
    );
    advance(&pic, c, owner, Step::BeginRehearsal).unwrap();
    let new_rehearsal = propose_refresh(&pic, owner, 11, t);
    for id in [12, 13] {
        vote_yes(&pic, owner, id, new_rehearsal);
    }
    let resealed = advance(&pic, c, owner, Step::Seal(new_rehearsal)).unwrap();
    assert_eq!(resealed.sealed_controller_changes, Some(upgraded_changes));
    let sealed_changes = upgraded_changes;
    pic.stop_canister(c, Some(owner)).unwrap();
    assert_eq!(
        controller_oracle(&pic, service, t).total_num_changes,
        sealed_changes,
        "stop must preserve the bound controller history"
    );
    pic.uninstall_canister(c, Some(owner)).unwrap();
    let empty = pic.canister_status(c, Some(owner)).unwrap();
    assert_eq!(
        controller_oracle(&pic, service, t).total_num_changes,
        sealed_changes + 1,
        "uninstall must advance controller history once"
    );
    assert!(empty.module_hash.is_none());
    assert_eq!(pic.get_controllers(c), vec![owner]);
    // The gap is deliberate: only independent external reads survive uninstall.
    let target: g::ListNeuronsResponse = update(
        &pic,
        GOVERNANCE,
        owner,
        "list_neurons",
        g::ListNeurons {
            neuron_ids: vec![t],
            include_neurons_readable_by_caller: false,
            include_empty_neurons_readable_by_caller: Some(false),
            include_public_neurons_in_full_neurons: Some(true),
            page_number: Some(0),
            page_size: Some(1),
            neuron_subaccounts: None,
        },
    );
    assert_eq!(target.full_neurons[0].controller, Some(c));
    assert_eq!(target.full_neurons[0].account, sub);
    assert!(target.full_neurons[0].hot_keys.is_empty());
    pic.set_controllers(c, Some(owner), vec![]).unwrap();
    assert!(pic.get_controllers(c).is_empty());
    assert!(
        pic.reinstall_canister(c, bytes, encode_one(plan.clone()).unwrap(), Some(owner))
            .is_err()
    );
    let report: Result<dendrite_types::ComplianceReport, candid::Reserved> = update(
        &pic,
        service,
        candid::Principal::anonymous(),
        "check_neuron",
        t,
    );
    let report = report.unwrap();
    assert_eq!(
        report.overall_status,
        dendrite_types::ComplianceStatus::Compliant
    );
    let later = propose_refresh(&pic, owner, 12, t);
    for id in [13, 14] {
        vote_yes(&pic, owner, id, later);
    }
    let final_proposal: Option<ProposalOracle> =
        update(&pic, GOVERNANCE, owner, "get_proposal_info", later);
    assert_eq!(final_proposal.unwrap().status, 4);
    let denied: g::ManageResponse = update(
        &pic,
        GOVERNANCE,
        owner,
        "manage_neuron",
        g::request(t, g::Command::RefreshVotingPower(g::Empty {})),
    );
    assert!(matches!(denied.command, Some(g::ResponseCommand::Error(_))));
    assert!(
        pic.update_call(
            c,
            owner,
            "advance",
            encode_one(Advance {
                revision: 1,
                step: Step::Refresh
            })
            .unwrap()
        )
        .is_err()
    );
    if let Some(a) = &automation {
        a.finalised(&pic, t, c, plan.nonce);
    }
    println!(
        "actual registered production creation T={t}, C={c}, full planned electorate and quorum, only two bootstrap failures, code-first teardown, full compliance and post-final manager execution verified"
    );
}

#[test]
#[ignore = "creation_protocol real bootstrap, Governance and Ledger qualification"]
fn real_bootstrap_claim_configuration_upgrade_manager_rehearsal_and_short_lock_return() {
    use bootstrap_model::{Following, Network, Phase, Plan, Profile, Step};
    use quorum_ic_clients::{GOVERNANCE, governance as g};
    use sha2::{Digest, Sha256};
    let pic = real_pic();
    let owner = user(41);
    let at = now(&pic);
    let mut manager = seed(11, owner, at);
    manager.known_neuron_data = Some(known(11));
    let mut permission_probe = seed(99, user(97), at);
    permission_probe.hot_keys = vec![owner];
    install_real(
        &pic,
        vec![manager, permission_probe],
        vec![(
            l::Account {
                owner,
                subaccount: None,
            },
            1_000_000_000,
        )],
        artifact("governance-canister"),
        artifact("ledger-canister"),
    );
    install_provisioning(&pic);
    for operation in [
        SetupOperation::SetVisibility {
            visibility: Some(2),
        },
        SetupOperation::IncreaseDissolveDelay {
            additional_dissolve_delay_seconds: 1,
        },
    ] {
        let denied: g::ManageResponse = update(
            &pic,
            GOVERNANCE,
            owner,
            "manage_neuron",
            setup_request(99, operation),
        );
        assert!(
            matches!(denied.command, Some(g::ResponseCommand::Error(_))),
            "a real hotkey must not replace controller authority for creation setup"
        );
    }
    let c = create_through_cycles_ledger(&pic, owner);
    let bytes = std::fs::read(
        root().join("dendrite/target/wasm32-unknown-unknown/release/dendrite_bootstrap.wasm"),
    )
    .expect("build bootstrap before this real-protocol gate");
    let plan = Plan {
        version: 1,
        profile: Profile::RecoverableTest,
        owner,
        network: Network::Local,
        dendrite_service: candid::Principal::from_text("pi33i-pt777-77776-aaaaa-cai").unwrap(),
        origin: "http://pi33i-pt777-77776-aaaaa-cai.localhost:4943".into(),
        api_host: "http://127.0.0.1:4943".into(),
        funding_budget_e8s: 200_010_000,
        icp_fee_e8s: 10_000,
        provision_cycles: 2_000_000_000_000,
        policy_version: dendrite_types::STANDARD_VERSION.into(),
        creation_id: vec![41; 32],
        nonce: 9041,
        revision: 1,
        policy_revision: dendrite_types::SOURCE_REVISION.into(),
        bootstrap_sha256: Sha256::digest(&bytes).to_vec(),
        managers: vec![11],
        committed_topics: vec![],
        following: vec![Following {
            topic: 1,
            followees: vec![11],
        }],
        stake_e8s: 200_000_000,
        lock_seconds: bootstrap_model::INITIAL_CLAIM_LOCK_SECONDS,
        cycle_reserve: bootstrap_model::MIN_RESERVE,
        return_account: l::account_id(owner, None),
        metadata: None,
    };
    pic.install_canister(
        c,
        bytes.clone(),
        encode_one(plan.clone()).unwrap(),
        Some(owner),
    );
    let observed = pic.canister_status(c, Some(owner)).unwrap();
    assert_eq!(observed.module_hash, Some(Sha256::digest(&bytes).to_vec()));
    assert_eq!(pic.get_controllers(c), vec![owner]);
    let initial: Result<bootstrap_model::State, String> = update(&pic, c, owner, "status", 1u64);
    let initial = initial.unwrap();
    assert_eq!(initial.plan_digest, plan.digest());
    pic.upgrade_canister(
        c,
        bytes.clone(),
        candid::encode_args(()).unwrap(),
        Some(owner),
    )
    .unwrap();
    let restored: Result<bootstrap_model::State, String> = update(&pic, c, owner, "status", 1u64);
    assert_eq!(restored.unwrap(), initial);
    let sub = bootstrap_model::staking_subaccount(c, plan.nonce);
    assert_eq!(sub, l::staking_subaccount(c, plan.nonce));
    let wrong_sub = l::staking_subaccount(c, plan.nonce + 1);
    transfer(
        &pic,
        owner,
        l::Account {
            owner: GOVERNANCE,
            subaccount: Some(wrong_sub.clone()),
        },
        99_000_000,
        None,
    );
    assert!(
        advance(&pic, c, owner, Step::Claim)
            .unwrap_err()
            .contains("underpayment"),
        "a real deposit at another nonce must not fund or authorise this creation"
    );
    transfer(
        &pic,
        owner,
        l::Account {
            owner: GOVERNANCE,
            subaccount: Some(sub.clone()),
        },
        99_000_000,
        None,
    );
    assert!(
        advance(&pic, c, owner, Step::Claim)
            .unwrap_err()
            .contains("underpayment")
    );
    transfer(
        &pic,
        owner,
        l::Account {
            owner: GOVERNANCE,
            subaccount: Some(sub.clone()),
        },
        101_000_000,
        None,
    );
    assert!(
        advance(&pic, c, user(42), Step::Claim)
            .unwrap_err()
            .contains("actual owner")
    );
    let original_claim = checkpoint_fault(&pic, c, owner, Step::Claim, &bytes);
    let claimed = advance(&pic, c, owner, Step::Claim).unwrap();
    assert_eq!(
        claimed.neuron_id, original_claim.neuron_id,
        "restored ambiguous claim must resolve the same actual Governance neuron"
    );
    let t = claimed.neuron_id.unwrap();
    let repeated = advance(&pic, c, owner, Step::Claim).unwrap();
    assert_eq!(repeated.neuron_id, Some(t));
    let request = || g::ListNeurons {
        neuron_ids: vec![t],
        include_neurons_readable_by_caller: false,
        include_empty_neurons_readable_by_caller: Some(true),
        include_public_neurons_in_full_neurons: Some(true),
        page_number: Some(0),
        page_size: Some(2),
        neuron_subaccounts: Some(vec![g::NeuronSubaccount {
            subaccount: sub.clone(),
        }]),
    };
    let before: g::ListNeuronsResponse = update(&pic, GOVERNANCE, c, "list_neurons", request());
    assert_eq!(before.full_neurons.len(), 1);
    assert_eq!(before.full_neurons[0].controller, Some(c));
    assert_eq!(before.full_neurons[0].account, sub);
    assert!(!before.full_neurons[0].not_for_profit);
    let mut configured = advance(&pic, c, owner, Step::Configure).unwrap();
    assert!(configured.public_visibility_confirmed);
    checkpoint_fault(&pic, c, owner, Step::Configure, &bytes);
    for _ in 0..5 {
        configured = advance(&pic, c, owner, Step::Configure).unwrap();
        if configured.phase == Phase::RecoverableTestReady {
            break;
        }
    }
    assert_eq!(configured.phase, Phase::RecoverableTestReady);
    assert!(advance(&pic, c, owner, Step::Seal(1)).is_err());
    let actual: g::ListNeuronsResponse = update(&pic, GOVERNANCE, c, "list_neurons", request());
    assert_eq!(actual.full_neurons[0].visibility, Some(2));
    assert!(actual.full_neurons[0].hot_keys.is_empty());
    assert_eq!(actual.full_neurons[0].followees, vec![fs(1, &[11])]);
    // A genuine Governance management proposal can operate the new target even
    // while C remains provisional. The full browser gate must exercise its UI.
    let intent_id = vec![77u8; 32];
    let marker = format!(
        "Dendrite creation {} operation {}",
        hex::encode(&plan.creation_id),
        hex::encode(&intent_id)
    );
    let proposal_request = g::request(
        11,
        g::Command::MakeProposal(Box::new(g::MakeProposal {
            url: String::new(),
            title: Some("Refresh the provisional test neuron".into()),
            summary: marker,
            action: Some(g::ActionRequest::ManageNeuron(Box::new(g::request(
                t,
                g::Command::RefreshVotingPower(g::Empty {}),
            )))),
        })),
    );
    let reservation = bootstrap_model::ExternalProposal {
        kind: bootstrap_model::ProposalKind::Rehearsal,
        intent_id: intent_id.clone(),
        request_digest: Sha256::digest(candid::encode_one(&proposal_request).unwrap()).to_vec(),
        proposer: 11,
        revision: 1,
        created_at: 0,
        proposal_id: None,
        dispatched: false,
    };
    advance(&pic, c, owner, Step::ReserveProposal(reservation)).unwrap();
    advance(
        &pic,
        c,
        owner,
        Step::MarkProposalDispatched(intent_id.clone()),
    )
    .unwrap();
    pic.upgrade_canister(c, bytes.clone(), encode_one(()).unwrap(), Some(owner))
        .unwrap();
    assert!(
        advance(
            &pic,
            c,
            owner,
            Step::MarkProposalDispatched(intent_id.clone())
        )
        .is_err()
    );
    assert!(advance(&pic, c, owner, Step::CancelReservedProposal(intent_id)).is_err());
    let response: g::ManageResponse =
        update(&pic, GOVERNANCE, owner, "manage_neuron", proposal_request);
    let proposal = match response.command {
        Some(g::ResponseCommand::MakeProposal(p)) => p.proposal_id.unwrap().id,
        other => panic!("proposal was not created: {other:?}"),
    };
    let resolved = advance(&pic, c, owner, Step::ResolveProposal(proposal)).unwrap();
    assert_eq!(
        resolved.external_proposal.unwrap().proposal_id,
        Some(proposal)
    );
    let oracle: Option<ProposalOracle> =
        update(&pic, GOVERNANCE, owner, "get_proposal_info", proposal);
    let oracle = oracle.unwrap();
    assert_eq!(oracle.status, 4);
    assert_eq!(oracle.topic, 1);
    assert!(oracle.executed_timestamp_seconds > 0);
    assert_eq!(oracle.ballots.len(), 1);
    assert_eq!(oracle.ballots[0].0, 11);
    assert_eq!(oracle.ballots[0].1.vote, 1);
    assert!(
        advance(
            &pic,
            c,
            owner,
            Step::Disburse {
                expected_amount_e8s: 199_990_000,
                expected_fee_e8s: 10_000
            }
        )
        .is_err()
    );
    let dissolution: g::ManageResponse = update(&pic, GOVERNANCE, owner, "manage_neuron", SetupProposalRequest {
        neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: 11 })),
        command: Some(SetupProposalCommand::MakeProposal(SetupProposal { title: Some("Explicit test recovery dissolution".into()), summary: "Verify the executable permits manager-proposed StartDissolving with not_for_profit=false. This is separately reviewed test recovery, not a Standard guarantee.".into(), url: String::new(), action: Some(SetupAction::ManageNeuron(setup_request(t, SetupOperation::StartDissolving(g::Empty {})))) })),
    });
    let dissolution_id = match dissolution.command {
        Some(g::ResponseCommand::MakeProposal(p)) => p.proposal_id.unwrap().id,
        other => panic!("real manager dissolution proposal failed: {other:?}"),
    };
    let executed: Option<ProposalOracle> =
        update(&pic, GOVERNANCE, owner, "get_proposal_info", dissolution_id);
    assert_eq!(
        executed.unwrap().status,
        4,
        "not_for_profit=false does not disable manager-proposed dissolution"
    );
    advance(&pic, c, owner, Step::StartDissolving).unwrap();
    pic.advance_time(std::time::Duration::from_secs(plan.lock_seconds + 1));
    pic.tick();
    let recovered = checkpoint_fault(
        &pic,
        c,
        owner,
        Step::Disburse {
            expected_amount_e8s: 199_990_000,
            expected_fee_e8s: 10_000,
        },
        &bytes,
    );
    assert_eq!(recovered.phase, Phase::Recovered);
    let h: l::History = query(
        &pic,
        LEDGER,
        "query_blocks",
        l::BlocksArgs {
            start: recovered.disbursement_block.unwrap(),
            length: 1,
        },
    );
    assert!(
        matches!(&h.blocks[0].transaction.operation,Some(l::Operation::Transfer {from,to,amount,..}) if *from==l::account_id(GOVERNANCE,Some(&sub)) && *to==plan.return_account && amount.e8s==199_990_000)
    );
    for _ in 0..40 {
        transfer(
            &pic,
            owner,
            l::Account {
                owner: user(42),
                subaccount: None,
            },
            1_000_000,
            None,
        );
    }
    let archived: l::History = query(
        &pic,
        LEDGER,
        "query_blocks",
        l::BlocksArgs {
            start: recovered.disbursement_block.unwrap(),
            length: 1,
        },
    );
    assert!(
        archived.blocks.is_empty() && archived.archived_blocks.len() == 1,
        "the original return must actually leave the main Ledger in this gate"
    );
    let archive = archived.archived_blocks[0].callback.0.principal;
    let pins: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root().join("protocol-pins.json")).unwrap()).unwrap();
    let archive_pin = pins["artifacts"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "ledger-archive-node-canister.wasm.gz")
        .unwrap();
    // Ledger uploads its gzip archive. module_hash hashes the install_code
    // input bytes, while wasm_sha256 binds the decompressed executable. The
    // same pinned release already records both distinct identities.
    assert_eq!(
        hex::encode(Sha256::digest(artifact("ledger-archive-node-canister"))),
        archive_pin["wasm_sha256"].as_str().unwrap()
    );
    assert_eq!(
        pic.canister_status(archive, None).unwrap().module_hash,
        Some(hex::decode(archive_pin["sha256"].as_str().unwrap()).unwrap()),
        "the endorsed archive must have the exact pinned gzip upload identity"
    );
    let return_balance = || -> Nat {
        query(
            &pic,
            LEDGER,
            "icrc1_balance_of",
            l::Account {
                owner,
                subaccount: None,
            },
        )
    };
    let before_reconcile = return_balance();
    assert!(
        advance(&pic, c, owner, Step::ReconcileDisbursement(0)).is_err(),
        "an unrelated archived block must not resolve the financial intent"
    );
    let reconciled = advance(
        &pic,
        c,
        owner,
        Step::ReconcileDisbursement(recovered.disbursement_block.unwrap()),
    )
    .unwrap();
    assert_eq!(reconciled.phase, Phase::Recovered);
    assert_eq!(reconciled.disbursement_block, recovered.disbursement_block);
    assert_eq!(
        return_balance(),
        before_reconcile,
        "archive reconciliation is read-only and cannot pay stake twice"
    );
    assert_eq!(pic.get_controllers(c), vec![owner]);
    assert!(
        pic.canister_status(c, Some(owner))
            .unwrap()
            .module_hash
            .is_some()
    );
    let wrong_balance: Nat = query(
        &pic,
        LEDGER,
        "icrc1_balance_of",
        l::Account {
            owner: GOVERNANCE,
            subaccount: Some(wrong_sub.clone()),
        },
    );
    assert_eq!(
        wrong_balance,
        Nat::from(99_000_000u64),
        "the wrong external destination is explicitly accounted for; it is outside this plan's recovery authority"
    );
    let unrelated: g::ListNeuronsResponse = update(
        &pic,
        GOVERNANCE,
        c,
        "list_neurons",
        g::ListNeurons {
            neuron_ids: vec![],
            include_neurons_readable_by_caller: false,
            include_empty_neurons_readable_by_caller: Some(true),
            include_public_neurons_in_full_neurons: Some(true),
            page_number: Some(0),
            page_size: Some(2),
            neuron_subaccounts: Some(vec![g::NeuronSubaccount {
                subaccount: wrong_sub,
            }]),
        },
    );
    assert!(
        unrelated.full_neurons.is_empty(),
        "the bootstrap never claimed the unrelated nonce"
    );
    std::fs::write(root().join("dist/evidence/creation-recovery-protocol.json"), serde_json::to_vec_pretty(&serde_json::json!({
        "classification":"native real-artifact protocol with explicitly restored pre-await checkpoints; separate signed-browser evidence required",
        "controller":c.to_text(),"owner":owner.to_text(),"neuron":t.to_string(),"nonce":plan.nonce.to_string(),
        "bootstrap_sha256":hex::encode(Sha256::digest(&bytes)),"return_account":hex::encode(&plan.return_account),
        "staking_subaccount":hex::encode(&sub),"disbursement_block":recovered.disbursement_block.unwrap().to_string(),
        "archive":archive.to_text(),"archive_module_sha256":archive_pin["sha256"],"archive_raw_wasm_sha256":archive_pin["wasm_sha256"],
        "returned_e8s":"199990000","fee_e8s":"10000","reconciliation_paid_again":false,
        "wrong_nonce_unclaimed_e8s":wrong_balance.to_string(),"recoverable_controllers":[owner.to_text()],
        "claim_following_disbursement_callbacks_reconciled_across_same_code_upgrades":true
    })).unwrap()).unwrap();
    println!(
        "real one-manager creation T={t}, C={c}, wrong-nonce funding refusal, repeated claim, upgrade, manager execution and ledger return verified; unrelated 99000000 e8s remains at its independently observed wrong external account, outside the plan; creation remains recoverable and not Standard-compliant"
    );
}

#[test]
#[ignore = "creation_protocol lane uses checksum-pinned real CMC/Cycles Ledger"]
fn real_cmc_conversion_and_cycles_ledger_creation_deduplicate() {
    let pic = real_pic();
    let owner = user(41);
    let funding_sub = vec![41; 32];
    install_real(
        &pic,
        vec![],
        vec![(
            l::Account {
                owner,
                subaccount: Some(funding_sub.clone()),
            },
            1_000_000_000,
        )],
        artifact("governance-canister"),
        artifact("ledger-canister"),
    );
    install_provisioning(&pic);
    let fee: Nat = query_empty(&pic, LEDGER, "icrc1_fee");
    let amount = 200_000_000u64;
    let transfer = l::TransferArg {
        from_subaccount: Some(funding_sub.clone()),
        to: l::Account {
            owner: cmc(),
            subaccount: Some(principal_subaccount(owner)),
        },
        fee: Some(fee.clone()),
        created_at_time: Some(now(&pic) * 1_000_000_000),
        memo: Some(0x544e494du64.to_le_bytes().to_vec()),
        amount: amount.into(),
    };
    let block: Result<Nat, l::TransferError> =
        update(&pic, LEDGER, owner, "icrc1_transfer", transfer.clone());
    let block = block.unwrap();
    let repeated: Result<Nat, l::TransferError> =
        update(&pic, LEDGER, owner, "icrc1_transfer", transfer);
    assert!(
        matches!(repeated, Err(l::TransferError::Duplicate { duplicate_of }) if duplicate_of == block)
    );
    let notify = NotifyMint {
        block_index: l::nat(block).unwrap(),
        to_subaccount: Some(funding_sub.clone()),
        deposit_memo: Some(vec![41]),
    };
    let minted: Result<MintSuccess, NotifyError> =
        update(&pic, cmc(), owner, "notify_mint_cycles", notify.clone());
    let minted = minted.unwrap();
    assert_eq!(minted.minted, Nat::from(10_000_000_000_000u64));
    let repeated: Result<MintSuccess, NotifyError> =
        update(&pic, cmc(), owner, "notify_mint_cycles", notify);
    assert_eq!(repeated.unwrap(), minted);
    let before = cycles_balance(&pic, owner, Some(funding_sub.clone()));
    let create = creation_args(&pic, owner, Some(funding_sub.clone()));
    let created: Result<Created, CreateError> = update(
        &pic,
        cycles_ledger(),
        owner,
        "create_canister",
        create.clone(),
    );
    let created = created.unwrap();
    let duplicate: Result<Created, CreateError> =
        update(&pic, cycles_ledger(), owner, "create_canister", create);
    assert!(
        matches!(duplicate, Err(CreateError::Duplicate { duplicate_of, canister_id: Some(id) }) if id == created.canister_id && duplicate_of == created.block_id)
    );
    let after = cycles_balance(&pic, owner, Some(funding_sub.clone()));
    let cycle_fee: Nat = query_empty(&pic, cycles_ledger(), "icrc1_fee");
    assert_eq!(
        &before.0 - &after.0,
        Nat::from(2_000_000_000_000u64).0 + cycle_fee.0
    );
    assert_eq!(pic.get_controllers(created.canister_id), vec![owner]);
    let state = pic
        .canister_status(created.canister_id, Some(owner))
        .unwrap();
    assert!(state.module_hash.is_none());
    assert!(state.cycles.0 > Nat::from(1_000_000_000_000u64).0);
    // Real failed creation burns the attempt and reimbursement fees. Its
    // duplicate intentionally has no canister ID; a caller must not try a new ID.
    let mut bad = creation_args(&pic, owner, Some(funding_sub.clone()));
    bad.created_at_time = Some(now(&pic) * 1_000_000_000 + 1);
    bad.creation_args.as_mut().unwrap().subnet_selection =
        Some(SubnetSelection::Subnet { subnet: user(99) });
    let failure: Result<Created, CreateError> =
        update(&pic, cycles_ledger(), owner, "create_canister", bad.clone());
    assert!(matches!(
        failure,
        Err(CreateError::FailedToCreate {
            fee_block: Some(_),
            refund_block: Some(_),
            ..
        })
    ));
    let failed_balance = cycles_balance(&pic, owner, Some(funding_sub.clone()));
    let duplicate: Result<Created, CreateError> =
        update(&pic, cycles_ledger(), owner, "create_canister", bad);
    assert!(matches!(
        duplicate,
        Err(CreateError::Duplicate {
            canister_id: None,
            ..
        })
    ));
    assert_eq!(
        failed_balance,
        cycles_balance(&pic, owner, Some(funding_sub.clone()))
    );
    let fee: Nat = query_empty(&pic, cycles_ledger(), "icrc1_fee");
    // The pinned CMC also retains BAD_REQUEST_CYCLES_PENALTY (100M).
    assert_eq!(
        &after.0 - &failed_balance.0,
        fee.0 * 2u32 + Nat::from(100_000_000u64).0
    );

    // A failed real CMC deposit returns ICP to the original payer. Verify the
    // actual ledger transfer, rather than classifying a lower balance as success.
    pic.stop_canister(cycles_ledger(), None).unwrap();
    let payment: Result<Nat, l::TransferError> = update(
        &pic,
        LEDGER,
        owner,
        "icrc1_transfer",
        l::TransferArg {
            from_subaccount: Some(funding_sub.clone()),
            to: l::Account {
                owner: cmc(),
                subaccount: Some(principal_subaccount(owner)),
            },
            fee: Some(10_000u64.into()),
            amount: 100_000_000u64.into(),
            memo: Some(0x544e494du64.to_le_bytes().to_vec()),
            created_at_time: Some(now(&pic) * 1_000_000_000),
        },
    );
    let reply: Result<MintSuccess, NotifyError> = update(
        &pic,
        cmc(),
        owner,
        "notify_mint_cycles",
        NotifyMint {
            block_index: l::nat(payment.unwrap()).unwrap(),
            to_subaccount: Some(funding_sub.clone()),
            deposit_memo: None,
        },
    );
    let refund = match reply {
        Err(NotifyError::Refunded {
            block_index: Some(block),
            ..
        }) => block,
        other => panic!("expected real CMC refund, got {other:?}"),
    };
    let history: l::History = query(
        &pic,
        LEDGER,
        "query_blocks",
        l::BlocksArgs {
            start: refund,
            length: 1,
        },
    );
    assert_eq!(history.first_block_index, refund);
    match history.blocks[0].transaction.operation.as_ref().unwrap() {
        l::Operation::Transfer {
            to, amount, fee, ..
        } => {
            assert_eq!(*to, l::account_id(owner, Some(&funding_sub)));
            assert_eq!(amount.e8s, 100_000_000 - 30_000);
            assert_eq!(fee.e8s, 10_000);
        }
        other => panic!("refund was not a ledger transfer: {other:?}"),
    }
    println!(
        "real provisioned controller {}, sole owner {}, exact cycle debit and retained duplicate ID verified",
        created.canister_id, owner
    );
}
