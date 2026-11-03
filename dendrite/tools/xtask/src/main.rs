#![forbid(unsafe_code)]
use std::{
    env,
    process::{Command, ExitCode},
};
fn run(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .status()
        .is_ok_and(|s| s.success())
}
fn main() -> ExitCode {
    let command = env::args().nth(1).unwrap_or_else(|| "help".into());
    let ok = match command.as_str() {
        "check" => {
            run("cargo", &["fmt", "--all", "--", "--check"])
                && run(
                    "cargo",
                    &[
                        "clippy",
                        "--locked",
                        "--workspace",
                        "--all-targets",
                        "--",
                        "-D",
                        "warnings",
                    ],
                )
                && run("npm", &["test"])
        }
        "test" => {
            run("sh", &["tools/scripts/ensure-pocketic.sh"])
                && run("npm", &["run", "build"])
                && run(
                    "cargo",
                    &[
                        "build",
                        "--locked",
                        "--release",
                        "--target",
                        "wasm32-unknown-unknown",
                        "-p",
                        "dendrite",
                    ],
                )
                && run(
                    "cargo",
                    &[
                        "build",
                        "--locked",
                        "--release",
                        "--target",
                        "wasm32-unknown-unknown",
                        "-p",
                        "dendrite-test-governance",
                    ],
                )
                && run("cargo", &["test", "--locked", "--workspace"])
                && run("npm", &["test"])
        }
        "coverage" => run("sh", &["tools/scripts/coverage.sh"]),
        "build" => {
            run("npm", &["run", "build"])
                && run(
                    "cargo",
                    &[
                        "build",
                        "--locked",
                        "--release",
                        "--target",
                        "wasm32-unknown-unknown",
                        "-p",
                        "dendrite",
                    ],
                )
        }
        "build-reproducible" => run("sh", &["tools/scripts/build-reproducible.sh"]),
        "verify-reproducible" => run("sh", &["tools/scripts/verify-reproducible.sh"]),
        "security-scan" => run("sh", &["tools/scripts/security-scan.sh"]),
        "sbom" => run("sh", &["tools/scripts/sbom.sh"]),
        _ => {
            eprintln!(
                "usage: cargo xtask <check|test|coverage|build|build-reproducible|verify-reproducible|security-scan|sbom>"
            );
            false
        }
    };
    if ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
