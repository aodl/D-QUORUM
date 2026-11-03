#!/bin/sh
set -eu
mkdir -p dist/sbom
cargo cyclonedx --format json --all --manifest-path Cargo.toml
cp canisters/dendrite/dendrite.cdx.json dist/sbom/dendrite-rust.cdx.json
cp crates/dendrite-types/dendrite-types.cdx.json dist/sbom/dendrite-types-rust.cdx.json
cp crates/ic-clients/ic-clients.cdx.json dist/sbom/ic-clients-rust.cdx.json
cp tests/fixtures/governance/dendrite-test-governance.cdx.json dist/sbom/dendrite-test-governance-rust.cdx.json
cp tools/xtask/xtask.cdx.json dist/sbom/xtask-rust.cdx.json
rm canisters/dendrite/dendrite.cdx.json crates/dendrite-types/dendrite-types.cdx.json crates/ic-clients/ic-clients.cdx.json tests/fixtures/governance/dendrite-test-governance.cdx.json tools/xtask/xtask.cdx.json
npm exec --offline -- cyclonedx-npm --omit dev --output-file dist/sbom/npm.cdx.json
sha256sum dist/sbom/*.json > dist/sbom/SHA256SUMS
