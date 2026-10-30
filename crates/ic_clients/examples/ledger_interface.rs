#![allow(dead_code)]
use quorum_ic_clients::ledger::*;
#[candid::candid_method(query)]
fn icrc1_balance_of(_: Account) -> candid::Nat {
    unreachable!()
}
#[candid::candid_method(query)]
fn icrc1_fee() -> candid::Nat {
    unreachable!()
}
#[candid::candid_method(update)]
fn icrc1_transfer(_: TransferArg) -> Result<candid::Nat, TransferError> {
    unreachable!()
}
#[candid::candid_method(query)]
fn query_blocks(_: BlocksArgs) -> History {
    unreachable!()
}
candid::export_service!();
fn main() {
    print!("{}", __export_service());
}
