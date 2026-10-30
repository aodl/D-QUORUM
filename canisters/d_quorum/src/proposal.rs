use crate::{
    selection,
    state::{self, ProposalPhase::*, *},
};
use candid::Principal;
use quorum_ic_clients::{GOVERNANCE, governance as g, ledger as l};
use quorum_policy::TARGET;
use sha2::{Digest, Sha256};

pub fn maturity_payload(marker: &str, owner: Principal) -> g::MaturityProposal {
    g::MaturityProposal {
        url: "https://forum.dfinity.org".into(),
        title: Some(marker.into()),
        summary: format!(
            "{marker}\nDisburse 100% of D-QUORUM available unstaked maturity to the automation canister default account. Other managers decide adoption. The amount is determined at execution, subject to finalization and modulation."
        ),
        action: Some(g::MaturityAction::ManageNeuron(g::ManagedMaturity {
            id: None,
            neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: TARGET })),
            command: Some(g::MaturityCommand::DisburseMaturity(g::DisburseMaturity {
                percentage_to_disburse: 100,
                to_account: Some(g::Account {
                    owner: Some(owner),
                    subaccount: None,
                }),
                to_account_identifier: None,
            })),
        })),
    }
}
pub fn action_matches(info: &g::ProposalInfo, owner: Principal) -> bool {
    let Some(g::StoredAction::ManageNeuron(m)) =
        info.proposal.as_ref().and_then(|p| p.action.as_ref())
    else {
        return false;
    };
    let target = match &m.neuron_id_or_subaccount {
        Some(g::Id::NeuronId(n)) => Some(n.id),
        None => m.id.as_ref().map(|n| n.id),
        _ => None,
    };
    if target != Some(TARGET) {
        return false;
    }
    matches!(&m.command,Some(g::StoredCommand::DisburseMaturity(d)) if d.percentage_to_disburse==100 && d.to_account==Some(g::Account{owner:Some(owner),subaccount:None}) && d.to_account_identifier.is_none())
}
fn exact_matches(p: &g::ProposalInfo, j: &ProposalJob, owner: Principal) -> bool {
    let expected = maturity_payload(&j.marker, owner);
    p.proposer.as_ref().map(|n| n.id) == Some(j.proposer)
        && action_matches(p, owner)
        && p.proposal.as_ref().is_some_and(|p| {
            p.url == expected.url && p.title == expected.title && p.summary == expected.summary
        })
}
pub async fn bootstrap(token: Token, now: u64) -> Result<(), String> {
    let (mode, b) = state::read(|s| (s.config.mode, s.bootstrap.clone()));
    if mode == Mode::ObserveOnly {
        state::guarded(token, |s| s.jobs[3].next_at = now + DAY);
        return Ok(());
    }
    let owner = ic_cdk::api::canister_self();
    match b {
        Bootstrap::Inactive | Bootstrap::WaitingFunding | Bootstrap::Claiming => {
            let balance = l::balance(
                GOVERNANCE,
                Some(l::staking_subaccount(owner, BOOTSTRAP_NONCE)),
            )
            .await?;
            let economics = g::economics().await?;
            if !state::current(token) {
                return Ok(());
            }
            if balance < economics.neuron_minimum_stake_e8s {
                state::guarded(token, |s| {
                    s.bootstrap = Bootstrap::WaitingFunding;
                    s.jobs[3].next_at = now + DAY;
                });
                return Ok(());
            }
            state::guarded(token, |s| s.bootstrap = Bootstrap::Claiming)
                .ok_or("stale bootstrap")?;
            let response = g::manage(g::ManageRequest {
                id: None,
                neuron_id_or_subaccount: None,
                command: Some(g::Command::ClaimOrRefresh(g::Claim {
                    by: Some(g::By::MemoAndController(g::MemoController {
                        memo: BOOTSTRAP_NONCE,
                        controller: Some(owner),
                    })),
                })),
            })
            .await?;
            let g::ResponseCommand::ClaimOrRefresh(r) = response else {
                return Err("unexpected claim response".into());
            };
            let id = r
                .refreshed_neuron_id
                .ok_or("claim returned no neuron ID")?
                .id;
            state::guarded(token, |s| s.bootstrap = Bootstrap::Verifying(id));
        }
        Bootstrap::Verifying(id) | Bootstrap::Ready(id) => {
            let r = g::full(vec![id]).await?;
            let n = r.full_neurons.first().ok_or("proposer unavailable")?;
            quorum_ic_clients::evidence::expected_controller(n, owner, id)?;
            if n.account != l::staking_subaccount(owner, BOOTSTRAP_NONCE)
                || selection::following(n)
                    .get(&1)
                    .is_some_and(|v| !v.is_empty())
            {
                return Err("proposer account mismatch or unsafe management following".into());
            }
            state::guarded(token, |s| {
                s.proposer = Some(id);
                s.bootstrap = Bootstrap::Ready(id);
                s.jobs[3].next_at = now + DAY;
            });
            if mode == Mode::Live && state::current(token) {
                selection::target().await?;
                if !state::current(token) {
                    return Ok(());
                }
                g::manage(g::request(
                    quorum_policy::TARGET,
                    g::Command::RefreshVotingPower(g::Empty {}),
                ))
                .await?;
            }
        }
    }
    Ok(())
}
async fn preflight(proposer: u64) -> Result<(), String> {
    let target = selection::target().await?;
    if !selection::following(&target)
        .get(&1)
        .is_some_and(|ids| ids.contains(&proposer))
    {
        return Err("waiting for separately authorized manager membership".into());
    }
    if !target
        .maturity_disbursements_in_progress
        .as_ref()
        .ok_or("required maturity-progress field unavailable")?
        .is_empty()
    {
        return Err("maturity disbursement already in progress".into());
    }
    if u128::from(target.maturity_e8s_equivalent) * 9500 / 10000 < 100_000_000 {
        return Err("unstaked maturity below protocol modulation-adjusted minimum".into());
    }
    let ns = g::full(vec![proposer]).await?;
    let n = ns
        .full_neurons
        .first()
        .ok_or("proposer neuron unavailable")?;
    let owner = ic_cdk::api::canister_self();
    quorum_ic_clients::evidence::expected_controller(n, owner, proposer)?;
    if n.account != l::staking_subaccount(owner, BOOTSTRAP_NONCE)
        || selection::following(n)
            .get(&1)
            .is_some_and(|xs| !xs.is_empty())
    {
        return Err("unsafe proposer binding or following".into());
    }
    let e = g::economics().await?;
    let required = u128::from(e.neuron_management_fee_per_proposal_e8s)
        + u128::from(e.neuron_minimum_stake_e8s);
    if n.cached_neuron_stake_e8s
        .checked_sub(n.neuron_fees_e8s)
        .is_none_or(|s| u128::from(s) < required)
    {
        return Err("proposer stake does not cover fee and minimum stake reserve".into());
    }
    Ok(())
}
pub async fn step(token: Token, now: u64) -> Result<(), String> {
    if state::read(|s| s.config.mode) != Mode::Live {
        state::guarded(token, |s| s.jobs[1].next_at = now + DAY);
        return Ok(());
    }
    let owner = ic_cdk::api::canister_self();
    let proposer = state::read(|s| s.proposer).ok_or("waiting for owned proposer bootstrap")?;
    let current = state::read(|s| s.proposal.clone());
    if current.is_none() {
        preflight(proposer).await?;
        let anchor = l::history(0, 0).await?.chain_length;
        state::guarded(token, |s| {
            s.proposal_nonce = s
                .proposal_nonce
                .checked_add(1)
                .expect("proposal nonce overflow");
            let marker = format!("D-QUORUM {} operation {}", owner, s.proposal_nonce);
            let fingerprint =
                Sha256::digest(candid::encode_one(maturity_payload(&marker, owner)).unwrap())
                    .to_vec();
            s.proposal = Some(ProposalJob {
                operation: s.proposal_nonce,
                proposer,
                created_at: now,
                marker,
                fingerprint,
                phase: Checking,
                history_before: None,
                history_pages: 0,
                found: vec![],
                saw_disbursement: false,
                earliest_finalization: None,
                ledger_cursor: anchor,
                receipt: None,
                retry_after: 0,
            });
        });
        return Ok(());
    }
    let mut j = current.unwrap();
    let mut history_backlog = false;
    match j.phase.clone() {
        Checking | Ambiguous | Intent => {
            let ambiguous = matches!(j.phase, Ambiguous | Intent);
            if j.history_before == Some(0) {
                if now < j.retry_after {
                    return Err("proposal outcome unresolved; await next history investigation without resubmission".into());
                }
                j.history_before = None;
                j.history_pages = 0;
            }
            let ps = g::proposals(j.history_before).await?;
            for p in &ps {
                if exact_matches(p, &j, owner) {
                    let id = p.id.as_ref().ok_or("history proposal ID absent")?.id;
                    if !j.found.contains(&id) {
                        j.found.push(id);
                    }
                } else if action_matches(p, owner) && [1, 3].contains(&p.status) {
                    return Err(
                        "an existing matching open/adopted maturity proposal blocks submission"
                            .into(),
                    );
                }
            }
            j.history_pages += 1;
            if j.history_pages > 1000 {
                return Err(
                    "authorized history exceeds bounded investigation; remains unresolved".into(),
                );
            }
            if j.found.len() > 1 {
                return Err("multiple exact proposal matches; remains unresolved".into());
            }
            if let Some(id) = j.found.first() {
                j.phase = Open(*id);
                j.history_before = None;
            } else if ps.len() < 100 {
                j.phase = if ambiguous { Ambiguous } else { Preflight };
                j.history_before = Some(0);
                if ambiguous {
                    j.retry_after = now + DAY;
                }
            } else {
                j.history_before = ps.last().and_then(|p| p.id.as_ref()).map(|id| id.id);
                if ambiguous {
                    j.phase = Ambiguous;
                }
            }
        }
        Preflight => {
            preflight(j.proposer).await?;
            // Recheck pending history immediately before creating the durable intent.
            let ps = g::proposals(None).await?;
            if ps
                .iter()
                .any(|p| action_matches(p, owner) && [1, 3].contains(&p.status))
            {
                return Err("matching proposal appeared during preflight".into());
            }
            if !state::current(token) {
                return Ok(());
            }
            let payload = maturity_payload(&j.marker, owner);
            if Sha256::digest(candid::encode_one(&payload).unwrap()).as_slice() != j.fingerprint {
                return Err("proposal fingerprint mismatch".into());
            }
            j.phase = Intent;
            j.history_before = None;
            j.history_pages = 0;
            state::guarded(token, |s| s.proposal = Some(j.clone()))
                .ok_or("stale proposal worker")?;
            let response = g::propose(j.proposer, payload).await;
            match response {
                Ok(g::ResponseCommand::MakeProposal(p)) => {
                    j.phase = Open(
                        p.proposal_id
                            .ok_or("proposal reply has no ID; investigate history")?
                            .id,
                    );
                }
                // Even an unexpected or rejected reply is retained for investigation; never blind retry.
                _ => {
                    j.phase = Ambiguous;
                }
            }
        }
        Open(id) | Adopted(id) => {
            let p = g::proposal(id)
                .await?
                .ok_or("authorized proposal history unavailable")?;
            if !exact_matches(&p, &j, owner) {
                return Err("proposal ID/fingerprint binding mismatch".into());
            }
            j.phase = match p.status {
                1 => Open(id),
                2 => {
                    j.retry_after = now + DAY;
                    Rejected(id)
                }
                3 => Adopted(id),
                4 => Executed(id),
                5 => {
                    j.retry_after = now + DAY;
                    Failed(id)
                }
                _ => return Err("unknown proposal status".into()),
            };
        }
        Executed(id) | AwaitingFinalization(id) => {
            let ns = g::full(vec![TARGET]).await?;
            let n = ns
                .full_neurons
                .first()
                .ok_or("managed target unavailable")?;
            let in_progress = n
                .maturity_disbursements_in_progress
                .as_ref()
                .is_some_and(|xs| {
                    xs.iter().any(|d| {
                        d.account_to_disburse_to
                            == Some(g::Account {
                                owner: Some(owner),
                                subaccount: None,
                            })
                            && d.timestamp_of_disbursement_seconds
                                .is_some_and(|t| t >= j.created_at)
                    })
                });
            j.saw_disbursement |= in_progress;
            if let Some(xs) = &n.maturity_disbursements_in_progress {
                for d in xs {
                    if d.account_to_disburse_to
                        == Some(g::Account {
                            owner: Some(owner),
                            subaccount: None,
                        })
                        && d.timestamp_of_disbursement_seconds
                            .is_some_and(|t| t >= j.created_at)
                    {
                        j.earliest_finalization = d.finalize_disbursement_timestamp_seconds;
                    }
                }
            }
            j.phase = AwaitingFinalization(id);
            // Actual default-account Mint records are recorded independently of balance changes.
            let h = l::history(j.ledger_cursor, 100).await?;
            let blocks = if h.first_block_index == j.ledger_cursor {
                h.blocks
            } else if let Some(a) = h.archived_blocks.iter().find(|a| {
                a.start <= j.ledger_cursor && a.start.saturating_add(a.length) > j.ledger_cursor
            }) {
                l::archive(
                    a,
                    j.ledger_cursor,
                    100.min(a.start + a.length - j.ledger_cursor),
                )
                .await?
            } else {
                vec![]
            };
            for (offset, b) in blocks.iter().enumerate() {
                if let Some(l::Operation::Mint { to, amount }) = &b.transaction.operation
                    && *to == l::account_id(owner, None)
                    && j.earliest_finalization
                        .is_some_and(|t| b.timestamp.timestamp_nanos / 1_000_000_000 >= t)
                {
                    j.receipt = Some((j.ledger_cursor + offset as u64, amount.e8s));
                }
            }
            j.ledger_cursor += blocks.len() as u64;
            history_backlog = j.ledger_cursor < h.chain_length;
            if j.saw_disbursement
                && n.maturity_disbursements_in_progress
                    .as_ref()
                    .is_some_and(|xs| xs.is_empty())
                && j.receipt.is_some()
                && j.earliest_finalization.is_some_and(|t| now >= t)
            {
                j.phase = FinalizedReceiptUnattributed(id);
                j.retry_after = now + DAY;
            }
        }
        Rejected(_) | Failed(_) | FinalizedReceiptUnattributed(_) => {
            if now >= j.retry_after {
                state::guarded(token, |s| {
                    s.proposal = None;
                    s.jobs[1].next_at = now + DAY;
                });
                return Ok(());
            }
        }
    }
    state::guarded(token, |s| {
        s.proposal = Some(j);
        s.jobs[1].next_at =
            now + if history_backlog
                || matches!(
                    s.proposal.as_ref().unwrap().phase,
                    Checking | Preflight | Intent | Ambiguous
                ) {
                10
            } else {
                3600
            };
    });
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hundred_percent_is_managed_target_and_explicit_default_destination() {
        let owner = Principal::from_slice(&[9, 1]);
        let p = maturity_payload("unique", owner);
        let Some(g::MaturityAction::ManageNeuron(m)) = p.action else {
            panic!()
        };
        assert_eq!(
            m.neuron_id_or_subaccount,
            Some(g::Id::NeuronId(g::NeuronId { id: TARGET }))
        );
        let Some(g::MaturityCommand::DisburseMaturity(d)) = m.command else {
            panic!()
        };
        assert_eq!(d.percentage_to_disburse, 100);
        assert_eq!(
            d.to_account,
            Some(g::Account {
                owner: Some(owner),
                subaccount: None
            })
        );
        assert!(d.to_account_identifier.is_none());
    }
}
