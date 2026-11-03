# Reproducible builds

## What is verified

Release verification connects one reviewed commit and lockfiles to the raw Wasm,
embedded frontend bytes, build configuration, checked-in interfaces, and SBOMs. It
does not authorize deployment.

## Release inputs

The canonical `linux/amd64` build uses `SOURCE_DATE_EPOCH=0` and the exact immutable
production inputs in [deployment](deployment.md). Root-key fetching is disabled.
Browser qualification permits anonymous Governance `query` plus query-signature
`read_state` only to the fixed Governance ID, and controller `read_state` only to the
exact principal recorded in the validated live report provenance. It rejects Dendrite,
controller query/update, `/call`, and every unexpected canister destination.

## Canonical Docker build

The digest-pinned `Dockerfile.repro`, pinned lockfiles, and `linux/amd64` platform
produce only `dendrite.wasm`, `frontend/`, `asset-manifest.json`,
`build-configuration.txt`, and deterministic `SHA256SUMS`. The latter excludes itself.

## Local determinism check

An ordinary configured `cargo xtask build` writes toolchain-local outputs.
`cargo xtask build-reproducible` packages a local configured build.
`cargo xtask verify-reproducible` compares two clean builds on the same host. These are
useful diagnostics, not the canonical public container artifact.

The canonical comparison performs two clean no-cache Docker builds into separate temporary directories and
fails on any missing, extra, or different file or manifest.

## Direct Standard rules candidate — 2026-07-30

This candidate is not deployed. It advances the catalogue to
`nns-dendrite/1.1-draft` and exposes only 25 substantive rules in six explicit
groups. The three former report-integrity entries and the reference-neuron metadata
check are internal invariants rather than scored neuron rules. The compliant fixture
contains 38 policy evaluations. Default-reference neurons are fetched only when
configured as any explicit followee, providing live known-neuron names while retaining the derived dependency bound
to the conservative 960-neuron wire-derived bound.

Every normal report disclosure starts collapsed, including Team Members, Topic
delegation, and all rule groups and rows. Header characteristics, Raw Report copying,
and navbar authentication are directly available. Status filtering never expands a group. Section summaries and group
counts are right aligned. Proposal-based dissolution is described through the
security consequence of `not_for_profit = false`.

Two clean local builds were byte-identical. Two forced-clean `--no-cache`
`linux/amd64` Docker exports had identical file sets, byte-identical files, and
identical deterministic manifests.

- Canonical raw Wasm SHA-256:
  `74f6090a729fa467908985c8ef8adc415e237fdf2e6eda8fa7d6a68a0aade972`
- Same-toolchain local raw Wasm SHA-256:
  `9e6b0bde5dee001fdbdc687578006c7923bb3b18c296624003f1aaf486f23abe`
- Frontend tree SHA-256:
  `31aa60d91ea15dbe94f0ce5d242c0ea3adacb6a3aa2f1b0db432aaa994d5aa4e`
- Asset manifest SHA-256:
  `15cab4649d2e415b15d5b1bf9d6628859249b69dabdc60737913adaf64da4bd2`
