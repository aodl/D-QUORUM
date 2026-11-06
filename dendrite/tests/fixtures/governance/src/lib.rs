#![forbid(unsafe_code)]

use candid::{CandidType, Deserialize, Principal};
use dendrite_types::{ALPHA_VOTE_NEURON_ID, MAX_DISSOLVE_DELAY_SECONDS, OMEGA_REJECT_NEURON_ID};
use ic_clients::{
    DissolveState, Followees, KnownNeuronData, ListNeurons, ListNeuronsResponse, Neuron, NeuronId,
    NeuronInfo, Reserved,
};
use std::cell::{Cell, RefCell};

thread_local! { static CONTROLLER: Cell<Principal> = const { Cell::new(Principal::anonymous()) }; }
thread_local! { static MANAGE_REQUESTS: RefCell<Vec<ManageNeuronRequest>> = const { RefCell::new(Vec::new()) }; }
thread_local! { static MANAGE_REQUEST_BYTES: RefCell<Vec<Vec<u8>>> = const { RefCell::new(Vec::new()) }; }
thread_local! { static LIST_PROPOSAL_REQUESTS: RefCell<Vec<ListProposalInfoRequest>> = const { RefCell::new(Vec::new()) }; }

const RETRIEVED_AT_TIMESTAMP_SECONDS: u64 = 1_700_000_000;

#[ic_cdk::init]
fn init(controller: Principal) {
    CONTROLLER.with(|value| value.set(controller));
}

fn neuron(id: u64, followees: Vec<(i32, Vec<u64>)>) -> Neuron {
    Neuron {
        id: Some(NeuronId { id }),
        staked_maturity_e8s_equivalent: Some(0),
        controller: None,
        not_for_profit: false,
        maturity_e8s_equivalent: 0,
        cached_neuron_stake_e8s: 100_000_000,
        created_timestamp_seconds: 1,
        auto_stake_maturity: Some(false),
        aging_since_timestamp_seconds: 1,
        hot_keys: vec![],
        dissolve_state: Some(DissolveState::DissolveDelaySeconds(
            MAX_DISSOLVE_DELAY_SECONDS,
        )),
        followees: followees
            .into_iter()
            .map(|(topic, ids)| {
                (
                    topic,
                    Followees {
                        followees: ids.into_iter().map(|id| NeuronId { id }).collect(),
                    },
                )
            })
            .collect(),
        neuron_fees_e8s: 0,
        visibility: Some(2),
        known_neuron_data: Some(KnownNeuronData {
            name: format!("known-{id}"),
            description: None,
            links: None,
            committed_topics: Some(vec![]),
        }),
        voting_power_refreshed_timestamp_seconds: Some(1_699_999_999),
        deciding_voting_power: Some(10),
        potential_voting_power: Some(10),
    }
}

fn fixtures() -> Vec<Neuron> {
    let managers = [100, 101, 102, 103, 104];
    let mut following = vec![(1, managers.to_vec()), (4, vec![100, 101, 102])];
    for topic in [0, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18] {
        following.push((topic, vec![ALPHA_VOTE_NEURON_ID]));
    }
    let mut target = neuron(42, following.clone());
    target.controller = Some(CONTROLLER.with(Cell::get));
    target.known_neuron_data.as_mut().unwrap().committed_topics = Some(vec![Some(Reserved)]);
    let mut non_compliant = target.clone();
    non_compliant.id = Some(NeuronId { id: 43 });
    non_compliant.hot_keys.push(Principal::anonymous());
    let dependencies = managers.into_iter().map(|id| {
        neuron(
            id,
            if id <= 102 {
                vec![(4, vec![OMEGA_REJECT_NEURON_ID])]
            } else {
                vec![]
            },
        )
    });
    [target, non_compliant]
        .into_iter()
        .chain(dependencies)
        .chain([
            neuron(ALPHA_VOTE_NEURON_ID, vec![]),
            neuron(OMEGA_REJECT_NEURON_ID, vec![]),
        ])
        .collect()
}

#[ic_cdk::query]
fn list_neurons(request: ListNeurons) -> ListNeuronsResponse {
    let metadata_neurons: Vec<_> = fixtures()
        .into_iter()
        .filter(|neuron| {
            neuron
                .id
                .as_ref()
                .is_some_and(|id| request.neuron_ids.contains(&id.id))
        })
        .collect();
    let full_neurons = metadata_neurons
        .iter()
        .cloned()
        .map(|mut neuron| {
            neuron.known_neuron_data = None;
            neuron
        })
        .collect();
    ListNeuronsResponse {
        neuron_infos: metadata_neurons
            .iter()
            .filter_map(|neuron| {
                neuron.id.as_ref().map(|id| {
                    (
                        id.id,
                        NeuronInfo {
                            id: Some(NeuronId { id: id.id }),
                            retrieved_at_timestamp_seconds: RETRIEVED_AT_TIMESTAMP_SECONDS,
                            known_neuron_data: neuron.known_neuron_data.clone(),
                            visibility: neuron.visibility,
                        },
                    )
                })
            })
            .collect(),
        full_neurons,
        total_pages_available: Some(1),
    }
}

