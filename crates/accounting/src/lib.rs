#![forbid(unsafe_code)]
use candid::CandidType;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
pub const MIN_SHARE: u64 = 1;
pub const RETRY_WINDOW_NS: u64 = 23 * 60 * 60 * 1_000_000_000;
#[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
pub struct Destination {
    pub neuron_id: u64,
    pub subaccount: Vec<u8>,
    pub validated_at: u64,
}
#[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
pub enum TransferStatus {
    Prepared,
    Rejected { reason: String },
    Unknown { attempts: u32 },
    Verifying { block: u64 },
    Confirmed { block: u64 },
    Held { reason: String },
}
#[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
pub enum RefreshState {
    Pending,
    Complete,
    Waiting { reason: String },
}
#[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
pub struct Attempt {
    pub number: u32,
    pub fee: u64,
    pub memo: Vec<u8>,
    pub created_at_time: u64,
    pub may_have_executed: bool,
}
#[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
pub struct Transfer {
    pub destination: Destination,
    pub amount: u64,
    /// Compatibility views of the current attempt. Zero time means never dispatched.
    pub memo: Vec<u8>,
    pub created_at_time: u64,
    pub status: TransferStatus,
    pub history_cursor: u64,
    pub attempt: Option<Attempt>,
    pub rejected_attempts: Vec<Attempt>,
    pub refresh: Option<RefreshState>,
}
#[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
pub struct Plan {
    pub id: u64,
    pub roster_round: u64,
    pub balance: u64,
    pub observed_at: u64,
    pub fee: u64,
    pub dust: u64,
    pub ledger_anchor: u64,
    pub transfers: Vec<Transfer>,
    pub initial_fee: u64,
    pub additional_fee_funding: u64,
}
fn memo(id: u64, index: usize, number: u32) -> Vec<u8> {
    let mut m = b"DQUORUM1".to_vec();
    m.extend(id.to_be_bytes());
    m.extend((index as u64).to_be_bytes());
    if number > 1 {
        m.extend(number.to_be_bytes());
    }
    m
}
impl Plan {
    pub fn build(
        id: u64,
        round: u64,
        balance: u64,
        fee: u64,
        now: u64,
        anchor: u64,
        mut ds: Vec<Destination>,
    ) -> Result<Self, &'static str> {
        if id == 0 || now == 0 || ds.is_empty() || ds.len() > 240 {
            return Err("no valid recipient snapshot");
        }
        ds.sort_by_key(|d| d.neuron_id);
        let n = ds.len() as u64;
        let distributable = balance
            .checked_sub(n.checked_mul(fee).ok_or("fee overflow")?)
            .ok_or("balance below fees")?;
        let amount = distributable / n;
        if amount < MIN_SHARE {
            return Err("share below minimum");
        }
        let transfers = ds
            .into_iter()
            .enumerate()
            .map(|(i, d)| Transfer {
                destination: d,
                amount,
                memo: memo(id, i, 1),
                created_at_time: 0,
                status: TransferStatus::Prepared,
                history_cursor: anchor,
                attempt: None,
                rejected_attempts: vec![],
                refresh: None,
            })
            .collect();
        let p = Self {
            id,
            roster_round: round,
            balance,
            observed_at: now,
            fee,
            dust: distributable % n,
            ledger_anchor: anchor,
            transfers,
            initial_fee: fee,
            additional_fee_funding: 0,
        };
        if !p.invariant() {
            return Err("invalid or conflicting staking destination");
        }
        Ok(p)
    }
    fn remaining_fee(&self, t: &Transfer) -> u64 {
        t.attempt
            .as_ref()
            .filter(|a| a.may_have_executed)
            .map_or(self.fee, |a| a.fee)
    }
    pub fn reserved(&self) -> Result<u64, &'static str> {
        self.transfers
            .iter()
            .filter(|t| !matches!(t.status, TransferStatus::Confirmed { .. }))
            .try_fold(0u64, |a, t| {
                a.checked_add(t.amount)
                    .and_then(|v| v.checked_add(self.remaining_fee(t)))
                    .ok_or("liability overflow")
            })
    }
    pub fn complete(&self) -> bool {
        self.transfers
            .iter()
            .all(|t| matches!(t.status, TransferStatus::Confirmed { .. }))
    }
    pub fn maintenance_complete(&self) -> bool {
        self.transfers
            .iter()
            .all(|t| t.refresh == Some(RefreshState::Complete))
    }
    pub fn confirmed_cost(&self) -> u128 {
        self.transfers
            .iter()
            .filter(|t| matches!(t.status, TransferStatus::Confirmed { .. }))
            .map(|t| {
                u128::from(t.amount)
                    + u128::from(t.attempt.as_ref().expect("confirmed attempt").fee)
            })
            .sum()
    }
    pub fn fund_fee(&mut self, fee: u64, available: u64) -> Result<(), &'static str> {
        let old = self.fee;
        self.fee = fee;
        let needed = self.reserved()?;
        if available
            < needed
                .checked_add(self.dust)
                .ok_or("dust reserve overflow")?
        {
            self.fee = old;
            return Err("waiting for additional fee funding; entitlements retained");
        }
        let total = self.confirmed_cost() + u128::from(needed) + u128::from(self.dust);
        let budget = u128::from(self.balance) + u128::from(self.additional_fee_funding);
        if total > budget {
            self.additional_fee_funding = self
                .additional_fee_funding
                .checked_add(u64::try_from(total - budget).map_err(|_| "fee funding overflow")?)
                .ok_or("fee funding overflow")?;
        }
        Ok(())
    }
    pub fn invariant(&self) -> bool {
        if self.id == 0
            || self.transfers.is_empty()
            || self.transfers.len() > 240
            || self.dust >= self.transfers.len() as u64
        {
            return false;
        }
        let Some(original_net) = self
            .balance
            .checked_sub((self.transfers.len() as u64).saturating_mul(self.initial_fee))
        else {
            return false;
        };
        if self.dust != original_net % self.transfers.len() as u64
            || self.transfers[0].amount != original_net / self.transfers.len() as u64
        {
            return false;
        }
        let mut ids = BTreeSet::new();
        let mut accounts = BTreeSet::new();
        let mut blocks = BTreeSet::new();
        for t in &self.transfers {
            if t.destination.neuron_id == 0
                || t.destination.validated_at == 0
                || t.destination.subaccount.len() != 32
                || !ids.insert(t.destination.neuron_id)
                || !accounts.insert(&t.destination.subaccount)
                || t.amount < MIN_SHARE
                || t.amount != self.transfers[0].amount
            {
                return false;
            }
            if let Some(a) = &t.attempt {
                if a.created_at_time == 0
                    || a.memo != t.memo
                    || a.created_at_time != t.created_at_time
                {
                    return false;
                }
            } else if !matches!(t.status, TransferStatus::Prepared) || t.created_at_time != 0 {
                return false;
            }
            if let TransferStatus::Confirmed { block } = t.status
                && !blocks.insert(block)
            {
                return false;
            }
        }
        self.reserved().is_ok_and(|r| {
            self.confirmed_cost() + u128::from(r) + u128::from(self.dust)
                <= u128::from(self.balance) + u128::from(self.additional_fee_funding)
        })
    }
    pub fn dispatch(&mut self, index: usize, now: u64) -> Result<(), &'static str> {
        let t = self.transfers.get_mut(index).ok_or("transfer index")?;
        let attempts = match &t.status {
            TransferStatus::Prepared | TransferStatus::Rejected { .. } => {
                if t.attempt.as_ref().is_some_and(|a| a.may_have_executed) {
                    return Err("prior attempt unresolved");
                }
                let number = t.attempt.as_ref().map_or(1, |a| a.number + 1);
                if number > 12 {
                    return Err("bounded definite-rejection attempts exhausted");
                }
                if let Some(a) = t.attempt.take() {
                    t.rejected_attempts.push(a);
                }
                let a = Attempt {
                    number,
                    fee: self.fee,
                    memo: memo(self.id, index, number),
                    created_at_time: now,
                    may_have_executed: true,
                };
                t.memo = a.memo.clone();
                t.created_at_time = now;
                t.attempt = Some(a);
                1
            }
            TransferStatus::Unknown { attempts } => {
                if now.saturating_sub(t.created_at_time) >= RETRY_WINDOW_NS {
                    return Err("deduplication window elapsed; reconcile history");
                }
                if *attempts >= 12 {
                    return Err("bounded retries exhausted; reconcile history");
                }
                attempts + 1
            }
            _ => return Err("transfer not dispatchable"),
        };
        t.status = TransferStatus::Unknown { attempts };
        Ok(())
    }
    pub fn reject(&mut self, index: usize, reason: String) -> Result<(), &'static str> {
        let t = self.transfers.get_mut(index).ok_or("transfer index")?;
        let a = t.attempt.as_mut().ok_or("missing attempt")?;
        a.may_have_executed = false;
        t.status = TransferStatus::Rejected { reason };
        Ok(())
    }
    pub fn confirm(&mut self, index: usize, block: u64) -> Result<(), &'static str> {
        if self.transfers.iter().enumerate().any(|(i, t)| {
            i != index && matches!(t.status,TransferStatus::Confirmed{block:b} if b==block)
        }) {
            return Err("block reused across obligations");
        }
        let t = self.transfers.get_mut(index).ok_or("transfer index")?;
        if t.attempt.is_none() {
            return Err("no dispatched attempt");
        }
        if let TransferStatus::Confirmed { block: b } = t.status
            && b != block
        {
            return Err("conflicting confirmation");
        }
        t.status = TransferStatus::Confirmed { block };
        t.refresh = Some(RefreshState::Pending);
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    fn ds(n: u64) -> Vec<Destination> {
        (1..=n)
            .map(|id| Destination {
                neuron_id: id,
                subaccount: vec![id as u8; 32],
                validated_at: 1,
            })
            .collect()
    }
    #[test]
    fn partial_success_new_deposit_fee_failure_never_rebuilds() {
        let mut p = Plan::build(1, 3, 1_000_003, 10_000, 1, 7, ds(3)).unwrap();
        let snapshot = p.clone();
        p.dispatch(0, 2).unwrap();
        p.confirm(0, 8).unwrap();
        p.dispatch(1, 3).unwrap();
        p.reject(1, "BadFee".into()).unwrap();
        assert!(p.invariant());
        assert_eq!(p.transfers[1].amount, snapshot.transfers[1].amount);
        assert!(p.dispatch(0, 3).is_err());
        assert_eq!(p.transfers[1].amount, snapshot.transfers[1].amount);
        assert_eq!(p.balance, snapshot.balance);
    }
    #[test]
    fn unknown_outcome_retains_identity_and_reservation() {
        let mut p = Plan::build(9, 2, 100, 1, 1, 5, ds(2)).unwrap();
        let original = p.transfers[0].clone();
        p.dispatch(0, 2).unwrap();
        p.dispatch(0, 3).unwrap();
        assert_eq!(p.transfers[0].memo, original.memo);
        assert_eq!(p.transfers[0].created_at_time, 2);
        assert!(p.dispatch(0, RETRY_WINDOW_NS + 3).is_err());
        assert_eq!(p.reserved().unwrap(), 100);
        assert!(!p.complete());
    }
    #[test]
    fn destination_substitution_and_duplicate_blocks_rejected() {
        let mut bad = ds(2);
        bad[1].subaccount = bad[0].subaccount.clone();
        assert!(Plan::build(1, 1, 100, 1, 1, 0, bad).is_err());
        let mut p = Plan::build(1, 1, 100, 1, 1, 0, ds(2)).unwrap();
        p.dispatch(0, 2).unwrap();
        p.confirm(0, 8).unwrap();
        p.dispatch(1, 2).unwrap();
        assert!(p.confirm(1, 8).is_err());
    }
    #[test]
    fn stable_roundtrip_at_each_financial_transition() {
        let mut p = Plan::build(1, 1, 100, 1, 1, 0, ds(2)).unwrap();
        p = candid::decode_one(&candid::encode_one(&p).unwrap()).unwrap();
        for i in 0..2 {
            p.dispatch(i, 2).unwrap();
            let b = candid::encode_one(&p).unwrap();
            p = candid::decode_one(&b).unwrap();
            assert!(p.invariant());
            p.transfers[i].status = TransferStatus::Verifying { block: i as u64 };
            p = candid::decode_one(&candid::encode_one(&p).unwrap()).unwrap();
            assert!(p.invariant());
            p.confirm(i, i as u64).unwrap();
            let b = candid::encode_one(&p).unwrap();
            p = candid::decode_one(&b).unwrap();
            assert!(p.invariant());
        }
        assert!(p.complete());
        assert_eq!(p.reserved().unwrap(), 0);
    }
    #[test]
    fn unvalidated_destinations_and_insufficient_fee_budget_cannot_form_a_plan() {
        for length in [0, 1, 31, 33] {
            let mut destinations = ds(1);
            destinations[0].subaccount = vec![1; length];
            assert!(Plan::build(1, 1, 100, 1, 1, 0, destinations).is_err());
        }
        assert!(Plan::build(1, 1, 19, 10, 1, 0, ds(2)).is_err());
        assert!(Plan::build(1, 1, 20, 10, 1, 0, ds(2)).is_err());
        let mut p = Plan::build(1, 1, 100, 1, 1, 0, ds(1)).unwrap();
        p.dispatch(0, 2).unwrap();
        p.transfers[0].status = TransferStatus::Held {
            reason: "insufficient funds".into(),
        };
        let restored: Plan = candid::decode_one(&candid::encode_one(&p).unwrap()).unwrap();
        assert!(restored.invariant());
        assert_eq!(restored.reserved().unwrap(), 100);
    }
    proptest! {#[test]fn arithmetic_conserves_every_e8s(balance in any::<u64>(),fee in 0u64..100_000,n in 1u64..=240){
        if let Ok(p)=Plan::build(1,1,balance,fee,1,0,ds(n)){prop_assert!(p.invariant());prop_assert!(p.dust<n);prop_assert!(p.transfers.iter().all(|t|t.amount==p.transfers[0].amount));}
    }}
}

