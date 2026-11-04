# Testing and release gates

Use `cargo run --locked -p xtask -- COMMAND`. Unit discovery uses Cargo workspace metadata and all library/binary targets; the runner reconciles discovered and executed libtest counts. Empty individual helper libraries are accounted for but cannot make an overall behavioural gate pass. Explicit ignored integration targets are required, and any successful zero-match behavioural command fails. Validators have no invented test counts. Required absent tools/suites fail.

| Command | Evidence |
|---|---|
| unit | Pure policy, accounting, durable-state and unchanged Dendrite parity/property tests |
| mock | Recording nominal Governance/Ledger and separately scripted malformed/lost replies, through production timers |
| hardening | Adversarial await races, long outages, unsent obligations, typed proposal refusals and cache-maintenance recovery through production timers |
| capacity | Dense 20/80/240-recipient fixtures, sixteen topics, coherent shared observations, latency/retry/upgrade and checkpoint costs |
| protocol | Checksum-pinned real Governance/Ledger, real archives, canister-origin reads, permissions, manager proposal, maturity delay and monetary effects |
| production | Complete actual export set, embedded Candid bytes, natural production timers and upgrades |
| scale | Synthetic large neuron index, actual Wasm timers, stable pages, serialized bytes, instructions, calls and cycles |
| coverage | Native Rust line/region/function coverage; does not attribute Wasm execution to native coverage |
| security | Cargo audit, scoped production dependency isolation, locked CycloneDX inventory/graph |
| canonical_artifact | Exact Docker-built candidate through natural mock timers and real production financial lifecycle |
| reproducible | Two no-cache digest-pinned Docker builds, exact filenames/bytes and source/artifact manifests |
| acceptance | All gates and mandatory behavioural matrix; incomplete requirements fail |

Wasm is compiled before fixtures start. The runner owns a checksum-pinned local PocketIC server with an explicit twelve-hour wall-clock hard lifetime and stops it on exit; this avoids the SDK implicit server's ten-minute hard exit during long suites. It does not alter virtual production time, job timers or freshness bounds. Direct ignored-test invocations without the runner use the SDK default lifetime. `protocol-pins.json` verifies the PocketIC executable and real protocol gzip/raw hashes. Test package imports do not add their dependencies or exports to production Wasm. Mock scripts do not establish NNS permissions. Real tests explicitly install the separately pinned Governance and Ledger; PocketIC's CMC and Registry provide the modulation environment. Real transfers compare exact account IDs, amounts and fees. Real archive creation/readback is exercised. Cached neuron stake is tested separately from a Ledger stake-account top-up.

The production module has no debug drivers. Tests advance virtual time and observe bounded public queries. A CDK self-only timer executor is an explicit infrastructure export. The export validator rejects all unreviewed application exports and checks embedded Candid against the committed interface. `didc 0.6.2` checks public types and dependency subtyping against pinned upstream DIDs; response variants are retained or rejected safely, not silently interpreted.

The large-index fixtures exercise 10,000 synthetic public neurons both without candidates and with one compliant candidate, exact score accumulation and selected-candidate revalidation. They measure those bounded workloads, not worst-case candidate graph/score-map costs or universal mainnet capacity. The hardening capacity suite separately measures dense candidate/score workloads with twice as many compliant contenders, shared-manager conflict exclusions, five-to-fifteen managers per candidate, and actual snapshot checkpoint costs at 20, 80 and 240 selected recipients; its results must pass before claiming those supported workloads. Instructions recorded in health cover the timer call context up to sampling; final checkpoint encoding and replica/callee work are not universal cost guarantees. Cycle deltas, instruction samples, serialized bytes, physical stable pages and actual canister heap/total memory are distinct measurements.

Evidence is written under `dist/evidence`, including per-command suite results, coverage, security, SBOM, actual export checks and scale samples. These ignored local artifacts should be retained alongside the release manifest. The consolidated qualification report records which exact suites actually ran and which mandatory requirements remain open. Remote workflow source is not a CI run or branch-protection proof.

Required tools are Rust 1.94.1 with rustfmt/Clippy/llvm-tools/Wasm target, Python 3, Docker for canonical release, cargo-llvm-cov 0.6.16, cargo-audit 0.22.2 and pinned didc/PocketIC. icp-cli 1.2.0 and local launcher `15.0.0-2026-08-20-03-30` are recorded for future local deployment; PocketIC tests use the independently checksum-pinned 15.0.0 release binary. Tests do not inspect DFX identity storage. If dfx is used for any separately authorised local inspection, use `DFX_IDENTITY=codex_local`.

Repository owners must separately configure and verify required checks: `Behavioral (unit)`, `Behavioral (mock)`, `Behavioral (hardening)`, `Behavioral (protocol)`, `Production artifact`, `Dependency security`, and `Native coverage`. Canonical release promotion additionally requires `Canonical reproducibility` and a retained passing full acceptance run. Ordinary PR CI should be observed after an authorised push. No workflow deploys or uses deployment secrets.

The source acceptance matrix maps implemented coverage. It does not assert that a run occurred. A successful full acceptance command writes the executed matrix into `dist/evidence/acceptance-matrix.json`, with its exact source commit and suite results.

