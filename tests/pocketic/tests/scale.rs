mod support;
use candid::{Principal, encode_one};
use quorum_ic_clients::GOVERNANCE;
use support::*;
#[test]
#[ignore = "xtask scale prepares production Wasm first"]
fn synthetic_large_index_natural_timer_measurements() {
    measure(false);
}
#[test]
#[ignore = "xtask scale prepares production Wasm first"]
fn synthetic_large_index_with_compliant_candidate_and_exact_scores() {
    measure(true);
}
fn measure(populated: bool) {
    let production = wasm("d_quorum");
    let mock = wasm("quorum_mocks");
    let pic = builder().build();
    let app = pic.create_canister();
    pic.add_cycles(app, 100_000_000_000_000);
    let fixture = if populated {
        let empty = pic.create_canister();
        pic.set_controllers(empty, None, vec![]).unwrap();
        Some(fixture(now(&pic), empty, app))
    } else {
        None
    };
    let expected_public = 10_000
        + fixture.as_ref().map_or(0, |f| {
            f.infos.iter().filter(|n| n.visibility == Some(2)).count() as u64
        });
    pic.create_canister_with_id(None, None, GOVERNANCE).unwrap();
    pic.add_cycles(GOVERNANCE, 100_000_000_000_000);
    pic.install_canister(GOVERNANCE, mock, encode_one(fixture).unwrap(), None);
    let _: () = update(
        &pic,
        GOVERNANCE,
        Principal::anonymous(),
        "scale_init",
        10_000u64,
    );
    pic.install_canister(
        app,
        production,
        encode_one(None::<d_quorum::state::Init>).unwrap(),
        None,
    );
    let started = std::time::Instant::now();
    let initial_cycles = pic.cycle_balance(app);
    for _ in 0..550 {
        drive(&pic, 10);
        let progress: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
        if progress.phase == "ready" {
            break;
        }
        assert_ne!(progress.phase, "failed");
    }
    let progress: d_quorum::ScanProgress = query_empty(&pic, app, "scan_progress");
    assert_eq!(progress.phase, "ready");
    assert_eq!(progress.public_observations, expected_public);
    assert_eq!(progress.pages, if populated { 102 } else { 101 });
    assert_eq!(progress.full_batches, if populated { 201 } else { 200 });
    let scores: Vec<d_quorum::Score> =
        query2(&pic, app, "score_page", (None::<(i32, u64)>, 100u16));
    if populated {
        assert_eq!(scores.len(), 1);
        assert_eq!(
            scores[0].scaled_score,
            (u128::from(u64::MAX) * 10_000 + 12_000) * quorum_policy::SCALE
        );
        assert!(scores[0].complete);
    } else {
        assert!(scores.is_empty());
    }
    let health: d_quorum::Health = query_empty(&pic, app, "health");
    let calls: Vec<String> = query_empty(&pic, GOVERNANCE, "recordings");
    let status = pic.canister_status(app, None).unwrap();
    let metrics = serde_json::json!({"synthetic_public_neurons":10000,"total_public_observations":expected_public,"compliant_candidates": if populated { 1 } else { 0 },"score_entries":scores.len(),"pages":progress.pages,"full_batches":progress.full_batches,"governance_calls":calls.len(),"selection_measured_instructions":health.jobs[0].measured_instructions,"maximum_step_instructions":health.jobs[0].maximum_step_instructions,"serialized_state_bytes":health.stable_snapshot_bytes,"physical_stable_pages":health.stable_memory_pages,"wasm_heap_bytes":status.memory_metrics.wasm_memory_size.to_string(),"reported_stable_bytes":status.memory_metrics.stable_memory_size.to_string(),"total_canister_memory_bytes":status.memory_size.to_string(),"cycle_delta":initial_cycles-pic.cycle_balance(app),"wall_seconds":started.elapsed().as_secs_f64(),"scope":"local synthetic PocketIC production timers; bounded fixture, not a worst-case or mainnet bound"});
    std::fs::create_dir_all(root().join("dist/evidence")).unwrap();
    std::fs::write(
        root().join(if populated {
            "dist/evidence/scale-populated.json"
        } else {
            "dist/evidence/scale.json"
        }),
        serde_json::to_string_pretty(&metrics).unwrap(),
    )
    .unwrap();
    println!("{metrics}");
}
