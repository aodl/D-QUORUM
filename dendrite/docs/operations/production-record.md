# Production record

**Status: UPGRADED — module and public certified assets verified.**

Only an operator-supplied real deployment result may change this into completed
evidence. Never include private identity or authentication material.

## Scoped authentication frontend upgrade — 2026-11-08

The user explicitly requested deployment of the latest Dendrite frontend using
`dfx` and `codex_local`. This authorizes the lifecycle-client and identity exceptions
to the default `icp-cli` procedure for this upgrade. The frontend is embedded in the
single Dendrite canister, so the operation upgraded the complete canonical Wasm.

| Field | Recorded value |
| --- | --- |
| Release source Git commit | `d1793f7728447b58232f5542dac95a07ee5e199b` |
| Latest main source comparison | `origin/main` at `49f8d57`; identical Dendrite subtree `fce567a2259bb3aacafb8eeb6730a6d7ea8d236b` |
| Browser harness repair commit | `7cca8bc`; test tooling only, no production asset or canister source changes |
| Lifecycle client / identity | `dfx 0.31.0` / `codex_local` |
| Operator identity principal | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm --argument '()'` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before / after | `4_794_414_414_333` / `4_771_790_289_394` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `bc75d0510e40affcc57d164df764ea2274ea044ca5c4332c6ed9ae3e66b4a501` |
| Installed canonical Wasm SHA-256 | `5ff6e1d3c79fa310f45d9f314ebb578d7f5b71abed15cd7f236fa5b7b122cf8d` |
| Release `SHA256SUMS` SHA-256 | `d8c2f1e0aa927743d80fa869b023c5d56357b356204e6786f5c4a6ee3bbaff71` |
| Asset-manifest SHA-256 | `8efaded8cd5a9af029ff805e38a362cf0664a54baa4db67c95a72225e2b8c342` |
| Generated application SHA-256 | `eb36d22b3c1a1093f4cf58237728bba409ea53c5b7be24a1c8dba560b380ccc6` |
| Generated stylesheet SHA-256 | `008b98904943b9caf17647649eb069684bfad51f5887b03943c896fe64d9dbf3` |
| Build-configuration SHA-256 | `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d` |
| SBOM checksum-manifest SHA-256 | `d732ba705432c3539240b2002ffa08bd2ff1a24e411e1e1488a53b8284cd86e6` |
| Upgrade started / verification completed | `2026-11-08T11:54:08Z` / `2026-11-08T11:54:26Z` |

Required command gates passed: `npm ci --ignore-scripts`, `cargo xtask check`,
`cargo xtask test`, `cargo xtask coverage`, `cargo xtask build`,
`cargo xtask build-reproducible`, `cargo xtask verify-reproducible`,
`cargo xtask security-scan`, `cargo xtask sbom`, `npm test`, and
`npm run test:coverage`. The suite passed 62 Rust unit tests, three PocketIC scenarios,
and 172 frontend tests. Workspace line coverage was 89.97%; rule-engine line/branch
coverage was 98.79%/95.51%; frontend line/branch/function coverage was
95.87%/87.37%/93.70%. Two clean local builds and two clean no-cache canonical Docker
builds were independently byte-identical. The canonical export exactly matched the
bound release. Scans passed with the existing documented, narrowly scoped exceptions
in [security](../security.md), including the two inactive optional npm build-tool
advisories; production npm audit reported zero vulnerabilities.

Read-only verification checked the installed module hash and byte identity of `/`,
`/index.html`, `/asset-manifest.json`, `/.well-known/ii-alternative-origins`, and both
generated assets. Every response returned HTTP 200 with certification v2, its
certificate expression, expected MIME/cache policy, popup-compatible COOP, CSP, and
security headers. Alternative origins remained exactly `{"alternativeOrigins":[]}`.
Controllers and settings were unchanged. No cycle transfer, D-QUORUM deployment,
blackholing, or NNS mutation was performed. The production Candid interface and fixed
evidence destinations/methods are unchanged; the pinned NNS revision remains
`d55a0f4d4edfabe49d8fd543aff473084cb741f2`.

Additional Chromium qualification did **not** pass completely. After correcting two
harness defects with failing-then-passing regressions (public DNS containment and
automatic favicon-404 accounting), desktop and actual 200% page-scale scenarios
passed. The 720-pixel equivalent-reflow scenario measured a frequent icon target at
42.859375 CSS pixels, below its unchanged 44-pixel gate. The run stopped there;
mobile and narrow scenarios were not reached. This is a retained limitation of the
requested existing artifact, not a passing browser qualification. Final-origin II,
controlled transactions, and blackholing operator gates remain UNRUN.

Bounded local evidence is under
[`dist/deployment-20261108`](../../dist/deployment-20261108/):
[command results](../../dist/deployment-20261108/check-results.txt),
[canonical build comparison](../../dist/deployment-20261108/canonical.log),
[live verification](../../dist/deployment-20261108/live-verification.json), and
[browser failure](../../dist/deployment-20261108/browser-smoke-final.log).
These generated files are ignored by Git; this entry retains the durable result.

## Evidence-specific rule diagnostics upgrade — 2026-07-29

| Field | Recorded value |
| --- | --- |
| Release Git commit | `694e1c2a47f3a2fc238b9b3799748610ca22b274` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Operator identity principal | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_337_452_178_658` |
| Cycles balance after | `5_315_097_916_637` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `8fec1ba048185e9020b815d0dadc499b5305550ff7f27f314885b2acc17278cd` |
| Installed module hash | `5b20aa2aa7b3d3b6706698bbd75dfaf6775a96d27c744fd230e7fd709ba448eb` |
| Release `SHA256SUMS` hash | `05b0a2f6340e8912a46cfa78d8f54591f1c330d74a3968eb4ed8a22481d3ecbb` |
| Asset-manifest hash | `c1e36dbff3b8240e32fe9878e86cdcb716bedeb3dc558f412a8f9e88b0cfad2b` |
| Generated application hash | `16a88df940fd5e9140f12806e367f907c5f152c16b9ea56b853f6163c08f1e46` |
| Generated stylesheet hash | `f4bde1b2f8652ece1ea245507bc42455c547b026ef0cb9b94e46cebe55bac235` |
| Deployment verification timestamp | `2026-07-29T20:18:12Z` |
| Verification | Installed module hash matched the canonical Wasm; `/`, `/asset-manifest.json`, `/.well-known/ii-alternative-origins`, and both generated assets returned certified HTTP 200 responses. |
| Notes | No controller, freezing threshold, authentication configuration, or other setting changed; no transaction gate, cycle transfer, or NNS mutation was performed. |