- Build configuration SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`
- `SHA256SUMS` SHA-256:
  `9989b8c9f4c87f85807c6f1ada8c58e8bfb2890938d1144f4a49edbdc73684f7`
- SBOM checksum manifest SHA-256:
  `9388482d89ea9f3018bd282981f3402cd52d8a7e6e8168023055b579669db603`
- Chromium evidence tree SHA-256:
  `454b3840226804f5e2502bff56038b2f8dd3cf3fb26a4d05c9ac23b2bad21b7c`

The generated assets are `generated/app.b621ba522c99801f.js` and
`generated/styles.1ebbbb16b0d22189.css`. Chrome 144.0.7559.96 passed desktop,
actual 200% page scale, 200%-equivalent reflow, mobile, and 320-pixel reflow with zero
overflow, console errors, page errors, interaction requests, Dendrite requests, and
`/call` requests. Pass was `rgb(19, 121, 91)` and fail was
`rgb(180, 35, 24)` for filters and group totals; verdict colours matched their status
tokens.

The matrix passed 159 frontend tests, 60 Rust unit tests, 3 PocketIC scenarios, and
all 38 Rust/browser parity fixtures. Frontend coverage was 95.50% lines, 86.59%
branches, and 92.98% functions. Rust workspace line coverage was 90.13%; the rule
engine reached 99.68% lines and 95.10% branches. Security scanning, production
dependency isolation, interface and declaration drift, transaction-IDL equality, npm
audit, and SBOM generation passed with the existing documented exceptions.
`check_neuron` remains confined to separate fresh transaction-review and final-
submission preflights. No lifecycle write or NNS mutation was performed.
The guarded anonymous upgrade dry-run verified every release checksum and the
candidate binding, observed the deployed predecessor hash, printed the exact intended
upgrade command, and exited with `dry-run complete; no write performed`.

## Final neuron-report hierarchy candidate — 2026-07-30

This candidate renders one route-loaded public report with a branded authentication
navbar; identity, direct compliance verdict, header characteristics and copy-only Raw
Report control; optional account workspace; Team Members; Topic delegation; and Standard rules.
Standard-rule totals are the only report filters. The former report actions, public
consensus state, binary attention control, and separate diagnostic-evidence section are
absent. `check_neuron` remains available only for separate fresh transaction-review
and final-submission preflights inside Management.

The deterministic `33138099823745946` fixture continues to prove that omission from
`list_neurons` is not absence: explicit `get_neuron_info` metadata supplies
`CO.DELTA △` and committed topics, the known-neuron rule passes, and no unrelated
metadata ID is requested. Certified controller reads, strict validation, Rust/browser
parity, and transaction fail-closed behavior remain intact.

Two clean local builds were byte-identical. Two forced-clean `--no-cache`
`linux/amd64` exports made with Docker Engine 28.0.1, Buildx 0.21.1, and BuildKit
0.31.2 had identical file sets, byte-identical files, and identical deterministic
`SHA256SUMS`.

- Canonical raw Wasm SHA-256:
  `72d10ba0de7b414f20de1c38fa68a120ad5a98ee0c41aa8d6f0229807a344dcf`
- Same-toolchain local raw Wasm SHA-256:
  `b86a767146a7e11a833ff00d27d557ed9f4c207f5bbb21001e016436caefb00a`
- Frontend tree SHA-256:
  `aebb724ee3de98e0f91986eeb486716b8502fd0155def8c4bf3f3a23424cb830`
- Asset manifest SHA-256:
  `56e8af977167dd421dcf5723564534b11a241253b060e65491a2e33f89b10011`
- Build configuration SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`
- `SHA256SUMS` SHA-256:
  `bcfec220624f3fa78e1ae7cb687a7b13fd27bea48b0b833ba0229f60846df247`
- SBOM checksum manifest SHA-256:
  `bf2d07cd5dad732264baf3493d0364e82929d7347a6d8e5d7165b4801d4711b6`
- Chromium evidence tree SHA-256:
  `ce644e3a33278f896186feb0a2540fe39f208e212e0b3aaf9620d518f9bf3646`

The generated frontend assets are
`generated/app.b963c5dc6bbff132.js` and
`generated/styles.56fc7339981b5436.css`. Chrome 144.0.7559.96 qualified desktop,
actual 200% page scale, 200%-equivalent reflow, mobile, and 320-pixel narrow reflow.
Computed pass and fail colours were respectively `rgb(19, 121, 91)` and
`rgb(180, 35, 24)` for global filters and group counts; the compliant and
non-compliant verdicts matched the corresponding token. All scenarios had zero
material overflow, console errors, or page errors. Report interactions made zero
requests; ordinary browsing made 20 anonymous Governance query requests, exact
signature/controller reads, zero Dendrite requests, and zero `/call` requests.

The release matrix passed 155 frontend tests, 57 Rust unit tests, 3 PocketIC
scenarios, and all 38 Rust/browser parity fixtures. Rust workspace line coverage was
89.58%, rule-engine line coverage was 98.23%, and frontend coverage was 95.50% lines,
86.69% branches, and 92.89% functions. Security scanning, production dependency
isolation, interface/declaration/transaction-IDL drift, npm audit, and CycloneDX SBOM
generation passed with the existing documented exceptions. The guarded anonymous
upgrade dry-run verified the exact candidate and printed the intended lifecycle
command without performing it. Internet Identity and controlled-transaction operator
gates remain unrun. No mainnet upgrade, lifecycle write, controller change, cycle
operation, authentication gate, or NNS mutation occurred.