#[ic_cdk::query]
fn get_neuron_info(id: u64) -> Result<NeuronInfo, GovernanceError> {
    fixtures()
        .into_iter()
        .find(|neuron| neuron.id.as_ref().is_some_and(|value| value.id == id))
        .map(|neuron| NeuronInfo {
            id: neuron.id,
            retrieved_at_timestamp_seconds: RETRIEVED_AT_TIMESTAMP_SECONDS,
            known_neuron_data: neuron.known_neuron_data,
            visibility: neuron.visibility,
        })
        .ok_or(GovernanceError {
            error_message: "Neuron not found".into(),
            error_type: 5,
        })
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct ProposalId {
    id: u64,
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
enum NeuronIdOrSubaccount {
    NeuronId(NeuronId),
    Subaccount(Vec<u8>),
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct Empty {}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct RegisterVote {
    vote: i32,
    proposal: Option<ProposalId>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct Follow {
    topic: i32,
    followees: Vec<NeuronId>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct MakeProposalRequest {
    url: String,
    title: Option<String>,
    action: Option<ProposalActionRequest>,
    summary: String,
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
enum ProposalActionRequest {
    ManageNeuron(Box<ManageNeuronRequest>),
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
enum ManageNeuronCommandRequest {
    Follow(Follow),
    MakeProposal(MakeProposalRequest),
    RefreshVotingPower(Empty),
    RegisterVote(RegisterVote),
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct ManageNeuronRequest {
    neuron_id_or_subaccount: Option<NeuronIdOrSubaccount>,
    command: Option<ManageNeuronCommandRequest>,
    id: Option<NeuronId>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct GovernanceError {
    error_message: String,
    error_type: i32,
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct MakeProposalResponse {
    message: Option<String>,
    proposal_id: Option<ProposalId>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
enum ManageNeuronResponseCommand {
    Error(GovernanceError),
    MakeProposal(MakeProposalResponse),
    RefreshVotingPower(Empty),
    RegisterVote(Empty),
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct ManageNeuronResponse {
    command: Option<ManageNeuronResponseCommand>,
}

#[derive(Clone, Debug, CandidType, Deserialize)]
struct NetworkEconomics {
    neuron_management_fee_per_proposal_e8s: u64,
}

#[derive(Clone, Debug, CandidType, Deserialize)]
struct Ballot {
    vote: i32,
    voting_power: u64,
}

#[derive(Clone, Debug, CandidType, Deserialize)]
struct StoredManageNeuronProposal {
    id: Option<NeuronId>,
    command: Option<StoredManageNeuronCommand>,
    neuron_id_or_subaccount: Option<NeuronIdOrSubaccount>,
}

#[derive(Clone, Debug, CandidType, Deserialize)]
enum StoredManageNeuronCommand {
    Follow(Follow),
    MakeProposal(Box<StoredProposal>),
    RefreshVotingPower(Empty),
    RegisterVote(RegisterVote),
}

#[derive(Clone, Debug, CandidType, Deserialize)]
enum StoredAction {
    ManageNeuron(StoredManageNeuronProposal),
}

#[derive(Clone, Debug, CandidType, Deserialize)]
struct StoredProposal {
    url: String,
    title: Option<String>,
    action: Option<StoredAction>,
    summary: String,
}

#[derive(Clone, Debug, CandidType, Deserialize)]
struct ProposalInfo {
    id: Option<ProposalId>,
    status: i32,
    topic: i32,
    ballots: Vec<(u64, Ballot)>,
    proposal_timestamp_seconds: u64,
    deadline_timestamp_seconds: Option<u64>,
    proposal: Option<StoredProposal>,
    proposer: Option<NeuronId>,
}

#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
struct ListProposalInfoRequest {
    include_reward_status: Vec<i32>,
    omit_large_fields: Option<bool>,
    before_proposal: Option<ProposalId>,
    limit: u32,
    exclude_topic: Vec<i32>,
    include_all_manage_neuron_proposals: Option<bool>,
    include_status: Vec<i32>,
    return_self_describing_action: Option<bool>,
}

#[derive(Clone, Debug, CandidType, Deserialize)]
struct ListProposalInfoResponse {
    proposal_info: Vec<ProposalInfo>,
}

fn open_proposal() -> ProposalInfo {
    ProposalInfo {
        id: Some(ProposalId { id: 777 }),
        status: 1,
        topic: 1,
        ballots: vec![(
            100,
            Ballot {
                vote: 0,
                voting_power: 1,
            },
        )],
        proposal_timestamp_seconds: RETRIEVED_AT_TIMESTAMP_SECONDS,
        deadline_timestamp_seconds: Some(RETRIEVED_AT_TIMESTAMP_SECONDS + 86_400),
        proposal: Some(StoredProposal {
            url: String::new(),
            title: Some("Dendrite neuron management request".into()),
            action: Some(StoredAction::ManageNeuron(StoredManageNeuronProposal {
                id: None,
                command: Some(StoredManageNeuronCommand::RefreshVotingPower(Empty {})),
                neuron_id_or_subaccount: Some(NeuronIdOrSubaccount::NeuronId(NeuronId { id: 42 })),
            })),
            summary: "Fixture target refresh".into(),
        }),
        proposer: Some(NeuronId { id: 100 }),
    }
}

fn proposal_with_target(id: u64) -> ProposalInfo {
    let mut proposal = open_proposal();
    proposal.id = Some(ProposalId { id });
    if let Some(StoredProposal {
        action: Some(StoredAction::ManageNeuron(managed)),
        ..
    }) = proposal.proposal.as_mut()
    {
        match id {
            778 => {
                managed.id = Some(NeuronId { id: 42 });
                managed.neuron_id_or_subaccount = None;
            }
            779 => managed.id = Some(NeuronId { id: 42 }),
            780 => managed.id = Some(NeuronId { id: 43 }),
            781 => {
                managed.id = None;
                managed.neuron_id_or_subaccount =
                    Some(NeuronIdOrSubaccount::Subaccount(vec![0; 32]));
            }
            782 => {
                managed.id = None;
                managed.neuron_id_or_subaccount = None;
            }
            _ => {}
        }
    }
    proposal
}

#[ic_cdk::query]
fn get_network_economics_parameters() -> NetworkEconomics {
    NetworkEconomics {
        neuron_management_fee_per_proposal_e8s: 100_000_000,
    }
}

#[ic_cdk::query]
fn get_proposal_info(id: u64) -> Option<ProposalInfo> {
    (777..=782).contains(&id).then(|| proposal_with_target(id))
}

// Production deliberately invokes this replicated read as an update so its
// caller-sensitive restricted-proposal filtering is consensus backed. Keeping
// the fixture method replicated also makes its request recording durable.
#[ic_cdk::update]
fn list_proposals(request: ListProposalInfoRequest) -> ListProposalInfoResponse {
    LIST_PROPOSAL_REQUESTS.with(|requests| requests.borrow_mut().push(request.clone()));
    let include_open = request.include_status.is_empty() || request.include_status.contains(&1);
    ListProposalInfoResponse {
        proposal_info: if include_open && request.limit > 0 {
            vec![open_proposal()]
        } else {
            vec![]
        },
    }
}

#[ic_cdk::query]
fn recorded_list_proposal_requests() -> Vec<ListProposalInfoRequest> {
    LIST_PROPOSAL_REQUESTS.with(|requests| requests.borrow().clone())
}

#[ic_cdk::update]
fn manage_neuron(request: ManageNeuronRequest) -> ManageNeuronResponse {
    MANAGE_REQUEST_BYTES.with(|requests| requests.borrow_mut().push(ic_cdk::api::msg_arg_data()));
    MANAGE_REQUESTS.with(|requests| requests.borrow_mut().push(request.clone()));
    let command = match request.command {
        Some(ManageNeuronCommandRequest::MakeProposal(_)) => {
            ManageNeuronResponseCommand::MakeProposal(MakeProposalResponse {
                message: None,
                proposal_id: Some(ProposalId { id: 777 }),
            })
        }
        Some(ManageNeuronCommandRequest::RegisterVote(_)) => {
            ManageNeuronResponseCommand::RegisterVote(Empty {})
        }
        Some(ManageNeuronCommandRequest::RefreshVotingPower(_)) => {
            ManageNeuronResponseCommand::RefreshVotingPower(Empty {})
        }
        Some(ManageNeuronCommandRequest::Follow(_)) | None => {
            ManageNeuronResponseCommand::Error(GovernanceError {
                error_message: "unsupported fixture command".into(),
                error_type: 3,
            })
        }
    };
    ManageNeuronResponse {
        command: Some(command),
    }
}

#[ic_cdk::query]
fn recorded_manage_requests() -> Vec<ManageNeuronRequest> {
    MANAGE_REQUESTS.with(|requests| requests.borrow().clone())
}

#[ic_cdk::query]
fn recorded_manage_request_bytes() -> Vec<Vec<u8>> {
    MANAGE_REQUEST_BYTES.with(|requests| requests.borrow().clone())
}