## Certified controller-evidence upgrade — 2026-07-29

| Field | Recorded value |
| --- | --- |
| Release Git commit | `fbab098a38f6f33b661e991ef50e9521e8fe7260` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Operator identity principal | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_359_743_697_857` |
| Cycles balance after | `5_337_616_559_505` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `93a9ab8dc8b16929bcf32e3dd5823f5ff8a572f8633dbccf771dc608907c4a6f` |
| Installed module hash | `8fec1ba048185e9020b815d0dadc499b5305550ff7f27f314885b2acc17278cd` |
| Release `SHA256SUMS` hash | `e3aa3286d33760f72870fa38a799d26edebff4f047c86e942689dcad79cd9578` |
| Asset-manifest hash | `f37c1fc10e138acee75baf9c0077643029c5c44423278114b6ca1efa038c74f6` |
| Generated application hash | `7a01ed2dfecd57cbb075d7b157ddfb12d73127bc6120fd95102408dd1ec8f631` |
| Generated stylesheet hash | `5c47423d8ae5798dcc30176b61e17e8552e31b192e731362b5000846f6fffaac` |
| Deployment verification timestamp | `2026-07-29T18:44:27Z` |
| Verification | Installed module hash matched the canonical Wasm; `/`, `/asset-manifest.json`, `/.well-known/ii-alternative-origins`, and both generated assets returned certified HTTP 200 responses. |
| Notes | The consolidated verifier passed artifact and status checks, then its anonymous `icp canister settings show` probe was rejected because controller authorization is required. Direct `dfx` status and public certified-HTTP verification completed. No controller, freezing threshold, authentication configuration, or other setting changed; no transaction gate, cycle transfer, or NNS mutation was performed. |

## Minimal visual-system upgrade — 2026-07-29

| Field | Recorded value |
| --- | --- |
| Release Git commit | `bd98353b9086834806c9999866841dd4c9d5e424` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm /home/codexdev/src/Dendrite/dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_382_481_336_903` |
| Cycles balance after | `5_360_394_521_990` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `f8556ca1b5d8345b734b95241e0c1aad887f3b1d826d6d3a6a4b9f79ff63efd6` |
| Installed module hash | `93a9ab8dc8b16929bcf32e3dd5823f5ff8a572f8633dbccf771dc608907c4a6f` |
| Release `SHA256SUMS` hash | `638305ff85f1fef1ac6c2465490178e7b2a05ad2b4f065acaa5433b5d0231b29` |
| Asset-manifest hash | `2dcf25b388d301acfe23a5f8fe48c2ca862d89e5415765302cfe50683a6a1661` |
| Generated application hash | `4f2a7ce261d94c9399b3fbdd3e045d0a4ef8a78d7700510bc90a89e6130ec33b` |
| Generated stylesheet hash | `5c47423d8ae5798dcc30176b61e17e8552e31b192e731362b5000846f6fffaac` |
| Deployment verification timestamp | `2026-07-29T12:24:31Z` |
| Verification | Module hash matched; `/asset-manifest.json` and both generated assets returned certified HTTP 200 responses and byte-matched the candidate |
| Notes | No controller, freezing threshold, authentication configuration, or other setting changed; no cycle transfer or NNS mutation occurred. |

