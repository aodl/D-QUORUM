#[path = "support/creation.rs"]
mod creation;
mod support;
use candid::Nat;
use creation::*;
use quorum_ic_clients::{LEDGER, ledger as l};
use support::*;

#[test]
#[ignore = "creation_protocol lane uses checksum-pinned real CMC/Cycles Ledger"]
fn real_cmc_conversion_and_cycles_ledger_creation_deduplicate() {
    let pic = real_pic();
    let owner = user(41);
    let funding_sub = vec![41; 32];
    install_real(
        &pic,
        vec![],
        vec![(
            l::Account {
                owner,
                subaccount: Some(funding_sub.clone()),
            },
            1_000_000_000,
        )],
        artifact("governance-canister"),
        artifact("ledger-canister"),
    );
    install_provisioning(&pic);
    let fee: Nat = query_empty(&pic, LEDGER, "icrc1_fee");
    let amount = 200_000_000u64;
    let transfer = l::TransferArg {
        from_subaccount: Some(funding_sub.clone()),
        to: l::Account {
            owner: cmc(),
            subaccount: Some(principal_subaccount(owner)),
        },
        fee: Some(fee.clone()),
        created_at_time: Some(now(&pic) * 1_000_000_000),
        memo: Some(0x544e494du64.to_le_bytes().to_vec()),
        amount: amount.into(),
    };
    let block: Result<Nat, l::TransferError> =
        update(&pic, LEDGER, owner, "icrc1_transfer", transfer.clone());
    let block = block.unwrap();
    let repeated: Result<Nat, l::TransferError> =
        update(&pic, LEDGER, owner, "icrc1_transfer", transfer);
    assert!(
        matches!(repeated, Err(l::TransferError::Duplicate { duplicate_of }) if duplicate_of == block)
    );
    let notify = NotifyMint {
        block_index: l::nat(block).unwrap(),
        to_subaccount: Some(funding_sub.clone()),
        deposit_memo: Some(vec![41]),
    };
    let minted: Result<MintSuccess, NotifyError> =
        update(&pic, cmc(), owner, "notify_mint_cycles", notify.clone());
    let minted = minted.unwrap();
    assert_eq!(minted.minted, Nat::from(10_000_000_000_000u64));
    let repeated: Result<MintSuccess, NotifyError> =
        update(&pic, cmc(), owner, "notify_mint_cycles", notify);
    assert_eq!(repeated.unwrap(), minted);
    let before = cycles_balance(&pic, owner, Some(funding_sub.clone()));
    let create = creation_args(&pic, owner, Some(funding_sub.clone()));
    let created: Result<Created, CreateError> = update(
        &pic,
        cycles_ledger(),
        owner,
        "create_canister",
        create.clone(),
    );
    let created = created.unwrap();
    let duplicate: Result<Created, CreateError> =
        update(&pic, cycles_ledger(), owner, "create_canister", create);
    assert!(
        matches!(duplicate, Err(CreateError::Duplicate { duplicate_of, canister_id: Some(id) }) if id == created.canister_id && duplicate_of == created.block_id)
    );
    let after = cycles_balance(&pic, owner, Some(funding_sub.clone()));
    let cycle_fee: Nat = query_empty(&pic, cycles_ledger(), "icrc1_fee");
    assert_eq!(
        &before.0 - &after.0,
        Nat::from(2_000_000_000_000u64).0 + cycle_fee.0
    );
    assert_eq!(pic.get_controllers(created.canister_id), vec![owner]);
    let state = pic
        .canister_status(created.canister_id, Some(owner))
        .unwrap();
    assert!(state.module_hash.is_none());
    assert!(state.cycles.0 > Nat::from(1_000_000_000_000u64).0);
    // Real failed creation burns the attempt and reimbursement fees. Its
    // duplicate intentionally has no canister ID; a caller must not try a new ID.
    let mut bad = creation_args(&pic, owner, Some(funding_sub.clone()));
    bad.created_at_time = Some(now(&pic) * 1_000_000_000 + 1);
    bad.creation_args.as_mut().unwrap().subnet_selection =
        Some(SubnetSelection::Subnet { subnet: user(99) });
    let failure: Result<Created, CreateError> =
        update(&pic, cycles_ledger(), owner, "create_canister", bad.clone());
    assert!(matches!(
        failure,
        Err(CreateError::FailedToCreate {
            fee_block: Some(_),
            refund_block: Some(_),
            ..
        })
    ));
    let failed_balance = cycles_balance(&pic, owner, Some(funding_sub.clone()));
    let duplicate: Result<Created, CreateError> =
        update(&pic, cycles_ledger(), owner, "create_canister", bad);
    assert!(matches!(
        duplicate,
        Err(CreateError::Duplicate {
            canister_id: None,
            ..
        })
    ));
    assert_eq!(
        failed_balance,
        cycles_balance(&pic, owner, Some(funding_sub.clone()))
    );
    let fee: Nat = query_empty(&pic, cycles_ledger(), "icrc1_fee");
    // The pinned CMC also retains BAD_REQUEST_CYCLES_PENALTY (100M).
    assert_eq!(&after.0 - &failed_balance.0, fee.0 * 2u32 + Nat::from(100_000_000u64).0);

    // A failed real CMC deposit returns ICP to the original payer. Verify the
    // actual ledger transfer, rather than classifying a lower balance as success.
    pic.stop_canister(cycles_ledger(), None).unwrap();
    let payment: Result<Nat, l::TransferError> = update(
        &pic,
        LEDGER,
        owner,
        "icrc1_transfer",
        l::TransferArg {
            from_subaccount: Some(funding_sub.clone()),
            to: l::Account {
                owner: cmc(),
                subaccount: Some(principal_subaccount(owner)),
            },
            fee: Some(10_000u64.into()),
            amount: 100_000_000u64.into(),
            memo: Some(0x544e494du64.to_le_bytes().to_vec()),
            created_at_time: Some(now(&pic) * 1_000_000_000),
        },
    );
    let reply: Result<MintSuccess, NotifyError> = update(
        &pic,
        cmc(),
        owner,
        "notify_mint_cycles",
        NotifyMint {
            block_index: l::nat(payment.unwrap()).unwrap(),
            to_subaccount: Some(funding_sub.clone()),
            deposit_memo: None,
        },
    );
    let refund = match reply {
        Err(NotifyError::Refunded {
            block_index: Some(block),
            ..
        }) => block,
        other => panic!("expected real CMC refund, got {other:?}"),
    };
    let history: l::History = query(
        &pic,
        LEDGER,
        "query_blocks",
        l::BlocksArgs {
            start: refund,
            length: 1,
        },
    );
    assert_eq!(history.first_block_index, refund);
    match history.blocks[0].transaction.operation.as_ref().unwrap() {
        l::Operation::Transfer {
            to, amount, fee, ..
        } => {
            assert_eq!(*to, l::account_id(owner, Some(&funding_sub)));
            assert_eq!(amount.e8s, 100_000_000 - 30_000);
            assert_eq!(fee.e8s, 10_000);
        }
        other => panic!("refund was not a ledger transfer: {other:?}"),
    }
    println!(
        "real provisioned controller {}, sole owner {}, exact cycle debit and retained duplicate ID verified",
        created.canister_id, owner
    );
}