## Known-metadata and single-live-report candidate — 2026-07-29

This candidate is not deployed. Ordinary reports have one route-loaded live state and
no refresh or public consensus-verification action. Anonymous, signature-verified
Governance `list_neurons` supplies full configuration while explicit-ID
`get_neuron_info` supplies known-neuron metadata; certified controller state remains a
separate exact-canister `read_state`. Dendrite `check_neuron` remains confined to exact
transaction review and final preflight.

Two clean local builds and two forced-clean, no-cache `linux/amd64` canonical Docker
exports had identical file sets and byte-identical output.

- Raw Wasm SHA-256:
  `26693c14ea44bf6b67216f5527671ad1290a628b5f44b0581a411e3bd7c9cee3`
- Frontend tree SHA-256:
  `dceed211dffed3bda2c56c31330d77b8afb1ec457055a909a4acba13a77d094e`
- Asset manifest SHA-256:
  `ed653503512e234b5f755fd3aba511bb8015046aadf174cc03f38fb5af7013af`
- Build configuration SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`
- `SHA256SUMS` SHA-256:
  `601be4bc25f87d6b0e1f607401ece3341b49914a9a19c099323feb9e24bd2339`
- SBOM checksum manifest SHA-256:
  `62f2f2241f54a0ac5617113522faded6b4a93116f8a458d88dc9db4113bdff88`

The deterministic `33138099823745946` fixture proves that omission from
`list_neurons` is not absence: explicit metadata for `CO.DELTA △` is merged, the known
rule passes, and committed topics come from `get_neuron_info`. Chromium 144 qualified
five viewports, semantic summary colours, deterministic failures, disclosure/filter/
copy request silence, 20 anonymous Governance query requests, and zero Dendrite or
`/call` requests. Rust workspace line coverage was 89.58%; frontend coverage was
95.56% lines, 86.95% branches, and 92.64% functions. Security scanning and SBOM
generation passed with the existing documented exceptions.

## Evidence-specific rule diagnostics candidate — 2026-07-29

This source-changing candidate is not deployed and performed no operator
authentication or transaction gate. The public Candid API remains update
`check_neuron` plus certified query `http_request`; replicated outbound calls remain
fixed Governance `list_neurons` and management `canister_info`. Ordinary browser
analysis adds only anonymous Governance `query`/signature `read_state` and certified
`read_state` to the exact query-reported controller. This candidate adds no network
boundary; its test-only deterministic failure page is excluded from production assets.

- Raw Wasm SHA-256:
  `5b20aa2aa7b3d3b6706698bbd75dfaf6775a96d27c744fd230e7fd709ba448eb`
- Frontend tree SHA-256:
  `db8f8a3b264ff70e152438feb33315e3874c5ff63c1b6cf6503fa83762ce086e`
- Asset manifest SHA-256:
  `c1e36dbff3b8240e32fe9878e86cdcb716bedeb3dc558f412a8f9e88b0cfad2b`
- Build configuration SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`
- `SHA256SUMS` SHA-256:
  `05b0a2f6340e8912a46cfa78d8f54591f1c330d74a3968eb4ed8a22481d3ecbb`
- SBOM checksum manifest SHA-256:
  `8a2fff884d2c9d6b4e528d0e9120b78ed77ac3d06d3f7c8b2aa5239ddb380272`
- Chromium evidence tree SHA-256:
  `b2dbfa5a5dbdb5232d1cca66e3f4d35d6cbebb3fb1bae67c3779608e56b5e868`

Two clean local builds and two forced-clean no-cache canonical Docker exports had
identical file sets and byte-identical outputs. Rust workspace line coverage was
91.71%; frontend coverage was 96.41% lines, 87.02% branches, and 92.72% functions.
Chromium 144 qualified five viewports plus the deterministic failure view, refresh,
interaction silence, exact controller
destination binding, controller `read_state`-only traffic, and zero Dendrite or `/call`
requests. Security scans passed with the existing documented `backoff`, `instant`,
`paste`, and `serde_cbor` exceptions. Final-origin Internet Identity and controlled
transaction smoke tests remain unrun operator gates.

