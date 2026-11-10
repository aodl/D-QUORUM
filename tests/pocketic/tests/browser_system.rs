#[path = "support/browser_clock.rs"]
mod browser_clock;
#[path = "support/browser_creation.rs"]
mod browser_creation;
#[path = "support/creation.rs"]
mod creation;
mod support;
use candid::{CandidType, Deserialize, Principal, encode_one};
use pocket_ic::common::rest::{IcpFeatures, IcpFeaturesConfig, InstanceHttpGatewayConfig};
use quorum_ic_clients::{GOVERNANCE, LEDGER, governance as g, ledger as l};
use quorum_policy::TARGET;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::Path,
    process::{Child, Command},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use support::*;

// Test-only, independently decoded proposal fields; no production client expansion.
#[derive(CandidType, Deserialize)]
struct BrowserBallot {
    vote: i32,
    voting_power: u64,
}
#[derive(CandidType, Deserialize)]
struct BrowserProposal {
    id: Option<g::NeuronId>,
    status: i32,
    topic: i32,
    proposer: Option<g::NeuronId>,
    executed_timestamp_seconds: u64,
    ballots: Vec<(u64, BrowserBallot)>,
    proposal: Option<BrowserPayload>,
}
#[derive(CandidType, Deserialize)]
struct BrowserPayload {
    action: Option<BrowserAction>,
}
#[derive(CandidType, Deserialize)]
enum BrowserAction {
    ManageNeuron(BrowserManaged),
}
#[derive(CandidType, Deserialize)]
struct BrowserManaged {
    id: Option<g::NeuronId>,
    neuron_id_or_subaccount: Option<g::Id>,
    command: Option<BrowserCommand>,
}
#[derive(CandidType, Deserialize)]
enum BrowserCommand {
    Follow(BrowserFollow),
    DisburseMaturity(g::DisburseMaturity),
}
#[derive(CandidType, Deserialize)]
struct BrowserFollow {
    topic: i32,
    followees: Vec<g::NeuronId>,
}

fn browser_proposal(pic: &pocket_ic::PocketIc, caller: Principal, id: u64) -> BrowserProposal {
    update::<_, Option<BrowserProposal>>(pic, GOVERNANCE, caller, "get_proposal_info", id).unwrap()
}

#[derive(CandidType)]
struct ManagerKeyRequest {
    neuron_id_or_subaccount: Option<g::Id>,
    command: Option<ManagerKeyCommand>,
}
#[derive(CandidType)]
enum ManagerKeyCommand {
    Configure(ManagerKeyConfigure),
}
#[derive(CandidType)]
struct ManagerKeyConfigure {
    operation: Option<ManagerKeyOperation>,
}
#[derive(CandidType)]
enum ManagerKeyOperation {
    RemoveHotKey(RemoveManagerKey),
    AddHotKey(AddManagerKey),
}
#[derive(CandidType)]
struct RemoveManagerKey {
    hot_key_to_remove: Option<Principal>,
}
#[derive(CandidType)]
struct AddManagerKey {
    new_hot_key: Option<Principal>,
}
fn manager_key(pic: &pocket_ic::PocketIc, principal: Principal, restore: bool) {
    let operation = if restore {
        ManagerKeyOperation::AddHotKey(AddManagerKey {
            new_hot_key: Some(principal),
        })
    } else {
        ManagerKeyOperation::RemoveHotKey(RemoveManagerKey {
            hot_key_to_remove: Some(principal),
        })
    };
    let response: g::ManageResponse = update(
        pic,
        GOVERNANCE,
        user(13),
        "manage_neuron",
        ManagerKeyRequest {
            neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: 13 })),
            command: Some(ManagerKeyCommand::Configure(ManagerKeyConfigure {
                operation: Some(operation),
            })),
        },
    );
    assert!(matches!(
        response.command,
        Some(g::ResponseCommand::Configure(_))
    ));
}
fn independently_read_ballots(
    pic: &pocket_ic::PocketIc,
    proposal: u64,
    callers: &[Principal],
) -> std::collections::BTreeSet<(u64, i32, u64)> {
    let mut observed = std::collections::BTreeMap::new();
    // Governance filters ballots to caller-readable neurons. Union authorised
    // readbacks; a public response is not the complete management electorate.
    for caller in callers {
        for (id, ballot) in browser_proposal(pic, *caller, proposal).ballots {
            if let Some(prior) = observed.insert(id, (ballot.vote, ballot.voting_power)) {
                assert_eq!(prior, (ballot.vote, ballot.voting_power));
            }
        }
    }
    observed
        .into_iter()
        .map(|(id, (vote, power))| (id, vote, power))
        .collect()
}

#[derive(CandidType)]
struct CertifiedHttpRequest {
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
    certificate_version: Option<u16>,
}
#[derive(CandidType, Deserialize)]
struct CertifiedHttpResponse {
    status_code: u16,
    body: Vec<u8>,
}
fn gateway_get(id: Principal, directory: &Path, label: &str) -> (u16, Vec<u8>) {
    let body = directory.join(format!("gateway-{label}.txt"));
    let response = Command::new("curl")
        .args([
            "--silent",
            "--show-error",
            "--noproxy",
            "*",
            "--max-time",
            "30",
            "--resolve",
            &format!("{id}.localhost:{}:127.0.0.1", browser_port()),
            "--output",
            body.to_str().unwrap(),
            "--write-out",
            "%{http_code}",
            &format!("http://{id}.localhost:{}/", browser_port()),
        ])
        .output()
        .unwrap();
    assert!(response.status.success());
    (
        String::from_utf8(response.stdout).unwrap().parse().unwrap(),
        fs::read(body).unwrap(),
    )
}
fn verify_http_certification(
    pic: &pocket_ic::PocketIc,
    id: Principal,
    directory: &Path,
    normal: &[u8],
    corrupt: &[u8],
) {
    assert_eq!(gateway_get(id, directory, "normal").0, 200);
    pic.upgrade_canister(id, corrupt.to_vec(), encode_one(()).unwrap(), None)
        .unwrap();
    let raw: CertifiedHttpResponse = query(
        pic,
        id,
        "http_request",
        CertifiedHttpRequest {
            method: "GET".into(),
            url: "/".into(),
            headers: vec![],
            body: vec![],
            certificate_version: Some(2),
        },
    );
    assert_eq!(raw.status_code, 200);
    assert!(raw.body.ends_with(b"invalid-certified-body"));
    let (status, body) = gateway_get(id, directory, "corrupt");
    assert!(
        matches!(status, 500 | 502 | 503),
        "gateway accepted or misclassified corrupted certified HTTP body: {status}"
    );
    let message = String::from_utf8_lossy(&body).to_lowercase();
    assert!(
        message.contains("verif") || message.contains("certif"),
        "gateway rejection was not a certification error: {message}"
    );
    pic.upgrade_canister(id, normal.to_vec(), encode_one(()).unwrap(), None)
        .unwrap();
    assert_eq!(gateway_get(id, directory, "restored").0, 200);
    fs::write(directory.join("http-certification-negative.json"),serde_json::to_vec_pretty(&serde_json::json!({"normal_module_sha256":hex::encode(Sha256::digest(normal)),"corrupt_module_sha256":hex::encode(Sha256::digest(corrupt)),"normal_status":200,"direct_corrupt_canister_status":raw.status_code,"corrupt_gateway_status":status,"restored_status":200,"classification":"actual pinned gateway rejects body changed after certification; healthy canister and valid controls exclude missing-method/stopped-canister false positives","error_excerpt":message.chars().take(512).collect::<String>()})).unwrap()).unwrap();
}

