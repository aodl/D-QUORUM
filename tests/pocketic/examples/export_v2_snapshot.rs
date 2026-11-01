//! Produce the migration fixture with the actual, checksum-verified RC2 Wasm.
#[path = "../tests/support/mod.rs"]
mod support;
use candid::{Principal, encode_one};
use d_quorum::state::{Init, Mode, ProposalJob, ProposalPhase};
use quorum_ic_clients::{GOVERNANCE, LEDGER, governance as g, ledger as l};
use sha2::{Digest, Sha256};
use std::io::Write;
use support::*;
fn main() {
    let old = std::fs::read(root().join("dist/history/rc2/release-d_quorum.wasm")).unwrap();
    let module_hash = hex::encode(Sha256::digest(&old));
    assert_eq!(
        module_hash,
        "867a31ec9a95b68b2d8a983d1e3ed406119b67a67b96270c3ef666093dc57019"
    );
    let pic = builder().build();
    let app = pic.create_canister();
    pic.add_cycles(app, 200_000_000_000_000);
    let empty = pic.create_canister();
    pic.set_controllers(empty, None, vec![]).unwrap();
    let mut f = fixture(now(&pic), empty, app);
    let mut proposer = raw(300, app, now(&pic));
    proposer.account = l::staking_subaccount(app, d_quorum::state::BOOTSTRAP_NONCE);
    proposer.visibility = Some(1);
    f.infos.push(g::NeuronInfo {
        id: proposer.id.clone(),
        retrieved_at_timestamp_seconds: now(&pic),
        known_neuron_data: None,
        visibility: proposer.visibility,
    });
    f.neurons.push(proposer);
    f.infos.sort_by_key(|n| n.id.as_ref().unwrap().id);
    let target = f
        .neurons
        .iter_mut()
        .find(|n| n.id.as_ref().unwrap().id == quorum_policy::TARGET)
        .unwrap();
    target.maturity_e8s_equivalent = 5_000_000_000;
    target.followees.retain(|(t, _)| *t != 1);
    target.followees.push(fs(1, &[101, 102, 103, 300]));
    for id in [GOVERNANCE, LEDGER] {
        pic.create_canister_with_id(None, None, id).unwrap();
        pic.add_cycles(id, 100_000_000_000_000);
        pic.install_canister(
            id,
            wasm("quorum_mocks"),
            encode_one(if id == GOVERNANCE {
                Some(f.clone())
            } else {
                None
            })
            .unwrap(),
            None,
        );
    }
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_staking_fund",
        1_000_000_000u64,
    );
    let _: () = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "ledger_init",
        2_000_000u64,
    );
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "reject_refresh_for",
        Some(100u64),
    );
    pic.install_canister(
        app,
        old,
        encode_one(Some(Init {
            mode: Mode::Live,
            expected_target_controller: Some(user(9)),
        }))
        .unwrap(),
        None,
    );
    let mut ready = false;
    for _ in 0..1200 {
        drive(&pic, 10);
        let ps: Vec<d_quorum::PayoutSummary> =
            query2(&pic, app, "payout_page", (None::<u64>, 100u16));
        let j: Option<ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if ps
            .first()
            .is_some_and(|p| p.complete && !p.maintenance_complete)
            && j.is_some_and(|j| matches!(j.phase, ProposalPhase::Open(1)))
        {
            ready = true;
            break;
        }
    }
    assert!(
        ready,
        "RC2 did not produce the reviewed financially settled/maintenance-blocked state"
    );
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "proposal_status",
        (1u64, 4i32),
    );
    let mut executed = false;
    for _ in 0..500 {
        drive(&pic, 10);
        let j: Option<ProposalJob> = query_empty(&pic, app, "proposal_progress");
        if j.is_some_and(|j| {
            matches!(j.phase, ProposalPhase::Executed(1))
                && !j.saw_disbursement
                && j.earliest_finalization.is_none()
        }) {
            executed = true;
            break;
        }
    }
    assert!(executed);
    pic.stop_canister(app, None).unwrap();
    let stable = pic.get_stable_memory(app);
    let history: l::History = update(
        &pic,
        LEDGER,
        Principal::anonymous(),
        "query_blocks",
        l::BlocksArgs {
            start: 0,
            length: 100,
        },
    );
    assert_eq!(history.blocks.len(), 1);
    let history_bytes = encode_one(history.blocks).unwrap();
    let mut encoder = flate2::GzBuilder::new()
        .mtime(0)
        .write(Vec::new(), flate2::Compression::best());
    encoder.write_all(&stable).unwrap();
    let compressed = encoder.finish().unwrap();
    let dir = root().join("tests/pocketic/fixtures");
    std::fs::write(
        dir.join("rc2-v2-financial-maturity-stable.bin.gz"),
        &compressed,
    )
    .unwrap();
    std::fs::write(dir.join("rc2-v2-ledger-blocks.candid"), &history_bytes).unwrap();
    let provenance = serde_json::json!({"ledger_history_sha256":hex::encode(Sha256::digest(&history_bytes)),"source_commit":"e14c9cb2fcc511472dfe273f9cee355c5d9f4a83","module_sha256":module_hash,"stable_bytes":stable.len(),"stable_sha256":hex::encode(Sha256::digest(&stable)),"gzip_sha256":hex::encode(Sha256::digest(&compressed)),"app":app.to_text(),"time_seconds":now(&pic),"generation":"Actual RC2 production natural timers with scripted Governance/Ledger; one exact confirmed payment, incomplete stake refresh, exact Executed proposal with no observed transient disbursement; Live only in local PocketIC"});
    std::fs::write(
        dir.join("rc2-v2-financial-maturity-stable.json"),
        serde_json::to_string_pretty(&provenance).unwrap() + "\n",
    )
    .unwrap();
    println!("{provenance}");
}