#[cfg(test)]
mod hardening {
    use super::*;
    fn plan() -> Plan {
        Plan::build(
            7,
            2,
            3_000_005,
            10_000,
            1,
            20,
            (1..=3)
                .map(|id| Destination {
                    neuron_id: id,
                    subaccount: vec![id as u8; 32],
                    validated_at: 1,
                })
                .collect(),
        )
        .unwrap()
    }
    fn restart(p: Plan) -> Plan {
        candid::decode_one(&candid::encode_one(p).unwrap()).unwrap()
    }
    #[test]
    fn paid_a_unknown_then_old_history_does_not_expire_unsent_b_c() {
        let mut p = plan();
        let original = p.transfers.iter().map(|t| t.amount).collect::<Vec<_>>();
        p.dispatch(0, 100).unwrap();
        p = restart(p);
        let old = p.transfers[0].attempt.clone();
        let later = 100 + RETRY_WINDOW_NS + 2 * 3_600_000_000_000;
        assert!(p.dispatch(0, later).is_err());
        assert_eq!(p.transfers[0].attempt, old);
        p.confirm(0, 20).unwrap();
        p = restart(p);
        let b = 2 * (p.transfers[1].amount + 12_000) + p.dust;
        p.fund_fee(12_000, b).unwrap();
        assert_eq!(p.additional_fee_funding, 4000);
        for i in 1..3 {
            assert!(p.transfers[i].attempt.is_none());
            p.dispatch(i, later + i as u64).unwrap();
            assert_eq!(p.transfers[i].created_at_time, later + i as u64);
            p = restart(p);
            p.confirm(i, 20 + i as u64).unwrap();
            p = restart(p);
        }
        assert!(p.complete());
        assert!(p.invariant());
        assert_eq!(p.reserved().unwrap(), 0);
        assert_eq!(
            p.transfers.iter().map(|t| t.amount).collect::<Vec<_>>(),
            original
        );
        assert_eq!(
            p.confirmed_cost() + u128::from(p.dust),
            u128::from(p.balance) + 4000
        );
    }
    #[test]
    fn unresolved_attempt_keeps_identity_and_funded_liability_after_days() {
        let mut p = plan();
        p.dispatch(0, 100).unwrap();
        let identity = p.transfers[0].attempt.clone();
        let reserved = p.reserved().unwrap();
        p = restart(p);
        assert!(p.dispatch(0, 100 + 2 * RETRY_WINDOW_NS).is_err());
        assert_eq!(p.transfers[0].attempt, identity);
        assert_eq!(p.reserved().unwrap(), reserved);
        assert!(p.transfers[1].attempt.is_none());
        assert!(p.invariant());
    }
    #[test]
    fn definite_rejection_may_start_new_attempt_but_extra_fees_require_funding() {
        let mut p = plan();
        p.dispatch(0, 100).unwrap();
        p.reject(0, "BadFee".into()).unwrap();
        p = restart(p);
        assert!(p.fund_fee(12_000, p.balance).is_err());
        p.fund_fee(12_000, p.balance + 6000).unwrap();
        let old = p.transfers[0].attempt.clone().unwrap();
        p.dispatch(0, 100 + 2 * RETRY_WINDOW_NS).unwrap();
        let new = p.transfers[0].attempt.clone().unwrap();
        assert_ne!(new.memo, old.memo);
        assert_eq!(new.fee, 12_000);
        assert!(new.created_at_time > old.created_at_time);
        assert_eq!(p.transfers[0].rejected_attempts, vec![old]);
        assert!(p.invariant());
        p.transfers[1].amount -= 1;
        assert!(!p.invariant());
    }
}