The guarded `icp-cli 1.2.0` dry-run ran as anonymous principal `2vxsx-fae`, verified
every candidate checksum, observed installed production module `8fec1ba0…17278cd`,
selected upgrade mode, printed the intended lifecycle command, and exited with
`dry-run complete; no write performed`. Its controller-only settings probe was rejected
as expected for the anonymous caller.

## Minimal visual-system upgrade candidate — 2026-07-29

This source-changing candidate is not deployed. It follows the aggregated-rule
production upgrade recorded in [production-record.md](production-record.md). The
visual tranche performed no additional production, lifecycle, controller, cycle,
authentication, or NNS write.

Docker Engine 28.0.1, Buildx 0.21.1, and BuildKit 0.31.2 used the reviewed
`dendrite-canonical` docker-container builder. Two forced-clean `--no-cache`
`linux/amd64` exports had identical file sets, byte-identical files, and identical
deterministic `SHA256SUMS`.

- Raw Wasm SHA-256:
  `93a9ab8dc8b16929bcf32e3dd5823f5ff8a572f8633dbccf771dc608907c4a6f`
- `SHA256SUMS` file SHA-256:
  `638305ff85f1fef1ac6c2465490178e7b2a05ad2b4f065acaa5433b5d0231b29`
- Frontend tree SHA-256:
  `3713bfe8f52385da5ba7008bfcb0f7f090725d685c732a55c207545761a1e462`
- `asset-manifest.json` SHA-256:
  `2dcf25b388d301acfe23a5f8fe48c2ca862d89e5415765302cfe50683a6a1661`
- `build-configuration.txt` SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`
- SBOM manifest SHA-256:
  `d72d1fe331bb5c586598c9fb71b65fcfe18306f0d9fcaa21fb3e1ec7db82725d`
- Executed Chromium evidence SHA-256:
  `b6ab0f031d00bb4390687e146f20bd03a00a615833727c46c48770306f28995d`

Chrome 144.0.7559.96 qualified five isolated layouts: 1440×1000 desktop;
1440×1000 with CDP `Emulation.setPageScaleFactor(2)` and measured visual viewport
720×500 at scale 2; the separately labelled 720×500 CSS-pixel
`200%-equivalent reflow viewport` at scale 1; 390×844 mobile; and 320×844 narrow
reflow. Every layout used DPR 1 and reported an 800×600 emulated screen. All recorded
zero material page overflow, no console/page errors, visible text and controls, and
44-CSS-pixel frequent icon targets.

The gate captured the header/verdict, collapsed rules, simple and multi-topic expanded
rules, legacy aggregate-status filtering, managers, topic delegation, and legacy diagnostic disclosures. It
proved transparent quiet disclosures, one filled preliminary header action, native
table headings, keyboard and guarded whole-row activation, flat disclosure structure,
and zero interaction-triggered requests. Every scenario independently observed a
Governance query and signature-verification `read_state` only to
`rrkah-fqaaa-aaaaa-aaaaq-cai`, with zero Dendrite, update, or unexpected-canister
requests. Anonymous ingress remains proved by the separate actor-construction unit
test, not inferred from missing HTTP headers.

The guarded anonymous `upgrade` dry-run verified the candidate binding and every
release checksum, observed the installed historical aggregation module
`f8556ca1b5d8345b734b95241e0c1aad887f3b1d826d6d3a6a4b9f79ff63efd6`,
tolerated the expected anonymous controller-settings rejection, printed the exact
intended upgrade command, and exited with `dry-run complete; no write performed`.
It made no lifecycle or NNS write.

## Aggregated-rule upgrade candidate — 2026-07-29

This candidate was subsequently deployed and is preserved as historical release
evidence in [production-record.md](production-record.md). Its qualification evidence
does not qualify or imply deployment of later source-changing candidates.

Docker Engine 28.0.1, Buildx 0.21.1, and BuildKit 0.31.2 used the reviewed
`dendrite-canonical` docker-container builder. Two forced-clean `--no-cache`
`linux/amd64` exports had identical file sets, byte-identical files, and identical
deterministic `SHA256SUMS`.

- Raw Wasm SHA-256:
  `f8556ca1b5d8345b734b95241e0c1aad887f3b1d826d6d3a6a4b9f79ff63efd6`
- `SHA256SUMS` file SHA-256:
  `57715c5c45ef57995c6ba52e5c3bc47dfec8c996b32a7248a45373eeb2dd9784`
- Frontend tree SHA-256:
  `404d300cfad45d50708980ee6136d7001cdb9ca6a26b115b40b08b52e9e36b39`
- `asset-manifest.json` SHA-256:
  `8cda676c9d449cf51ba4f423f566ffab3f65f40ce815317a5f689d8b5ab44e7c`
- `build-configuration.txt` SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`
- SBOM manifest SHA-256:
  `d6c03ae938360909fadc2d3ffa76e09acf61caf1b88abb1083caf465591af98e`
