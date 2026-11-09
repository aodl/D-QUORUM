//! Fixed destinations and typed commands only. No public generic call boundary.
use crate::model::{Following, State};
use candid::{CandidType, Deserialize, Nat, Principal, Reserved};
use ic_cdk::call::Call;
use ic_clients::{DissolveState, Followees, GovernanceError, NNS_GOVERNANCE, NeuronId};

pub const LEDGER: Principal = Principal::from_slice(&[0, 0, 0, 0, 0, 0, 0, 2, 1, 1]);
#[derive(CandidType, Deserialize)]
pub struct Account {
    pub owner: Principal,
    pub subaccount: Option<Vec<u8>>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct Neuron {
    pub id: Option<NeuronId>,
    pub account: Vec<u8>,
    pub controller: Option<Principal>,
    pub hot_keys: Vec<Principal>,
    pub not_for_profit: bool,
    pub visibility: Option<i32>,
    pub cached_neuron_stake_e8s: u64,
    pub neuron_fees_e8s: u64,
    pub dissolve_state: Option<DissolveState>,
    pub followees: Vec<(i32, Followees)>,
    pub voting_power_refreshed_timestamp_seconds: Option<u64>,
    pub potential_voting_power: Option<u64>,
    pub deciding_voting_power: Option<u64>,
}
#[derive(CandidType, Deserialize)]
struct Neurons {
    full_neurons: Vec<Neuron>,
}
pub async fn neuron(s: &State) -> Result<Option<Neuron>, String> {
    let request = ic_clients::ListNeurons {
        neuron_ids: s.neuron_id.into_iter().collect(),
        include_neurons_readable_by_caller: false,
        include_empty_neurons_readable_by_caller: Some(true),
        include_public_neurons_in_full_neurons: Some(true),
        page_number: Some(0),
        page_size: Some(2),
        neuron_subaccounts: Some(vec![ic_clients::NeuronSubaccount {
            subaccount: s.staking_subaccount.clone(),
        }]),
    };
    let response: Neurons = Call::unbounded_wait(NNS_GOVERNANCE, "list_neurons")
        .with_arg(request)
        .await
        .map_err(bounded)?
        .candid()
        .map_err(bounded)?;
    validate_neuron_response(s, response.full_neurons)
}

/// Keep untrusted wire-record validation independent of the fixed network call.
pub(crate) fn validate_neuron_response(
    s: &State,
    mut neurons: Vec<Neuron>,
) -> Result<Option<Neuron>, String> {
    if neurons.len() > 1 {
        return Err("Conflicting neuron binding".into());
    }
    let Some(n) = neurons.pop() else {
        return Ok(None);
    };
    if n.controller != Some(s.controller)
        || n.account != s.staking_subaccount
        || n.id
            .as_ref()
            .is_none_or(|id| id.id == 0 || s.neuron_id.is_some_and(|expected| expected != id.id))
        || n.hot_keys.len() > 10
        || n.followees.len() > 64
        || n.followees.iter().any(|(_, f)| f.followees.len() > 15)
    {
        return Err("Neuron controller, account, ID or bounds do not match creation".into());
    }
    let mut keys = std::collections::BTreeSet::new();
    if n.followees.iter().any(|(topic, _)| !keys.insert(*topic)) {
        return Err("Duplicate following topic".into());
    }
    Ok(Some(n))
}
pub fn bounded(error: impl std::fmt::Display) -> String {
    error.to_string().chars().take(512).collect()
}
pub async fn stake_balance(sub: Vec<u8>) -> Result<u64, String> {
    let value: Nat = Call::unbounded_wait(LEDGER, "icrc1_balance_of")
        .with_arg(Account {
            owner: NNS_GOVERNANCE,
            subaccount: Some(sub),
        })
        .await
        .map_err(bounded)?
        .candid()
        .map_err(bounded)?;
    u64::try_from(value.0).map_err(bounded)
}
#[derive(CandidType, Deserialize)]
pub struct Economics {
    pub neuron_minimum_stake_e8s: u64,
    pub transaction_fee_e8s: u64,
    pub voting_power_economics: Option<VotingEconomics>,
}
#[derive(CandidType, Deserialize)]
pub struct VotingEconomics {
    pub neuron_minimum_dissolve_delay_to_vote_seconds: Option<u64>,
}
impl Economics {
    pub fn minimum_voting_delay(&self) -> u64 {
        // Executable defaults of the qualified source, separate from Standard.
        // The browser verifies its exact deployed module before creation writes.
        match &self.voting_power_economics {
            None => 15_778_800,
            Some(p) => p
                .neuron_minimum_dissolve_delay_to_vote_seconds
                .unwrap_or(1_209_600),
        }
    }
}
pub async fn economics() -> Result<Economics, String> {
    Call::unbounded_wait(NNS_GOVERNANCE, "get_network_economics_parameters")
        .await
        .map_err(bounded)?
        .candid()
        .map_err(bounded)
}
#[derive(CandidType)]
pub struct MemoController {
    pub memo: u64,
    pub controller: Option<Principal>,
}
#[derive(CandidType)]
pub enum By {
    MemoAndController(MemoController),
}
#[derive(CandidType)]
pub struct Claim {
    pub by: Option<By>,
}
#[derive(CandidType)]
pub struct Configure {
    pub operation: Option<Operation>,
}
#[derive(CandidType)]
pub enum Operation {
    SetVisibility(Visibility),
    IncreaseDissolveDelay(Increase),
    StartDissolving(Empty),
}
#[derive(CandidType)]
pub struct Empty {}
#[derive(CandidType)]
pub struct Visibility {
    pub visibility: Option<i32>,
}
#[derive(CandidType)]
pub struct Increase {
    pub additional_dissolve_delay_seconds: u32,
}
#[derive(CandidType)]
pub struct Follow {
    pub topic: i32,
    pub followees: Vec<NeuronId>,
}
#[derive(CandidType)]
pub struct AccountIdentifier {
    pub hash: Vec<u8>,
}
#[derive(CandidType)]
pub struct Disburse {
    pub to_account: Option<AccountIdentifier>,
    pub amount: Option<Tokens>,
}
#[derive(CandidType, Deserialize)]
pub struct Tokens {
    pub e8s: u64,
}
#[derive(CandidType)]
pub enum Command {
    ClaimOrRefresh(Claim),
    Configure(Configure),
    Follow(Follow),
    RefreshVotingPower(Empty),
    Disburse(Disburse),
}
#[derive(CandidType)]
pub enum Id {
    NeuronId(NeuronId),
}
#[derive(CandidType)]
pub struct Manage {
    pub id: Option<NeuronId>,
    pub neuron_id_or_subaccount: Option<Id>,
    pub command: Option<Command>,
}
#[derive(CandidType, Deserialize)]
pub struct ClaimResponse {
    pub refreshed_neuron_id: Option<NeuronId>,
}
#[derive(CandidType, Deserialize)]
pub struct DisburseResponse {
    pub transfer_block_height: u64,
}
#[derive(CandidType, Deserialize)]
pub enum Response {
    Error(GovernanceError),
    ClaimOrRefresh(ClaimResponse),
    Configure(Reserved),
    Follow(Reserved),
    RefreshVotingPower(Reserved),
    Disburse(DisburseResponse),
    Spawn(Reserved),
    Split(Reserved),
    RegisterVote(Reserved),
    Merge(Reserved),
    DisburseToNeuron(Reserved),
    MakeProposal(Reserved),
    StakeMaturity(Reserved),
    MergeMaturity(Reserved),
    DisburseMaturity(Reserved),
    SetFollowing(Reserved),
}
#[derive(CandidType, Deserialize)]
pub struct ManageResponse {
    pub command: Option<Response>,
}
pub enum Failure {
    Known(String),
    Unknown(String),
}
pub async fn mutate(id: Option<u64>, command: Command) -> Result<Response, Failure> {
    let reply: ManageResponse = Call::unbounded_wait(NNS_GOVERNANCE, "manage_neuron")
        .with_arg(Manage {
            id: None,
            neuron_id_or_subaccount: id.map(|id| Id::NeuronId(NeuronId { id })),
            command: Some(command),
        })
        .await
        .map_err(|e| Failure::Unknown(bounded(e)))?
        .candid()
        .map_err(|e| Failure::Unknown(bounded(e)))?;
    match reply.command {
        Some(Response::Error(e)) => Err(Failure::Known(bounded(e.error_message))),
        Some(r) => Ok(r),
        None => Err(Failure::Unknown(
            "Governance response has no command".into(),
        )),
    }
}
pub fn following(n: &Neuron) -> Vec<Following> {
    n.followees
        .iter()
        .filter(|(_, f)| !f.followees.is_empty())
        .map(|(topic, f)| Following {
            topic: *topic,
            followees: f.followees.iter().map(|id| id.id).collect(),
        })
        .collect()
}
pub async fn managers(s: &State) -> Result<(), String> {
    let response = ic_clients::fetch_public_full_neurons(s.plan.managers.clone())
        .await
        .map_err(bounded)?;
    if response.full_neurons.len() != s.plan.managers.len() {
        return Err("Missing manager configuration".into());
    }
    let mut found = std::collections::BTreeSet::new();
    let mut owner_has_role = false;
    for n in response.full_neurons {
        let id = n.id.as_ref().ok_or("Manager ID unavailable")?.id;
        if !s.plan.managers.contains(&id)
            || !found.insert(id)
            || s.neuron_id == Some(id)
            || n.visibility != Some(2)
        {
            return Err("Unexpected, duplicate, private or self manager".into());
        }
        let info = ic_clients::fetch_known_neuron_info(id)
            .await
            .map_err(bounded)?;
        if info.known_neuron_data.is_none() || info.visibility != Some(2) {
            return Err("Manager is not a public known neuron".into());
        }
        owner_has_role |= n.controller == Some(s.plan.owner) || n.hot_keys.contains(&s.plan.owner);
        for f in &s.plan.following {
            if f.topic != 1
                && f.followees.contains(&id)
                && n.followees
                    .iter()
                    .find(|(t, _)| *t == f.topic)
                    .is_none_or(|(_, v)| {
                        v.followees.as_slice()
                            != [NeuronId {
                                id: dendrite_types::OMEGA_REJECT_NEURON_ID,
                            }]
                    })
            {
                return Err("Selected manager delegate is not following only omega-reject".into());
            }
        }
    }
    if !owner_has_role {
        return Err("Creator has no observed authority on any proposed manager".into());
    }
    Ok(())
}
#[derive(CandidType, Deserialize)]
pub struct Tally {
    pub yes: u64,
    pub no: u64,
    pub total: u64,
}
#[derive(CandidType, Deserialize)]
pub struct Rehearsal {
    pub status: i32,
    pub topic: i32,
    pub proposal_timestamp_seconds: u64,
    pub executed_timestamp_seconds: u64,
    pub latest_tally: Option<Tally>,
    pub proposal: Option<Proposal>,
}
#[derive(CandidType, Deserialize)]
pub struct Proposal {
    pub action: Option<Action>,
}
#[derive(CandidType, Deserialize)]
pub enum Action {
    ManageNeuron(Managed),
    RegisterKnownNeuron(Reserved),
    Motion(Reserved),
}
#[derive(CandidType, Deserialize)]
pub struct Managed {
    pub id: Option<NeuronId>,
    pub neuron_id_or_subaccount: Option<ReadId>,
    pub command: Option<RehearsalCommand>,
}
#[derive(CandidType, Deserialize)]
pub enum ReadId {
    NeuronId(NeuronId),
    Subaccount(Vec<u8>),
}
#[derive(CandidType, Deserialize)]
pub enum RehearsalCommand {
    RefreshVotingPower(Reserved),
    Follow(Reserved),
    Configure(Reserved),
}
#[derive(CandidType, Deserialize)]
struct ExternalRecord {
    status: i32,
    topic: i32,
    proposal_timestamp_seconds: u64,
    proposer: Option<NeuronId>,
    proposal: Option<ExternalPayload>,
}
#[derive(CandidType, Deserialize)]
struct ExternalPayload {
    summary: String,
    action: Option<ExternalAction>,
}
#[derive(CandidType, Deserialize)]
enum ExternalAction {
    ManageNeuron(Managed),
    RegisterKnownNeuron(RegistrationRead),
    Motion(Reserved),
}
#[derive(CandidType, Deserialize)]
struct RegistrationRead {
    id: Option<NeuronId>,
    known_neuron_data: Option<ic_clients::KnownNeuronData>,
}
pub async fn verify_external_proposal(s: &State, id: u64, terminal: bool) -> Result<(), String> {
    use crate::model::ProposalKind;
    let intent = s
        .external_proposal
        .as_ref()
        .ok_or("No original external proposal")?;
    let p: Option<ExternalRecord> = Call::unbounded_wait(NNS_GOVERNANCE, "get_proposal_info")
        .with_arg(id)
        .await
        .map_err(bounded)?
        .candid()
        .map_err(bounded)?;
    let p = p.ok_or("Original external proposal unavailable")?;
    if terminal && !matches!(p.status, 2 | 4 | 5) {
        return Err("Original proposal is still open or adopted without execution".into());
    }
    let payload = p.proposal.ok_or("Original proposal payload unavailable")?;
    let hex = |bytes: &[u8]| bytes.iter().map(|v| format!("{v:02x}")).collect::<String>();
    let marker = format!(
        "Dendrite creation {} operation {}",
        hex(&s.plan.creation_id),
        hex(&intent.intent_id)
    );
    if p.proposer.as_ref().map(|p| p.id) != Some(intent.proposer)
        || p.proposal_timestamp_seconds < intent.created_at
        || !payload.summary.contains(&marker)
        || payload.summary.len() > 5000
        || !(1..=5).contains(&p.status)
    {
        return Err("Proposal does not match its original reserved operation/proposer/time".into());
    }
    match (&intent.kind, payload.action) {
        (ProposalKind::Registration, Some(ExternalAction::RegisterKnownNeuron(r))) => {
            let expected = s
                .plan
                .metadata
                .as_ref()
                .ok_or("No reviewed registration metadata")?;
            let data = r
                .known_neuron_data
                .ok_or("Registration metadata unavailable")?;
            if p.topic != 4
                || r.id.as_ref().map(|id| id.id) != s.neuron_id
                || data.name != expected.name
                || data.description.as_deref().unwrap_or("") != expected.description
                || data.links.unwrap_or_default() != expected.links
            {
                return Err("Registration payload differs from the reviewed creation".into());
            }
        }
        (ProposalKind::Rehearsal, Some(ExternalAction::ManageNeuron(m))) => {
            let target = match m.neuron_id_or_subaccount {
                Some(ReadId::NeuronId(id)) => Some(id.id),
                None => m.id.map(|id| id.id),
                _ => None,
            };
            if p.topic != 1
                || target != s.neuron_id
                || !matches!(m.command, Some(RehearsalCommand::RefreshVotingPower(_)))
            {
                return Err("Reserved rehearsal is not the exact target's benign refresh".into());
            }
        }
        _ => return Err("Reserved proposal action differs from its fixed creation purpose".into()),
    }
    Ok(())
}
pub async fn rehearsal(s: &State, id: u64) -> Result<(), String> {
    let p: Option<Rehearsal> = Call::unbounded_wait(NNS_GOVERNANCE, "get_proposal_info")
        .with_arg(id)
        .await
        .map_err(bounded)?
        .candid()
        .map_err(bounded)?;
    validate_rehearsal_response(s, p)
}

pub(crate) fn validate_rehearsal_response(s: &State, p: Option<Rehearsal>) -> Result<(), String> {
    let p = p.ok_or("Rehearsal proposal unavailable")?;
    let tally = p.latest_tally.ok_or("Rehearsal tally unavailable")?;
    let Some(Action::ManageNeuron(m)) = p.proposal.and_then(|p| p.action) else {
        return Err("Rehearsal is not a management proposal".into());
    };
    let target = match m.neuron_id_or_subaccount {
        Some(ReadId::NeuronId(id)) => Some(id.id),
        Some(ReadId::Subaccount(_)) => None,
        None => m.id.map(|id| id.id),
    };
    if target != s.neuron_id
        || !matches!(m.command, Some(RehearsalCommand::RefreshVotingPower(_)))
        || p.status != 4
        || p.topic != 1
        || p.executed_timestamp_seconds == 0
        || s.rehearsal_started_at
            .is_none_or(|start| p.proposal_timestamp_seconds < start)
        || tally.total != s.plan.managers.len() as u64
        || tally.yes <= tally.total / 2
        || tally.no > tally.total
        || tally.yes > tally.total
        || tally.yes.saturating_add(tally.no) > tally.total
    {
        return Err(
            "Rehearsal target, command, execution, freshness or quorum does not match creation"
                .into(),
        );
    }
    // The authorised browser must additionally verify complete readable electorate
    // IDs. C cannot see other callers' filtered ballots and never claims it can.
    Ok(())
}
#[derive(CandidType, Deserialize)]
struct Blocks {
    start: u64,
    length: u64,
}
#[derive(CandidType, Deserialize)]
struct History {
    first_block_index: u64,
    blocks: Vec<Block>,
    archived_blocks: Vec<ArchivedRange>,
}
candid::define_function!(ArchiveCallback : (Blocks) -> (Result<ArchivedBlocks, Reserved>) query);
#[derive(CandidType, Deserialize)]
struct ArchivedRange {
    start: u64,
    length: u64,
    callback: ArchiveCallback,
}
#[derive(CandidType, Deserialize)]
struct ArchivedBlocks {
    blocks: Vec<Block>,
}
#[derive(CandidType, Deserialize)]
struct Block {
    transaction: Transaction,
    timestamp: Timestamp,
}
#[derive(CandidType, Deserialize)]
struct Timestamp {
    timestamp_nanos: u64,
}
#[derive(CandidType, Deserialize)]
struct Transaction {
    operation: Option<LedgerOperation>,
}
#[derive(CandidType, Deserialize)]
enum LedgerOperation {
    Transfer {
        from: Vec<u8>,
        to: Vec<u8>,
        amount: Tokens,
        fee: Tokens,
    },
    Mint(Reserved),
    Burn(Reserved),
    Approve(Reserved),
}
pub async fn verify_return(s: &State, block: u64) -> Result<(), String> {
    let mut h: History = Call::unbounded_wait(LEDGER, "query_blocks")
        .with_arg(Blocks {
            start: block,
            length: 1,
        })
        .await
        .map_err(bounded)?
        .candid()
        .map_err(bounded)?;
    // Only a callback endorsed by the fixed, replicated Ledger response is
    // accepted. The caller supplies a block index, never a destination/method.
    let returned = if h.first_block_index == block && h.blocks.len() == 1 {
        h.blocks.pop().unwrap()
    } else {
        if !h.blocks.is_empty() || h.archived_blocks.len() != 1 {
            return Err("Original return block is absent or ambiguous".into());
        }
        let range = h.archived_blocks.pop().unwrap();
        if block < range.start
            || block
                .checked_sub(range.start)
                .is_none_or(|n| n >= range.length)
            || range.callback.0.method != "get_blocks"
            || range.callback.0.principal == Principal::anonymous()
            || range.callback.0.principal == Principal::management_canister()
        {
            return Err("Ledger did not endorse this bounded archive callback".into());
        }
        let result: Result<ArchivedBlocks, Reserved> =
            Call::unbounded_wait(range.callback.0.principal, "get_blocks")
                .with_arg(Blocks {
                    start: block,
                    length: 1,
                })
                .await
                .map_err(bounded)?
                .candid()
                .map_err(bounded)?;
        let mut archived = result.map_err(|_| "Ledger archive rejected the original block")?;
        if archived.blocks.len() != 1 {
            return Err("Original archived return block unavailable".into());
        }
        archived.blocks.pop().unwrap()
    };
    let Some(LedgerOperation::Transfer {
        from,
        to,
        amount,
        fee,
    }) = &returned.transaction.operation
    else {
        return Err("Return was not a transfer".into());
    };
    if *from != crate::model::legacy_account(NNS_GOVERNANCE, &s.staking_subaccount)
        || *to != s.plan.return_account
        || Some(amount.e8s) != s.pending.as_ref().and_then(|p| p.expected_return_e8s)
        || Some(fee.e8s) != s.pending.as_ref().and_then(|p| p.expected_return_fee_e8s)
        || s.pending
            .as_ref()
            .is_none_or(|p| returned.timestamp.timestamp_nanos < p.dispatched_at)
    {
        return Err("Return block does not match the original disbursement intent".into());
    }
    Ok(())
}
