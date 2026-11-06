#!/bin/sh
set -eu

required_version='cargo-llvm-cov 0.6.16'
coverage_toolchain='nightly-2026-07-17'
installed_version=$(cargo llvm-cov --version 2>/dev/null || true)
if [ "$installed_version" != "$required_version" ]; then
    echo "coverage requires $required_version; found: ${installed_version:-not installed}" >&2
    echo "install with: rustup component add llvm-tools-preview && cargo install cargo-llvm-cov --version 0.6.16 --locked" >&2
    exit 1
fi
if ! rustc "+$coverage_toolchain" --version >/dev/null 2>&1; then
    echo "branch coverage requires the separately pinned $coverage_toolchain toolchain" >&2
    echo "install with: rustup toolchain install $coverage_toolchain --profile minimal --component llvm-tools-preview" >&2
    exit 1
fi

# Stable Rust supports source regions, functions, and lines. LLVM branch
# instrumentation remains nightly-only, so branch coverage is reported as an
# explicit release limitation rather than silently substituted.
cargo llvm-cov -p dendrite-types --summary-only \
    --fail-under-regions 95 \
    --fail-under-lines 95
branch_report=$(mktemp)
trap 'rm -f "$branch_report"' EXIT
cargo "+$coverage_toolchain" llvm-cov -p dendrite-types --branch --summary-only | tee "$branch_report"
awk '
    /^TOTAL/ {
        value = $NF
        sub(/%$/, "", value)
        if ((value + 0) < 95) {
            print "pure-engine branch coverage " value "% is below 95%" > "/dev/stderr"
            exit 1
        }
        found = 1
    }
    END {
        if (!found) {
            print "branch coverage TOTAL was not reported" > "/dev/stderr"
            exit 1
        }
    }
' "$branch_report"
workspace_report=$(mktemp)
trap 'rm -f "$branch_report" "$workspace_report"' EXIT
cargo llvm-cov --workspace --summary-only | tee "$workspace_report"
awk '
    /^TOTAL/ {
        value = $(NF - 3)
        sub(/%$/, "", value)
        if ((value + 0) < 85) {
            print "workspace line coverage " value "% is below 85%" > "/dev/stderr"
            exit 1
        }
        found = 1
    }
    END {
        if (!found) {
            print "workspace coverage TOTAL was not reported" > "/dev/stderr"
            exit 1
        }
    }
' "$workspace_report"