- Executed Chromium evidence SHA-256:
  `62fe11404cfc45c7943579fa78314ce60701f59cb8f5b8220a1f587e871c7be4`

The exact frontend passed four isolated Chrome 144.0.7559.96 scenarios. Desktop used
a 1440×1000 CSS viewport at DPR 1 and visual scale 1. Actual page-scale qualification
used CDP `Emulation.setPageScaleFactor(2)` after navigation: the CSS viewport remained
1440×1000 while the measured visual viewport became 720×500 at scale 2. The separate
`200%-equivalent reflow viewport` used 720×500 CSS pixels, DPR 1, and scale 1. Mobile
used 390×844 CSS pixels, DPR 1, and scale 1. The headless environment reported an
800×600 emulated screen in every scenario. All four recorded zero material horizontal
overflow, visible text and controls, complete keyboard evidence, no console/page
errors, and zero interaction-triggered requests.

Each isolated scenario rendered 25 rows for 25 distinct live-report rule IDs and
expanded the live default rule into all 16 returned topic evaluations; deterministic
fixture tests separately prove 29 rows from the fully-compliant report's 43 entries and
all 15 of its default-rule topic instances. Each browser scenario recorded at least one
Governance query and signature-verification `read_state`, only to
`rrkah-fqaaa-aaaaa-aaaaq-cai`, with zero Dendrite/update/unexpected destinations.
Missing Authorization/cookie headers are recorded transport facts; the production
actor identity-construction unit test supplies the ingress-anonymity proof.

The guarded anonymous `upgrade` dry-run at commit
`2bf98b017bb87fadb8e3566b6aba869637a5dd6d` verified the new candidate binding and
every release checksum, observed the previously deployed rules-first module
`da0b1892880866e941b1c7461c0672ccc80d44a6b93fcb4727e63f26b4d36d0e`,
tolerated the expected anonymous controller-settings rejection, printed the exact
intended upgrade command, and exited with `dry-run complete; no write performed`.
It made no lifecycle or NNS write.

## Rules-first neuron-page upgrade candidate — 2026-07-28

Docker Engine 28.0.1, Buildx 0.21.1, and BuildKit 0.31.2 used the reviewed
`dendrite-canonical` `docker-container` builder. Two forced-clean `--no-cache`
`linux/amd64` exports had identical file sets, byte-identical files, and identical
deterministic `SHA256SUMS`. This rules-first release was subsequently installed by the
operator as the production upgrade recorded in
[production-record.md](production-record.md). It remains historical deployed-release
evidence and is not evidence that a later source-changing candidate was deployed.

- Raw Wasm SHA-256:
  `da0b1892880866e941b1c7461c0672ccc80d44a6b93fcb4727e63f26b4d36d0e`
- `SHA256SUMS` file SHA-256:
  `249064631886d6244e35a467792339dc18e5158632b0e769d443bbddde0a8559`
- Frontend tree SHA-256:
  `a1901e741fb423e3ae52d14e6a122b6124ffcf3f7592d48cb0e05dfa4050f1e1`
