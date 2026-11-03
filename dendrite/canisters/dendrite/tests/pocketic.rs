use candid::{CandidType, Decode, Deserialize, Encode, Principal, Reserved};
use dendrite::DendriteError;
use dendrite_types::{ComplianceReport, ComplianceStatus, ManagerEvidenceStatus};
use ic_clients::NNS_GOVERNANCE;
use pocket_ic::{PocketIc, PocketIcBuilder};
use std::{
    path::PathBuf,
    time::{Duration, UNIX_EPOCH},
};

#[derive(Clone, CandidType)]
struct HttpRequest {
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    certificate_version: Option<u16>,
}

#[derive(CandidType, Deserialize)]
struct HttpResponse {
    status_code: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    upgrade: Option<bool>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct TxNeuronId {
    id: u64,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct TxProposalId {
    id: u64,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
enum TxNeuronIdOrSubaccount {
    NeuronId(TxNeuronId),
    Subaccount(Vec<u8>),
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct TxEmpty {}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct TxRegisterVote {
    vote: i32,
    proposal: Option<TxProposalId>,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct TxMakeProposal {
    url: String,
    title: Option<String>,
    action: Option<TxProposalAction>,
    summary: String,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
enum TxProposalAction {
    ManageNeuron(Box<TxManageNeuronRequest>),
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
enum TxCommand {
    MakeProposal(TxMakeProposal),
    RefreshVotingPower(TxEmpty),
    RegisterVote(TxRegisterVote),
    Follow(TxFollow),
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct TxFollow {
    topic: i32,
    followees: Vec<TxNeuronId>,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct TxManageNeuronRequest {
    neuron_id_or_subaccount: Option<TxNeuronIdOrSubaccount>,
    command: Option<TxCommand>,
    id: Option<TxNeuronId>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
struct TxMakeProposalResponse {
    message: Option<String>,
    proposal_id: Option<TxProposalId>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
struct TxGovernanceError {
    error_message: String,
    error_type: i32,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
enum TxResponseCommand {
    Error(TxGovernanceError),
    MakeProposal(TxMakeProposalResponse),
    RefreshVotingPower(TxEmpty),
    RegisterVote(TxEmpty),
}
#[derive(Clone, Debug, CandidType, Deserialize)]
struct TxManageNeuronResponse {
    command: Option<TxResponseCommand>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
struct TxEconomics {
    neuron_management_fee_per_proposal_e8s: u64,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct TxListProposalInfoRequest {
    include_reward_status: Vec<i32>,
    omit_large_fields: Option<bool>,
    before_proposal: Option<TxProposalId>,
    limit: u32,
    exclude_topic: Vec<i32>,
    include_all_manage_neuron_proposals: Option<bool>,
    include_status: Vec<i32>,
    return_self_describing_action: Option<bool>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
struct TxStoredManagedTarget {
    id: Option<TxNeuronId>,
    neuron_id_or_subaccount: Option<TxNeuronIdOrSubaccount>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
enum TxStoredAction {
    ManageNeuron(TxStoredManagedTarget),
}
#[derive(Clone, Debug, CandidType, Deserialize)]
struct TxStoredProposal {
    action: Option<TxStoredAction>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
struct TxProposalInfoTarget {
    proposal: Option<TxStoredProposal>,
}

fn header<'a>(response: &'a HttpResponse, name: &str) -> Option<&'a str> {
    response
        .headers
        .iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.as_str())
}

fn wasm() -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/wasm32-unknown-unknown/release/dendrite.wasm");
    std::fs::read(&path).unwrap_or_else(|error| {
        panic!(
            "read frontend-embedded Wasm at {} (run cargo xtask test): {error}",
            path.display()
        )
    })
}

fn governance_wasm() -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/wasm32-unknown-unknown/release/dendrite_test_governance.wasm");
    std::fs::read(&path).unwrap_or_else(|error| {
        panic!(
            "read test Governance Wasm at {} (run cargo xtask test): {error}",
            path.display()
        )
    })
}

fn pocket_ic() -> PocketIc {
    let server = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../dist/tools/pocket-ic-server-15.0.0/pocket-ic");
    assert!(
        server.is_file(),
        "run cargo xtask test to provision PocketIC"
    );
    PocketIcBuilder::new()
        .with_application_subnet()
        .with_server_binary(server)
        .build()
}

fn pocket_ic_with_nns() -> PocketIc {
    let server = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../dist/tools/pocket-ic-server-15.0.0/pocket-ic");
    PocketIcBuilder::new()
        .with_nns_subnet()
        .with_application_subnet()
        .with_server_binary(server)
        .build()
}

#[test]
fn public_api_certified_http_and_upgrade_work_anonymously() {
    let pic = pocket_ic();
    let canister = pic.create_canister();
    pic.add_cycles(canister, 5_000_000_000_000);
    let wasm = wasm();
    pic.install_canister(canister, wasm.clone(), Encode!().unwrap(), None);

    let request = HttpRequest {
        method: "GET".into(),
        url: "/".into(),
        headers: vec![],
        body: vec![],
        certificate_version: Some(2),
    };
    let reply = pic
        .query_call(
            canister,
            Principal::anonymous(),
            "http_request",
            Encode!(&request).unwrap(),
        )
        .unwrap();
    let response = Decode!(&reply, HttpResponse).unwrap();
    assert_eq!(response.status_code, 200);
    assert_eq!(response.upgrade, None);
    assert!(
        std::str::from_utf8(&response.body)
            .unwrap()
            .contains("Dendrite")
    );
    for required in [
        "content-security-policy",
        "strict-transport-security",
        "x-content-type-options",
        "ic-certificate",
    ] {
        assert!(
            response
                .headers
                .iter()
                .any(|(name, _)| name.eq_ignore_ascii_case(required)),
            "missing {required}"
        );
    }
    assert_eq!(
        header(&response, "cross-origin-opener-policy"),
        Some("same-origin-allow-popups")
    );
    assert_eq!(
        header(&response, "cross-origin-resource-policy"),
        Some("same-origin")
    );

    let manifest_request = HttpRequest {
        url: "/asset-manifest.json".into(),
        ..request.clone()
    };
    let reply = pic
        .query_call(
            canister,
            Principal::anonymous(),
            "http_request",
            Encode!(&manifest_request).unwrap(),
        )
        .unwrap();
    let manifest = Decode!(&reply, HttpResponse).unwrap();
    assert_eq!(manifest.status_code, 200);
    assert_eq!(
        header(&manifest, "content-type"),
        Some("application/json; charset=utf-8")
    );
    assert!(
        std::str::from_utf8(&manifest.body)
            .unwrap()
            .contains("\"app.js\"")
    );

    let well_known_request = HttpRequest {
        url: "/.well-known/ii-alternative-origins".into(),
        ..request.clone()
    };
    let reply = pic
        .query_call(
            canister,
            Principal::anonymous(),
            "http_request",
            Encode!(&well_known_request).unwrap(),
        )
        .unwrap();
    let well_known = Decode!(&reply, HttpResponse).unwrap();
    assert_eq!(well_known.status_code, 200);
    assert_eq!(
        std::str::from_utf8(&well_known.body).unwrap(),
        "{\"alternativeOrigins\":[]}"
    );
    assert_eq!(
        header(&well_known, "content-type"),
        Some("application/json; charset=utf-8")
    );
    assert_eq!(
        header(&well_known, "access-control-allow-origin"),
        Some("*")
    );
    assert_eq!(
        header(&well_known, "cross-origin-resource-policy"),
        Some("cross-origin")
    );
    assert!(
        header(&well_known, "cache-control")
            .unwrap()
            .contains("no-cache")
    );

    let checked = pic
        .update_call(
            canister,
            Principal::anonymous(),
            "check_neuron",
            Encode!(&7_u64).unwrap(),
        )
        .unwrap();
    let error = Decode!(&checked, Result<ComplianceReport, DendriteError>)
        .unwrap()
        .unwrap_err();
    assert!(matches!(
        error,
        DendriteError::AnalysisFailed(message)
            if message == "NNS evidence snapshot timestamp is invalid"
    ));
    pic.upgrade_canister(canister, wasm, Encode!().unwrap(), None)
        .unwrap();
    let reply = pic
        .query_call(
            canister,
            Principal::anonymous(),
            "http_request",
            Encode!(&request).unwrap(),
        )
        .unwrap();
    assert_eq!(Decode!(&reply, HttpResponse).unwrap().status_code, 200);
}

#[test]
fn live_compliant_and_non_compliant_checks_use_fixed_governance_and_real_controller() {
    let pic = pocket_ic_with_nns();
    pic.set_time((UNIX_EPOCH + Duration::from_secs(1_700_000_000)).into());
    let controller = pic.create_canister();
    pic.set_controllers(controller, None, vec![])
        .expect("blackhole the empty controller canister");
    let governance = pic
        .create_canister_with_id(None, None, NNS_GOVERNANCE)
        .expect("create fixed NNS Governance canister");
    pic.install_canister(
        governance,
        governance_wasm(),
        Encode!(&controller).unwrap(),
        None,
    );
    let dendrite = pic.create_canister();
    pic.add_cycles(dendrite, 5_000_000_000_000);
    pic.install_canister(dendrite, wasm(), Encode!().unwrap(), None);

    for (neuron_id, expected) in [
        (42_u64, ComplianceStatus::Compliant),
        (43_u64, ComplianceStatus::NonCompliant),
    ] {
        let reply = pic
            .update_call(
                dendrite,
                Principal::anonymous(),
                "check_neuron",
                Encode!(&neuron_id).unwrap(),
            )
            .unwrap();
        let report = Decode!(&reply, Result<ComplianceReport, Reserved>)
            .unwrap()
            .unwrap();
        assert_eq!(
            report.overall_status, expected,
            "rules: {:?}; failures: {:?}",
            report.rules, report.source_failures
        );
        assert_eq!(report.neuron_id, neuron_id);
        assert_eq!(report.managers.len(), 5);
        assert!(report.managers.iter().all(|manager| {
            manager.evidence_status == ManagerEvidenceStatus::Found
                && manager.known_neuron.is_some()
                && manager.hot_keys.len() <= ic_clients::MAX_HOT_KEYS
        }));
    }
}

#[test]
fn governance_fixture_decodes_exact_proposal_nesting_and_direct_manager_vote() {
    let pic = pocket_ic_with_nns();
    pic.set_time((UNIX_EPOCH + Duration::from_secs(1_700_000_000)).into());
    let controller = pic.create_canister();
    let governance = pic
        .create_canister_with_id(None, None, NNS_GOVERNANCE)
        .unwrap();
    pic.install_canister(
        governance,
        governance_wasm(),
        Encode!(&controller).unwrap(),
        None,
    );

    let economics = pic
        .query_call(
            governance,
            Principal::anonymous(),
            "get_network_economics_parameters",
            Encode!().unwrap(),
        )
        .unwrap();
    assert_eq!(
        Decode!(&economics, TxEconomics)
            .unwrap()
            .neuron_management_fee_per_proposal_e8s,
        100_000_000
    );

    let list_request = TxListProposalInfoRequest {
        include_reward_status: vec![],
        omit_large_fields: Some(true),
        before_proposal: None,
        limit: 50,
        exclude_topic: vec![],
        include_all_manage_neuron_proposals: None,
        include_status: vec![1],
        return_self_describing_action: Some(false),
    };
    pic.update_call(
        governance,
        Principal::anonymous(),
        "list_proposals",
        Encode!(&list_request).unwrap(),
    )
    .unwrap();
    let recorded_lists = pic
        .query_call(
            governance,
            Principal::anonymous(),
            "recorded_list_proposal_requests",
            Encode!().unwrap(),
        )
        .unwrap();
    assert_eq!(
        Decode!(&recorded_lists, Vec<TxListProposalInfoRequest>).unwrap(),
        vec![list_request]
    );
    let mut targets = Vec::new();
    for id in 777_u64..=782 {
        let raw = pic
            .query_call(
                governance,
                Principal::anonymous(),
                "get_proposal_info",
                Encode!(&id).unwrap(),
            )
            .unwrap();
        let value = Decode!(&raw, Option<TxProposalInfoTarget>)
            .unwrap()
            .unwrap();
        let Some(TxStoredAction::ManageNeuron(target)) = value.proposal.unwrap().action else {
            panic!("missing stored management target")
        };
        targets.push((target.id, target.neuron_id_or_subaccount));
    }
    assert_eq!(
        targets[0],
        (
            None,
            Some(TxNeuronIdOrSubaccount::NeuronId(TxNeuronId { id: 42 }))
        )
    );
    assert_eq!(targets[1], (Some(TxNeuronId { id: 42 }), None));
    assert_eq!(
        targets[2],
        (
            Some(TxNeuronId { id: 42 }),
            Some(TxNeuronIdOrSubaccount::NeuronId(TxNeuronId { id: 42 }))
        )
    );
    assert_eq!(
        targets[3],
        (
            Some(TxNeuronId { id: 43 }),
            Some(TxNeuronIdOrSubaccount::NeuronId(TxNeuronId { id: 42 }))
        )
    );
    assert!(matches!(
        targets[4].1,
        Some(TxNeuronIdOrSubaccount::Subaccount(_))
    ));
    assert_eq!(targets[5], (None, None));

    let inner = TxManageNeuronRequest {
        id: None,
        neuron_id_or_subaccount: Some(TxNeuronIdOrSubaccount::NeuronId(TxNeuronId { id: 42 })),
        command: Some(TxCommand::RefreshVotingPower(TxEmpty {})),
    };
    let outer = TxManageNeuronRequest {
        id: None,
        neuron_id_or_subaccount: Some(TxNeuronIdOrSubaccount::NeuronId(TxNeuronId { id: 100 })),
        command: Some(TxCommand::MakeProposal(TxMakeProposal {
            url: String::new(),
            title: Some("Dendrite neuron management request".into()),
            summary: "Manage Dendrite neuron 42.".into(),
            action: Some(TxProposalAction::ManageNeuron(Box::new(inner.clone()))),
        })),
    };
    let response = pic
        .update_call(
            governance,
            Principal::anonymous(),
            "manage_neuron",
            Encode!(&outer).unwrap(),
        )
        .unwrap();
    match Decode!(&response, TxManageNeuronResponse).unwrap().command {
        Some(TxResponseCommand::MakeProposal(value)) => {
            assert_eq!(value.proposal_id.unwrap().id, 777)
        }
        other => panic!("unexpected proposal response: {other:?}"),
    }

    let direct = TxManageNeuronRequest {
        id: None,
        neuron_id_or_subaccount: Some(TxNeuronIdOrSubaccount::NeuronId(TxNeuronId { id: 100 })),
        command: Some(TxCommand::RegisterVote(TxRegisterVote {
            vote: 1,
            proposal: Some(TxProposalId { id: 777 }),
        })),
    };
    let response = pic
        .update_call(
            governance,
            Principal::anonymous(),
            "manage_neuron",
            Encode!(&direct).unwrap(),
        )
        .unwrap();
    assert!(matches!(
        Decode!(&response, TxManageNeuronResponse).unwrap().command,
        Some(TxResponseCommand::RegisterVote(_))
    ));

    let rejected = TxManageNeuronRequest {
        id: None,
        neuron_id_or_subaccount: Some(TxNeuronIdOrSubaccount::NeuronId(TxNeuronId { id: 100 })),
        command: Some(TxCommand::Follow(TxFollow {
            topic: 1,
            followees: vec![TxNeuronId { id: 42 }],
        })),
    };
    let response = pic
        .update_call(
            governance,
            Principal::anonymous(),
            "manage_neuron",
            Encode!(&rejected).unwrap(),
        )
        .unwrap();
    assert!(matches!(
        Decode!(&response, TxManageNeuronResponse).unwrap().command,
        Some(TxResponseCommand::Error(TxGovernanceError {
            error_type: 3,
            ..
        }))
    ));

    let recorded = pic
        .query_call(
            governance,
            Principal::anonymous(),
            "recorded_manage_requests",
            Encode!().unwrap(),
        )
        .unwrap();
    assert_eq!(
        Decode!(&recorded, Vec<TxManageNeuronRequest>).unwrap(),
        vec![outer.clone(), direct.clone(), rejected.clone()]
    );
    let recorded_bytes = pic
        .query_call(
            governance,
            Principal::anonymous(),
            "recorded_manage_request_bytes",
            Encode!().unwrap(),
        )
        .unwrap();
    let exact_bytes = Decode!(&recorded_bytes, Vec<Vec<u8>>).unwrap();
    assert_eq!(
        exact_bytes,
        vec![
            Encode!(&outer).unwrap(),
            Encode!(&direct).unwrap(),
            Encode!(&rejected).unwrap()
        ]
    );
}
