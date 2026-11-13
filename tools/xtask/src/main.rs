use std::process::{Command, exit};
fn main() {
    // A shared target directory can reuse an otherwise identical launcher
    // compiled in another checkout. Resolve the explicitly selected workspace
    // at invocation time instead of retaining that checkout's absolute path.
    let current = std::env::current_dir().expect("workspace directory is required");
    let root = current
        .ancestors()
        .find(|path| path.join("tools/scripts/xtask.py").is_file())
        .expect("run xtask from the consolidated workspace");
    let status = Command::new("python3")
        .arg(root.join("tools/scripts/xtask.py"))
        .args(std::env::args().skip(1))
        .current_dir(root)
        .status()
        .expect("python3 is required");
    exit(status.code().unwrap_or(1));
}
