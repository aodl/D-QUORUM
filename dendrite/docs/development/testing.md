# Testing

Build commands use the production values from [deployment](../operations/deployment.md). Local
replica commands additionally use `DFX_IDENTITY=codex_local`, a local API/provider,
and root-key fetching `true`; production commands require root-key fetching `false`.

| Layer | Command | Network | Writes state? | Automated or manual | Purpose | Expected evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Frontend unit | `npm test` | None | Files in temp only | Automated | Preliminary query/validation/evaluator/state/UI, identity, transaction rules | Passing tests |
| Frontend coverage | `npm run test:coverage` | None | Coverage output | Automated | 85% thresholds | Coverage summary |
| Rust unit/workspace | `cargo test --workspace --locked` | None | Build files | Automated | Rules and collector | Passing tests |
| Complete suite/PocketIC | `cargo xtask test` | Local PocketIC | Local only | Automated | Live graphs, rejection, certified HTTP/upgrade | Passing scenarios |
| Rust coverage | `cargo xtask coverage` | None | Coverage output | Automated | Workspace >85%, engine >95% | Coverage summary |
| Interface drift | `tools/scripts/check-interface-drift.sh` | Pinned GitHub source | No IC state | Automated | Canister read subset, separate anonymous browser query declaration, transaction Candid semantics, generated IDL equality | Pinned revision pass |
| Certified HTTP/alternatives | `cargo xtask test` | PocketIC | Local only | Automated | Headers and exact well-known bytes | Assertions pass |
| Chromium qualification | `tools/scripts/browser-smoke.sh dist/release/frontend` | Anonymous public Governance query | Read-only | Automated | Digest-pinned Chrome desktop/mobile route, status filters, disclosures, copying, and network capture | Executed PASS with bounded JSON/screenshots |
| Production asset identity | `npm test` | None | Temp only | Automated | Checked-in assets unchanged by tests | Tree hash equality |
| Dependency reachability | `tools/scripts/check-production-dependencies.sh` | Registry metadata | No IC state | Automated | Exclude PocketIC packages from Wasm | Tree report |
| Security scan | `cargo xtask security-scan` | Public registries/GitHub | No IC state | Automated | Advisories, policy, drift, secrets | No unapproved finding |
| SBOM | `cargo xtask sbom` | None | `dist/sbom` | Automated | CycloneDX evidence | SBOM hashes |
| Configured local build | `cargo xtask build` | None | Build output | Automated | Current toolchain build | Wasm |
| Local packaged build | `cargo xtask build-reproducible` | Public registries | Build output | Automated | Same-toolchain package | Local hashes |
| Local two-build | `cargo xtask verify-reproducible` | Public registries | Build output | Automated | Same-toolchain determinism | Byte equality |
| Canonical Docker | `tools/scripts/docker-build-release.sh` | Public registries | `dist/release` | Automated | Public release artifact | `SHA256SUMS` |
| Canonical two-build | `tools/scripts/verify-docker-reproducible.sh` | Public registries | Temp only | Automated | Two no-cache builds | Tree equality |
| Deployment dry-run | `tools/scripts/mainnet-deploy.sh dry-run` | Read-only mainnet | No | Automated/operator review | Validate exact lifecycle command | “no write performed” |
| Local II popup | Gate 1 with labelled local origin | Local | Browser session only | Manual | Popup mechanics | Signed local evidence |
| Final-origin II | Gate 1 | Mainnet HTTP/II | Browser session only | Manual | Production principal/origin | Signed gate |
| Controlled transaction | Gate 2 | Controlled NNS context | Yes, explicitly controlled | Manual | Full browser-to-NNS flow | Signed gate |

