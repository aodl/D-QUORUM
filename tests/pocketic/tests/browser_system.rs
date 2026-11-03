mod support;
use candid::{Principal, encode_one};
use pocket_ic::common::rest::{IcpFeatures, IcpFeaturesConfig, InstanceHttpGatewayConfig};
use quorum_ic_clients::{GOVERNANCE, governance as g};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::Path,
    process::{Child, Command},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use support::*;

fn local_frontend(directory: &Path, id: Principal) -> Vec<u8> {
    let source = directory.join("source");
    fs::create_dir_all(&source).unwrap();
    let listed = Command::new("git")
        .args(["ls-files", "-z", "dendrite/"])
        .current_dir(root())
        .output()
        .unwrap();
    assert!(listed.status.success());
    for file in listed.stdout.split(|b| *b == 0).filter(|p| !p.is_empty()) {
        let file = std::str::from_utf8(file).unwrap();
        assert!(!file.ends_with(".pem") && !file.split('/').any(|p| p.starts_with(".env")));
        let target = source.join(file.strip_prefix("dendrite/").unwrap());
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::copy(root().join(file), target).unwrap();
    }
    std::os::unix::fs::symlink(
        root().join("dendrite/node_modules"),
        source.join("node_modules"),
    )
    .unwrap();
    let origin = format!("http://{id}.localhost:4943");
    let config = serde_json::json!({"DENDRITE_BUILD_MODE":"local","DENDRITE_CANISTER_ID":id.to_text(),"DENDRITE_API_HOST":"http://127.0.0.1:4943","DENDRITE_FETCH_ROOT_KEY":"true","DENDRITE_DERIVATION_ORIGIN":origin,"DENDRITE_IDENTITY_PROVIDER":"http://id.ai.localhost:4943/authorize","DENDRITE_ALTERNATIVE_ORIGINS_JSON":"[]"});
    let mut build = Command::new("npm");
    build.args(["run", "build"]).current_dir(&source);
    for (key, value) in config.as_object().unwrap() {
        build.env(key, value.as_str().unwrap());
    }
    assert!(build.status().unwrap().success());
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
    fs::write(directory.join("local-build.json"),serde_json::to_vec_pretty(&serde_json::json!({"configuration":config,"wasm_sha256":hex::encode(Sha256::digest(&bytes)),"classification":"local browser configuration; never canonical production bytes"})).unwrap()).unwrap();
    bytes
}
fn signal(directory: &Path, name: &str, child: &mut Child) -> serde_json::Value {
    let deadline = Instant::now() + Duration::from_secs(240);
    loop {
        let path = directory.join(format!("{name}.json"));
        if path.exists() {
            return serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        }
        if let Some(status) = child.try_wait().unwrap() {
            panic!("browser exited before {name}: {status}; inspect browser-system.log");
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
    browser_world(false);
}
#[test]
#[ignore = "xtask system_browser uses real II with dummy authentication disabled"]
fn real_ii_unrestricted_delegation_is_rejected_before_governance() {
    browser_world(true);
}
fn browser_world(expect_scope_rejection: bool) {
    let directory = root().join(format!(".cache/tmp/browser-world-{}", std::process::id()));
    fs::create_dir(&directory).unwrap();
    // The first application ID is deterministic for this pinned topology.
    // Compile and checksum the local application before starting the test world.
    let expected_verifier = Principal::from_text("pi33i-pt777-77776-aaaaa-cai").unwrap();
    let local = local_frontend(&directory, expected_verifier);
    let host_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;
    let domains = directory.join("domains.txt");
    fs::write(&domains, format!("id.ai.localhost:{}\n", ii_frontend_id())).unwrap();
    let mut pic = builder()
        .with_mainnet_nns_subnet_id()
        .with_initial_time(pocket_ic::Time::from_nanos_since_unix_epoch(host_time))
        .with_ii_subnet()
        .with_http_gateway(InstanceHttpGatewayConfig {
            ip_addr: Some("127.0.0.1".into()),
            port: Some(4943),
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
    configure_real_ii(&pic);
    let verifier = pic.create_canister();
    pic.add_cycles(verifier, 200_000_000_000_000);
    assert_eq!(
        verifier, expected_verifier,
        "pinned topology allocation changed"
    );
    pic.install_canister(verifier, local, encode_one(()).unwrap(), None);
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
    pic.make_live(Some(4943));
    let uid = Command::new("id").arg("-u").output().unwrap();
    let gid = Command::new("id").arg("-g").output().unwrap();
    let process_user = format!(
        "{}:{}",
        String::from_utf8(uid.stdout).unwrap().trim(),
        String::from_utf8(gid.stdout).unwrap().trim()
    );
    let name = format!("dendrite-browser-{}", std::process::id());
    let log = fs::File::create(directory.join("browser-system.log")).unwrap();
    let mut child=Command::new("docker").args(["run","--rm","--name",&name,"--network","host","--user",&process_user,"-v",&format!("{}:/workspace:ro",root().display()),"-v",&format!("{}:/coordination",directory.display()),"-w","/workspace","-e",&format!("SYSTEM_BROWSER_EXPECT_SCOPE_REJECTION={expect_scope_rejection}"),"-e","SYSTEM_BROWSER_COORDINATION=/coordination","-e",&format!("SYSTEM_BROWSER_ORIGIN=http://{verifier}.localhost:4943"),"ghcr.io/puppeteer/puppeteer:24.36.0@sha256:60273620ab047d273d77f8535cd3adaffa9c138e3b38ba7934d8934a7b5d3c92","node","tests/browser/team-management.mjs"]).stdout(log.try_clone().unwrap()).stderr(log).spawn().unwrap();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if expect_scope_rejection {
            let proof = signal(&directory, "scope-rejection", &mut child);
            assert_eq!(proof["scopeRejection"], true);
            assert!(proof["governanceRequests"].as_array().unwrap().is_empty());
            assert!(proof["deniedOrigins"].as_array().unwrap().is_empty());
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
        assert_ne!(principals[0], principals[1]);
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
                } else if topic == 4 {
                    fs(topic, &[11, 12, 13])
                } else {
                    fs(topic, &[dendrite_types::ALPHA_VOTE_NEURON_ID])
                }
            })
            .collect();
        let mut neurons = vec![target];
        for id in (11..16).chain(21..26) {
            let controller = if id == 11 {
                principals[0]
            } else if id == 12 {
                principals[1]
            } else {
                user((id % 200) as u8)
            };
            let mut n = seed(id, controller, at);
            n.known_neuron_data = Some(known(id));
            n.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
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
            vec![],
            artifact("governance-canister"),
            artifact("ledger-canister"),
        );
        fs::write(directory.join("provisioned.json"), "{}").unwrap();
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
        let _: g::ManageResponse = update(
            &pic,
            GOVERNANCE,
            user(13),
            "manage_neuron",
            VoteRequest {
                neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id: 13 })),
                command: Some(VoteCommand::RegisterVote(Vote {
                    vote: 1,
                    proposal: Some(g::NeuronId { id: proposal }),
                })),
            },
        );
        let final_info: Option<g::ProposalInfo> = update(
            &pic,
            GOVERNANCE,
            principals[0],
            "get_proposal_info",
            proposal,
        );
        assert_eq!(final_info.unwrap().status, 4);
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
            vec![21, 22, 23, 24, 25]
        );
        fs::write(directory.join("verified.json"), "{}").unwrap();
        assert!(child.wait().unwrap().success());
    }));
    let _ = Command::new("docker")
        .args(["stop", "--timeout", "3", &name])
        .output();
    let _ = child.wait();
    fs::create_dir_all(root().join("dist/evidence/browser-system")).unwrap();
    for file in [
        "local-build.json",
        "browser-system.log",
        "review.json",
        "submitted.json",
        "voted.json",
        "scope-rejection.json",
    ] {
        let path = directory.join(file);
        if path.exists() {
            fs::copy(path, root().join("dist/evidence/browser-system").join(file)).unwrap();
        }
    }
    if let Err(e) = result {
        std::panic::resume_unwind(e);
    }
}
