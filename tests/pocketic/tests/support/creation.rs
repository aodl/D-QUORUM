//! Actual monetary protocol fixtures; no application success flags or fake CMC.
#![allow(dead_code)]
use crate::support::*;
use candid::{CandidType, Deserialize, Nat, Principal, encode_one};
use pocket_ic::PocketIc;
use quorum_ic_clients::{GOVERNANCE, LEDGER, ledger as l};

pub fn cmc() -> Principal {
    Principal::from_text("rkp4c-7iaaa-aaaaa-aaaca-cai").unwrap()
}
pub fn cycles_ledger() -> Principal {
    Principal::from_text("um5iw-rqaaa-aaaaq-qaaba-cai").unwrap()
}
pub fn principal_subaccount(p: Principal) -> Vec<u8> {
    let mut sub = vec![0; 32];
    sub[0] = p.as_slice().len() as u8;
    sub[1..1 + p.as_slice().len()].copy_from_slice(p.as_slice());
    sub
}
#[derive(CandidType)]
pub struct CmcInit {
    pub ledger_canister_id: Option<Principal>,
    pub governance_canister_id: Option<Principal>,
    pub minting_account_id: Option<String>,
    pub cycles_ledger_canister_id: Option<Principal>,
}
#[derive(CandidType)]
pub struct CyclesInit {
    pub max_blocks_per_request: u64,
    pub index_id: Option<Principal>,
    pub initial_balances: Option<Vec<(l::Account, Nat)>>,
}
#[derive(CandidType)]
pub enum CyclesArgs {
    Init(CyclesInit),
}
#[derive(CandidType)]
pub struct AuthorizedSubnets {
    pub who: Option<Principal>,
    pub subnets: Vec<Principal>,
}
#[derive(CandidType)]
pub struct RateUpdate {
    pub timestamp_seconds: u64,
    pub xdr_permyriad_per_icp: u64,
    pub data_source: String,
    pub reason: Option<candid::Empty>,
}
#[derive(CandidType, Deserialize, Debug)]
pub struct Rate {
    pub timestamp_seconds: u64,
    pub xdr_permyriad_per_icp: u64,
}
#[derive(CandidType, Deserialize)]
pub struct RateResponse {
    pub data: Rate,
    pub hash_tree: Vec<u8>,
    pub certificate: Vec<u8>,
}
#[derive(CandidType, Clone)]
pub struct NotifyMint {
    pub block_index: u64,
    pub to_subaccount: Option<Vec<u8>>,
    pub deposit_memo: Option<Vec<u8>>,
}
#[derive(CandidType, Deserialize, Debug, PartialEq, Eq)]
pub struct MintSuccess {
    pub block_index: Nat,
    pub minted: Nat,
    pub balance: Nat,
}
#[derive(CandidType, Deserialize, Debug)]
pub enum NotifyError {
    Refunded {
        reason: String,
        block_index: Option<u64>,
    },
    InvalidTransaction(String),
    TransactionTooOld(u64),
    Processing,
    Other {
        error_code: u64,
        error_message: String,
    },
}
#[derive(CandidType, Clone)]
pub struct Settings {
    pub controllers: Option<Vec<Principal>>,
    pub compute_allocation: Option<Nat>,
    pub memory_allocation: Option<Nat>,
    pub freezing_threshold: Option<Nat>,
}
#[derive(CandidType, Clone)]
pub enum SubnetSelection {
    Subnet { subnet: Principal },
}
#[derive(CandidType, Clone)]
pub struct CmcCreation {
    pub settings: Option<Settings>,
    pub subnet_selection: Option<SubnetSelection>,
}
#[derive(CandidType, Clone)]
pub struct CreateArgs {
    pub from_subaccount: Option<Vec<u8>>,
    pub created_at_time: Option<u64>,
    pub amount: Nat,
    pub creation_args: Option<CmcCreation>,
}
#[derive(CandidType, Deserialize, Debug)]
pub struct Created {
    pub block_id: Nat,
    pub canister_id: Principal,
}
#[derive(CandidType, Deserialize, Debug)]
pub enum CreateError {
    InsufficientFunds {
        balance: Nat,
    },
    TooOld,
    CreatedInFuture {
        ledger_time: u64,
    },
    TemporarilyUnavailable,
    Duplicate {
        duplicate_of: Nat,
        canister_id: Option<Principal>,
    },
    FailedToCreate {
        fee_block: Option<Nat>,
        refund_block: Option<Nat>,
        error: String,
    },
    GenericError {
        error_code: Nat,
        message: String,
    },
}

pub fn install_provisioning(pic: &PocketIc) {
    // System fixtures may be installed by the coordinator. User creations below
    // must go through the real Cycles Ledger -> CMC -> management path.
    let id = cycles_ledger();
    pic.create_canister_with_id(None, None, id).unwrap();
    pic.add_cycles(id, 20_000_000_000_000);
    pic.install_canister(
        id,
        artifact("cycles-ledger"),
        encode_one(CyclesArgs::Init(CyclesInit {
            max_blocks_per_request: 100,
            index_id: None,
            initial_balances: None,
        }))
        .unwrap(),
        None,
    );
    let controller = pic.get_controllers(cmc())[0];
    pic.reinstall_canister(
        cmc(),
        artifact("cycles-minting-canister"),
        encode_one(Some(CmcInit {
            ledger_canister_id: Some(LEDGER),
            governance_canister_id: Some(GOVERNANCE),
            minting_account_id: Some(hex::encode(l::account_id(GOVERNANCE, None))),
            cycles_ledger_canister_id: Some(id),
        }))
        .unwrap(),
        Some(controller),
    )
    .unwrap();
    update::<_, ()>(
        pic,
        cmc(),
        GOVERNANCE,
        "set_authorized_subnetwork_list",
        AuthorizedSubnets {
            who: None,
            subnets: pic.topology().get_app_subnets(),
        },
    );
    let rate: Result<(), String> = update(
        pic,
        cmc(),
        GOVERNANCE,
        "set_icp_xdr_conversion_rate",
        RateUpdate {
            timestamp_seconds: now(pic),
            xdr_permyriad_per_icp: 50_000,
            data_source: "Synthetic local fixture quote".into(),
            reason: None,
        },
    );
    rate.unwrap();
}
pub fn cycles_balance(pic: &PocketIc, owner: Principal, sub: Option<Vec<u8>>) -> Nat {
    query(
        pic,
        cycles_ledger(),
        "icrc1_balance_of",
        l::Account {
            owner,
            subaccount: sub,
        },
    )
}
pub fn creation_args(pic: &PocketIc, owner: Principal, sub: Option<Vec<u8>>) -> CreateArgs {
    CreateArgs {
        from_subaccount: sub,
        created_at_time: Some(now(pic) * 1_000_000_000),
        amount: 2_000_000_000_000u64.into(),
        creation_args: Some(CmcCreation {
            settings: Some(Settings {
                controllers: Some(vec![owner]),
                compute_allocation: Some(0u64.into()),
                memory_allocation: Some(0u64.into()),
                freezing_threshold: Some(2_592_000u64.into()),
            }),
            subnet_selection: Some(SubnetSelection::Subnet {
                subnet: pic.topology().get_app_subnets()[0],
            }),
        }),
    }
}
