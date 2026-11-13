use crate::*;

/// Align only this owned replica/gateway process with explicit virtual jumps.
/// No freshness threshold, verification option or monotonic timer is altered.
pub struct ClockServer {
    child: Child,
    pub url: String,
}
impl ClockServer {
    pub fn start(directory: &Path) -> Self {
        let library = directory.join("pocketic-wall-clock.so");
        assert!(
            Command::new("cc")
                .args(["-shared", "-fPIC", "-O2", "-Wall", "-Wextra", "-Werror"])
                .arg(root().join("tests/browser/pocketic-wall-clock.c"))
                .arg("-o")
                .arg(&library)
                .status()
                .unwrap()
                .success()
        );
        fs::write(directory.join("clock-offset-ns"), "0\n").unwrap();
        let port_file = directory.join("clock-server.port");
        let log = fs::File::create(directory.join("clock-server.log")).unwrap();
        let binary = root().join(".cache/tools/pocket-ic");
        assert_eq!(
            hex::encode(Sha256::digest(fs::read(&binary).unwrap())),
            "29472ea4433b30a280676c4e22e369d79d5ba6ee1b4d48bab32ebe7d0ad2b4bb"
        );
        let child = Command::new(binary)
            .args(["--ttl", "7200", "--port-file"])
            .arg(&port_file)
            .env("LD_PRELOAD", &library)
            .env(
                "DENDRITE_TEST_CLOCK_FILE",
                directory.join("clock-offset-ns"),
            )
            .stdout(log.try_clone().unwrap())
            .stderr(log)
            .spawn()
            .unwrap();
        let mut server = Self {
            child,
            url: "http://127.0.0.1:1/".into(),
        };
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if let Ok(port) = fs::read_to_string(&port_file)
                && let Ok(port) = port.trim().parse::<u16>()
            {
                server.url = format!("http://127.0.0.1:{port}/");
                break;
            }
            assert!(
                server.child.try_wait().unwrap().is_none(),
                "owned clock server exited"
            );
            assert!(
                Instant::now() < deadline,
                "owned clock server startup timed out"
            );
            std::thread::sleep(Duration::from_millis(50));
        }
        fs::write(directory.join("clock-policy.json"), serde_json::to_vec_pretty(&serde_json::json!({
            "classification":"test-only owned PocketIC process real-time alignment; no freshness bypass",
            "server_sha256":"29472ea4433b30a280676c4e22e369d79d5ba6ee1b4d48bab32ebe7d0ad2b4bb",
            "clock_source_sha256":hex::encode(Sha256::digest(fs::read(root().join("tests/browser/pocketic-wall-clock.c")).unwrap())),
            "clock_library_sha256":hex::encode(Sha256::digest(fs::read(library).unwrap())),
            "compiler":String::from_utf8(Command::new("cc").arg("--version").output().unwrap().stdout).unwrap().lines().next().unwrap(),
            "monotonic_clocks":"unchanged", "certificate_and_delegation_limits":"unchanged"
        })).unwrap()).unwrap();
        server
    }
}
impl Drop for ClockServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
pub fn advance(pic: &pocket_ic::PocketIc, directory: &Path, duration: Duration) {
    pic.stop_progress();
    pic.advance_time(duration);
    let path = directory.join("clock-offset-ns");
    let previous: u64 = fs::read_to_string(&path).unwrap().trim().parse().unwrap();
    let next = previous
        .checked_add(u64::try_from(duration.as_nanos()).unwrap())
        .unwrap();
    assert!(
        next <= 31_536_000_000_000_000,
        "bounded test clock supports at most one year"
    );
    let temporary = directory.join("clock-offset-ns.tmp");
    fs::write(&temporary, format!("{next}\n")).unwrap();
    fs::rename(temporary, path).unwrap();
    pic.auto_progress();
}

pub fn verify_gateway_freshness(pic: &pocket_ic::PocketIc, directory: &Path, verifier: Principal) {
    let request = || {
        Command::new("curl")
            .args([
                "--silent",
                "--show-error",
                "--max-time",
                "30",
                "--write-out",
                "\n%{http_code}",
                "--header",
            ])
            .arg(format!("Host: {verifier}.localhost:{}", browser_port()))
            .arg(format!("http://127.0.0.1:{}/", browser_port()))
            .output()
            .unwrap()
    };
    let before = request();
    assert!(before.status.success());
    assert!(
        before.stdout.ends_with(b"\n200"),
        "aligned initial gateway response failed"
    );
    pic.stop_progress();
    // Deliberately age the unchanged replica certificate at the gateway only.
    // Restore alignment before asserting, even when the negative request fails.
    fs::write(directory.join("clock-offset-ns"), "3600000000000\n").unwrap();
    let rejected = request();
    fs::write(directory.join("clock-offset-ns"), "0\n").unwrap();
    pic.auto_progress();
    let body = String::from_utf8(rejected.stdout).unwrap();
    let error: serde_json::Value = serde_json::from_str(body.rsplit_once('\n').unwrap().0).unwrap();
    assert!(
        rejected.status.success()
            && body.ends_with("\n503")
            && error["error_type"] == "backend_response_verification",
        "misaligned certificate was not rejected by response verification: {body}"
    );
    let after = request();
    assert!(after.status.success() && after.stdout.ends_with(b"\n200"));
    fs::write(
        directory.join("clock-freshness-negative.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "classification":"actual pinned gateway HTTP verification; no browser authority claim",
            "aligned_before":200,"gateway_only_one_hour_ahead":503,"aligned_after":200,
            "freshness_disabled":false,"monotonic_time_changed":false
        }))
        .unwrap(),
    )
    .unwrap();
}
