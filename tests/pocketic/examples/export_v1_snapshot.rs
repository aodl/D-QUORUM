//! Regenerate only from the historical checksum-verified RC1 Wasm, never a live canister.
#[path = "../tests/support/mod.rs"]
mod support;
use candid::encode_one;
use d_quorum::state::{Init, Mode};
use sha2::{Digest, Sha256};
use std::io::Write;
use support::*;
fn main() {
    let path = std::env::args()
        .nth(1)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| root().join("dist/history/rc1/release-d_quorum.wasm"));
    let old = std::fs::read(path).unwrap();
    let module_hash = hex::encode(Sha256::digest(&old));
    assert_eq!(
        module_hash,
        "1cac858b906c615c1cb9444b3177cf1a04b3a52e9e46b0c4adc32a455eb9a3e1"
    );
    let pic = builder().build();
    let app = pic.create_canister();
    pic.install_canister(
        app,
        old,
        encode_one(Some(Init {
            mode: Mode::ObserveOnly,
            expected_target_controller: Some(user(9)),
        }))
        .unwrap(),
        None,
    );
    // Do not advance timers or install Governance/Ledger: init alone writes the real V1 envelope.
    let stable = pic.get_stable_memory(app);
    let mut encoder = flate2::GzBuilder::new()
        .mtime(0)
        .write(Vec::new(), flate2::Compression::best());
    encoder.write_all(&stable).unwrap();
    let compressed = encoder.finish().unwrap();
    let dir = root().join("tests/pocketic/fixtures");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("rc1-v1-initial-stable.bin.gz"), &compressed).unwrap();
    let provenance = serde_json::json!({"source_commit":"85f38e22e223d1d503988f776b21dcde51733a1d", "module_sha256":module_hash,"stable_bytes":stable.len(),"stable_sha256":hex::encode(Sha256::digest(&stable)),"gzip_sha256":hex::encode(Sha256::digest(&compressed)),"generation":"PocketIC init only; ObserveOnly; expected target user(9); no timers, network canisters or financial state"});
    std::fs::write(
        dir.join("rc1-v1-initial-stable.json"),
        serde_json::to_string_pretty(&provenance).unwrap() + "\n",
    )
    .unwrap();
    println!("{provenance}");
}
