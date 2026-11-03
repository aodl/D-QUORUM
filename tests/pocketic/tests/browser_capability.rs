mod support;
use pocket_ic::common::rest::{IcpFeatures, IcpFeaturesConfig};
use support::*;
#[test]
#[ignore = "xtask system_browser provisions the pinned browser and PocketIC"]
fn actual_ii_page_and_virtual_webauthn_capability() {
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;
    let domains = root().join(format!(".cache/tmp/ii-domains-{}.txt", std::process::id()));
    std::fs::write(&domains, format!("id.ai.localhost:{}\n", ii_frontend_id())).unwrap();
    let mut pic = builder()
        .with_mainnet_nns_subnet_id()
        .with_initial_time(pocket_ic::Time::from_nanos_since_unix_epoch(at))
        .with_ii_subnet()
        .with_http_gateway(pocket_ic::common::rest::InstanceHttpGatewayConfig {
            ip_addr: Some("127.0.0.1".into()),
            port: Some(4943),
            domains: Some(vec!["localhost".into()]),
            https_config: None,
            domain_custom_provider_local_file: Some(domains.to_str().unwrap().into()),
        })
        .with_icp_features(IcpFeatures {
            ii: Some(IcpFeaturesConfig::DefaultConfig),
            ..Default::default()
        })
        .build();
    configure_real_ii(&pic);
    // With a gateway supplied at creation, make_live returns its URL without
    // enabling progress. This bounded interactive probe needs real-time rounds.
    let _api = pic.auto_progress();
    pic.make_live(Some(4943));
    let uid = String::from_utf8(
        std::process::Command::new("id")
            .arg("-u")
            .output()
            .unwrap()
            .stdout,
    )
    .unwrap();
    let gid = String::from_utf8(
        std::process::Command::new("id")
            .arg("-g")
            .output()
            .unwrap()
            .stdout,
    )
    .unwrap();
    let user = format!("{}:{}", uid.trim(), gid.trim());
    let output = std::process::Command::new("docker").args(["run","--rm","--network","host","--user",&user,"-v",&format!("{}:/workspace:ro",root().display()),"-w","/workspace","ghcr.io/puppeteer/puppeteer:24.36.0@sha256:60273620ab047d273d77f8535cd3adaffa9c138e3b38ba7934d8934a7b5d3c92","node","tests/browser/ii-capability.mjs"]).output().unwrap();
    println!("{}", String::from_utf8_lossy(&output.stdout));
    eprintln!("{}", String::from_utf8_lossy(&output.stderr));
    let text = String::from_utf8(output.stdout).unwrap();
    let evidence: serde_json::Value = serde_json::from_str(text.trim()).unwrap();
    std::fs::write(
        root().join("dist/evidence/ii-browser-capability.json"),
        serde_json::to_string_pretty(&evidence).unwrap(),
    )
    .unwrap();
    assert!(
        output.status.success(),
        "actual II/browser capability failed; do not substitute fake auth"
    );
}
