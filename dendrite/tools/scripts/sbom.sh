#!/bin/sh
set -eu
mkdir -p dist/sbom
cargo cyclonedx --format json --all --manifest-path Cargo.toml
cp canisters/dendrite/dendrite.cdx.json dist/sbom/dendrite-rust.cdx.json
cp canisters/bootstrap/dendrite-bootstrap.cdx.json dist/sbom/dendrite-bootstrap-rust.cdx.json
cp crates/dendrite-types/dendrite-types.cdx.json dist/sbom/dendrite-types-rust.cdx.json
cp crates/ic-clients/ic-clients.cdx.json dist/sbom/ic-clients-rust.cdx.json
cp tests/fixtures/governance/dendrite-test-governance.cdx.json dist/sbom/dendrite-test-governance-rust.cdx.json
cp tools/xtask/xtask.cdx.json dist/sbom/xtask-rust.cdx.json
rm canisters/dendrite/dendrite.cdx.json canisters/bootstrap/dendrite-bootstrap.cdx.json crates/dendrite-types/dendrite-types.cdx.json crates/ic-clients/ic-clients.cdx.json tests/fixtures/governance/dendrite-test-governance.cdx.json tools/xtask/xtask.cdx.json
npm exec --offline --ignore-scripts -- cyclonedx-npm --omit dev --output-format JSON --output-file dist/sbom/npm.cdx.json
node --input-type=module <<'NODE'
import {readFile,writeFile} from 'node:fs/promises';
import {heartbeatPolicy,reviewedHeartbeatSource,annotateHeartbeatSbom} from './canisters/dendrite/web/sdk-heartbeat-policy.mjs';
reviewedHeartbeatSource(await readFile('node_modules/@icp-sdk/signer/lib/esm/web/heartbeat/client.js','utf8'));
const path='dist/sbom/npm.cdx.json',sbom=annotateHeartbeatSbom(JSON.parse(await readFile(path,'utf8')));
await writeFile(path,`${JSON.stringify(sbom,null,2)}\n`);
await writeFile('dist/sbom/signer-heartbeat-build-policy.json',`${JSON.stringify(heartbeatPolicy,null,2)}\n`);
NODE
sha256sum dist/sbom/*.json > dist/sbom/SHA256SUMS
