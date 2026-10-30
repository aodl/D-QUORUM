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
pub async fn step(token: Token, now: u64) -> Result<(), String> {
    let (active, mut draft, applied, mode, revision) = state::read(|s| {
        (
            s.payout.clone(),
            s.draft.clone(),
            s.applied.clone(),
            s.config.mode,
            s.config.revision,
        )
    });
    let owner = ic_cdk::api::canister_self();
    if let Some(mut plan) = active {
        if plan.complete() {
            state::guarded(token, |s| {
                s.completed_payouts.push(plan);
                if s.completed_payouts.len() > 32 {
                    s.completed_payouts.remove(0);
                }
                s.payout = None;
                s.jobs[2].next_at = now + DAY;
            });
            return Ok(());
        }
        let i = plan
            .transfers
            .iter()
            .position(|t| !matches!(t.status, TransferStatus::Confirmed { .. }))
            .unwrap();
        let t = plan.transfers[i].clone();
        match t.status {
            TransferStatus::Verifying { block } => {
                let (_, bs) = read_blocks(block, 1).await?;
                let b = bs.first().ok_or("ledger block not yet available")?;
                if !l::matches(
                    b,
                    owner,
                    &t.destination.subaccount,
                    t.amount,
                    plan.fee,
                    &t.memo,
                    t.created_at_time,
                ) {
                    return Err("ledger block does not match immutable obligation".into());
                }
                plan.confirm(i, block).map_err(str::to_string)?;
            }
            TransferStatus::Unknown { .. } | TransferStatus::Held { .. }
                if ic_cdk::api::time().saturating_sub(t.created_at_time) >= RETRY_WINDOW_NS =>
            {
                let (chain, bs) = read_blocks(t.history_cursor, 100).await?;
                let found = bs
                    .iter()
                    .enumerate()
                    .find(|(_, b)| {
                        l::matches(
                            b,
                            owner,
                            &t.destination.subaccount,
                            t.amount,
                            plan.fee,
                            &t.memo,
                            t.created_at_time,
                        )
                    })
                    .map(|(offset, _)| t.history_cursor + offset as u64);
                if let Some(block) = found {
                    plan.confirm(i, block).map_err(str::to_string)?;
                } else {
                    plan.transfers[i].history_cursor = t
                        .history_cursor
                        .checked_add(bs.len() as u64)
                        .ok_or("history cursor overflow")?;
                    if plan.transfers[i].history_cursor >= chain {
                        plan.transfers[i].status=TransferStatus::Held{reason:"expired identity; no conclusive match in authoritative history; no safe retry".into()};
                    }
                }
            }
            TransferStatus::Prepared | TransferStatus::Unknown { .. } => {
                if mode != Mode::Live {
                    return Ok(());
                }
                let fee = l::fee().await?;
                if fee != plan.fee {
                    plan.transfers[i].status = TransferStatus::Held {
                        reason: format!(
                            "fee changed from {} to {}; immutable entitlements retained",
                            plan.fee, fee
                        ),
                    };
                } else {
                    let balance = l::balance(owner, None).await?;
                    if matches!(t.status, TransferStatus::Prepared)
                        && balance < plan.reserved().map_err(str::to_string)?
                    {
                        return Err("balance cannot cover reserved obligations".into());
                    }
                    let nanos = ic_cdk::api::time();
                    if let Err(e) = plan.dispatch(i, nanos) {
                        plan.transfers[i].status = TransferStatus::Held { reason: e.into() };
                    } else {
                        state::guarded(token, |s| s.payout = Some(plan.clone()))
                            .ok_or("stale payout worker")?;
                        let result = l::transfer(l::TransferArg {
                            from_subaccount: None,
                            to: l::Account {
                                owner: quorum_ic_clients::GOVERNANCE,
                                subaccount: Some(t.destination.subaccount.clone()),
                            },
                            fee: Some(plan.fee.into()),
                            created_at_time: Some(t.created_at_time),
                            memo: Some(t.memo.clone()),
                            amount: t.amount.into(),
                        })
                        .await;
                        match result {
       Ok(Ok(block))=>plan.transfers[i].status=TransferStatus::Verifying{block},
       Ok(Err(l::TransferError::Duplicate{duplicate_of}))=>plan.transfers[i].status=TransferStatus::Verifying{block:l::nat(duplicate_of)?},
       Ok(Err(l::TransferError::TemporarilyUnavailable))|Err(_)=>{},
       Ok(Err(l::TransferError::TooOld))=>plan.transfers[i].status=TransferStatus::Held{reason:"ledger deduplication expired; authoritative history required".into()},
       Ok(Err(e))=>plan.transfers[i].status=TransferStatus::Held{reason:quorum_ic_clients::bounded(format!("ledger rejected: {e:?}; obligation retained"))},
      }
                    }
                }
            }
            TransferStatus::Held { .. } => {
                state::guarded(token, |s| s.jobs[2].next_at = now + 3600);
            }
            TransferStatus::Confirmed { .. } => unreachable!(),
        }
        if !plan.invariant() {
            return Err("payout invariant violated".into());
        }
        state::guarded(token, |s| s.payout = Some(plan));
        return Ok(());
    }
    let balance = l::balance(owner, None).await?;
    state::guarded(token, |s| {
        s.observed_balance = Some(balance);
        s.balance_observed_at = Some(now);
    });
    if balance == 0 {
        state::guarded(token, |s| s.jobs[2].next_at = now + DAY);
        return Ok(());
    }
    let roster = applied.ok_or("funds retained: no fully reconciled applied roster")?;
    if roster.revision != revision || now.saturating_sub(roster.reconciled_at) > ROSTER_MAX_AGE {
        return Err("funds retained: roster is stale or from an old configuration".into());
    }
    if draft
        .as_ref()
        .is_none_or(|d| d.roster.round != roster.round)
    {
        let ids: Vec<_> = quorum_policy::recipients(&roster.rosters)
            .into_iter()
            .collect();
        if ids.is_empty() {
            return Err("funds retained: no valid recipients".into());
        }
        draft = Some(PayoutDraft {
            roster: roster.clone(),
            ids,
            destinations: vec![],
            offset: 0,
            started_at: now,
        });
    }
    let mut draft = draft.unwrap();
    if now.saturating_sub(draft.started_at) > 1800 {
        state::guarded(token, |s| s.draft = None);
        return Err("recipient validation expired; reconstruct new draft".into());
    }
    if let Some(id) = draft.ids.get(draft.offset as usize).copied() {
        let ns = g::full(vec![id]).await?;
        let n = ns
            .full_neurons
            .first()
            .ok_or("recipient configuration unavailable")?;
        if n.id.as_ref().map(|n| n.id) != Some(id)
            || n.visibility != Some(2)
            || n.account.len() != 32
        {
            return Err("recipient identity, public visibility or staking account invalid".into());
        }
        draft.destinations.push(Destination {
            neuron_id: id,
            subaccount: n.account.clone(),
            validated_at: now,
        });
        draft.offset += 1;
        state::guarded(token, |s| s.draft = Some(draft));
    } else {
        let actual = crate::selection::following(&crate::selection::target().await?);
        if roster
            .rosters
            .iter()
            .any(|r| actual.get(&r.topic).cloned().unwrap_or_default() != r.selected)
        {
            return Err(
                "funds retained: current following differs from the reconciled roster".into(),
            );
        }
        let fee = l::fee().await?;
        let balance = l::balance(owner, None).await?;
        let anchor = l::history(0, 0).await?.chain_length;
        if !state::current(token) {
            return Ok(());
        }
        let current = state::read(|s| {
            s.applied.as_ref().is_some_and(|a| a.round == roster.round)
                && s.config.revision == revision
        });
        if !current {
            return Err("roster changed during payout planning".into());
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
        state::guarded(token, |s| {
            s.payout_nonce = id;
            s.payout = Some(plan);
            s.draft = None;
        });
    }
    Ok(())
}