- `asset-manifest.json` SHA-256:
  `eeb605c876ba3aa74348f2dff3b1b210015f4d001b2d322383924c1f537bfb8b`
- `build-configuration.txt` SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`
- SBOM manifest SHA-256:
  `be5ba61c762bd244ff88acf635a2408c643f8bf1abb79b7131df0e646b2ae52a`
- Executed Chromium evidence SHA-256:
  `e636a58c615e7f818fc378aa531bd435c1eb24c71b1ef451b073bde0fd83c770`

The exact canonical frontend export passed the qualification mechanism used at that
time at 1440×1000, a 720×500 viewport with 2× device scale (a high-density reflow
scenario, not proof of actual browser zoom), and 390×844. It verified
canonical rule ordering above managers and delegation, keyboard
rule expansion, legacy aggregate-status filtering, preliminary controller uncertainty, route-stable
section navigation, every lower disclosure, and post-interaction overflow. The run
recorded six anonymous Governance query requests, zero Dendrite requests, zero
interaction-triggered requests, zero update endpoints, zero unexpected destinations,
and no console or page errors. A legacy report action was present and not activated.

The guarded anonymous `upgrade` dry-run at commit
`fd79b3ced63619b8b4477cc2919a8aa8fb7d8e42` verified the candidate binding and every
release checksum, observed the installed module, tolerated the expected anonymous
controller-settings rejection, printed the exact intended upgrade command, and exited
with `dry-run complete; no write performed`. It made no lifecycle write.

## Trust-state-hardening upgrade candidate — 2026-07-27

Docker Engine 28.0.1, Buildx 0.21.1, and BuildKit 0.31.2 used the reviewed
`dendrite-canonical` `docker-container` builder. Two forced-clean `--no-cache`
`linux/amd64` exports had identical file sets, byte-identical files, and identical
deterministic `SHA256SUMS`. This candidate has not been installed or submitted to
mainnet.

This `e2b621…` candidate is preserved as historical evidence and is superseded by the
2026-07-28 rules-first candidate. It is not the current release candidate.

- Raw Wasm SHA-256:
  `e2b621207262360035803d45c3a6e144116219751c5391c517e51b625eb28a02`
- `SHA256SUMS` file SHA-256:
  `1b0c49a189f7ea06f98634a6d14659738671929ce8610d6eb6159203d13f5477`
- Frontend tree SHA-256:
  `1b878e17e09ae3d7cbda1c87e6198469c64d5a073ee6a8dbf3144cd431f20b90`
- `asset-manifest.json` SHA-256:
  `10236d6fd0ed398f1006ef5ca382e9a6f06329ad31ca0ebae00eeac49e23d528`
- `build-configuration.txt` SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`
- SBOM manifest SHA-256:
  `7c37d5db77dca574ba004121a23c89029c97641e2e35722be4112e934c69d374`

The exact canonical frontend export passed the executed Chrome 144.0.7559.96 gate in
the digest-pinned Puppeteer 24.36.0 image. Desktop and narrow-mobile routes produced
four anonymous Governance query requests, query-signature `read_state` traffic, zero
Dendrite requests, zero update endpoints, zero unexpected destinations, no console or
page errors, and no material horizontal overflow. The Verify action was present and
was not activated.

The guarded anonymous `upgrade` dry-run at commit
`1f96a7c6836aa8546f072b7439ea67456443ad57` verified every release checksum and the
candidate binding, read the installed module status, tolerated the expected
controller-only settings rejection, printed the exact intended upgrade command, and
exited successfully with `dry-run complete; no write performed`. It made no lifecycle
write.

## Historical browser-first upgrade candidate — 2026-07-26

Docker Engine 28.0.1 and Buildx 0.21.1 used the reviewed
`dendrite-canonical` `docker-container` builder. Two clean `--no-cache`
`linux/amd64` exports were byte-identical, including their deterministic
`SHA256SUMS`. This candidate has not been installed or otherwise submitted to
mainnet.

This `ff5104…` candidate is preserved as historical evidence and was superseded by the
2026-07-27 trust-state-hardening candidate after source changes. It is not the current
release candidate.

- Raw Wasm SHA-256:
  `ff5104dbd9006228118e1b67eae0242dad026b2e487b2f4ac7a97dc65f55a75b`
