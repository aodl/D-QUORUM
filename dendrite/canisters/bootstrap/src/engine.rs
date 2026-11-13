use crate::{
    model::*,
    protocol::{self, Command, Empty, Failure, Neuron, Operation, Response},
};
use ic_clients::{DissolveState, NeuronId};

// This internal typed test seam has no public transport or arbitrary destination.
// Its production implementation calls only the fixed protocol adapters below.
pub(crate) trait CreationClient {
    fn now(&self) -> u64;
    fn checkpoint(&self, state: &State);
    async fn neuron(&self, state: &State) -> Result<Option<Neuron>, String>;
    async fn stake_balance(&self, sub: Vec<u8>) -> Result<u64, String>;
    async fn economics(&self) -> Result<protocol::Economics, String>;
    async fn managers(&self, state: &State) -> Result<(), String>;
    async fn mutate(&self, id: Option<u64>, command: Command) -> Result<Response, Failure>;
    async fn known(&self, id: u64) -> Result<ic_clients::NeuronInfo, String>;
    async fn system(
        &self,
        id: candid::Principal,
    ) -> Result<ic_clients::CanisterInfoResponse, String>;
    async fn rehearsal(&self, state: &State, id: u64) -> Result<(), String>;
    async fn verify_return(&self, state: &State, block: u64) -> Result<(), String>;
    async fn verify_external_proposal(
        &self,
        state: &State,
        id: u64,
        terminal: bool,
    ) -> Result<(), String>;
}
pub(crate) struct Replica;
impl CreationClient for Replica {
    fn now(&self) -> u64 {
        ic_cdk::api::time() / 1_000_000_000
    }
    fn checkpoint(&self, s: &State) {
        crate::save(s);
    }
    async fn neuron(&self, s: &State) -> Result<Option<Neuron>, String> {
        protocol::neuron(s).await
    }
    async fn stake_balance(&self, sub: Vec<u8>) -> Result<u64, String> {
        protocol::stake_balance(sub).await
    }
    async fn economics(&self) -> Result<protocol::Economics, String> {
        protocol::economics().await
    }
    async fn managers(&self, s: &State) -> Result<(), String> {
        protocol::managers(s).await
    }
    async fn mutate(&self, id: Option<u64>, cmd: Command) -> Result<Response, Failure> {
        protocol::mutate(id, cmd).await
    }
    async fn known(&self, id: u64) -> Result<ic_clients::NeuronInfo, String> {
        ic_clients::fetch_known_neuron_info(id)
            .await
            .map_err(protocol::bounded)
    }
    async fn system(
        &self,
        id: candid::Principal,
    ) -> Result<ic_clients::CanisterInfoResponse, String> {
        ic_clients::inspect_controller_canister(id)
            .await
            .map_err(protocol::bounded)
    }
    async fn rehearsal(&self, s: &State, id: u64) -> Result<(), String> {
        protocol::rehearsal(s, id).await
    }
    async fn verify_return(&self, s: &State, block: u64) -> Result<(), String> {
        protocol::verify_return(s, block).await
    }
    async fn verify_external_proposal(
        &self,
        s: &State,
        id: u64,
        terminal: bool,
    ) -> Result<(), String> {
        protocol::verify_external_proposal(s, id, terminal).await
    }
}

