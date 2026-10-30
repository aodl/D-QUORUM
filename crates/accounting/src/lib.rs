#![forbid(unsafe_code)]
use candid::CandidType;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const MIN_SHARE: u64 = 1; // ICP Ledger accepts positive e8s top-ups; no neuron-minimum-stake requirement.
pub const RETRY_WINDOW_NS: u64 = 23 * 60 * 60 * 1_000_000_000; // conservative margin inside Ledger's 24h window
#[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
pub struct Destination { pub neuron_id: u64, pub subaccount: Vec<u8>, pub validated_at: u64 }
#[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
pub enum TransferStatus {
    Prepared,
    Unknown { attempts: u32 },
    Verifying { block: u64 },
    Confirmed { block: u64 },
    Held { reason: String },
}
#[derive(Clone, Debug, Eq, PartialEq, CandidType, Serialize, Deserialize)]
pub struct Transfer {
    pub destination: Destination,
    pub amount: u64,
    pub memo: Vec<u8>,
    pub created_at_time: u64,
    pub status: TransferStatus,
    pub history_cursor: u64,
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
}
impl Plan {
    pub fn build(id:u64, round:u64, balance:u64, fee:u64, now:u64, anchor:u64, mut destinations:Vec<Destination>) -> Result<Self,&'static str> {
        if id==0 || now==0 || destinations.is_empty() || destinations.len()>240 {return Err("no valid recipient snapshot");}
        destinations.sort_by_key(|d|d.neuron_id);
        let mut ids=BTreeSet::new();let mut accounts=BTreeSet::new();
        for d in &destinations {
            if d.neuron_id==0 || d.validated_at==0 || d.subaccount.len()!=32 || !ids.insert(d.neuron_id) || !accounts.insert(d.subaccount.clone()) {return Err("invalid or conflicting staking destination");}
        }
        let n=destinations.len() as u64;
        let fees=n.checked_mul(fee).ok_or("fee overflow")?;
        let distributable=balance.checked_sub(fees).ok_or("balance below fees")?;
        let amount=distributable/n;
        if amount<MIN_SHARE {return Err("share below minimum");}
        let dust=distributable%n;
        let transfers=destinations.into_iter().enumerate().map(|(i,d)| {
            let mut memo=b"DQUORUM1".to_vec();memo.extend_from_slice(&id.to_be_bytes());memo.extend_from_slice(&(i as u64).to_be_bytes());
            Transfer{destination:d,amount,memo,created_at_time:now,status:TransferStatus::Prepared,history_cursor:anchor}
        }).collect();
        Ok(Self{id,roster_round:round,balance,observed_at:now,fee,dust,ledger_anchor:anchor,transfers})
    }
    pub fn reserved(&self)->Result<u64,&'static str> {
        self.transfers.iter().filter(|t|!matches!(t.status,TransferStatus::Confirmed{..})).try_fold(0u64,|a,t| a.checked_add(t.amount).and_then(|x|x.checked_add(self.fee)).ok_or("liability overflow"))
    }
    pub fn complete(&self)->bool {self.transfers.iter().all(|t|matches!(t.status,TransferStatus::Confirmed{..}))}
    pub fn confirmed_cost(&self)->u128 {self.transfers.iter().filter(|t|matches!(t.status,TransferStatus::Confirmed{..})).map(|t|u128::from(t.amount)+u128::from(self.fee)).sum()}
    pub fn invariant(&self)->bool {self.reserved().is_ok_and(|r|self.confirmed_cost()+u128::from(r)+u128::from(self.dust)==u128::from(self.balance))}
    pub fn dispatch(&mut self,index:usize,now:u64)->Result<(),&'static str> {
        let t=self.transfers.get_mut(index).ok_or("transfer index")?;
        if now.saturating_sub(t.created_at_time)>=RETRY_WINDOW_NS {return Err("deduplication window elapsed; reconcile history");}
        let attempts=match t.status {TransferStatus::Prepared=>1,TransferStatus::Unknown{attempts}=>attempts.checked_add(1).ok_or("attempt overflow")?,_=>return Err("transfer not dispatchable")};
        t.status=TransferStatus::Unknown{attempts};Ok(())
    }
    pub fn confirm(&mut self,index:usize,block:u64)->Result<(),&'static str> {
        if self.transfers.iter().enumerate().any(|(i,t)|i!=index && matches!(t.status,TransferStatus::Confirmed{block:b} if b==block)) {return Err("block reused across obligations");}
        let t=self.transfers.get_mut(index).ok_or("transfer index")?;
        if let TransferStatus::Confirmed{block:old}=t.status {if old!=block {return Err("conflicting confirmation");}}
        t.status=TransferStatus::Confirmed{block};Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;use proptest::prelude::*;
    fn ds(n:u64)->Vec<Destination>{(1..=n).map(|id|Destination{neuron_id:id,subaccount:vec![id as u8;32],validated_at:1}).collect()}
    #[test] fn partial_success_new_deposit_fee_failure_never_rebuilds() {
        let mut p=Plan::build(1,3,1_000_003,10_000,1,7,ds(3)).unwrap();let snapshot=p.clone();
        p.dispatch(0,2).unwrap();p.confirm(0,8).unwrap();p.transfers[1].status=TransferStatus::Held{reason:"BadFee".into()};
        assert!(p.invariant());assert_eq!(p.transfers[1].amount,snapshot.transfers[1].amount);assert!(p.dispatch(0,3).is_err());
        assert!(p.dispatch(1,3).is_err());assert_eq!(p.balance,snapshot.balance);
    }
    #[test] fn unknown_outcome_retains_identity_and_reservation() {
        let mut p=Plan::build(9,2,100,1,1,5,ds(2)).unwrap();let original=p.transfers[0].clone();
        p.dispatch(0,2).unwrap();p.dispatch(0,3).unwrap();assert_eq!(p.transfers[0].memo,original.memo);assert_eq!(p.transfers[0].created_at_time,1);
        assert!(p.dispatch(0,RETRY_WINDOW_NS+1).is_err());assert_eq!(p.reserved().unwrap(),100);assert!(!p.complete());
    }
    #[test] fn destination_substitution_and_duplicate_blocks_rejected() {
        let mut bad=ds(2);bad[1].subaccount=bad[0].subaccount.clone();assert!(Plan::build(1,1,100,1,1,0,bad).is_err());
        let mut p=Plan::build(1,1,100,1,1,0,ds(2)).unwrap();p.confirm(0,8).unwrap();assert!(p.confirm(1,8).is_err());
    }
    #[test] fn stable_roundtrip_at_each_financial_transition() {
        let mut p=Plan::build(1,1,100,1,1,0,ds(2)).unwrap();
        for i in 0..2 {p.dispatch(i,2).unwrap();let b=candid::encode_one(&p).unwrap();p=candid::decode_one(&b).unwrap();assert!(p.invariant());p.confirm(i,i as u64).unwrap();let b=candid::encode_one(&p).unwrap();p=candid::decode_one(&b).unwrap();assert!(p.invariant());}
        assert!(p.complete());assert_eq!(p.reserved().unwrap(),0);
    }
    proptest!{#[test]fn arithmetic_conserves_every_e8s(balance in any::<u64>(),fee in 0u64..100_000,n in 1u64..=100){
        if let Ok(p)=Plan::build(1,1,balance,fee,1,0,ds(n)){prop_assert!(p.invariant());prop_assert!(p.dust<n);prop_assert!(p.transfers.iter().all(|t|t.amount==p.transfers[0].amount));}
    }}
}