fn local_frontend(
    directory: &Path,
    id: Principal,
    alternate_assets: bool,
    identity_provider: &str,
    tamper_http: bool,
    retain_ii_device: bool,
    historical_bootstrap: bool,
) -> Vec<u8> {
    const HISTORICAL_FRONTEND_SOURCE: &str = "97343f8dbb714a0a12f90a474805518c83017184";
    const HISTORICAL_BOOTSTRAP: &str =
        "fef1735bb08b92bad58ec761f199741fa459292b81864c219aff5442e7423265";
    let source = directory.join("source");
    fs::create_dir_all(&source).unwrap();
    let mut listing = Command::new("git");
    if historical_bootstrap {
        listing.args([
            "ls-tree",
            "-r",
            "-z",
            "--name-only",
            HISTORICAL_FRONTEND_SOURCE,
            "--",
            "dendrite/",
        ]);
    } else {
        listing.args([
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "dendrite/",
        ]);
    }
    let listed = listing.current_dir(root()).output().unwrap();
    assert!(listed.status.success());
    let mut source_files = std::collections::BTreeMap::new();
    for file in listed.stdout.split(|b| *b == 0).filter(|p| !p.is_empty()) {
        let file = std::str::from_utf8(file).unwrap();
        assert!(!file.ends_with(".pem") && !file.split('/').any(|p| p.starts_with(".env")));
        // Development diagnostics may have a reviewed old generated asset staged
        // for deletion. Full qualification independently requires a clean source.
        if !historical_bootstrap && !root().join(file).is_file() {
            continue;
        }
        let target = source.join(file.strip_prefix("dendrite/").unwrap());
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        let content = if historical_bootstrap {
            let old = Command::new("git")
                .args(["show", &format!("{HISTORICAL_FRONTEND_SOURCE}:{file}")])
                .current_dir(root())
                .output()
                .unwrap();
            assert!(
                old.status.success(),
                "reviewed historical frontend source is unavailable"
            );
            old.stdout
        } else {
            fs::read(root().join(file)).unwrap()
        };
        source_files.insert(file.to_string(), hex::encode(Sha256::digest(&content)));
        fs::write(target, content).unwrap();
    }
    if historical_bootstrap {
        for file in ["package.json", "package-lock.json"] {
            assert_eq!(
                fs::read(source.join(file)).unwrap(),
                fs::read(root().join("dendrite").join(file)).unwrap(),
                "historical frontend requires its exact reviewed npm dependency lock"
            );
        }
    }
    std::os::unix::fs::symlink(
        root().join("dendrite/node_modules"),
        source.join("node_modules"),
    )
    .unwrap();
    if tamper_http {
        let assets = source.join("canisters/dendrite/src/assets.rs");
        let original = fs::read_to_string(&assets).unwrap();
        let old = "    ROUTER.with_borrow(|router| {\n        router\n            .serve_asset(&certificate, &request)\n            .expect(\"the certified 404 fallback covers every GET asset path\")\n    })";
        let replacement = "    let response = ROUTER.with_borrow(|router| { router.serve_asset(&certificate, &request).expect(\"test-only HTTP body corruption\") });\n    let mut body=response.body().to_vec();body.extend_from_slice(b\"invalid-certified-body\");\n    HttpResponse::builder().with_status_code(response.status_code()).with_headers(response.headers().to_vec()).with_body(body).build()";
        assert!(original.contains(old));
        fs::write(assets, original.replace(old, replacement)).unwrap();
    }
    if alternate_assets {
        let css = source.join("canisters/dendrite/web/src/styles.css");
        let mut bytes = fs::read(&css).unwrap();
        bytes.extend_from_slice(b"\n/* isolated authenticated-upgrade asset evidence */\n");
        fs::write(css, bytes).unwrap();
    }
    let origin = format!("http://{id}.localhost:{}", browser_port());
    let config = serde_json::json!({"DENDRITE_BUILD_MODE":"local","DENDRITE_CANISTER_ID":id.to_text(),"DENDRITE_API_HOST":format!("http://127.0.0.1:{}",browser_port()),"DENDRITE_FETCH_ROOT_KEY":"true","DENDRITE_DERIVATION_ORIGIN":origin,"DENDRITE_IDENTITY_PROVIDER":identity_provider,"DENDRITE_ALTERNATIVE_ORIGINS_JSON":"[]"});
    let mut build = if retain_ii_device {
        let mut cmd = Command::new("node");
        cmd.arg(root().join("tests/browser/build-creation-fixture.mjs"))
            .arg(&source);
        cmd
    } else {
        let mut cmd = Command::new("npm");
        cmd.args(["run", "build"]);
        cmd
    };
    build.current_dir(&source);
    if historical_bootstrap {
        let compiled = directory.join("historical-bootstrap-input");
        fs::create_dir_all(&compiled).unwrap();
        let wasm = fs::read(root().join(format!(
            "dendrite/canisters/bootstrap/compat/{HISTORICAL_BOOTSTRAP}.wasm"
        )))
        .unwrap();
        assert_eq!(hex::encode(Sha256::digest(&wasm)), HISTORICAL_BOOTSTRAP);
        fs::write(compiled.join("bootstrap.wasm"), wasm).unwrap();
        fs::copy(
            source.join("canisters/bootstrap/bootstrap.did"),
            compiled.join("bootstrap.did"),
        )
        .unwrap();
        fs::copy(
            source.join("src/declarations/bootstrap/policy.json"),
            compiled.join("policy.json"),
        )
        .unwrap();
        build
            .env_remove("DENDRITE_BOOTSTRAP_RELEASE_DIR")
            .env("DENDRITE_BOOTSTRAP_COMPILED_DIR", compiled);
    } else {
        build.env(
            "DENDRITE_BOOTSTRAP_RELEASE_DIR",
            std::env::var_os("DENDRITE_BOOTSTRAP_RELEASE_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| root().join("dendrite/target/bootstrap-release")),
        );
    }
    for (key, value) in config.as_object().unwrap() {
        build.env(key, value.as_str().unwrap());
    }
    assert!(build.status().unwrap().success());
    if historical_bootstrap {
        let manifest: serde_json::Value = serde_json::from_slice(
            &fs::read(source.join("target/bootstrap-release/manifest.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest["sha256"], HISTORICAL_BOOTSTRAP);
        fs::write(directory.join("historical-bootstrap-policy.json"), serde_json::to_vec_pretty(&serde_json::json!({
            "classification":"actual reviewed historical frontend source, with current recorded native-window infrastructure only; no canonical production-byte claim",
            "historical_frontend_source":HISTORICAL_FRONTEND_SOURCE,
            "source_files":source_files,
            "npm_dependency_lock_identical":true,
            "manifest":manifest
        })).unwrap()).unwrap();
    }
    let mut probe = Command::new("node");
    probe
        .arg(root().join("tests/browser/build-scope-probe.mjs"))
        .arg(&source)
        .current_dir(root());
    for (key, value) in config.as_object().unwrap() {
        probe.env(key, value.as_str().unwrap());
    }
    assert!(probe.status().unwrap().success());
    assert!(
        Command::new("cargo")
            .args([
                "build",
                "--locked",
                "--release",
                "--target",
                "wasm32-unknown-unknown",
                "-p",
                "dendrite"
            ])
            .current_dir(&source)
            .env(
                "CARGO_TARGET_DIR",
                root().join("dendrite/target/local-browser")
            )
            .status()
            .unwrap()
            .success()
    );
    let bytes = fs::read(
        root().join("dendrite/target/local-browser/wasm32-unknown-unknown/release/dendrite.wasm"),
    )
    .unwrap();
    let head = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(root())
        .output()
        .unwrap();
    let tree = Command::new("git")
        .args(["rev-parse", "HEAD^{tree}"])
        .current_dir(root())
        .output()
        .unwrap();
    let dirty = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(root())
        .output()
        .unwrap();
    fs::write(directory.join("dendrite-local.wasm"), &bytes).unwrap();
    fs::write(directory.join("local-build.json"),serde_json::to_vec_pretty(&serde_json::json!({"root_source":String::from_utf8(head.stdout).unwrap().trim(),"root_git_tree":String::from_utf8(tree.stdout).unwrap().trim(),"source_dirty":!dirty.stdout.is_empty(),"alternate_assets":alternate_assets,"http_body_corruption":tamper_http,"test_only_asset_delta":"extra scoped-signing/evidence/mutation-fault JS and replacement 404 test page; optional stylesheet or HTTP body negative control; excluded from canonical assets","configuration":config,"wasm_sha256":hex::encode(Sha256::digest(&bytes)),"classification":"local browser configuration; never canonical production bytes"})).unwrap()).unwrap();
    bytes
}
fn publish(directory: &Path, name: &str, value: serde_json::Value) {
    let temporary = directory.join(format!("{name}.json.tmp"));
    fs::write(&temporary, serde_json::to_vec(&value).unwrap()).unwrap();
    fs::rename(temporary, directory.join(format!("{name}.json"))).unwrap();
}
fn signal(directory: &Path, name: &str, child: &mut Child) -> serde_json::Value {
    // Five independent II setups are serial and each retains the SDK's own
    // channel timeout. This orchestration budget is not delegation freshness.
    let seconds = if name == "creation-principal" {
        600
    } else {
        240
    };
    let deadline = Instant::now() + Duration::from_secs(seconds);
    loop {
        let path = directory.join(format!("{name}.json"));
        if path.exists() {
            return serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        }
        if let Some(status) = child.try_wait().unwrap() {
            // This file contains only a public II heading and clicked control labels,
            // never SDK errors, request envelopes or delegation credentials.
            let ii_failure = fs::read_to_string(directory.join("ii-failure.json"))
                .unwrap_or_else(|_| "no II failure heading recorded".into());
            panic!(
                "browser exited before {name}: {status}; {ii_failure}; inspect browser-system.log"
            );
        }
        assert!(
            Instant::now() < deadline,
            "browser coordination timeout: {name}"
        );
        std::thread::sleep(Duration::from_millis(200));
    }
}
#[test]
#[ignore = "xtask system_browser provisions actual II, real protocol and pinned Chromium"]
fn real_ii_compiled_frontend_known_managers_and_signed_governance() {
    browser_world("team-management");
}
#[test]
#[ignore = "xtask system_browser uses real II with dummy authentication disabled"]
fn real_ii_scoped_child_is_enforced_by_replica() {
    browser_world("scoped-signing");
}

#[test]
#[ignore = "creation_browser signed real-II recoverable creation journey"]
fn real_ii_recoverable_creation_and_ledger_recovery() {
    browser_world("creation-recoverable");
}

#[test]
#[ignore = "creation_browser signed real-II registration-first finalisation journey"]
fn real_ii_production_creation_finalisation_and_subsequent_management() {
    browser_world("creation-production");
}
#[test]
#[ignore = "xtask system_browser uses the real SDK channel-establishment timeout"]
fn real_ii_closed_popup_does_not_publish_session() {
    browser_world("cancellation");
}
#[test]
#[ignore = "xtask system_browser reuses the existing full anonymous browser qualification against local real protocol"]
fn real_local_anonymous_browser_preserves_responsive_and_certificate_checks() {
    browser_world("anonymous");
}
#[test]
#[ignore = "xtask system_browser rejects an actual local provider misconfiguration without injected credentials"]
fn real_browser_wrong_provider_never_publishes_a_transaction_session() {
    browser_world("wrong-provider");
}
fn anonymous_neurons(pic: &pocket_ic::PocketIc) -> Vec<SeedNeuron> {
    let at = now(pic);
    let blackhole = pic.create_canister();
    pic.add_cycles(blackhole, 10_000_000_000_000);
    pic.install_canister(
        blackhole,
        wasm("quorum_mocks"),
        encode_one(None::<quorum_mocks::Fixture>).unwrap(),
        None,
    );
    // Deliberately non-compliant real controller: pass and fail filters both exist.
    // The economic journey retains genuinely empty controllerless controllers.
    pic.set_controllers(blackhole, None, vec![]).unwrap();
    let mut target = seed(100, blackhole, at);
    target.known_neuron_data = Some(known(100));
    target.followees = dendrite_types::RECOGNISED_TOPICS
        .into_iter()
        .map(|topic| {
            if topic == 1 {
                fs(topic, &[11, 12, 13, 14, 15])
            } else if topic == 4 {
                fs(topic, &[11, 12, 13])
            } else {
                fs(topic, &[dendrite_types::ALPHA_VOTE_NEURON_ID])
            }
        })
        .collect();
    let mut neurons = vec![target];
    for id in 11..16 {
        let mut manager = seed(id, user(id as u8), at);
        manager.known_neuron_data = Some(known(id));
        manager.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
        neurons.push(manager);
    }
    for id in [
        dendrite_types::ALPHA_VOTE_NEURON_ID,
        dendrite_types::OMEGA_REJECT_NEURON_ID,
    ] {
        neurons.push(seed(id, user(1), at));
    }
    neurons
}
fn browser_world(scenario: &str) {
    let wall = Instant::now();
    let evidence = root().join("dist/evidence/browser-system").join(scenario);
    if evidence.exists() {
        let history = root().join(".cache/browser-system-history");
        fs::create_dir_all(&history).unwrap();
        fs::rename(
            &evidence,
            history.join(format!("{scenario}-{}", std::process::id())),
        )
        .unwrap();
    }
    fs::create_dir_all(&evidence).unwrap();
    let scope_probe_mode = scenario == "scoped-signing";
    let directory = root().join(format!(
        ".cache/tmp/browser-world-{scenario}-{}",
        std::process::id()
    ));
    fs::create_dir(&directory).unwrap();
    // The first application ID is deterministic for this pinned topology.
    // Compile and checksum the local application before starting the test world.
    let expected_verifier = Principal::from_text("pi33i-pt777-77776-aaaaa-cai").unwrap();
    let provider = if scenario == "wrong-provider" {
        format!(
            "http://{expected_verifier}.localhost:{}/authorize",
            browser_port()
        )
    } else {
        format!("http://id.ai.localhost:{}/authorize", browser_port())
    };
    let local = local_frontend(
        &directory,
        expected_verifier,
        false,
        &provider,
        false,
        scenario.starts_with("creation-"),
        scenario == "creation-recoverable",
    );
    let upgraded_local = if scenario == "team-management" || scenario == "creation-recoverable" {
        Some(local_frontend(
            &directory.join("upgrade"),
            expected_verifier,
            scenario == "team-management",
            &provider,
            false,
            scenario == "creation-recoverable",
            false,
        ))
    } else {
        None
    };
    let corrupt_local = if scenario == "anonymous" {
        Some(local_frontend(
            &directory.join("corrupt-http"),
            expected_verifier,
            false,
            &provider,
            true,
            false,
            false,
        ))
    } else {
        None
    };
    let host_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;
    let domains = directory.join("domains.txt");
    fs::write(&domains, format!("id.ai.localhost:{}\n", ii_frontend_id())).unwrap();
    let clock_server = scenario
        .starts_with("creation-")
        .then(|| browser_clock::ClockServer::start(&directory));
    let mut world_builder = builder();
    if let Some(clock) = &clock_server {
        world_builder = world_builder.with_server_url(clock.url.parse().unwrap());
    }
    let mut pic = world_builder
        .with_initial_time(pocket_ic::Time::from_nanos_since_unix_epoch(host_time))
        .with_ii_subnet()
        .with_http_gateway(InstanceHttpGatewayConfig {
            ip_addr: Some("127.0.0.1".into()),
            port: Some(browser_port()),
            domains: Some(vec!["localhost".into()]),
            https_config: None,
            domain_custom_provider_local_file: Some(domains.to_str().unwrap().into()),
        })
        .with_icp_features(IcpFeatures {
            ii: Some(IcpFeaturesConfig::DefaultConfig),
            registry: Some(IcpFeaturesConfig::DefaultConfig),
            cycles_minting: Some(IcpFeaturesConfig::DefaultConfig),
            ..Default::default()
        })
        .build();
    configure_real_ii_at_port(&pic, browser_port());
    let verifier = pic.create_canister();
    pic.add_cycles(verifier, 200_000_000_000_000);
    assert_eq!(
        verifier, expected_verifier,
        "pinned topology allocation changed"
    );
    pic.install_canister(verifier, local.clone(), encode_one(()).unwrap(), None);
    // Compilation is outside the interactive phase. Move only forward to the
    // host clock before issuing certificates/delegations; never extend validity.
    let interactive_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;
    assert!(pic.get_time().as_nanos_since_unix_epoch() <= interactive_time);
    pic.set_time(pocket_ic::Time::from_nanos_since_unix_epoch(
        interactive_time,
    ));
    pic.auto_progress();
    pic.make_live(Some(browser_port()));
    if scenario == "creation-production" {
        browser_clock::verify_gateway_freshness(&pic, &directory, verifier);
    }
    let uid = Command::new("id").arg("-u").output().unwrap();
    let gid = Command::new("id").arg("-g").output().unwrap();
    let process_user = format!(
        "{}:{}",
        String::from_utf8(uid.stdout).unwrap().trim(),
        String::from_utf8(gid.stdout).unwrap().trim()
    );
    let name = format!("dendrite-browser-{}", std::process::id());
    let log = fs::File::create(directory.join("browser-system.log")).unwrap();
    if scenario == "anonymous" {
        verify_http_certification(
            &pic,
            verifier,
            &directory,
            &local,
            corrupt_local.as_ref().unwrap(),
        );
    }
    let mut child = if scenario == "anonymous" {
        install_real(
            &pic,
            anonymous_neurons(&pic),
            vec![],
            artifact("governance-canister"),
            artifact("ledger-canister"),
        );
        Command::new("sh")
            .arg(root().join("dendrite/tools/scripts/browser-smoke.sh"))
            .arg(directory.join("source/canisters/dendrite/public"))
            .current_dir(root().join("dendrite"))
            .env("DENDRITE_BROWSER_CONTAINER_NAME", &name)
            .env("DENDRITE_BROWSER_LOCAL_WORLD", "true")
            .env("DENDRITE_BROWSER_CANISTER_ID", verifier.to_text())
            .env(
                "DENDRITE_BROWSER_BASE_URL",
                format!("http://{verifier}.localhost:{}", browser_port()),
            )
            .env(
                "DENDRITE_BROWSER_EVIDENCE_DIR",
                directory.join("anonymous-evidence"),
            )
            .stdout(log.try_clone().unwrap())
            .stderr(log)
            .spawn()
            .unwrap()
    } else {
        Command::new("docker").args(["run","--rm","--name",&name,"--network","host","--user",&process_user,"-v",&format!("{}:/workspace:ro",root().display()),"-v",&format!("{}:/coordination",directory.display()),"-w","/workspace","-e",&format!("SYSTEM_BROWSER_SCENARIO={scenario}"),"-e","SYSTEM_BROWSER_COORDINATION=/coordination","-e",&format!("SYSTEM_BROWSER_ORIGIN=http://{verifier}.localhost:{}",browser_port()),"ghcr.io/puppeteer/puppeteer:25.16.0@sha256:956a72e3d523c76606efaad23392fbe33950370189f749715222c7427f57392b","node","tests/browser/team-management.mjs"]).stdout(log.try_clone().unwrap()).stderr(log).spawn().unwrap()
    };
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if scenario == "anonymous" {
            assert!(child.wait().unwrap().success());
            return;
        }
        if scenario == "wrong-provider" {
            let proof = signal(&directory, "wrong-provider", &mut child);
            assert_eq!(proof["failedClosed"], true);
            assert_eq!(proof["governanceRequests"], 0);
            assert!(child.wait().unwrap().success());
            return;
        }
        if scenario == "cancellation" {
            let proof = signal(&directory, "cancellation", &mut child);
            assert_eq!(proof["actualPopupClosed"], true);
            assert_eq!(proof["noSessionPublished"], true);
            assert_eq!(proof["temporaryExpiryCleared"], true);
            assert_eq!(proof["governanceRequests"], 0);
            assert!(child.wait().unwrap().success());
            return;
        }
        if scope_probe_mode {
            let at = now(&pic);
            install_real(
                &pic,
                vec![seed(100, user(100), at)],
                vec![(
                    l::Account {
                        owner: user(41),
                        subaccount: None,
                    },
                    1_000_000_000,
                )],
                artifact("governance-canister"),
                artifact("ledger-canister"),
            );
            creation::install_provisioning(&pic);
            publish(&directory, "provisioned", serde_json::json!({}));
            let identity = signal(&directory, "scope-provisioning-principal", &mut child);
            let principal = Principal::from_text(identity["principal"].as_str().unwrap()).unwrap();
            let payment: Result<candid::Nat, l::TransferError> = update(
                &pic,
                LEDGER,
                user(41),
                "icrc1_transfer",
                l::TransferArg {
                    from_subaccount: None,
                    to: l::Account {
                        owner: principal,
                        subaccount: None,
                    },
                    fee: Some(10_000u64.into()),
                    amount: 600_000_000u64.into(),
                    memo: None,
                    created_at_time: Some(pic.get_time().as_nanos_since_unix_epoch()),
                },
            );
            payment.unwrap();
            publish(&directory, "scope-funding-ready", serde_json::json!({}));
            let proof = signal(&directory, "scope-probe", &mut child);
            assert_eq!(proof["unrestrictedRejected"], true);
            assert_eq!(proof["principalPreserved"], true);
            assert_eq!(proof["allowedGovernanceRead"], true);
            assert_eq!(proof["nonGovernanceScopeDenied"], true);
            assert_eq!(proof["controlDestinationSucceeded"], true);
            let provisioned = &proof["provisioning"];
            assert_eq!(provisioned["principal"], principal.to_text());
            assert_eq!(provisioned["exactBootstrapManagementDenied"], true);
            assert_eq!(
                provisioned["sameManagementScopeCanReadOtherOwnedCanister"],
                true
            );
            for name in [
                "principalPreserved",
                "fundingManagementDenied",
                "soleControllerVerified",
                "installedHashVerified",
                "bootstrapCallSucceeded",
                "stopVerified",
                "uninstallBeforeControllerRemoval",
                "certifiedModuleAbsent",
                "certifiedControllersEmpty",
                "reinstallDenied",
            ] {
                assert_eq!(
                    provisioned[name], true,
                    "missing real delegated provisioning proof: {name}"
                );
            }
            assert!(
                pic.get_controllers(
                    Principal::from_text(provisioned["canister"].as_str().unwrap()).unwrap()
                )
                .is_empty()
            );
            assert_eq!(
                pic.get_controllers(
                    Principal::from_text(provisioned["otherOwnedCanister"].as_str().unwrap())
                        .unwrap()
                ),
                vec![principal]
            );
            assert!(child.wait().unwrap().success());
            return;
        }
        if scenario.starts_with("creation-") {
            browser_creation::coordinate(
                &pic,
                verifier,
                &directory,
                scenario,
                &mut child,
                upgraded_local.as_deref(),
            );
            assert!(child.wait().unwrap().success());
            return;
        }
        let principals = signal(&directory, "principals", &mut child);
        let principals: Vec<Principal> = principals
            .as_array()
            .unwrap()
            .iter()
            .map(|p| Principal::from_text(p.as_str().unwrap()).unwrap())
            .collect();
        assert_eq!(principals.len(), 4);
        assert_eq!(
            principals
                .iter()
                .copied()
                .collect::<std::collections::BTreeSet<_>>()
                .len(),
            4
        );
        let at = now(&pic);
        let blackhole = pic.create_canister();
        pic.set_controllers(blackhole, None, vec![]).unwrap();
        let mut target = seed(100, blackhole, at);
        target.known_neuron_data = Some(known(100));
        target.followees = dendrite_types::RECOGNISED_TOPICS
            .into_iter()
            .map(|topic| {
                if topic == 1 {
                    fs(topic, &[11, 12, 13, 14, 15])
                } else if matches!(topic, 4 | 7) {
                    fs(topic, &[11, 12, 13])
                } else {
                    fs(topic, &[dendrite_types::ALPHA_VOTE_NEURON_ID])
                }
            })
            .collect();
        let automation = pic.create_canister();
        pic.add_cycles(automation, 200_000_000_000_000);
        let automation_cycles_before = pic.cycle_balance(automation);
        let mut neurons = vec![target];
        for (id, first) in [(106, 2010), (112, 2020), (118, 2030)] {
            let mut candidate = seed(id, blackhole, at);
            candidate.known_neuron_data = Some(known(id));
            candidate.followees = dendrite_types::RECOGNISED_TOPICS
                .into_iter()
                .map(|topic| {
                    if topic == 1 {
                        fs(topic, &(first..first + 5).collect::<Vec<_>>())
                    } else if matches!(topic, 4 | 7) {
                        fs(topic, &(first..first + 3).collect::<Vec<_>>())
                    } else {
                        fs(topic, &[dendrite_types::ALPHA_VOTE_NEURON_ID])
                    }
                })
                .collect();
            neurons.push(candidate);
            for id in first..first + 5 {
                let mut manager = seed(id, user((id % 200) as u8), at);
                manager.known_neuron_data = Some(known(id));
                manager.followees = vec![
                    fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID]),
                    fs(7, &[dendrite_types::OMEGA_REJECT_NEURON_ID]),
                ];
                neurons.push(manager);
            }
        }
        let mut source = seed(200, user(2), at);
        source.aging_since_timestamp_seconds = 0; // Saturated age bonus: independent VP reads remain comparable.
        source.followees = vec![fs(4, &[100, 106]), fs(7, &[100, 106])];
        neurons.push(source);
        // Direct support from 202 only: 201's following of 202 must not propagate.
        let mut upstream = seed(201, user(2), at);
        upstream.aging_since_timestamp_seconds = 0;
        upstream.followees = vec![fs(4, &[202]), fs(7, &[202])];
        neurons.push(upstream);
        let mut direct = seed(202, user(2), at);
        direct.aging_since_timestamp_seconds = 0;
        direct.cached_neuron_stake_e8s = 5_000_000_000;
        direct.followees = vec![fs(4, &[106]), fs(7, &[106])];
        neurons.push(direct);
        let mut quorum = seed(TARGET, user(9), at);
        quorum.hot_keys = vec![automation];
        quorum.followees = vec![fs(1, &[300, 11, 12, 14, 15])];
        quorum.maturity_e8s_equivalent = 5_000_000_000;
        neurons.push(quorum);
        let mut proposer = seed(300, automation, at);
        proposer.account = l::staking_subaccount(automation, d_quorum::state::BOOTSTRAP_NONCE);
        proposer.known_neuron_data = Some(known(300));
        neurons.push(proposer);

        for id in (11..16).chain(21..26) {
            let controller = if id == 11 {
                principals[0]
            } else if id == 12 {
                principals[1]
            } else if id == 21 {
                principals[3]
            } else {
                user((id % 200) as u8)
            };
            let mut n = seed(id, controller, at);
            if id == 13 {
                n.hot_keys = vec![principals[2]];
            }
            n.known_neuron_data = Some(known(id));
            n.followees = vec![
                fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID]),
                fs(7, &[dendrite_types::OMEGA_REJECT_NEURON_ID]),
            ];
            neurons.push(n);
        }
        for id in [
            dendrite_types::ALPHA_VOTE_NEURON_ID,
            dendrite_types::OMEGA_REJECT_NEURON_ID,
        ] {
            neurons.push(seed(id, user(1), at));
        }
        install_real(
            &pic,
            neurons,
            vec![(
                l::Account {
                    owner: user(7),
                    subaccount: None,
                },
                10_000_000_000_000,
            )],
            artifact("governance-canister"),
            artifact("ledger-canister"),
        );
        for id in [11, 12, 13, 21, 22] {
            let batch: g::ListNeuronsResponse = update(
                &pic,
                GOVERNANCE,
                Principal::anonymous(),
                "list_neurons",
                g::ListNeurons {
                    neuron_ids: vec![id],
                    include_neurons_readable_by_caller: false,
                    include_empty_neurons_readable_by_caller: Some(false),
                    include_public_neurons_in_full_neurons: Some(true),
                    page_number: Some(0),
                    page_size: Some(50),
                    neuron_subaccounts: None,
                },
            );
            assert_eq!(batch.full_neurons.len(), 1);
            assert!(
                batch.full_neurons[0].known_neuron_data.is_none(),
                "old helper negative control must observe absent batch metadata"
            );
            let scalar: Result<g::NeuronInfo, g::GovernanceError> = update(
                &pic,
                GOVERNANCE,
                Principal::anonymous(),
                "get_neuron_info",
                id,
            );
            let scalar = scalar.unwrap();
            assert_eq!(scalar.id.unwrap().id, id);
            assert!(scalar.known_neuron_data.is_some());
            assert_eq!(scalar.visibility, Some(2));
        }
        publish(&directory, "provisioned", serde_json::json!({}));
        let outsider = signal(&directory, "wrong-manager", &mut child);
        assert_eq!(outsider["mutationRequests"], 0);
        assert_eq!(outsider["notInInitialElectorate"], true);
        let review = signal(&directory, "review", &mut child);
        assert_eq!(
            review["review"], true,
            "known-manager browser regression: {review}"
        );
        let submitted = signal(&directory, "submitted", &mut child);
        let proposal = submitted["id"].as_str().unwrap().parse::<u64>().unwrap();
        let info: Option<g::ProposalInfo> = update(
            &pic,
            GOVERNANCE,
            principals[0],
            "get_proposal_info",
            proposal,
        );
        let info = info.unwrap();
        assert_eq!(info.proposer.unwrap().id, 11);
        assert!(info.proposal.is_some());
        let _voted = signal(&directory, "voted", &mut child);
        let final_info = browser_proposal(&pic, principals[0], proposal);
        assert_eq!(final_info.id.unwrap().id, proposal);
        assert_eq!(final_info.status, 4);
        assert_eq!(final_info.topic, 1);
        assert_eq!(final_info.proposer.unwrap().id, 11);
        assert!(final_info.executed_timestamp_seconds > 0);
        let ballots = independently_read_ballots(
            &pic,
            proposal,
            &[
                principals[0],
                principals[1],
                principals[2],
                user(14),
                user(15),
            ],
        );
        assert_eq!(ballots.len(), 5);
        assert_eq!(
            ballots,
            [(11, 1, 1), (12, 1, 1), (13, 1, 1), (14, 0, 1), (15, 0, 1)]
                .into_iter()
                .collect()
        );
        let BrowserAction::ManageNeuron(managed) = final_info.proposal.unwrap().action.unwrap();
        assert_eq!(
            managed
                .id
                .map(|id| id.id)
                .or(match managed.neuron_id_or_subaccount {
                    Some(g::Id::NeuronId(id)) => Some(id.id),
                    _ => None,
                }),
            Some(100)
        );
        let BrowserCommand::Follow(follow) = managed.command.unwrap() else {
            panic!("wrong management command")
        };
        assert_eq!(follow.topic, 1);
        assert_eq!(
            follow.followees.iter().map(|n| n.id).collect::<Vec<_>>(),
            vec![11, 12, 13, 21, 22]
        );
        fs::write(directory.join("proposal-evidence.json"),serde_json::to_vec_pretty(&serde_json::json!({"id":proposal,"target":100,"proposer":11,"status":"Executed","topic":1,"original_electorate":[11,12,13,14,15],"ballots":ballots,"browser_signed_voters":[11,12,13],"following":[11,12,13,21,22]})).unwrap()).unwrap();
        let rows: g::ListNeuronsResponse = update(
            &pic,
            GOVERNANCE,
            Principal::anonymous(),
            "list_neurons",
            g::ListNeurons {
                neuron_ids: vec![100],
                include_neurons_readable_by_caller: false,
                include_empty_neurons_readable_by_caller: Some(false),
                include_public_neurons_in_full_neurons: Some(true),
                page_number: Some(0),
                page_size: Some(1),
                neuron_subaccounts: None,
            },
        );
        let management = &rows.full_neurons[0]
            .followees
            .iter()
            .find(|(t, _)| *t == 1)
            .unwrap()
            .1
            .followees;
        assert_eq!(
            management.iter().map(|n| n.id).collect::<Vec<_>>(),
            vec![11, 12, 13, 21, 22]
        );
        let policy: Result<dendrite_types::ComplianceReport, candid::Reserved> = update(
            &pic,
            verifier,
            Principal::anonymous(),
            "check_neuron",
            100u64,
        );
        assert_eq!(
            policy.unwrap().overall_status,
            dendrite_types::ComplianceStatus::Compliant
        );
        publish(
            &directory,
            "management-verified",
            serde_json::json!({"proposal":proposal}),
        );
        let _review = signal(&directory, "authority-review", &mut child);
        manager_key(&pic, principals[2], false);
        publish(&directory, "authority-removed", serde_json::json!({}));
        let blocked = signal(&directory, "authority-blocked", &mut child);
        assert_eq!(blocked["blocked"], true);
        let absent: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", 2u64);
        assert!(absent.is_none());
        manager_key(&pic, principals[2], true);
        publish(&directory, "authority-restored", serde_json::json!({}));
        let _held = signal(&directory, "genuine-dispatch-held", &mut child);
        manager_key(&pic, principals[2], false);
        publish(
            &directory,
            "genuine-authority-removed",
            serde_json::json!({}),
        );
        let rejection = signal(&directory, "genuine-rejection", &mut child);
        assert_eq!(rejection["knownGovernanceRejection"], true);
        let absent: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", 2u64);
        assert!(absent.is_none(), "typed rejection created no proposal");
        manager_key(&pic, principals[2], true);
        publish(
            &directory,
            "genuine-authority-restored",
            serde_json::json!({}),
        );
        let lost = signal(&directory, "lost-outcome", &mut child);
        assert_eq!(lost["unknown"], true);
        assert_eq!(lost["faultRequestIds"].as_array().unwrap().len(), 1);
        let recovered = browser_proposal(&pic, principals[3], 2);
        assert_eq!(recovered.proposer.unwrap().id, 21);
        assert_eq!(recovered.status, 1);
        let BrowserAction::ManageNeuron(recovered) = recovered.proposal.unwrap().action.unwrap();
        assert_eq!(
            recovered
                .id
                .map(|id| id.id)
                .or(match recovered.neuron_id_or_subaccount {
                    Some(g::Id::NeuronId(id)) => Some(id.id),
                    _ => None,
                }),
            Some(100)
        );
        let BrowserCommand::Follow(recovered) = recovered.command.unwrap() else {
            panic!("unknown operation has wrong command")
        };
        assert_eq!(recovered.topic, 1);
        assert_eq!(
            recovered.followees.iter().map(|n| n.id).collect::<Vec<_>>(),
            vec![11, 12, 13, 21, 22]
        );
        let absent: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", 3u64);
        assert!(
            absent.is_none(),
            "uncertain browser call was not resubmitted with a new identity"
        );
        publish(
            &directory,
            "lost-verified",
            serde_json::json!({"proposal":2}),
        );
        let reloaded = signal(&directory, "lost-reload", &mut child);
        assert_eq!(reloaded["noAutomaticResubmission"], true);
        let signed_out = signal(&directory, "signout-preparation", &mut child);
        assert_eq!(signed_out["blocked"], true);
        // Scripted incompatible verifier upgrade: no production exports are added.
        // Existing mock Wasm has no check_neuron, so the old frontend must fail preflight.
        pic.upgrade_canister(
            verifier,
            wasm("quorum_mocks"),
            encode_one(()).unwrap(),
            None,
        )
        .unwrap();
        publish(&directory, "incompatible-verifier", serde_json::json!({}));
        let incompatible = signal(&directory, "incompatible-blocked", &mut child);
        assert_eq!(incompatible["blocked"], true);
        let absent: Option<g::ProposalInfo> = query(&pic, GOVERNANCE, "get_proposal_info", 3u64);
        assert!(absent.is_none());
        let upgraded = upgraded_local.as_ref().unwrap();
        pic.upgrade_canister(verifier, upgraded.clone(), encode_one(()).unwrap(), None)
            .unwrap();
        let module = pic
            .canister_status(verifier, None)
            .unwrap()
            .module_hash
            .unwrap();
        assert_eq!(module, Sha256::digest(upgraded).to_vec());
        publish(
            &directory,
            "compatible-upgrade",
            serde_json::json!({"module_sha256":hex::encode(module)}),
        );
        let assets = signal(&directory, "upgrade-assets", &mut child);
        assert_eq!(assets["changed"], true);
        pic.install_canister(
            automation,
            wasm("d_quorum"),
            encode_one(Some(d_quorum::state::Init {
                mode: d_quorum::state::Mode::Live,
                expected_target_controller: Some(user(9)),
            }))
            .unwrap(),
            None,
        );
        publish(&directory, "verified", serde_json::json!({}));
        // Remain host-aligned while browser signers are active. Only natural timers
        // run here; no virtual-time jumps or coordinator-supplied management votes.
        let deadline = Instant::now() + Duration::from_secs(600);
        let (maturity_id, maturity_marker, maturity_fingerprint) = loop {
            let progress: Option<d_quorum::state::ProposalJob> =
                query_empty(&pic, automation, "proposal_progress");
            let roster: Vec<d_quorum::RosterView> =
                query2(&pic, automation, "roster_page", (0u16, 100u16));
            if let Some(job) = progress
                && let d_quorum::state::ProposalPhase::Open(id) = job.phase
                && roster
                    .iter()
                    .any(|r| r.topic == 4 && r.applied == vec![106, 100] && r.reward_eligible)
            {
                break (id, job.marker, job.fingerprint);
            }
            assert!(
                Instant::now() < deadline,
                "natural browser-world selection/proposal timed out: {:?}",
                query_empty::<d_quorum::Health>(&pic, automation, "health")
            );
            std::thread::sleep(Duration::from_millis(500));
        };
        let scores: Vec<d_quorum::Score> =
            query2(&pic, automation, "score_page", (None::<(i32, u64)>, 100u16));
        let raw = public_neuron(&pic, 200).deciding_voting_power.unwrap();
        let direct = public_neuron(&pic, 202).deciding_voting_power.unwrap();
        let expected = u128::from(raw) * quorum_policy::SCALE / 2;
        for topic in [4, 7] {
            assert_eq!(
                scores
                    .iter()
                    .find(|s| s.topic == topic && s.neuron_id == 100)
                    .unwrap()
                    .scaled_score,
                expected
            );
            assert_eq!(
                scores
                    .iter()
                    .find(|s| s.topic == topic && s.neuron_id == 106)
                    .unwrap()
                    .scaled_score,
                expected + u128::from(direct) * quorum_policy::SCALE
            );
            assert_eq!(
                public_neuron(&pic, TARGET)
                    .followees
                    .iter()
                    .find(|(code, _)| *code == topic)
                    .unwrap()
                    .1
                    .followees
                    .iter()
                    .map(|id| id.id)
                    .collect::<Vec<_>>(),
                vec![106, 100]
            );
        }
        let original: Option<g::ProposalInfo> =
            query(&pic, GOVERNANCE, "get_proposal_info", maturity_id);
        let original = original.unwrap();
        assert!(d_quorum::proposal::action_matches(&original, automation));
        assert_eq!(original.proposer.unwrap().id, 300);
        publish(
            &directory,
            "maturity-ready",
            serde_json::json!({"id":maturity_id.to_string(),"target":TARGET.to_string()}),
        );
        let _approved = signal(&directory, "maturity-voted", &mut child);
        let exact = browser_proposal(&pic, principals[0], maturity_id);
        assert_eq!(exact.status, 4);
        assert!(exact.executed_timestamp_seconds > 0);
        let maturity_ballots = independently_read_ballots(
            &pic,
            maturity_id,
            &[automation, principals[0], principals[1], user(14), user(15)],
        );
        assert_eq!(
            maturity_ballots
                .iter()
                .filter(|(_, vote, _)| *vote == 1)
                .map(|(id, _, _)| *id)
                .collect::<std::collections::BTreeSet<_>>(),
            [300, 11, 12].into_iter().collect()
        );
        let progress = public_neuron(&pic, TARGET)
            .maturity_disbursements_in_progress
            .unwrap();
        assert_eq!(progress.len(), 1);
        let pending = &progress[0];
        assert_eq!(pending.amount_e8s, Some(5_000_000_000));
        assert_eq!(
            pending.account_to_disburse_to.as_ref().unwrap().owner,
            Some(automation)
        );
        assert_eq!(
            pending.account_to_disburse_to.as_ref().unwrap().subaccount,
            None
        );
        let finalization = pending.finalize_disbursement_timestamp_seconds.unwrap();
        assert!(finalization > now(&pic));
        publish(&directory, "browser-complete", serde_json::json!({}));
        assert!(child.wait().unwrap().success());
        // All browser requests are now quiesced. Deterministic long-time advancement
        // begins only after browser-signed approval, in this same network instance.
        pic.stop_progress();
        let before: candid::Nat = query(
            &pic,
            LEDGER,
            "icrc1_balance_of",
            l::Account {
                owner: automation,
                subaccount: None,
            },
        );
        assert_eq!(l::nat(before).unwrap(), 0);
        drive(&pic, 9 * 86400);
        for _ in 0..1200 {
            if real_plans(&pic, automation)
                .iter()
                .any(|p| p.id == 1 && p.complete)
            {
                break;
            }
            drive(&pic, 10);
        }
        assert!(now(&pic) >= finalization);
        assert!(
            public_neuron(&pic, TARGET)
                .maturity_disbursements_in_progress
                .unwrap()
                .is_empty()
        );
        let history: l::History = query(
            &pic,
            LEDGER,
            "query_blocks",
            l::BlocksArgs {
                start: 0,
                length: 200,
            },
        );
        let mints = history
            .blocks
            .iter()
            .enumerate()
            .filter_map(|(index, block)| match &block.transaction.operation {
                Some(l::Operation::Mint { to, amount })
                    if *to == l::account_id(automation, None) =>
                {
                    Some((
                        history.first_block_index + index as u64,
                        amount.e8s,
                        block.timestamp.timestamp_nanos,
                    ))
                }
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(mints.len(), 1);
        assert_eq!(mints[0].1, 5_000_000_000);
        assert!(mints[0].2 / 1_000_000_000 >= finalization);
        let first = real_transfers(&pic, automation, 1);
        assert_eq!(first.len(), 2);
        assert_eq!(first[0].amount, first[1].amount);
        real_confirmed_evidence(&pic, automation, &first);
        assert_eq!(
            first
                .iter()
                .map(|t| t.destination.neuron_id)
                .collect::<std::collections::BTreeSet<_>>(),
            [100, 106].into_iter().collect()
        );
        // A second actual Ledger-funded pot and changed support use the normal
        // weekly selection/daily payout cadence, retaining the first obligations.
        real_set_support(&pic, &[112, 118]);
        let support: g::ManageResponse = update(
            &pic,
            GOVERNANCE,
            user(2),
            "manage_neuron",
            g::request(
                200,
                g::Command::SetFollowing(g::SetFollowing {
                    topic_following: Some(vec![g::Following {
                        topic: Some(7),
                        followees: Some(vec![g::NeuronId { id: 112 }, g::NeuronId { id: 118 }]),
                    }]),
                }),
            ),
        );
        assert!(matches!(
            support.command,
            Some(g::ResponseCommand::SetFollowing(_))
        ));
        let clear: g::ManageResponse = update(
            &pic,
            GOVERNANCE,
            user(2),
            "manage_neuron",
            g::request(
                202,
                g::Command::SetFollowing(g::SetFollowing {
                    topic_following: Some(
                        [4, 7]
                            .into_iter()
                            .map(|topic| g::Following {
                                topic: Some(topic),
                                followees: Some(vec![]),
                            })
                            .collect(),
                    ),
                }),
            ),
        );
        assert!(matches!(
            clear.command,
            Some(g::ResponseCommand::SetFollowing(_))
        ));
        drive(&pic, 7 * 86400);
        for _ in 0..1200 {
            let rows: Vec<d_quorum::RosterView> =
                query2(&pic, automation, "roster_page", (0u16, 100u16));
            if rows
                .iter()
                .any(|r| r.topic == 4 && r.applied == vec![112, 118] && r.reward_eligible)
            {
                break;
            }
            drive(&pic, 10);
        }
        for topic in [4, 7] {
            assert_eq!(
                public_neuron(&pic, TARGET)
                    .followees
                    .iter()
                    .find(|(code, _)| *code == topic)
                    .unwrap()
                    .1
                    .followees
                    .iter()
                    .map(|id| id.id)
                    .collect::<Vec<_>>(),
                vec![112, 118]
            );
        }
        let transfer: Result<candid::Nat, l::TransferError> = update(
            &pic,
            LEDGER,
            user(7),
            "icrc1_transfer",
            l::TransferArg {
                from_subaccount: None,
                to: l::Account {
                    owner: automation,
                    subaccount: None,
                },
                amount: 2_000_000u64.into(),
                fee: Some(10_000u64.into()),
                memo: None,
                created_at_time: None,
            },
        );
        transfer.unwrap();
        drive(&pic, 86400); // Respect the normal daily admission interval after new funding.
        for _ in 0..1200 {
            if real_plans(&pic, automation)
                .iter()
                .any(|p| p.id == 2 && p.complete)
            {
                break;
            }
            drive(&pic, 10);
        }
        let second = real_transfers(&pic, automation, 2);
        assert_eq!(second.len(), 2);
        assert_eq!(second[0].amount, second[1].amount);
        real_confirmed_evidence(&pic, automation, &second);
        assert_eq!(
            second
                .iter()
                .map(|t| t.destination.neuron_id)
                .collect::<std::collections::BTreeSet<_>>(),
            [112, 118].into_iter().collect()
        );
        for (original, retained) in first.iter().zip(real_transfers(&pic, automation, 1)) {
            assert_eq!(original.amount, retained.amount);
            assert_eq!(original.destination, retained.destination);
            assert_eq!(original.attempt, retained.attempt);
            assert_eq!(original.status, retained.status);
        }
        let plans = real_plans(&pic, automation);
        assert_eq!(plans.len(), 2);
        for plan in &plans {
            assert!(plan.complete);
            assert_eq!(plan.reserved, 0);
            assert_eq!(
                plan.confirmed_cost + u128::from(plan.dust),
                u128::from(plan.observed_balance) + u128::from(plan.additional_fee_funding)
            );
        }
        assert_eq!(
            plans.iter().find(|p| p.id == 1).unwrap().observed_balance,
            5_000_000_000
        );
        for _ in 0..100 {
            if query_empty::<d_quorum::Health>(&pic, automation, "health").pending_refreshes == 0 {
                break;
            }
            drive(&pic, 10);
        }
        for transfer in first.iter().chain(&second) {
            assert_eq!(
                public_neuron(&pic, transfer.destination.neuron_id).cached_neuron_stake_e8s,
                10_000_000_000 + transfer.amount
            );
        }
        assert_eq!(
            public_neuron(&pic, TARGET)
                .followees
                .iter()
                .find(|(topic, _)| *topic == 1)
                .unwrap()
                .1
                .followees
                .iter()
                .map(|n| n.id)
                .collect::<Vec<_>>(),
            vec![300, 11, 12, 14, 15]
        );
        let health: d_quorum::Health = query_empty(&pic, automation, "health");
        let status = pic.canister_status(automation, None).unwrap();
        fs::write(directory.join("world-resources.json"),serde_json::to_vec_pretty(&serde_json::json!({"wall_seconds":wall.elapsed().as_secs_f64(),"network_time_seconds":now(&pic),"virtual_elapsed_seconds":now(&pic)-at,"automation_cycles_before":automation_cycles_before,"automation_cycles_after":pic.cycle_balance(automation),"automation_cycle_use":automation_cycles_before-pic.cycle_balance(automation),"stable_snapshot_bytes":health.stable_snapshot_bytes,"stable_pages":health.stable_memory_pages,"memory_bytes":status.memory_size.to_string(),"checkpoints":health.checkpoints,"pending_maintenance":health.pending_refreshes,"abandoned_maintenance":health.abandoned_refreshes,"pending_financial_liabilities":plans.iter().map(|p|p.recipient_count-p.confirmed_count).sum::<u32>(),"protocol_call_counts":"real canister internal call totals not instrumented; public browser request paths and recording-fixture capacity counts are retained separately"})).unwrap()).unwrap();
        fs::write(directory.join("economic-evidence.json"),serde_json::to_vec_pretty(&serde_json::json!({"same_instance":true,"observed_finalization_seconds":finalization,"authoritative_mints":mints,"seeded_maturity_e8s":5_000_000_000u64,"browser_manager_proposal":proposal,"browser_approved_maturity_proposal":maturity_id,"maturity_marker":maturity_marker,"maturity_fingerprint":hex::encode(maturity_fingerprint),"maturity_ballots":maturity_ballots,"selected_topics":[4,7],"initial_roster":[106,100],"later_roster":[112,118],"first_payments":first,"later_payments":second,"genuine_reward_accrual":"separate preserved real-protocol test; this journey uses explicitly seeded maturity"})).unwrap()).unwrap();
    }));
    let _ = Command::new("docker")
        .args(["stop", "--timeout", "3", &name])
        .output();
    let _ = child.wait();
    for file in [
        "local-build.json",
        "session-storage-0.json",
        "session-storage-1.json",
        "session-storage-2.json",
        "session-storage-3.json",
        "dendrite-local.wasm",
        "http-certification-negative.json",
        "browser-system.log",
        "ii-failure.json",
        "authentication-retries.json",
        "creation-reauthentication-retries.json",
        "review.json",
        "submitted.json",
        "voted.json",
        "scope-probe.json",
        "sdk-window-policy.json",
        "browser-scheduling-policy.json",
        "creation-principal.json",
        "creation-plan.json",
        "creation-controller-installed.json",
        "creation-configured.json",
        "creation-rehearsal.json",
        "creation-dissolving.json",
        "creation-recovered.json",
        "creation-code-removed.json",
        "creation-finalised.json",
        "creation-signed-creator-denied.json",
        "creation-authority-probe-policy.json",
        "creation-post-final-management.json",
        "creation-resources.json",
        "historical-bootstrap-policy.json",
        "clock-policy.json",
        "pocketic-wall-clock.so",
        "clock-freshness-negative.json",
        "clock-offset-ns",
        "creation-historical-frontend-migrated.json",
        "creation-recoverable-90-day-resumed.json",
        "creation-stake-payment-unknown.json",
        "creation-stake-payment-recovered.json",
        "creation-31-day-resumed.json",
        "creation-90-day-resumed.json",
        "creation-sealed.json",
        "creation-registration-refused.json",
        "creation-registration-refusal-step.bin",
        "creation-refusal-v2-stable.bin",
        "creation-refusal-provenance.json",
        "creation-rehearsal-refused.json",
        "creation-rehearsal-unknown.json",
        "creation-manager-authority-matrix.json",
        "creation-membership-before-requested.json",
        "creation-membership-before-changed.json",
        "creation-membership-before-blocked.json",
        "creation-membership-before-restored.json",
        "creation-membership-during-requested.json",
        "creation-membership-during-changed.json",
        "creation-membership-during-blocked.json",
        "creation-membership-during-restored.json",
        "creation-membership-after-requested.json",
        "creation-membership-after-changed.json",
        "creation-membership-after-blocked.json",
        "creation-membership-after-restored.json",
        "creation-failure-receipt.json",
        "creation-accessibility.json",
        "creation-mobile.png",
        "creation-recoverable.png",
        "principals.json",
        "verified.json",
        "proposal-evidence.json",
        "executed.png",
        "economic-evidence.json",
        "world-resources.json",
        "maturity-voted.json",
        "public-evidence.json",
        "cancellation.json",
        "authority-blocked.json",
        "signout-preparation.json",
        "incompatible-blocked.json",
        "upgrade-assets.json",
        "route-preparation.json",
        "genuine-rejection.json",
        "wrong-manager.json",
        "wrong-provider.json",
        "lost-outcome.json",
        "lost-reload.json",
        "failure-0.png",
        "failure-1.png",
        "failure-2.png",
    ] {
        let path = directory.join(file);
        if path.exists() {
            fs::copy(path, evidence.join(file)).unwrap();
        }
    }
    if scenario == "anonymous" && directory.join("anonymous-evidence").is_dir() {
        let destination = evidence.join("anonymous-evidence");
        fs::create_dir_all(&destination).unwrap();
        for file in fs::read_dir(directory.join("anonymous-evidence")).unwrap() {
            let file = file.unwrap();
            assert!(file.file_type().unwrap().is_file());
            fs::copy(file.path(), destination.join(file.file_name())).unwrap();
        }
    }
    for (variant, prefix) in [("upgrade", "upgraded"), ("corrupt-http", "corrupt-http")] {
        for filename in [
            "local-build.json",
            "dendrite-local.wasm",
            "sdk-window-policy.json",
            "historical-bootstrap-policy.json",
        ] {
            let path = directory.join(variant).join(filename);
            if path.exists() {
                fs::copy(path, evidence.join(format!("{prefix}-{filename}"))).unwrap();
            }
        }
    }
    fs::write(evidence.join("scenario-result.json"),serde_json::to_vec_pretty(&serde_json::json!({"scenario":scenario,"passed":result.is_ok(),"wall_seconds":wall.elapsed().as_secs_f64(),"configuration":"local browser artifact; protocol pins unchanged"})).unwrap()).unwrap();
    if let Err(e) = result {
        std::panic::resume_unwind(e);
    }
}
