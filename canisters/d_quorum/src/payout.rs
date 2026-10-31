use crate::state::{self, *};
use quorum_accounting::{Destination, Plan, RETRY_WINDOW_NS, TransferStatus};
use quorum_ic_clients::{governance as g, ledger as l};

async fn read_blocks(start: u64, length: u64) -> Result<(u64, Vec<l::Block>), String> {
    let h = l::history(start, length).await?;
    if start >= h.chain_length {
        return Ok((h.chain_length, vec![]));
    }
    if h.first_block_index == start && !h.blocks.is_empty() {
        return Ok((h.chain_length, h.blocks));
    }
    let a = h
        .archived_blocks
        .iter()
        .find(|a| a.start <= start && a.start.checked_add(a.length).is_some_and(|end| end > start))
        .ok_or("authoritative history did not cover requested cursor")?;
    let blocks = l::archive(a, start, length.min(a.start + a.length - start)).await?;
    Ok((h.chain_length, blocks))
}
fn clock() -> u64 {
    ic_cdk::api::time() / 1_000_000_000
}
fn live(t: Token) -> bool {
    state::current(t)
        && state::read(|s| s.config.mode == Mode::Live)
        && ic_cdk::api::canister_cycle_balance() >= 2_000_000_000_000
}
async fn verify_history(plan: &mut Plan, i: usize) -> Result<(), String> {
    let t = plan.transfers[i].clone();
    let a = t.attempt.as_ref().ok_or("missing attempt")?;
    let start = if let TransferStatus::Verifying { block } = t.status {
        block
    } else {
        t.history_cursor
    };
    let (chain, bs) = read_blocks(
        start,
        if matches!(t.status, TransferStatus::Verifying { .. }) {
            1
        } else {
            100
        },
    )
    .await?;
    let found = bs
        .iter()
        .enumerate()
        .find(|(_, b)| {
            l::matches(
                b,
                ic_cdk::api::canister_self(),
                &t.destination.subaccount,
                t.amount,
                a.fee,
                &a.memo,
                a.created_at_time,
            )
        })
        .map(|(j, _)| start + j as u64);
    if let Some(block) = found {
        plan.confirm(i, block).map_err(str::to_string)?;
    } else if matches!(t.status, TransferStatus::Verifying { .. }) {
        return Err("candidate block unavailable or does not match obligation".into());
    } else {
        plan.transfers[i].history_cursor = start
            .checked_add(bs.len() as u64)
            .ok_or("history cursor overflow")?;
        if plan.transfers[i].history_cursor >= chain {
            plan.transfers[i].status = TransferStatus::Held {
                reason:
                    "unresolved attempt; authoritative absence never authorizes another identity"
                        .into(),
            };
        }
    }
    Ok(())
}
async fn maintain(token: Token, plan: &mut Plan) -> Result<(), String> {
    use quorum_accounting::RefreshState;
    let Some(i) = plan
        .transfers
        .iter()
        .position(|t| t.refresh != Some(RefreshState::Complete))
    else {
        return Ok(());
    };
    if !live(token) {
        return Ok(());
    }
    let d = plan.transfers[i].destination.clone();
    let result = async {
        let r = g::full(vec![d.neuron_id]).await?;
        let before = r
            .full_neurons
            .first()
            .ok_or("refresh pending: public recipient unavailable")?;
        if before.account != d.subaccount || before.visibility != Some(2) {
            return Err("refresh pending: recipient binding/visibility changed".into());
        }
        if !live(token) {
            return Err("refresh deferred: inactive worker".into());
        }
        let result = g::manage(g::request(
            d.neuron_id,
            g::Command::ClaimOrRefresh(g::Claim {
                by: Some(g::By::NeuronIdOrSubaccount(g::Empty {})),
            }),
        ))
        .await?;
        if !matches!(result, g::ResponseCommand::ClaimOrRefresh(g::ClaimResponse {
            refreshed_neuron_id: Some(g::NeuronId { id })
        }) if id == d.neuron_id)
        {
            return Err("refresh returned another neuron".into());
        }
        let r = g::full(vec![d.neuron_id]).await?;
        let after = r
            .full_neurons
            .first()
            .ok_or("refresh verification unavailable")?;
        if after.account != d.subaccount || !g::same_staking_configuration(before, after) {
            return Err("refresh verification changed protected configuration".into());
        }
        Ok::<(), String>(())
    }
    .await;
    match result {
        Ok(()) => plan.transfers[i].refresh = Some(RefreshState::Complete),
        Err(reason) => {
            plan.transfers[i].refresh = Some(RefreshState::Waiting {
                reason: quorum_ic_clients::bounded(reason),
            });
            state::guarded(token, |s| s.jobs[2].next_at = clock() + 3600);
        }
    }
    Ok(())
}
pub async fn step(token: Token, _now: u64) -> Result<(), String> {
    let (active, mut draft, applied, revision) = state::read(|s| {
        (
            s.payout.clone(),
            s.draft.clone(),
            s.applied.clone(),
            s.config.revision,
        )
    });
    let owner = ic_cdk::api::canister_self();
    if let Some(mut plan) = active {
        if plan.complete() {
            if !plan.maintenance_complete() {
                maintain(token, &mut plan).await?;
                state::guarded(token, |s| s.payout = Some(plan));
                return Ok(());
            }
            state::guarded(token, |s| {
                s.completed_payouts.push(plan);
                if s.completed_payouts.len() > 32 {
                    s.completed_payouts.remove(0);
                }
                s.payout = None;
                s.jobs[2].next_at = clock() + DAY;
            });
            return Ok(());
        }
        let i = plan
            .transfers
            .iter()
            .position(|t| !matches!(t.status, TransferStatus::Confirmed { .. }))
            .unwrap();
        let t = plan.transfers[i].clone();
        let expired = t.attempt.as_ref().is_some_and(|a| {
            ic_cdk::api::time().saturating_sub(a.created_at_time) >= RETRY_WINDOW_NS
        });
        match t.status {
            TransferStatus::Verifying { .. } => verify_history(&mut plan, i).await?,
            TransferStatus::Held { .. } => {
                if t.attempt.as_ref().is_some_and(|a| a.may_have_executed) {
                    verify_history(&mut plan, i).await?;
                }
                state::guarded(token, |s| s.jobs[2].next_at = clock() + 3600);
            }
            TransferStatus::Unknown { .. } if expired => verify_history(&mut plan, i).await?,
            TransferStatus::Prepared
            | TransferStatus::Rejected { .. }
            | TransferStatus::Unknown { .. } => {
                if !live(token) {
                    return Ok(());
                }
                let fee = l::fee().await?;
                let unknown = matches!(t.status, TransferStatus::Unknown { .. });
                if unknown && t.attempt.as_ref().is_some_and(|a| a.fee != fee) {
                    verify_history(&mut plan, i).await?;
                } else {
                    let balance = l::balance(owner, None).await?;
                    if !unknown {
                        plan.fund_fee(fee, balance).map_err(str::to_string)?;
                    }
                    if !live(token) {
                        return Ok(());
                    }
                    if let Err(reason) = plan.dispatch(i, ic_cdk::api::time()) {
                        plan.transfers[i].status = TransferStatus::Held {
                            reason: reason.into(),
                        };
                    } else {
                        let a = plan.transfers[i].attempt.clone().unwrap();
                        state::guarded_if(
                            token,
                            |s| {
                                s.config.mode == Mode::Live
                                    && s.payout.as_ref().is_some_and(|p| p.id == plan.id)
                            },
                            |s| s.payout = Some(plan.clone()),
                        )
                        .ok_or("stale payout intent")?;
                        let result = l::transfer(l::TransferArg {
                            from_subaccount: None,
                            to: l::Account {
                                owner: quorum_ic_clients::GOVERNANCE,
                                subaccount: Some(t.destination.subaccount),
                            },
                            fee: Some(a.fee.into()),
                            created_at_time: Some(a.created_at_time),
                            memo: Some(a.memo),
                            amount: t.amount.into(),
                        })
                        .await;
                        match result {
                            Ok(Ok(block)) => {
                                plan.transfers[i].status = TransferStatus::Verifying { block }
                            }
                            Ok(Err(l::TransferError::Duplicate { duplicate_of })) => {
                                plan.transfers[i].status = TransferStatus::Verifying {
                                    block: l::nat(duplicate_of)?,
                                }
                            }
                            Ok(Err(
                                e @ (l::TransferError::BadFee { .. }
                                | l::TransferError::InsufficientFunds { .. }
                                | l::TransferError::CreatedInFuture { .. }
                                | l::TransferError::BadBurn { .. }),
                            )) if !unknown => {
                                plan.reject(i, format!("verified no-execution rejection: {e:?}"))
                                    .map_err(str::to_string)?;
                                state::guarded(token, |s| s.jobs[2].next_at = clock() + 120);
                            }
                            Ok(Err(l::TransferError::TooOld)) => {
                                plan.transfers[i].status = TransferStatus::Held {
                                    reason: "attempt expired; history required".into(),
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            TransferStatus::Confirmed { .. } => unreachable!(),
        }
        if !plan.invariant() {
            return Err("payout invariant violated".into());
        }
        state::guarded(token, |s| s.payout = Some(plan));
        return Ok(());
    }
    if let Some((index, mut p)) = state::read(|s| {
        s.completed_payouts
            .iter()
            .enumerate()
            .find(|(_, p)| !p.maintenance_complete())
            .map(|(i, p)| (i, p.clone()))
    }) {
        maintain(token, &mut p).await?;
        state::guarded(token, |s| {
            if s.completed_payouts.get(index).is_some_and(|x| x.id == p.id) {
                s.completed_payouts[index] = p;
            }
        });
        return Ok(());
    }
    let balance = l::balance(owner, None).await?;
    state::guarded(token, |s| {
        s.observed_balance = Some(balance);
        s.balance_observed_at = Some(clock());
    });
    if balance == 0 || !live(token) {
        state::guarded(token, |s| {
            s.draft = None;
            s.jobs[2].next_at = clock() + DAY;
        });
        return Ok(());
    }
    let roster = applied.ok_or("funds retained: no reconciled roster")?;
    if !roster.reward_eligible(revision, clock()) {
        return Err(
            "funds retained: underlying roster observations stale or wrong revision".into(),
        );
    }
    if Some(g::voting_context().await?) != roster.economics {
        state::guarded(token, |s| {
            s.draft = None;
            s.jobs[0].next_at = clock() + 1;
        });
        return Err("funds retained: applied economics changed; fresh scan required".into());
    }
    if draft
        .as_ref()
        .is_none_or(|d| d.roster.round != roster.round)
    {
        let ids = quorum_policy::recipients(&roster.rosters)
            .into_iter()
            .collect::<Vec<_>>();
        if ids.is_empty() {
            return Err("funds retained: no recipients".into());
        }
        draft = Some(PayoutDraft {
            roster: roster.clone(),
            ids,
            destinations: vec![],
            offset: 0,
            started_at: clock(),
        });
    }
    let mut draft = draft.unwrap();
    if clock().saturating_sub(draft.started_at) > 1800 {
        state::guarded(token, |s| s.draft = None);
        return Err("recipient draft expired".into());
    }
    if (draft.offset as usize) < draft.ids.len() {
        let end = draft.ids.len().min(draft.offset as usize + 50);
        let ids = draft.ids[draft.offset as usize..end].to_vec();
        let r = g::full(ids.clone()).await?;
        for id in ids {
            let n = r
                .full_neurons
                .iter()
                .find(|n| n.id.as_ref().map(|n| n.id) == Some(id))
                .ok_or("recipient unavailable")?;
            let at = r
                .neuron_infos
                .iter()
                .find(|(i, _)| *i == id)
                .ok_or("recipient observation unavailable")?
                .1
                .retrieved_at_timestamp_seconds;
            if n.visibility != Some(2)
                || n.account.len() != 32
                || at > clock()
                || clock().saturating_sub(at) > 300
            {
                return Err("recipient account/observation invalid".into());
            }
            draft.destinations.push(Destination {
                neuron_id: id,
                subaccount: n.account.clone(),
                validated_at: at,
            });
        }
        draft.offset = end as u32;
        state::guarded_if(
            token,
            |s| {
                s.config.revision == revision
                    && s.applied.as_ref().is_some_and(|a| a.round == roster.round)
            },
            |s| s.draft = Some(draft),
        );
    } else {
        let actual = crate::selection::following(&crate::selection::target().await?);
        if roster
            .rosters
            .iter()
            .any(|r| actual.get(&r.topic).cloned().unwrap_or_default() != r.selected)
        {
            return Err("following differs from applied roster".into());
        }
        let fee = l::fee().await?;
        let balance = l::balance(owner, None).await?;
        let anchor = l::history(0, 0).await?.chain_length;
        if Some(g::voting_context().await?) != roster.economics {
            return Err("economics changed during payout admission".into());
        }
        if !live(token)
            || !roster.reward_eligible(revision, clock())
            || clock().saturating_sub(draft.started_at) > 1800
            || draft
                .destinations
                .iter()
                .any(|d| clock().saturating_sub(d.validated_at) > 1800)
        {
            return Err("payout admission expired during awaits".into());
        }
        let id = state::read(|s| s.payout_nonce.checked_add(1)).ok_or("payout nonce overflow")?;
        let plan = Plan::build(
            id,
            roster.round,
            balance,
            fee,
            ic_cdk::api::time(),
            anchor,
            draft.destinations,
        )
        .map_err(str::to_string)?;
        state::guarded_if(
            token,
            |s| {
                s.config.revision == revision
                    && s.config.mode == Mode::Live
                    && s.applied.as_ref().is_some_and(|a| a.round == roster.round)
            },
            |s| {
                s.payout_nonce = id;
                s.payout = Some(plan);
                s.draft = None;
            },
        )
        .ok_or("payout configuration changed")?;
    }
    Ok(())
}