- `SHA256SUMS` file SHA-256:
  `6ae0db48fa3f89fbcc67102d0c39f46248161bba6a9634737b41a008afb457f9`
- Frontend tree SHA-256:
  `d3b8e340c08226d8b00d9c0a4d34b5121aa77669f58cededcaaf581b28ac3956`
- `asset-manifest.json` SHA-256:
  `e0a51525ad9f32c01b6464d82fb52a5bcfca5e8a1cf6aff10b0a056bfd2f06f0`
- `build-configuration.txt` SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`

The candidate embeds the browser-first anonymous Governance query path, explicit
consensus-verification action, first-verification unavailable/stale distinction,
bounded target-query diagnostics, severity-first compliance presentation, and
certified asset manifest. Rust-to-JavaScript differential fixtures, interface drift,
all PocketIC scenarios, workspace coverage, frontend coverage, security scans, SBOM
generation, and local clean-build equality passed before the canonical comparison.

## Canonical Docker evidence — 2026-07-25

Docker Engine 28.0.1 and Buildx 0.21.1 used the reviewed
`dendrite-canonical` `docker-container` builder. The Buildx local exporter smoke test
passed. Two clean `--no-cache` local exports completed with identical file sets,
byte-identical files, and identical deterministic manifests. No alternate engine or
prior failed-export artifact contributed to this evidence.

- Raw Wasm SHA-256:
  `1291a51cc26bcdd1ea387f6509aeef3f9c39e19f04f58495576f842873aa371a`
- `SHA256SUMS` file SHA-256:
  `090f2cba0cfa230323506d8051bda7b18866da3a0f4f787264dfb0e56d28ad7b`
- Frontend tree SHA-256:
  `1d61cb33d96e4628570f6ad7d613dc48ac2f0644bb6dfce23d1e16db8f59e2f9`
- `asset-manifest.json` SHA-256:
  `1791938f3a445cbaf3d5c21afe6ff5a1313d309e5e652ca8a4102f60660c82eb`
- `build-configuration.txt` SHA-256:
  `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d`

The earlier
`f8f856c83f1dde99f3cdb1796d0af9e3fd448e929ba3392d2a7cdde472fd9d64`
artifact was superseded before deployment because the final frontend documentation
links were corrected. It was not deployed.

The release manifest excludes itself, uses relative byte-sorted paths, and verifies
from inside the release directory. `icp.yaml` binds the prebuilt recipe directly to the
raw canonical Wasm and configures no implicit production rebuild.

Clean-checkout hermeticity passed with `dist/` absent: `npm ci`, all 112 frontend tests,
and frontend coverage completed before the unchanged canonical release was restored
and reverified. The automated anonymous mainnet dry-run also passed: it verified the
mapping, empty module hash, release checksums, raw Wasm hash, and prebuilt manifest;
tolerated the expected controller-only settings rejection; printed the intended fresh
install command; and performed no write.

## Mainnet module-hash comparison

After installation, compare `sha256sum dist/release/dendrite.wasm` with the module hash
from `icp canister status dendrite -e ic`. The management interface defines
`module_hash` as SHA-256 of the installed module and accepts raw or gzip install input;
the IC decompresses gzip before installation. Dendrite installs the raw file, so the
live hash must equal its raw bytes directly. Do not compare a gzip container hash.

## Frontend asset verification

Record the `asset-manifest.json` hash and a deterministic frontend tree hash; require
every generated hashed asset to exist. Verify the exact alternative-origin bytes,
certified response headers, build configuration, transaction Candid, generated
declaration, command policy, and response policy hashes.

## Runtime configuration verification

Confirm the served bundle embeds the production canister ID, API host, origin,
alternative origins, identity provider, and disabled root-key policy. Hash equality
alone does not prove controller policy, cycles, canonical DNS/origin behavior, popup
behavior, or either transaction operator gate.

## Limitations

Reproducibility depends on the pinned public registries and digest availability.
Module-hash equality proves installed code bytes, not who may later replace them.
Final-origin identity and controlled transaction tests remain the two unrun
[operator gates](operator-gates.md).