## Aggregated-rule upgrade — 2026-07-29

| Field | Recorded value |
| --- | --- |
| Release Git commit | `870ddfbd08e5599b405c007d4484991d6f0998f9` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_405_034_799_652` |
| Cycles balance after | `5_382_996_288_948` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `da0b1892880866e941b1c7461c0672ccc80d44a6b93fcb4727e63f26b4d36d0e` |
| Installed module hash | `f8556ca1b5d8345b734b95241e0c1aad887f3b1d826d6d3a6a4b9f79ff63efd6` |
| Release `SHA256SUMS` hash | `57715c5c45ef57995c6ba52e5c3bc47dfec8c996b32a7248a45373eeb2dd9784` |
| Asset-manifest hash | `8cda676c9d449cf51ba4f423f566ffab3f65f40ce815317a5f689d8b5ab44e7c` |
| Generated application hash | `dfc86dcd377a4c133182f3dfe537a1040fe1007c423686ea922c18836f9bcf60` |
| Generated stylesheet hash | `b88e8e9260e1394384e1ebcdf5ea7970a3dc7b2f3259cab6b2a29fd2a6c38036` |
| Deployment verification timestamp | `2026-07-29T07:25:00Z` |
| Verification | Module hash matched; `/`, `/asset-manifest.json`, and both generated assets returned certified HTTP 200 responses and byte-matched the candidate |
| Notes | No controller, freezing threshold, authentication configuration, or other setting changed; no cycle transfer or NNS mutation occurred. |

## Rules-first upgrade — 2026-07-28

| Field | Recorded value |
| --- | --- |
| Release Git commit | `8582e64` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_428_266_033_775` |
| Cycles balance after | `5_406_247_854_072` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `e2b621207262360035803d45c3a6e144116219751c5391c517e51b625eb28a02` |
| Installed module hash | `da0b1892880866e941b1c7461c0672ccc80d44a6b93fcb4727e63f26b4d36d0e` |
| Release `SHA256SUMS` hash | `249064631886d6244e35a467792339dc18e5158632b0e769d443bbddde0a8559` |
| Asset-manifest hash | `eeb605c876ba3aa74348f2dff3b1b210015f4d001b2d322383924c1f537bfb8b` |
| Generated application hash | `6fbb6d8d0eeb471ad86be18fc8dd27db8cb0d16f62ce1aad7103fc7a457b35fc` |
| Generated stylesheet hash | `59eb7b4de6930a5126bf23b216a545a091dae5e9ef0617a418a5ba374286bcb4` |
| Deployment verification timestamp | `2026-07-28T19:37:34Z` |
| Verification | Module hash matched; `/`, `/asset-manifest.json`, both generated assets, and `/.well-known/ii-alternative-origins` returned HTTP 200 with IC certification and byte-matched the candidate |
| Notes | The consolidated anonymous verifier could not read controller-only settings, as expected. Direct public HTTP verification completed. No controller, freezing threshold, authentication configuration, or other setting changed; no cycle top-up or NNS mutation occurred. |