fn effect(client: &impl CreationClient, s: &mut State, value: Effect) {
    s.pending.as_mut().expect("admitted operation").effect = Some(value);
    client.checkpoint(s);
}
async fn send(
    client: &impl CreationClient,
    s: &mut State,
    cmd: Command,
) -> Result<Response, String> {
    match client.mutate(s.neuron_id, cmd).await {
        Ok(reply) => Ok(reply),
        Err(Failure::Known(message)) => {
            // Only the adapter's audited pre-dispatch errors prove no effect.
            s.pending.as_mut().expect("admitted operation").effect = None;
            Err(format!("Governance rejected the exact request: {message}"))
        }
        Err(Failure::Unknown(message)) => Err(format!(
            "Unresolved Governance outcome; reconcile original operation: {message}"
        )),
    }
}
fn secure_target(s: &State, n: &Neuron) -> Result<u64, String> {
    let id = n.id.as_ref().ok_or("Target ID unavailable")?.id;
    if s.plan.managers.contains(&id) || !n.hot_keys.is_empty() || n.not_for_profit {
        return Err(
            "Target has self-management, hotkeys or incompatible not_for_profit setting".into(),
        );
    }
    if n.cached_neuron_stake_e8s != s.plan.stake_e8s {
        return Err(
            "Observed stake differs from reviewed amount; review underpayment or extra funding"
                .into(),
        );
    }
    Ok(id)
}
fn exact_following(s: &State, n: &Neuron) -> bool {
    let canonical = |fs: Vec<Following>| {
        fs.into_iter()
            .filter(|f| !f.followees.is_empty())
            .map(|f| (f.topic, f.followees))
            .collect::<std::collections::BTreeMap<_, _>>()
    };
    canonical(protocol::following(n)) == canonical(s.plan.following.clone())
}
fn delay(n: &Neuron, current_time: u64) -> Result<u64, String> {
    match n.dissolve_state {
        Some(DissolveState::DissolveDelaySeconds(value)) => Ok(value),
        Some(DissolveState::WhenDissolvedTimestampSeconds(at)) if at <= current_time => Ok(0),
        _ => Err("Neuron is dissolving or its lock state is unavailable".into()),
    }
}
fn after_configuration(s: &mut State) {
    s.phase = if s.plan.profile == Profile::RecoverableTest {
        Phase::RecoverableTestReady
    } else {
        Phase::AwaitingRegistration
    };
}
async fn configured(client: &impl CreationClient, s: &State, n: &Neuron) -> Result<(), String> {
    secure_target(s, n)?;
    if n.visibility != Some(2)
        || !exact_following(s, n)
        || delay(n, client.now())? != s.plan.lock_seconds
    {
        return Err("Actual configuration does not match the reviewed plan".into());
    }
    client.managers(s).await
}
pub(crate) async fn perform(
    client: &impl CreationClient,
    s: &mut State,
    step: Step,
) -> Result<(), String> {
    if step == Step::Unseal {
        if s.phase != Phase::Sealed {
            return Err("Only a sealed, still-installed bootstrap may unseal".into());
        }
        let system = client.system(s.controller).await?;
        if s.sealed_controller_changes
            .is_none_or(|changes| system.total_num_changes <= changes)
            || system.module_hash.as_deref() != Some(s.bound_module())
            || system.controllers != [s.plan.owner]
        {
            return Err("Explicit controller history change required before unsealing; the approved same-code upgrade invalidates old sealed provenance".into());
        }
        s.rehearsal_started_at = None;
        s.rehearsal_proposal = None;
        s.sealed_controller_changes = None;
        s.phase = Phase::AwaitingRegistration;
        return Ok(());
    }
    if let Step::ReconcileDisbursement(block) = step {
        if !matches!(
            s.pending.as_ref().map(|p| &p.step),
            Some(Step::Disburse { .. })
        ) {
            return Err("No original disbursement intent".into());
        }
        client.verify_return(s, block).await?;
        s.disbursement_block = Some(block);
        s.phase = Phase::Recovered;
        return Ok(());
    }
    if let Step::ResolveProposal(id) = step {
        let current = s
            .external_proposal
            .as_ref()
            .ok_or("No original external proposal reservation")?;
        if current.proposal_id.is_some_and(|original| original != id) {
            return Err("External proposal ID substitution".into());
        }
        client.verify_external_proposal(s, id, false).await?;
        s.external_proposal.as_mut().unwrap().proposal_id = Some(id);
        return Ok(());
    }
    if let Step::MarkProposalDispatched(id) = &step {
        let intent = s
            .external_proposal
            .as_mut()
            .ok_or("No reserved external proposal")?;
        if intent.intent_id != *id || intent.dispatched || intent.proposal_id.is_some() {
            return Err(
                "The original proposal dispatch is already owned or resolved; never submit again"
                    .into(),
            );
        }
        intent.dispatched = true;
        return Ok(());
    }
    if let Step::ResolveProposalRefusal(proof) = &step {
        let audit =
            crate::proposal_refusal::verify(s, proof, client.now().saturating_mul(1_000_000_000))?;
        let history = s.proposal_refusals.get_or_insert_with(Vec::new);
        if history.len() == 16 {
            history.remove(0);
        }
        history.push(audit);
        s.external_proposal = None;
        return Ok(());
    }
    if let Step::CancelReservedProposal(id) = &step {
        let intent = s
            .external_proposal
            .as_ref()
            .ok_or("No reserved external proposal")?;
        if intent.intent_id != *id || intent.dispatched || intent.proposal_id.is_some() {
            return Err("A dispatched or resolved proposal cannot be cancelled as unsent".into());
        }
        s.external_proposal = None;
        return Ok(());
    }
    if step == Step::Claim {
        let balance = client.stake_balance(s.staking_subaccount.clone()).await?;
        let economics = client.economics().await?;
        if balance != s.plan.stake_e8s || balance < economics.neuron_minimum_stake_e8s {
            return Err(
                "Stake underpayment, overpayment or current minimum mismatch; no claim dispatched"
                    .into(),
            );
        }
        client.managers(s).await?;
        if let Some(n) = client.neuron(s).await? {
            if s.neuron_id.is_none()
                && !matches!(
                    s.pending.as_ref().and_then(|p| p.effect.as_ref()),
                    Some(Effect::Claim)
                )
            {
                return Err("Existing neuron has no original dispatched claim intent; do not adopt a fresh creation onto it".into());
            }
            let id = secure_target(s, &n)?;
            s.neuron_id = Some(id);
            s.phase = Phase::Configuring;
            return Ok(());
        }
        if s.neuron_id.is_some() {
            return Err("Previously bound neuron is unavailable; never claim a replacement".into());
        }
        effect(client, s, Effect::Claim);
        let response = send(
            client,
            s,
            Command::ClaimOrRefresh(protocol::Claim {
                by: Some(protocol::By::MemoAndController(protocol::MemoController {
                    memo: s.plan.nonce,
                    controller: Some(s.controller),
                })),
            }),
        )
        .await?;
        let Response::ClaimOrRefresh(reply) = response else {
            return Err("Unexpected claim response; preserve original intent".into());
        };
        s.neuron_id = Some(
            reply
                .refreshed_neuron_id
                .ok_or("Claim omitted neuron ID")?
                .id,
        );
        client.checkpoint(s);
        let n = client
            .neuron(s)
            .await?
            .ok_or("Claimed neuron is unavailable")?;
        secure_target(s, &n)?;
        s.phase = Phase::Configuring;
        return Ok(());
    }
    let mut n = client
        .neuron(s)
        .await?
        .ok_or("Bound neuron is unavailable")?;
    if s.neuron_id.is_none() {
        return Err("Reconcile the original claim first".into());
    }
    secure_target(s, &n)?;
    match step {
        Step::ReserveProposal(mut intent) => {
            configured(client, s, &n).await?;
            if intent.revision != s.plan.revision
                || intent.proposer == 0
                || intent.intent_id.len() != 32
                || intent.request_digest.len() != 32
                || intent.request_id.as_ref().is_some_and(|id| id.len() != 32)
                || intent.proposal_id.is_some()
                || intent.dispatched
            {
                return Err("Invalid external proposal reservation".into());
            }
            let permitted = match intent.kind {
                ProposalKind::Registration => {
                    s.plan.profile == Profile::ProductionCandidate
                        && s.phase == Phase::AwaitingRegistration
                        && s.plan.metadata.is_some()
                }
                ProposalKind::Rehearsal => {
                    s.plan.managers.contains(&intent.proposer)
                        && (s.phase == Phase::Rehearsing || s.phase == Phase::RecoverableTestReady)
                }
            };
            if !permitted {
                return Err("Proposal is outside the reviewed creation phase/profile".into());
            }
            if let Some(existing) = &s.external_proposal {
                if existing.intent_id == intent.intent_id
                    && existing.request_digest == intent.request_digest
                    && existing.request_id == intent.request_id
                    && existing.proposer == intent.proposer
                    && existing.kind == intent.kind
                {
                    return Ok(());
                }
                return Err(
                    "Reconcile the original external proposal before another submission".into(),
                );
            }
            intent.created_at = client.now();
            s.external_proposal = Some(intent);
        }
        Step::Configure => {
            if let Some(Effect::Following(f)) = s.pending.as_ref().and_then(|p| p.effect.clone()) {
                if n.visibility != Some(2) {
                    return Err("Visibility changed while the original following operation remains unresolved".into());
                }
                let observed = n
                    .followees
                    .iter()
                    .find(|(t, _)| *t == f.topic)
                    .map(|(_, v)| v.followees.iter().map(|id| id.id).collect::<Vec<_>>())
                    .unwrap_or_default();
                if observed == f.followees {
                    s.phase = Phase::Configuring;
                    return Ok(());
                }
            } else if matches!(
                s.pending.as_ref().and_then(|p| p.effect.as_ref()),
                Some(Effect::Visibility)
            ) && n.visibility == Some(2)
            {
                s.phase = Phase::Configuring;
                return Ok(());
            }
            client.managers(s).await?;
            if n.visibility != Some(2) {
                effect(client, s, Effect::Visibility);
                if !matches!(
                    send(
                        client,
                        s,
                        Command::Configure(protocol::Configure {
                            operation: Some(Operation::SetVisibility(protocol::Visibility {
                                visibility: Some(2)
                            }))
                        })
                    )
                    .await?,
                    Response::Configure(_)
                ) {
                    return Err("Unexpected visibility response".into());
                }
            } else {
                let observed = protocol::following(&n);
                let mut wanted = match s.pending.as_ref().and_then(|p| p.effect.clone()) {
                    Some(Effect::Following(f)) => Some(f),
                    _ => s
                        .plan
                        .following
                        .iter()
                        .find(|f| {
                            observed
                                .iter()
                                .find(|n| n.topic == f.topic)
                                .map(|f| f.followees.as_slice())
                                .unwrap_or(&[])
                                != f.followees.as_slice()
                        })
                        .cloned(),
                };
                if wanted.is_none() {
                    wanted = observed
                        .iter()
                        .find(|f| !s.plan.following.iter().any(|p| p.topic == f.topic))
                        .map(|f| Following {
                            topic: f.topic,
                            followees: vec![],
                        });
                }
                if let Some(f) = wanted {
                    if !dendrite_types::RECOGNISED_TOPICS.contains(&f.topic) {
                        return Err("Unexpected unsupported following topic".into());
                    }
                    effect(client, s, Effect::Following(f.clone()));
                    if !matches!(
                        send(
                            client,
                            s,
                            Command::Follow(protocol::Follow {
                                topic: f.topic,
                                followees: f
                                    .followees
                                    .into_iter()
                                    .map(|id| NeuronId { id })
                                    .collect()
                            })
                        )
                        .await?,
                        Response::Follow(_)
                    ) {
                        return Err("Unexpected following response".into());
                    }
                }
            }
            n = client
                .neuron(s)
                .await?
                .ok_or("Configuration readback unavailable")?;
            if n.visibility != Some(2) {
                return Err("Visibility readback mismatch".into());
            }
            s.public_visibility_confirmed = true;
            if let Some(Effect::Following(f)) = s.pending.as_ref().and_then(|p| p.effect.as_ref()) {
                let observed = n
                    .followees
                    .iter()
                    .find(|(t, _)| *t == f.topic)
                    .map(|(_, v)| v.followees.iter().map(|id| id.id).collect::<Vec<_>>())
                    .unwrap_or_default();
                if observed != f.followees {
                    return Err("Following readback mismatch".into());
                }
            }
            s.phase = Phase::Configuring;
            if exact_following(s, &n) {
                if delay(&n, client.now())? == s.plan.lock_seconds {
                    after_configuration(s);
                } else {
                    s.phase = Phase::AwaitingLock;
                }
            }
        }
        Step::CommitLock => {
            let economics = client.economics().await?;
            if s.plan.lock_seconds < economics.minimum_voting_delay() {
                return Err("Network voting minimum exceeds the fixed Standard lock; no increase was dispatched".into());
            }
            if n.visibility != Some(2) || !exact_following(s, &n) {
                return Err("Finish reversible setup before committing lock".into());
            }
            client.managers(s).await?;
            let current = delay(&n, client.now())?;
            if current > s.plan.lock_seconds {
                return Err(
                    "Existing lock exceeds reviewed requirement and cannot be shortened".into(),
                );
            }
            if current < s.plan.lock_seconds
                && matches!(
                    s.pending.as_ref().and_then(|p| p.effect.as_ref()),
                    Some(Effect::Lock(_))
                )
            {
                return Err("Original additive lock outcome remains unresolved; do not dispatch another increase".into());
            }
            if current < s.plan.lock_seconds {
                let additional =
                    u32::try_from(s.plan.lock_seconds - current).map_err(protocol::bounded)?;
                effect(client, s, Effect::Lock(s.plan.lock_seconds));
                if !matches!(
                    send(
                        client,
                        s,
                        Command::Configure(protocol::Configure {
                            operation: Some(Operation::IncreaseDissolveDelay(protocol::Increase {
                                additional_dissolve_delay_seconds: additional
                            }))
                        })
                    )
                    .await?,
                    Response::Configure(_)
                ) {
                    return Err("Unexpected lock response".into());
                }
            }
            n = client.neuron(s).await?.ok_or("Lock readback unavailable")?;
            if delay(&n, client.now())? != s.plan.lock_seconds {
                return Err("Lock readback does not exactly match Standard/profile".into());
            }
            after_configuration(s);
        }
        Step::Refresh => {
            configured(client, s, &n).await?;
            effect(client, s, Effect::Refresh);
            if !matches!(
                send(client, s, Command::RefreshVotingPower(Empty {})).await?,
                Response::RefreshVotingPower(_)
            ) {
                return Err("Unexpected refresh response".into());
            }
            n = client
                .neuron(s)
                .await?
                .ok_or("Refresh readback unavailable")?;
            if n.voting_power_refreshed_timestamp_seconds
                .is_none_or(|at| at < s.pending.as_ref().unwrap().dispatched_at / 1_000_000_000)
                || n.potential_voting_power.is_none()
                || n.potential_voting_power != n.deciding_voting_power
            {
                return Err("Voting power readback is not current".into());
            }
        }
        Step::BeginRehearsal | Step::Seal(_) => {
            if let Some(id) = s.external_proposal.as_ref().and_then(|p| p.proposal_id) {
                client.verify_external_proposal(s, id, true).await?;
            }
            if s.external_proposal
                .as_ref()
                .is_some_and(|p| p.proposal_id.is_none())
            {
                return Err("Original external proposal outcome remains unresolved".into());
            }
            if s.plan.profile != Profile::ProductionCandidate {
                return Err("Test profile cannot finalise".into());
            }
            configured(client, s, &n).await?;
            let info = client
                .known(s.neuron_id.unwrap())
                .await
                .map_err(protocol::bounded)?;
            let known = info
                .known_neuron_data
                .ok_or("Awaiting actual known-neuron registration")?;
            if let Some(expected) = &s.plan.metadata
                && (known.name != expected.name
                    || known.description.as_deref().unwrap_or("") != expected.description
                    || known.links.unwrap_or_default() != expected.links)
            {
                return Err("Registration metadata changed; review a new plan".into());
            }
            let system = client
                .system(s.controller)
                .await
                .map_err(protocol::bounded)?;
            if system.controllers != [s.plan.owner]
                || system.module_hash.as_deref() != Some(s.bound_module())
            {
                return Err("Bootstrap controller/module binding changed".into());
            }
            if let Step::Seal(proposal) = step {
                client.rehearsal(s, proposal).await?;
                s.rehearsal_proposal = Some(proposal);
                s.sealed_controller_changes = Some(system.total_num_changes);
                s.phase = Phase::Sealed;
            } else {
                s.rehearsal_started_at = Some(client.now());
                s.rehearsal_proposal = None;
                s.external_proposal = None;
                s.phase = Phase::Rehearsing;
            }
        }
        Step::StartDissolving => {
            // Dedicated owner-reviewed recovery action, not ordinary setup.
            if matches!(n.dissolve_state, Some(DissolveState::DissolveDelaySeconds(value)) if value > 0)
            {
                effect(client, s, Effect::Dissolve);
                if !matches!(
                    send(
                        client,
                        s,
                        Command::Configure(protocol::Configure {
                            operation: Some(Operation::StartDissolving(Empty {}))
                        })
                    )
                    .await?,
                    Response::Configure(_)
                ) {
                    return Err("Unexpected dissolution response".into());
                }
                n = client
                    .neuron(s)
                    .await?
                    .ok_or("Dissolution readback unavailable")?;
                if !matches!(
                    n.dissolve_state,
                    Some(DissolveState::WhenDissolvedTimestampSeconds(_))
                ) {
                    return Err("Dissolution was not confirmed".into());
                }
            }
            s.rehearsal_started_at = None;
            s.rehearsal_proposal = None;
            s.phase = Phase::Recovering;
        }
        Step::Disburse {
            expected_amount_e8s,
            expected_fee_e8s,
        } => {
            if s.pending.as_ref().unwrap().effect.is_some() {
                return Err("Disbursement may have executed; supply its original ledger block for reconciliation, never resend".into());
            }
            let dissolved = matches!(
                n.dissolve_state,
                Some(DissolveState::DissolveDelaySeconds(0))
            ) || matches!(n.dissolve_state, Some(DissolveState::WhenDissolvedTimestampSeconds(at)) if at <= client.now());
            if !dissolved {
                return Err(
                    "Locked stake cannot be refunded; separately review dissolution and wait"
                        .into(),
                );
            }
            let economics = client.economics().await?;
            s.pending.as_mut().unwrap().expected_return_e8s = Some(
                n.cached_neuron_stake_e8s
                    .checked_sub(n.neuron_fees_e8s)
                    .and_then(|v| v.checked_sub(economics.transaction_fee_e8s))
                    .ok_or("Stake cannot cover fees")?,
            );
            s.pending.as_mut().unwrap().expected_return_fee_e8s =
                Some(economics.transaction_fee_e8s);
            if s.pending.as_ref().unwrap().expected_return_e8s != Some(expected_amount_e8s)
                || economics.transaction_fee_e8s != expected_fee_e8s
            {
                return Err("Disbursement amount or fee changed after the exact review; no transfer was sent".into());
            }
            effect(client, s, Effect::Disburse);
            let reply = send(
                client,
                s,
                Command::Disburse(protocol::Disburse {
                    to_account: Some(protocol::AccountIdentifier {
                        hash: s.plan.return_account.clone(),
                    }),
                    amount: None,
                }),
            )
            .await?;
            let Response::Disburse(reply) = reply else {
                return Err("Unexpected disbursement response".into());
            };
            client.verify_return(s, reply.transfer_block_height).await?;
            s.disbursement_block = Some(reply.transfer_block_height);
            s.phase = Phase::Recovered;
        }
        Step::Claim
        | Step::Unseal
        | Step::ReconcileDisbursement(_)
        | Step::ResolveProposal(_)
        | Step::MarkProposalDispatched(_)
        | Step::CancelReservedProposal(_)
        | Step::ResolveProposalRefusal(_) => {
            unreachable!("handled before target read")
        }
    }
    Ok(())
}