Native coverage is also reported separately for policy, accounting, clients and transitions, excluding the unchanged evaluator from those figures. Integration execution of Wasm-only await/timer branches is reported as integration coverage, without adding fictitious native-covered lines. See [hardening contracts](hardening-design.md) for exact scan economics, observation-age, attempt and migration semantics.

The committed `tests/pocketic/fixtures/rc1-v1-initial-stable.bin.gz` is an actual V1 initial checkpoint from historical RC1 Wasm, not a V1 value encoded using the new envelope. Its provenance/checksums are adjacent. It contains no financial state and complements the native migration matrix for all financial phases. Regenerate locally only from the checksum-matching historical artifact with `cargo run --locked -p quorum-pocketic --example export_v1_snapshot -- PATH_TO_HISTORICAL_WASM`; the generator only initializes a fresh local ObserveOnly canister and never advances timers or installs network canisters. The upgrade regression runs against both prepared production Wasm and the canonical Docker artifact.


The final lifecycle matrix adds financial settlement with permanently rejected/private/missing maintenance, fair progress to another recipient, a later new-roster payout after upgrade and normal daily admission, more than twelve conclusive Ledger refusals versus twelve ambiguous replies, and missed maturity windows with exact retained proposal identities. Native coverage separately reports payout, maturity and migration modules; Wasm-only timer/await branches receive integration evidence, never native coverage credit. Pure tests, scripted faults and real protocol observations remain distinct.

Real refusal injection uses a local PocketIC impersonated debit between the production job's balance validation and cross-subnet Ledger dispatch, producing actual pinned Ledger InsufficientFunds replies. It does not imply an unauthorized production withdrawal capability. The pinned ICP Ledger does not support a transfer-fee change in UpgradeArgs; fee-change recovery is exercised by scripted Ledger fixtures and accounting tests. Actual protocol settlement still verifies exact Ledger blocks.

CI keeps all mandatory suites, including canonical qualification on pull requests. Production/capacity and canonical jobs have 360-minute limits to accommodate the previously observed prepared 240-recipient run; an obsolete run is not automatically cancelled mid-capacity. Canonical qualification depends on all behavioural, security and coverage jobs. Hosted execution remains unrun until separately authorized push/CI access. Prepared capacity and lifecycle measurements are copied before canonical repeats overwrite fixture output names.

The V2 financial checkpoint is generated by actual checksum-verified RC2 Wasm using natural timers in an isolated local recording fixture. It retains a confirmed payment with unavailable maintenance and an exact Executed proposal with no observed transient progress. Adjacent provenance binds module, original stable bytes, compressed bytes and exact Ledger block fixture. Production upgrades must preserve both without duplicate dispatch. This supplements genuine frozen V1/V2 native wire fixtures; it is not a claim that a scripted Governance fixture establishes real NNS semantics.

Lost real proposal-reply injection captures the actual production stable Intent image immediately before its await, lets pinned Governance create the proposal, and restores that exact crash image across upgrade while retaining Governance state. This discards the callback without fabricating a proposal or editing the journal. It is scripted fault injection against real artifacts, not a claim that PocketIC's ordinary upgrade helper lost the reply: that helper can drain callbacks before upgrading. Subsequent recovery and all dispatches use natural production timers and exact real proposal history.

The cycle-reserve scenario starts with an explicit local cycle balance, with platform freezing disabled to isolate the application's reserve gate. After ordinary setup, actual local compute-allocation charges consume the margin before manager approval. Allocation then returns to zero. The Live canister remains below reserve for the complete progress window, including an upgrade. Adding test cycles permits exact outcome recovery and a later distinct harvesting proposal. This adds no production drain/debug endpoint or synthetic cycle-balance mutation.

The focused typed-barrier regressions distinguish native response validation, actual adapter calls through recording fixtures, production state-machine fault injection, and pinned real Governance/Ledger execution. The real error-14 fixture seeds the target's actual staking balance below the minimum, verifies the typed Governance response, and retains strict ordinary refresh failure. It then misses a complete executed maturity window, upgrades, and recovers through production timers without assigning a receipt. The recording fixture separately exercises wrong IDs, other codes, absent/unexpected/malformed replies and rejected calls; none authorizes another proposal. Canonical repeats include both fixture tests and the real error-14 lifecycle. The same state-machine test must fail against the historical RC3 production artifact before the correction; that expected negative-control failure is evidence, not a passing qualification gate.

## Integrated application testing

The root `xtask` remains the orchestrator. `integration_inventory` discovers both independent Cargo workspaces and frontend test targets and verifies evaluator source/fixture equality. Discovery is not execution. `component_dendrite` invokes Dendrite's original runner and frontend coverage; missing tools, failed gates and zero behavioural matches fail. `component_dendrite_canonical` invokes the original two-clean-Docker-build procedure and retains both compared output sets. The original anonymous browser assertions now run in an explicitly local mode against the shared pinned fixture, including all five viewports, keyboard/filter/copy checks, signature-verifying queries and certified controller reads. Its legacy public-network mode is not run in the local-only lane.

