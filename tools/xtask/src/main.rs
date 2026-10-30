use std::{
    path::PathBuf,
    process::{Command, exit},
};
fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let status = Command::new("python3")
        .arg(root.join("tools/scripts/xtask.py"))
        .args(std::env::args().skip(1))
        .current_dir(&root)
        .status()
        .expect("python3 is required");
    exit(status.code().unwrap_or(1));
}