## Initial installation — 2026-07-26

| Field | Recorded value |
| --- | --- |
| Release Git commit | `5be98b8a8bbc51828faba655c302580a9f1086fb` |
| Release tag | UNRUN |
| Production mapping | See authoritative [deployment identifiers](deployment.md) |
| Lifecycle client | `dfx 0.27.0`, used only as the direct credential-bearing management-canister client |
| Operator identity | `codex_local` |
| Operator identity principal | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Wallet | None; no `--wallet` option was specified |
| Deployment mode | `install` |
| Exact install command | `dfx --identity codex_local canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode install --wasm /home/codexdev/src/Dendrite/dist/release/dendrite.wasm` |
| Controller list before | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Controller list after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `2_284_571_107_661` |
| Cycles balance after | `2_262_848_218_764` |
| Freezing threshold before | `7_776_000` seconds |
| Freezing threshold after | `7_776_000` seconds |
| Canonical Wasm SHA-256 | `1291a51cc26bcdd1ea387f6509aeef3f9c39e19f04f58495576f842873aa371a` |
| Installed module hash | `1291a51cc26bcdd1ea387f6509aeef3f9c39e19f04f58495576f842873aa371a` |
| Release `SHA256SUMS` hash | `090f2cba0cfa230323506d8051bda7b18866da3a0f4f787264dfb0e56d28ad7b` |
| Frontend tree hash | `9eca27496a792732545e4f8eba8e686db14b7f15258415a1307cc058c9618ed3` |
| Asset-manifest hash | `1791938f3a445cbaf3d5c21afe6ff5a1313d309e5e652ca8a4102f60660c82eb` |
| Build-configuration hash | `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d` |
| Transaction Candid hash | UNRUN |
| Generated declaration hash | UNRUN |
| Command policy hash | UNRUN |
| Response policy hash | UNRUN |
| SBOM hashes | Recorded in `dist/sbom/SHA256SUMS` at the release commit |
| Deployment timestamp | `2026-07-26T08:23:22Z` |
| Gate 1 result | UNRUN |
| Gate 2 result | UNRUN |
| Known limitations | `tools/scripts/verify-mainnet-readonly.sh` did not complete: its anonymous `icp-cli` controller-settings read was rejected, and direct follow-up verification found `/asset-manifest.json` returns HTTP 404. Other directly checked routes (`/`, `/index.html`, `/.well-known/ii-alternative-origins`, `/404.html`, and the hashed JS/CSS assets) return HTTP 200; the well-known document is exactly `{"alternativeOrigins":[]}`. |
| Operator notes | `icp-cli 1.2.0` remained the release and no-write dry-run client. No controller, freezing-threshold, or other settings change was made. No cycles wallet was used. All `dfx` management calls ran from a temporary directory outside the repository, which was removed; no dfx project configuration was introduced. No push, NNS mutation, or blackholing was performed. |