`system_protocol` installs Dendrite and production-feature D-QUORUM in one existing real Governance/Ledger PocketIC fixture. Independent Governance following, replicated verifier reports and exact Ledger records are the oracles. A second case adds Dendrite to the existing missed-window/upgrade/reward-accrual lifecycle, then executes another actual maturity operation and pays a changed roster. Seeded initial maturity and later genuinely accrued voting rewards are identified separately. These backend journeys are not browser-to-economic golden-journey proof.

`system_browser` first probes actual II HTTP/certificate delivery with the pinned Chromium/WebAuthn stack, then requires the compiled local application to obtain real II sessions and send signed management operations to the same real Governance fixture. Its local frontend is built in an isolated tracked-source copy before network creation; production assets are untouched. Only public principals, request paths and bounded control labels are retained. No session, delegation, passkey credential material or private key is exported. Browser time advances with host-aligned real-time progress during the bounded interactive phase. After real browser majority and maturity approval, the same coordinator closes the browser and switches that same instance to long deterministic advancement for actual maturity minting and two payout cycles. No certificate or delegation validity window is enlarged.

`integrated_acceptance` continues independent lanes after a failure and exits nonzero unless the entire documented integration matrix is implemented and passes. The existing `acceptance` retains its original D-QUORUM scope and source-stability checks; it cannot certify the full integrated product. Root workflows are read-only, retain all existing capacity and canonical repeats, and make canonical qualification depend on the added component, shared-protocol and signed-browser jobs. Hosted runs and branch-protection enforcement are operator steps.

The `Complete integrated requirement selection` CI validator prevents component success from hiding unfinished cross-application requirements; it is not a behavioural test. Canonical publication evidence remains blocked while any mandatory integrated matrix entry is incomplete. The repository owner must require the existing behavioural, production/capacity, security, coverage, canonical, Dendrite component, shared-protocol, signed-browser and integrated-readiness checks after observing actual hosted runs. No branch protection setting has been changed.

II uses the production backend/frontend artifacts from `release-2026-06-20`, exactly matching PocketIC's pinned source references, with separately verified compressed and uncompressed digests. `id.ai.localhost` maps to the **frontend** canister `uqzsh-gqaaa-aaaaq-qaada-cai`; the backend is `rdmx6-jaaaa-aaaaa-aaadq-cai`. The default built-in configuration enables dummy authentication. The real lane explicitly clears it in both modules before any browser identity exists and queries the backend configuration to prove it is disabled. Captcha remains disabled in this isolated fixture, while actual WebAuthn credential proof remains required. The test never accepts dummy index prompts.

`system_protocol_canonical` repeats the two connected backend journeys against the exact canonical pair after both component builds. `dist/integration-manifest.json` binds that pair without replacing either component's individual manifests. Dendrite's original Wasm format exposes `get_candid_pointer` rather than a public Candid custom section. The canonical gate extracts its interface from the actual Wasm with pinned `candid-extractor 0.1.6`, checks structural equality using `didc`, and independently checks the complete production export set. It does not claim a missing custom section exists.

The positive browser test uses four independent real II principals. Neuron 11's signed
proposal supplies its automatic Yes; explicit browser votes from 12 and 13 reach the
original five-manager majority without a coordinator-supplied deciding vote. Neuron
21 initially lacks authority and later acquires it through the actual management
change. The final voter is a hotkey, separately tested against controller revocation.
An exact proposal/ballot/following readback and authoritative Ledger blocks are the
oracles. Scripted lost HTTP replies, held preflight requests and a deliberately
incompatible verifier are labelled faults; they do not substitute for authentication.
The same world selects each recipient on topics 4 and 7, yet requires exactly two
financial obligations per pot. Both Governance rosters and hand-calculated scores are
checked independently, followed by a changed roster and a second payout.

`real_ii_scoped_child_is_enforced_by_replica` uses actual II and an SDK-signed child,
then compares a working non-Governance control destination with the same request under
the scoped signer. An unsuccessful replica HTTP response and delegation-target diagnostics establish replica scope
enforcement. Expired parent/child, wrong key, cyclic chain and excluding ancestor
probes retain only public outcomes. The raw bootstrap also fails the production actor
boundary. The genuine II popup cancellation uses the SDK's actual timeout.

The anonymous lane upgrades a healthy local verifier with a test-only response-body
mutation after certification. The direct canister returns 200 while the real gateway
rejects it with a verification error; restoring the original module restores 200.
This negative control and the isolated historical auth/metadata helper failures are
counted separately from passing behavioural executions. Probes never enter canonical
production assets.

The integrated verdict requires exact named executions, hashed log files, all mandatory
component gates, a clean unchanged commit/tree and the positive browser case. Seven
small runner regressions cover all-pass, failure, absent logs, changed source, missing
positive browser, matrix-only edits and an acyclic CI dependency graph. Hosted readiness
aggregates all existing lane receipts after canonical jobs; workflow source is not a
hosted run. The owner must require every root job, including Signed browser II required,
Shared application real protocol, Dendrite preserved qualification, Canonical
reproducibility and Complete integrated requirement selection.