The Chromium gate uses `puppeteer-core` only as a development dependency and runs
Chrome 144.0.7559.96 from the digest-pinned
`ghcr.io/puppeteer/puppeteer:24.36.0` image. It serves the exact production export
and executes five independent scenarios: 1440×1000 desktop; 1440×1000 with Chrome
DevTools Protocol `Emulation.setPageScaleFactor` set to 2 and the resulting visual
viewport scale asserted as actual 200% page scale; a separately labelled 720×500
CSS-pixel `200%-equivalent reflow viewport` at page scale 1; 390×844 mobile; and a
320×844 narrow CSS reflow.
It captures bounded JSON evidence and
screenshots under `dist/browser-qualification`, fails on page/console errors or
material page overflow, and keyboard-focuses report copy and disclosure controls.
It records emulated screen and CSS viewport dimensions, device pixel ratio,
visual-viewport dimensions and scale, overflow, visible text/control counts, and
keyboard evidence. It also proves one primary row per distinct rule ID, the 15-topic
default-rule summary, all 15 instances after keyboard expansion, Enter and Space
operation, whole-row pointer behavior and its interactive-child safeguards, hidden empty
group headings under filtering, and certified controller status handling. It exercises
All, Pass, and Fail filters; header characteristics and copy-only Raw Report control;
Standard Rules, Team Members, and Topic Delegation near the top; navbar authentication at every layout;
and repeats overflow checks after interaction. Bounded desktop screenshots cover direct
compliant and non-compliant verdicts, collapsed and expanded rule states, every filter,
semantic group-count colours, Standard Rules, Team Members, Topic Delegation, header characteristics,
Raw Report copy control, navbar, and account workspace.
The harness additionally serves a deterministic test-only report from a temporary
qualification root. That page is excluded from production assets and exercises failed
controller-module and retained-controller-list diagnostics, direct compliant and
non-compliant verdicts, exact Dashboard links, requirement/outcome separation, group
totals, collapsed defaults, child-state clearing, filter behaviour, and zero
disclosure/filter/copy network requests.
Each scenario independently requires at least one fixed-Governance v3 `query`, expected
query-signature `read_state`, no update endpoint, no unexpected canister, zero
production Dendrite requests, and zero interaction-triggered requests. Captured
transport headers contain no Authorization or cookies, but ingress anonymity is proved
by the separate production actor identity-construction unit test, not inferred from
those headers alone. The procedure never invokes Internet
Identity or sends an NNS mutation.

The Rust unit suite deterministically regenerates
`canisters/dendrite/web/test/fixtures/evaluator.json`. Its 38 cases record Rust overall
status, quorum and every direct rule status with stable names and timestamps. The
fully compliant fixture has exactly 37 evaluations and 23 distinct rules. Frontend tests
apply the same named mutations to BigInt-safe browser evidence and require exact
policy-field equality. The cases cover compliant, missing/unavailable/contradictory
evidence, target posture, manager cardinality and availability, exact alpha/default/committed
following, quorum, controller evidence, source failures, and standard-update semantics.

Frontend state and presentation tests separately prove that every rule occurs once in
canonical order; all policy statuses have icon and text; unknown IDs fall back safely;
rule diagnostics, factual reasons, requirement separation, values, topics, local neuron
and controller links, Raw report copy, single-select status filters, group disclosures
and semantic status summaries, final section order, navbar and account workspace,
empty/unavailable states, and accessible expansion
attributes behave without mutating the report. They also prove that route entry calls
Governance and the query-reported controller without calling Dendrite, controller
certificate failures remain indeterminate, valid certified state drives controller
pass/fail results, route races remain suppressed, and ordinary browsing never calls
Dendrite. Existing transaction tests continue
to prove that final preflight independently invokes `check_neuron` and a failed
preflight sends no Governance mutation.

The 2026-07-30 final-hierarchy candidate ran 155 frontend tests and 57 Rust unit tests
plus 3 PocketIC scenarios. Workspace Rust line coverage was 89.58% and rule-engine
line coverage was 98.23%; frontend coverage was 95.50% lines, 86.69% branches, and
92.89% functions. All 38 Rust/browser policy fixtures matched exactly. Chrome
144.0.7559.96 passed all five layouts with 20 anonymous Governance query requests,
the required signature/controller `read_state` traffic, and zero Dendrite, `/call`, or
interaction-triggered requests. The executed Chromium evidence is bounded non-release
output under `dist/browser-qualification`.

### Troubleshooting

- Missing ID/origin or malformed alternative JSON: export every exact build input.
- Wrong Node/npm: select Node 24.15.0 and npm 11.12.1.
- Missing fixture Wasm: run `cargo xtask test`, which builds fixtures first.
- Docker/buildx unavailable: restore daemon access/buildx; do not substitute a local
  artifact as canonical.
- `icp-cli` identity mismatch: stop and select the reviewed production identity; never
  export identity material.
- Registry failure: retry only the build after registry recovery.
- Stale generated assets: rerun the configured frontend build and byte-identity tests.
- Dirty worktree: commit/review intended changes; the deploy guard intentionally fails.
- Release hash mismatch: rebuild canonically, regenerate `SHA256SUMS`, then update
  `icp.yaml`.
