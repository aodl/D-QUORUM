use crate::{GOVERNANCE, call, no_args};
use candid::{CandidType, Deserialize, Principal, Reserved};
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct NeuronId {
    pub id: u64,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct Followees {
    pub followees: Vec<NeuronId>,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct KnownNeuronData {
    pub name: String,
    pub description: Option<String>,
    pub links: Option<Vec<String>>,
    // Descriptive metadata only. Decode entries opaquely so a future Governance
    // variant cannot break the live response; following-map keys are authoritative.
    pub committed_topics: Option<Vec<Option<Reserved>>>,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub enum DissolveState {
    DissolveDelaySeconds(u64),
    WhenDissolvedTimestampSeconds(u64),
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct Neuron {
    pub account: Vec<u8>,
    pub maturity_disbursements_in_progress: Option<Vec<MaturityDisbursement>>,
    pub id: Option<NeuronId>,
    pub staked_maturity_e8s_equivalent: Option<u64>,
    pub controller: Option<Principal>,
    pub not_for_profit: bool,
    pub maturity_e8s_equivalent: u64,
    pub cached_neuron_stake_e8s: u64,
    pub created_timestamp_seconds: u64,
    pub auto_stake_maturity: Option<bool>,
    pub aging_since_timestamp_seconds: u64,
    pub hot_keys: Vec<Principal>,
    pub dissolve_state: Option<DissolveState>,
    pub followees: Vec<(i32, Followees)>,
    pub neuron_fees_e8s: u64,
    pub visibility: Option<i32>,
    pub known_neuron_data: Option<KnownNeuronData>,
    pub voting_power_refreshed_timestamp_seconds: Option<u64>,
    pub deciding_voting_power: Option<u64>,
    pub potential_voting_power: Option<u64>,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct ListNeurons {
    pub neuron_ids: Vec<u64>,
    pub include_neurons_readable_by_caller: bool,
    pub include_empty_neurons_readable_by_caller: Option<bool>,
    pub include_public_neurons_in_full_neurons: Option<bool>,
    pub page_number: Option<u64>,
    pub page_size: Option<u64>,
    pub neuron_subaccounts: Option<Vec<NeuronSubaccount>>,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct NeuronSubaccount {
    pub subaccount: Vec<u8>,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct NeuronInfo {
    pub id: Option<NeuronId>,
    pub retrieved_at_timestamp_seconds: u64,
    pub known_neuron_data: Option<KnownNeuronData>,
    pub visibility: Option<i32>,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct GovernanceError {
    pub error_message: String,
    pub error_type: i32,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct ListNeuronsResponse {
    pub neuron_infos: Vec<(u64, NeuronInfo)>,
    pub full_neurons: Vec<Neuron>,
    pub total_pages_available: Option<u64>,
}
#[derive(Clone, Debug, CandidType, Eq, PartialEq)]
pub struct CanisterInfoRequest {
    pub canister_id: Principal,
    pub num_requested_changes: Option<u64>,
}
#[derive(Clone, Debug, CandidType, Deserialize, Eq, PartialEq)]
pub struct CanisterInfoResponse {
    pub total_num_changes: u64,
    pub recent_changes: Vec<Reserved>,
    pub module_hash: Option<Vec<u8>>,
    pub controllers: Vec<Principal>,
}

#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct Account {
    pub owner: Option<Principal>,
    pub subaccount: Option<Vec<u8>>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct AccountIdentifier {
    pub hash: Vec<u8>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct MaturityDisbursement {
    pub amount_e8s: Option<u64>,
    pub timestamp_of_disbursement_seconds: Option<u64>,
    pub finalize_disbursement_timestamp_seconds: Option<u64>,
    pub account_to_disburse_to: Option<Account>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct KnownNeuron {
    pub id: Option<NeuronId>,
    pub known_neuron_data: Option<KnownNeuronData>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct KnownResponse {
    pub known_neurons: Vec<KnownNeuron>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct IndexRequest {
    pub exclusive_start_neuron_id: Option<NeuronId>,
    pub page_size: Option<u32>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct IndexPage {
    pub neurons: Vec<NeuronInfo>,
}
pub async fn known() -> Result<Vec<KnownNeuron>, String> {
    let r: KnownResponse = no_args(GOVERNANCE, "list_known_neurons").await?;
    if r.known_neurons.len() > 10_000 {
        return Err("known-neuron bound exceeded".into());
    }
    let mut seen = std::collections::BTreeSet::new();
    for n in &r.known_neurons {
        let id = n.id.as_ref().map_or(0, |n| n.id);
        if id == 0
            || !seen.insert(id)
            || n.known_neuron_data
                .as_ref()
                .is_none_or(|m| !valid_metadata(m))
        {
            return Err("invalid known-neuron discovery".into());
        }
    }
    Ok(r.known_neurons)
}
pub async fn index(cursor: Option<u64>) -> Result<Vec<NeuronInfo>, String> {
    let r: Result<IndexPage, GovernanceError> = call(
        GOVERNANCE,
        "get_neuron_index",
        IndexRequest {
            exclusive_start_neuron_id: cursor.map(|id| NeuronId { id }),
            page_size: Some(100),
        },
    )
    .await?;
    let ns = r.map_err(|e| crate::bounded(e.error_message))?.neurons;
    validate_index(cursor, &ns)?;
    Ok(ns)
}
pub fn validate_index(cursor: Option<u64>, ns: &[NeuronInfo]) -> Result<(), String> {
    if ns.len() > 100 {
        return Err("index page exceeds bound".into());
    }
    let mut last = cursor.unwrap_or(0);
    for n in ns {
        let id = n.id.as_ref().map_or(0, |n| n.id);
        if id <= last
            || n.retrieved_at_timestamp_seconds == 0
            || !matches!(n.visibility, Some(1 | 2))
        {
            return Err("index identity, visibility, timestamp or cursor is invalid".into());
        }
        last = id;
    }
    Ok(())
}
pub fn valid_metadata(m: &KnownNeuronData) -> bool {
    m.name.len() <= 200
        && m.description.as_ref().is_none_or(|s| s.len() <= 3000)
        && m.links
            .as_ref()
            .is_none_or(|xs| xs.len() <= 10 && xs.iter().all(|s| s.len() <= 100))
        && m.committed_topics.as_ref().is_none_or(|xs| xs.len() <= 64)
}
pub fn validate_batch(ids: &[u64], r: &ListNeuronsResponse) -> Result<(), String> {
    use std::collections::BTreeSet;
    if ids.is_empty()
        || ids.len() > 50
        || ids.contains(&0)
        || ids.iter().collect::<BTreeSet<_>>().len() != ids.len()
        || r.total_pages_available != Some(1)
        || r.full_neurons.len() > ids.len()
        || r.neuron_infos.len() > ids.len()
    {
        return Err("full-neuron batch bounds or page count".into());
    }
    let mut infos = BTreeSet::new();
    for (id, i) in &r.neuron_infos {
        if !ids.contains(id)
            || !infos.insert(id)
            || i.id.as_ref().map(|n| n.id) != Some(*id)
            || i.retrieved_at_timestamp_seconds == 0
        {
            return Err("invalid neuron-info binding".into());
        }
    }
    let mut seen = BTreeSet::new();
    for n in &r.full_neurons {
        let id = n.id.as_ref().map_or(0, |n| n.id);
        let mut topics = BTreeSet::new();
        if !ids.contains(&id)
            || !seen.insert(id)
            || !infos.contains(&id)
            || n.account.len() != 32
            || n.hot_keys.len() > 10
            || n.followees.len() > 64
            || n.followees.iter().any(|(t, fs)| {
                !topics.insert(*t)
                    || fs.followees.len() > 15
                    || fs.followees.iter().any(|x| x.id == 0)
            })
            || n.known_neuron_data
                .as_ref()
                .is_some_and(|m| !valid_metadata(m))
            || !matches!(n.visibility, Some(1 | 2))
            || n.cached_neuron_stake_e8s
                .checked_sub(n.neuron_fees_e8s)
                .and_then(|s| s.checked_add(n.staked_maturity_e8s_equivalent.unwrap_or(0)))
                .is_none()
            || n.deciding_voting_power
                .zip(n.potential_voting_power)
                .is_none_or(|(d, p)| d > p)
            || n.maturity_disbursements_in_progress
                .as_ref()
                .is_some_and(|xs| xs.len() > 10)
        {
            return Err("invalid full-neuron record".into());
        }
        let at = r
            .neuron_infos
            .iter()
            .find(|(i, _)| *i == id)
            .unwrap()
            .1
            .retrieved_at_timestamp_seconds;
        if n.voting_power_refreshed_timestamp_seconds
            .is_some_and(|t| t > at)
        {
            return Err("voting refresh after observation".into());
        }
    }
    Ok(())
}
pub async fn full(ids: Vec<u64>) -> Result<ListNeuronsResponse, String> {
    let r = call(
        GOVERNANCE,
        "list_neurons",
        ListNeurons {
            neuron_ids: ids.clone(),
            include_neurons_readable_by_caller: false,
            include_empty_neurons_readable_by_caller: Some(false),
            include_public_neurons_in_full_neurons: Some(true),
            page_number: Some(0),
            page_size: Some(50),
            neuron_subaccounts: None,
        },
    )
    .await?;
    validate_batch(&ids, &r)?;
    Ok(r)
}
pub async fn info(id: u64) -> Result<NeuronInfo, String> {
    let r: Result<NeuronInfo, GovernanceError> = call(GOVERNANCE, "get_neuron_info", id).await?;
    let n = r.map_err(|e| crate::bounded(e.error_message))?;
    if n.id.as_ref().map(|n| n.id) != Some(id)
        || n.retrieved_at_timestamp_seconds == 0
        || n.known_neuron_data
            .as_ref()
            .is_some_and(|m| !valid_metadata(m))
    {
        return Err("invalid metadata response".into());
    }
    Ok(n)
}
pub async fn controller(id: Principal) -> Result<CanisterInfoResponse, String> {
    let r: CanisterInfoResponse = call(
        Principal::management_canister(),
        "canister_info",
        CanisterInfoRequest {
            canister_id: id,
            num_requested_changes: Some(0),
        },
    )
    .await?;
    if !r.recent_changes.is_empty()
        || r.controllers.len() > 10
        || r.module_hash.as_ref().is_some_and(|v| v.len() != 32)
    {
        return Err("invalid controller state".into());
    }
    Ok(r)
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct Empty {}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub enum By {
    MemoAndController(MemoController),
    NeuronIdOrSubaccount(Empty),
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct MemoController {
    pub memo: u64,
    pub controller: Option<Principal>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct Claim {
    pub by: Option<By>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub enum Id {
    NeuronId(NeuronId),
    Subaccount(Vec<u8>),
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct SetFollowing {
    pub topic_following: Option<Vec<Following>>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct Following {
    pub topic: Option<i32>,
    pub followees: Option<Vec<NeuronId>>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct DisburseMaturity {
    pub percentage_to_disburse: u32,
    pub to_account: Option<Account>,
    pub to_account_identifier: Option<AccountIdentifier>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct MakeProposal {
    pub url: String,
    pub title: Option<String>,
    pub summary: String,
    pub action: Option<ActionRequest>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub enum ActionRequest {
    ManageNeuron(Box<ManageRequest>),
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub enum Command {
    ClaimOrRefresh(Claim),
    SetFollowing(SetFollowing),
    RefreshVotingPower(Empty),
    MakeProposal(Box<MakeProposal>),
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct ManageRequest {
    pub id: Option<NeuronId>,
    pub neuron_id_or_subaccount: Option<Id>,
    pub command: Option<Command>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct ClaimResponse {
    pub refreshed_neuron_id: Option<NeuronId>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct ProposalResponse {
    pub proposal_id: Option<NeuronId>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub enum ResponseCommand {
    Error(GovernanceError),
    ClaimOrRefresh(ClaimResponse),
    SetFollowing(Empty),
    RefreshVotingPower(Empty),
    MakeProposal(ProposalResponse),
    Spawn(Reserved),
    Split(Reserved),
    Follow(Reserved),
    Configure(Reserved),
    RegisterVote(Reserved),
    Merge(Reserved),
    DisburseToNeuron(Reserved),
    StakeMaturity(Reserved),
    MergeMaturity(Reserved),
    Disburse(Reserved),
    DisburseMaturity(Reserved),
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct ManageResponse {
    pub command: Option<ResponseCommand>,
}
pub async fn manage(request: ManageRequest) -> Result<ResponseCommand, String> {
    let expected = match &request.command {
        Some(Command::ClaimOrRefresh(_)) => 0,
        Some(Command::SetFollowing(_)) => 1,
        Some(Command::RefreshVotingPower(_)) => 2,
        Some(Command::MakeProposal(_)) => 3,
        None => return Err("missing command".into()),
    };
    let r: ManageResponse = call(GOVERNANCE, "manage_neuron", request).await?;
    validate_manage_response(expected, r)
}
fn validate_manage_response(expected: u8, r: ManageResponse) -> Result<ResponseCommand, String> {
    match r.command {
        Some(ResponseCommand::Error(e)) => Err(crate::bounded(format!(
            "Governance {}: {}",
            e.error_type, e.error_message
        ))),
        Some(x)
            if matches!(
                (expected, &x),
                (0, ResponseCommand::ClaimOrRefresh(_))
                    | (1, ResponseCommand::SetFollowing(_))
                    | (2, ResponseCommand::RefreshVotingPower(_))
                    | (3, ResponseCommand::MakeProposal(_))
            ) =>
        {
            Ok(x)
        }
        Some(_) => Err("unexpected Governance response variant".into()),
        None => Err("empty manage response".into()),
    }
}
pub fn request(id: u64, command: Command) -> ManageRequest {
    ManageRequest {
        id: None,
        neuron_id_or_subaccount: Some(Id::NeuronId(NeuronId { id })),
        command: Some(command),
    }
}
// Proposal payload uses a separate restricted wire type; no direct DisburseMaturity command is in Command.
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct MaturityProposal {
    pub url: String,
    pub title: Option<String>,
    pub summary: String,
    pub action: Option<MaturityAction>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub enum MaturityAction {
    ManageNeuron(ManagedMaturity),
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub struct ManagedMaturity {
    pub id: Option<NeuronId>,
    pub neuron_id_or_subaccount: Option<Id>,
    pub command: Option<MaturityCommand>,
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub enum MaturityCommand {
    DisburseMaturity(DisburseMaturity),
}
#[derive(CandidType)]
struct ProposalRequest {
    id: Option<NeuronId>,
    neuron_id_or_subaccount: Option<Id>,
    command: Option<ProposalCommand>,
}
#[derive(CandidType)]
enum ProposalCommand {
    MakeProposal(MaturityProposal),
}
pub async fn propose(proposer: u64, p: MaturityProposal) -> Result<ResponseCommand, String> {
    let r: ManageResponse = call(
        GOVERNANCE,
        "manage_neuron",
        ProposalRequest {
            id: None,
            neuron_id_or_subaccount: Some(Id::NeuronId(NeuronId { id: proposer })),
            command: Some(ProposalCommand::MakeProposal(p)),
        },
    )
    .await?;
    match r.command {
        Some(x) => Ok(x),
        None => Err("empty proposal response".into()),
    }
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct Economics {
    pub neuron_minimum_stake_e8s: u64,
    pub neuron_management_fee_per_proposal_e8s: u64,
}
pub async fn economics() -> Result<Economics, String> {
    no_args(GOVERNANCE, "get_network_economics_parameters").await
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct ProposalInfo {
    pub id: Option<NeuronId>,
    pub status: i32,
    pub proposer: Option<NeuronId>,
    pub proposal: Option<StoredProposal>,
    pub proposal_timestamp_seconds: u64,
    pub executed_timestamp_seconds: u64,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct StoredProposal {
    pub url: String,
    pub title: Option<String>,
    pub summary: String,
    pub action: Option<StoredAction>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct StoredManaged {
    pub id: Option<NeuronId>,
    pub neuron_id_or_subaccount: Option<Id>,
    pub command: Option<StoredCommand>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub enum StoredAction {
    ManageNeuron(StoredManaged),
    RegisterKnownNeuron(Reserved),
    DeregisterKnownNeuron(Reserved),
    UpdateCanisterSettings(Reserved),
    InstallCode(Reserved),
    StopOrStartCanister(Reserved),
    CreateServiceNervousSystem(Reserved),
    ExecuteNnsFunction(Reserved),
    RewardNodeProvider(Reserved),
    OpenSnsTokenSwap(Reserved),
    SetSnsTokenSwapOpenTimeWindow(Reserved),
    SetDefaultFollowees(Reserved),
    RewardNodeProviders(Reserved),
    ManageNetworkEconomics(Reserved),
    ApproveGenesisKyc(Reserved),
    AddOrRemoveNodeProvider(Reserved),
    Motion(Reserved),
    FulfillSubnetRentalRequest(Reserved),
    BlessAlternativeGuestOsVersion(Reserved),
    TakeCanisterSnapshot(Reserved),
    LoadCanisterSnapshot(Reserved),
    CreateCanisterAndInstallCode(Reserved),
    UpdateStandardEngineReplicaVersion(Reserved),
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub enum StoredCommand {
    DisburseMaturity(DisburseMaturity),
    Spawn(Reserved),
    Split(Reserved),
    Follow(Reserved),
    ClaimOrRefresh(Reserved),
    Configure(Reserved),
    RegisterVote(Reserved),
    Merge(Reserved),
    DisburseToNeuron(Reserved),
    MakeProposal(Reserved),
    StakeMaturity(Reserved),
    MergeMaturity(Reserved),
    Disburse(Reserved),
    RefreshVotingPower(Reserved),
    SetFollowing(Reserved),
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct ListProposals {
    pub include_reward_status: Vec<i32>,
    pub omit_large_fields: Option<bool>,
    pub before_proposal: Option<NeuronId>,
    pub limit: u32,
    pub exclude_topic: Vec<i32>,
    pub include_all_manage_neuron_proposals: Option<bool>,
    pub include_status: Vec<i32>,
    pub return_self_describing_action: Option<bool>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct Proposals {
    pub proposal_info: Vec<ProposalInfo>,
}
pub async fn proposals(before: Option<u64>) -> Result<Vec<ProposalInfo>, String> {
    let r: Proposals = call(
        GOVERNANCE,
        "list_proposals",
        ListProposals {
            include_reward_status: vec![],
            omit_large_fields: Some(false),
            before_proposal: before.map(|id| NeuronId { id }),
            limit: 100,
            exclude_topic: vec![],
            include_all_manage_neuron_proposals: Some(true),
            include_status: vec![],
            return_self_describing_action: Some(false),
        },
    )
    .await?;
    if r.proposal_info.len() > 100 {
        return Err("proposal history bound".into());
    }
    let mut last = before.unwrap_or(u64::MAX);
    for p in &r.proposal_info {
        validate_proposal(p)?;
        let id = p.id.as_ref().map_or(0, |n| n.id);
        if id == 0
            || id >= last
            || p.proposal
                .as_ref()
                .is_some_and(|p| p.summary.len() > 100_000)
        {
            return Err("proposal history cursor or size".into());
        }
        last = id;
    }
    Ok(r.proposal_info)
}
pub async fn proposal(id: u64) -> Result<Option<ProposalInfo>, String> {
    let p: Option<ProposalInfo> = call(GOVERNANCE, "get_proposal_info", id).await?;
    if let Some(p) = &p {
        validate_proposal(p)?;
        if p.id.as_ref().map(|n| n.id) != Some(id) {
            return Err("proposal identity mismatch".into());
        }
    }
    Ok(p)
}
fn validate_proposal(p: &ProposalInfo) -> Result<(), String> {
    if p.proposal.as_ref().is_none_or(|p| p.action.is_none()) {
        return Err("proposal action unavailable or unknown protocol variant".into());
    }
    if matches!(p.proposal.as_ref().and_then(|p|p.action.as_ref()),Some(StoredAction::ManageNeuron(m)) if m.command.is_none())
    {
        return Err("management command unavailable or unknown protocol variant".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn info(id: u64) -> NeuronInfo {
        NeuronInfo {
            id: Some(NeuronId { id }),
            retrieved_at_timestamp_seconds: 1,
            known_neuron_data: None,
            visibility: Some(2),
        }
    }
    #[test]
    fn index_duplicates_and_nonprogress_are_rejected() {
        assert!(validate_index(None, &[info(1), info(1)]).is_err());
        assert!(validate_index(Some(2), &[info(2)]).is_err());
        assert!(validate_index(None, &[info(0)]).is_err());
        assert!(validate_index(None, &[info(1), info(2)]).is_ok());
    }
    #[test]
    fn unknown_and_mismatched_manage_responses_fail_closed() {
        assert!(
            validate_manage_response(
                1,
                ManageResponse {
                    command: Some(ResponseCommand::RefreshVotingPower(Empty {}))
                }
            )
            .is_err()
        );
        assert!(validate_manage_response(0, ManageResponse { command: None }).is_err());
        assert!(
            validate_manage_response(
                1,
                ManageResponse {
                    command: Some(ResponseCommand::SetFollowing(Empty {}))
                }
            )
            .is_ok()
        );
    }
    #[test]
    fn unknown_stored_actions_cannot_be_interpreted_as_absence() {
        let p = ProposalInfo {
            id: Some(NeuronId { id: 1 }),
            status: 1,
            proposer: Some(NeuronId { id: 2 }),
            proposal: Some(StoredProposal {
                url: "https://forum.dfinity.org".into(),
                title: None,
                summary: String::new(),
                action: None,
            }),
            proposal_timestamp_seconds: 1,
            executed_timestamp_seconds: 0,
        };
        assert!(validate_proposal(&p).is_err());
    }
}
