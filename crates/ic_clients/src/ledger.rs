use candid::{CandidType,Deserialize,Nat,Principal};
use sha2::{Digest,Sha224,Sha256};
use crate::{call,no_args,LEDGER};
#[derive(Clone,Debug,CandidType,Deserialize,serde::Serialize,PartialEq,Eq)]
pub struct Account {pub owner:Principal,pub subaccount:Option<Vec<u8>>}
#[derive(Clone,Debug,CandidType,Deserialize,PartialEq,Eq)]
pub struct TransferArg {pub from_subaccount:Option<Vec<u8>>,pub to:Account,pub fee:Option<Nat>,pub created_at_time:Option<u64>,pub memo:Option<Vec<u8>>,pub amount:Nat}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub enum TransferError {BadFee{expected_fee:Nat},BadBurn{min_burn_amount:Nat},InsufficientFunds{balance:Nat},TooOld,CreatedInFuture{ledger_time:u64},Duplicate{duplicate_of:Nat},TemporarilyUnavailable,GenericError{error_code:Nat,message:String}}
pub fn nat(n:Nat)->Result<u64,String>{u64::try_from(n.0).map_err(|_|"ledger integer out of range".into())}
pub async fn balance(owner:Principal,subaccount:Option<Vec<u8>>)->Result<u64,String>{nat(call(LEDGER,"icrc1_balance_of",Account{owner,subaccount}).await?)}
pub async fn fee()->Result<u64,String>{nat(no_args(LEDGER,"icrc1_fee").await?)}
pub async fn transfer(t:TransferArg)->Result<Result<u64,TransferError>,String>{
    let r:Result<Nat,TransferError>=call(LEDGER,"icrc1_transfer",t).await?;match r {Ok(n)=>Ok(Ok(nat(n)?)),Err(e)=>Ok(Err(e))}
}
pub fn staking_subaccount(owner:Principal,nonce:u64)->Vec<u8>{let mut h=Sha256::new();h.update(b"\x0cneuron-stake");h.update(owner.as_slice());h.update(nonce.to_be_bytes());h.finalize().to_vec()}
pub fn account_id(owner:Principal,sub:Option<&[u8]>)->Vec<u8>{
    let mut h=Sha224::new();h.update(b"\x0Aaccount-id");h.update(owner.as_slice());h.update(sub.unwrap_or(&[0;32]));let hash=h.finalize();
    let mut crc=0xffff_ffffu32;for byte in hash {crc^=u32::from(byte);for _ in 0..8 {crc=(crc>>1) ^ (0xedb8_8320u32 & (0u32.wrapping_sub(crc&1)));}}
    let mut r=(!crc).to_be_bytes().to_vec();r.extend_from_slice(&hash);r
}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub struct Tokens {pub e8s:u64}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub struct Timestamp {pub timestamp_nanos:u64}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub enum Operation {Mint{to:Vec<u8>,amount:Tokens},Burn{from:Vec<u8>,amount:Tokens,spender:Option<Vec<u8>>},Transfer{from:Vec<u8>,to:Vec<u8>,amount:Tokens,fee:Tokens,spender:Option<Vec<u8>>},Approve{from:Vec<u8>,spender:Vec<u8>,allowance:Tokens,fee:Tokens,expires_at:Option<Timestamp>,expected_allowance:Option<Tokens>}}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub struct Transaction {pub memo:u64,pub icrc1_memo:Option<Vec<u8>>,pub operation:Option<Operation>,pub created_at_time:Timestamp}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub struct Block {pub transaction:Transaction,pub timestamp:Timestamp}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub struct BlocksArgs {pub start:u64,pub length:u64}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub struct BlockRange {pub blocks:Vec<Block>}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub enum ArchiveError {BadFirstBlockIndex{requested_index:u64,first_valid_index:u64},Other{error_code:u64,error_message:String}}
candid::define_function!(pub ArchiveFn : (BlocksArgs) -> (Result<BlockRange,ArchiveError>) query);
#[derive(Clone,Debug,CandidType,Deserialize)]
pub struct ArchivedRange {pub start:u64,pub length:u64,pub callback:ArchiveFn}
#[derive(Clone,Debug,CandidType,Deserialize)]
pub struct History {pub chain_length:u64,pub first_block_index:u64,pub blocks:Vec<Block>,pub archived_blocks:Vec<ArchivedRange>}
pub async fn history(start:u64,length:u64)->Result<History,String>{
    if length>100 {return Err("history request bound".into());}
    let h:History=call(LEDGER,"query_blocks",BlocksArgs{start,length}).await?;
    if h.blocks.len()>100 || h.archived_blocks.len()>100 || h.first_block_index.checked_add(h.blocks.len() as u64).is_none_or(|end|end>h.chain_length) {return Err("invalid history bounds".into());}Ok(h)
}
pub async fn archive(range:&ArchivedRange,start:u64,length:u64)->Result<Vec<Block>,String>{
    if range.callback.0.method!="get_blocks" || length==0 || length>100 || start<range.start || start.checked_add(length).is_none_or(|end|range.start.checked_add(range.length).is_none_or(|r|end>r)) {return Err("invalid authoritative archive reference".into());}
    let r:Result<BlockRange,ArchiveError>=call(range.callback.0.principal,"get_blocks",BlocksArgs{start,length}).await?;
    let b=r.map_err(|_|"archive unavailable")?.blocks;
    if b.is_empty() || b.len()>length as usize {return Err("archive did not progress".into());}Ok(b)
}
pub fn matches(block:&Block,from:Principal,to_sub:&[u8],amount:u64,fee:u64,memo:&[u8],created:u64)->bool{
    block.transaction.icrc1_memo.as_deref()==Some(memo) && block.transaction.created_at_time.timestamp_nanos==created && matches!(&block.transaction.operation,Some(Operation::Transfer{from:f,to,amount:a,fee:fe,spender:None}) if *f==account_id(from,None) && *to==account_id(crate::GOVERNANCE,Some(to_sub)) && a.e8s==amount && fe.e8s==fee)
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn accounts_match_known_ledger_fixture(){assert_eq!(account_id(Principal::anonymous(),None).len(),32);assert_eq!(staking_subaccount(Principal::anonymous(),1).len(),32);assert_ne!(staking_subaccount(Principal::anonymous(),1),staking_subaccount(Principal::anonymous(),2));}
 #[test]fn malformed_response_and_unknown_variant_fail_closed(){assert!(crate::decode::<TransferError>(vec![0,1,2]).is_err());assert!(crate::decode::<History>(vec![0;crate::MAX_REPLY+1]).is_err());}
}
