> Historical RC3 record for source `55152c59bb2524f4304d2cd3c5c5d8d0c4cc0e04`. Its tests and hashes do not qualify later sources. The later typed lock-barrier correction is recorded in [the current qualification](../qualification.md).

# RC3 financial lifecycle qualification

**All mandatory local gates passed for the undeployed candidate.** The complete source-stable acceptance command exited normally with status 0; [the captured launcher receipt](../../dist/history/rc3-qualified/evidence/launcher-exit.json) records that result. Hosted CI is unrun. No push or mainnet operation occurred.

## A. Commits and source

The actual starting checkout was report commit `e01ea392c088994598e514eb77fd206d50f6115e`, descending from accepted RC2 implementation `e14c9cb2fcc511472dfe273f9cee355c5d9f4a83`. Subsequent work was preserved without reset. Historical [RC1](rc1-qualification.md) and [RC2](rc2-qualification.md) reports, hashes, execution records and canonical outputs remain historical.

- `da8057828502a18c99dd40bc68eae82e8e5c8d88`: financial settlement/maintenance separation, terminal maturity proof, recoverable refusal episodes, V3 migration and adversarial tests.
- `982e09103521bcd79462c10874cf616782e055d0`: qualification infrastructure, interface compatibility, documentation and historical provenance.
- `55152c59bb2524f4304d2cd3c5c5d8d0c4cc0e04`: isolate managed PocketIC teardown from the launcher process group. This is the qualified source for the final complete acceptance run and canonical builds below.
- The final handover is a documentation-only descendant, identified by the final response and review bundle. Only documentation changes after source-stable qualification; runtime, interface, tests, dependencies and build configuration stay identical.

Both final source-stability guards passed, including all 80 source-file SHA-256 checks. The acceptance source-tree digest is `c9f014da20cabf1916f672bbe6eeeb61dcdc81f5c55440c92677f63b384862c3`. Every behavioural and validator record below belongs to the same clean qualified source. The handover changes only README and this report; the archived qualified tree remains exact for manifest verification.

## B. Three defect corrections

**A — Confirmed payment and refresh maintenance.** [payout.rs](../../canisters/d_quorum/src/payout.rs), [state.rs](../../canisters/d_quorum/src/state.rs) and [accounting](../../crates/accounting/src/lib.rs) retire an active plan only after every exact Ledger transfer is authoritatively confirmed. Financial settlement releases its settled reservations independently of cache maintenance. A persisted full-day admission deadline prevents fresh rosters, deposits, upgrades or maintenance from accelerating another distribution. Existing completed plans retain refresh work; the fifth existing scheduler slot chooses earliest-due work, so an unavailable recipient cannot monopolize retries. The retry reservation is durable before await, callbacks require the original plan/neuron/account binding and worker ownership, and eight hour-to-day backoff attempts end in explicit `Abandoned`, never financial failure or success. The existing 32-plan settled-history bound remains; evicted unfinished maintenance is counted separately. Unresolved financial liabilities are never pruned.

The native retention/fairness tests, three `settled_payments_and_later_rosters_progress_despite_*` hardening tests, lost-eighth-callback upgrade test and real `financially_settled_real_payments_allow_later_roster_despite_unrefreshable_stake` exercise exact original entitlements, memo/time identities, confirmation blocks, normal cadence and later C/D payments without duplicate A/B transfers. Missing/private and persistent-refusal cases remain distinct. The real case finishes with four exact payments, no unpaid liability and one still-pending refresh.

**B — Missed maturity-finalization windows.** [proposal.rs](../../canisters/d_quorum/src/proposal.rs) separates retained exact execution proof, operation termination and receipt attribution. The [pinned executable-source audit](../hardening-design.md#final-financial-lifecycle-contracts-v3) establishes that finalization removes its progress record before awaiting the mint under the neuron lock. Empty progress alone is therefore unsafe. A supported refresh acquires that same lock; exact refresh success or the audited post-lock InsufficientFunds response supplies a barrier. Fresh empty progress before and after that barrier, unchanged protected configuration and the 300-second observation bound establish terminal execution when the exact command was already verified Executed. The state records execution and terminal-observation times separately; missing legacy times remain absent.

Real tests miss the entire progress window from Open and Executed, across upgrade and reserve interruption, and after a scripted lost creation callback against real Governance. Each retains proposal 1, does not resubmit it, and permits later distinct proposal 5 after actual new maturity and fresh normal preflight. Unrelated deposits and another neuron's mint do not become receipt evidence. Scripted tests separately retain Adopted, failed-barrier, unavailable/pruned-history and genuinely ambiguous outcomes. New recovery does not assign a plausible Ledger mint to an operation whose identity is absent from the mint record.

**C — Repeated definite transfer refusals.** The existing obligation/attempt state machine now applies a durable one-day `Cooldown` after each twelve conclusive first-dispatch refusals. After cooldown, fresh fees, funding and dispatch authorization precede the next monotonically numbered safe attempt. Immutable net entitlements, recipient/account, plan ID and obligation identity remain unchanged. Possibly executed Unknown, Verifying and Held attempts cannot gain a new identity from time, cooldown or retry exhaustion. Exact history remains authoritative.

Native tests cross two episodes and 27 refusals; hardening tests cross fourteen refusals with upgrade, fee change and extra funding; the real Ledger regression receives fourteen actual typed InsufficientFunds replies and settles on attempt 15, followed by the next recipient. Twelve ambiguous replies retain one exact identity and all liabilities across days and upgrade. The pinned real Ledger cannot change its transfer fee through UpgradeArgs, so fee changes are tested with recording fixtures and accounting, not falsely claimed as real Ledger upgrades.

Following the scope clarification, the existing vector retains twelve recent exact conclusively rejected attempt records; older proven no-execution audit details are pruned. Current/ambiguous identities and confirmed evidence remain exact, and attempt numbering never resets. No hash commitment, event log or additional archive subsystem was introduced.

## C. Safety invariants

Each distinct selected neuron retains one equal fixed net entitlement at its originally verified Governance staking subaccount, deduplicated across topics. Exact sender, destination, fee, amount, memo, timestamp and authoritative block verification are required for settlement. Confirmed cost plus outstanding reservations plus fixed dust cannot exceed original funding plus explicitly reserved additional fees. Later deposits and fee changes do not redistribute residual funds or alter entitlements. Insufficient fee funding remains observable.

Unknown execution is protected indefinitely when reconciliation is unavailable. No absent history query proves non-execution. No refresh failure resends a confirmed payment. No proposal status creates spendable ICP; payouts use authoritative Ledger funds. Uncertain proposal creation is never blindly retried. Maturity proposals remain explicit 100% DisburseMaturity of D-QUORUM `4713806069430754115` to the automation canister's default account, with exact proposer/target/marker/fingerprint binding and manager approval.

Governance-only count authority, protected transaction checks, fixed Governance/Ledger principals, direct eligible public VP, proportional attribution over every distinct effective followee, exact arithmetic, greedy accepted-manager disjointness, numeric ties, five default seats and 1–15 range remain unchanged. No favoured seat, roster override, recipient substitution, manager redirection or reward weighting was introduced. Dendrite remains the same pinned evaluator and Standard. `not_for_profit=false` is not a universal prohibition on dissolution, splitting or maturity commands.

## D. State and interface

Stable schema is **V3**. [legacy_v2.rs](../../canisters/d_quorum/src/legacy_v2.rs) freezes actual RC2 financial/proposal wire shapes; the unchanged V1 one-variant and V2 two-variant envelopes are checked losslessly before explicit conversion. New fields are the payout admission deadline, maintenance eviction counter, fifth existing job slot and optional execution/terminal observations. The three existing status enums gain cooldown, refresh retry/abandonment and terminal-execution variants.

Native migration cases retain V1 Prepared/Held/Confirmed and V2 Prepared/Unknown/Verifying/Confirmed/Rejected/exhausted proven-refusal Held states, completed plans with unfinished refresh, pending/executed maturity with missing observations and observed progress/legacy receipt references. A Held reason string is never proof: V1 uncertain Held remains ambiguous; only a V2 persisted no-execution flag permits cooldown recovery. Exact prior fees, identities, blocks, entitlements, proposal markers and fingerprints survive. Mode preservation does not activate ObserveOnly state; the existing changed-policy pin safeguard remains.

The actual RC2 Wasm checkpoint has compressed SHA-256 `46c3c481af42e89946a8315f0f19f3058d22052c22ff897de5c603de9bdd5b57` and stable-image SHA-256 `8044e8b0d43d095d7497365b3f517d26e9983add72c99e3f55cc8dd6f514c88f`. Its [provenance](../../tests/pocketic/fixtures/rc2-v2-financial-maturity-stable.json) binds original module and Ledger blocks. Both prepared and canonical candidate tests restore it and upgrade twice without duplicate payment/proposal. The actual V1 snapshot remains tested too; these complement genuine frozen-wire native fixtures rather than encoding current types under old labels.

All eleven public method/request/mode signatures remain unchanged. Five existing response types extend: Health, ProposalJob, ProposalPhase, RefreshState and TransferStatus. Existing clients need regenerated response decoders; the [compatibility evidence](../../dist/history/rc3-qualified/evidence/interface-compatibility.json) explicitly records the response-variant boundary. No mutation endpoint was added.

Remaining unprovable cases are explicit: creation ambiguity without an exact history match, or an Open/Adopted operation whose execution cannot be established after history disappears, remain unresolved. Previously retained exact Executed proof survives later pruning. Exact historical mint attribution may remain impossible because the protocol carries no proposal fingerprint in the mint; termination does not manufacture receipt certainty.

## E. Qualification evidence

The qualifying run contains **122 unique tests, 203 passing test executions, 101 passing gate records and 73 executed behavioural requirements**. All required cases were selected; no mandatory suite was skipped. Validators have no invented test counts. Repeated coverage, production and canonical executions add evidence, not new unique cases.

| Suite | Passing executions |
|---|---:|
| Native unit/property/evaluator parity | 68 |
| Recording-fixture integrations | 13 |
| Adversarial hardening | 24 |
| Real pinned Governance/Ledger/archive | 12 |
| Production natural-timer repeat | 1 |
| Large-index scale | 2 |
| Dense 20/80/240 capacity | 3 |
| Instrumented native coverage repeat | 68 |
| Canonical artifact repeats | 12 |

The earlier source `982e091` completed all 101 gate records and final guards (203 passing executions), but its enclosing exec session reported status 143 after qualification. The cause was not established by the short shutdown checks; a supplemental isolated production-gate check exited 0 (one additional test execution). The managed server was then isolated from the launcher process group, and the entire matrix was repeated from source `55152c5` with the actual child exit captured as 0. [Original outer-status receipt](../../dist/history/rc3-gates-passed-launcher143/evidence/outer-launcher-status.json), [supplemental exit receipt](../../dist/history/rc3-gates-passed-launcher143/evidence/shutdown-production-exit.json) and all original logs/artifacts are retained. Across those two complete runs plus that diagnostic there were 407 passing behavioural executions of the same 122 unique cases. Earlier development preflights are retained separately and excluded from qualification counts.

The runtime protocol pin remains `83f29e0803496ba6aaea3d6b43f6c6bebea12dd9`; the unchanged Dendrite evaluator pin is `b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291`, and D-QUORUM policy remains `selection-2-eligible-ballots/reward-roster-equal-1`. [Protocol pins](../../protocol-pins.json) bind actual Governance/Ledger/archive artifacts and checksums, PocketIC 15.0.0 and didc 0.6.2. Rust is 1.94.1.


Pure/native, recording-fixture faults, natural production timers and real pinned-protocol tests are separate evidence classes. Restoring the exact Intent checkpoint discards a creation callback against real Governance; it is not a claim that ordinary PocketIC upgrade loses replies. Real refusal injection is a local test-only impersonated debit at the production await boundary. The reserve test uses actual local allocation charges, disables platform freezing to isolate the application reserve, and adds only test cycles. No debug driver substitutes for production timers.

### Capacity and resources

| Recipients / seats | Artifact | Contenders / scores | Selected / total virtual s | Validation to intent / readback s | Destination age / admission after applied s | Measured host s |
|---|---|---|---|---|---|---:|
| 20 / 5 | [prepared](../../dist/history/rc3-qualified/evidence/prepared-capacity-20.json) | 40 / 640 | 454 / 1074 | 59 / 69 | 10 / 20 | 62.10 |
| 80 / 5 | [prepared](../../dist/history/rc3-qualified/evidence/prepared-capacity-80.json) | 160 / 2560 | 1374 / 3814 | 189 / 199 | 30 / 40 | 318.81 |
| 240 / 15 | [prepared](../../dist/history/rc3-qualified/evidence/prepared-capacity-240.json) | 480 / 7680 | 5595 / 12865 | 819 / 829 | 60 / 70 | 2473.16 |
| 240 / 15 | [canonical](../../dist/history/rc3-qualified/evidence/capacity-240.json) | 480 / 7680 | 5595 / 12865 | 819 / 829 | 60 / 70 | 3420.18 |

| Recipients / artifact | Logical snapshot / Wasm heap bytes | Stable pages | Maximum checkpoint instructions | Cycles used | Governance replies / neuron reads | Ledger balance / fee / history / transfers | Pending financial / maintenance |
|---|---|---:|---:|---:|---|---|---|
| 20 / prepared | 178,541 / 3,932,160 | 129 | 48,397,563 | 97,334,602,872 | 194 / 148 | 47 / 21 / 21 / 20 | 0 / 0 |
| 80 / prepared | 655,722 / 11,534,336 | 129 | 124,417,534 | 728,202,807,384 | 702 / 563 | 169 / 81 / 81 / 80 | 0 / 0 |
| 240 / prepared | 1,962,913 / 34,275,328 | 129 | 327,128,002 | 6,236,680,668,164 | 2173 / 1789 | 494 / 241 / 241 / 240 | 0 / 0 |
| 240 / canonical | 1,962,913 / 34,275,328 | 129 | 327,128,002 | 6,236,680,323,221 | 2173 / 1789 | 494 / 241 / 241 / 240 | 0 / 0 |

Physical stable allocation is 129 pages (8,454,144 bytes) in each row, distinct from logical serialization and Wasm heap. Fixture host intervals exclude some command setup/cleanup; complete libtest wall times remain in gate logs. The largest original fixture completed on both prepared and canonical artifacts with unchanged 1,800-second admission/validation and 300-second metadata limits.

Compared with historical RC2, logical snapshots grow by 628 bytes per measured fixture. Virtual completion increases by 21 seconds (20 recipients), 30 seconds (80) and 20 seconds (240). The largest checkpoint maximum grows from 322,712,726 to 327,128,002 instructions. Durable maintenance reservations require extra checkpoints: measured automation cycle use increases by approximately 15.9% at 20 recipients, 7.4% at 80 and 3.2% at 240. These costs remain within the exercised workload budgets; no storage-engine replacement or freshness-window expansion was needed. Host-time changes are provisioning observations and are not claimed as implementation speedups.

The two 10,000-source fixtures also passed with zero and one compliant candidate: maximum sampled step instructions were 62,176,164 and 62,487,290 respectively. These index cases complement the dense capacity results and do not establish worst-case candidate-graph capacity.


All dense rows use original fixtures with twice as many compliant contenders, 16-topic dense scores, five-to-fifteen managers, shared/unshared dependencies, latency, transient retry, discovery upgrade, real production constants and natural timers. Every obligation pays once and refreshes; denied setters leave populated stable bytes and checkpoint counters unchanged. Ages are actual observation ages, not restamped completion times. These are bounded fixture/provisioning observations, not universal mainnet throughput guarantees. Checkpoint instructions cover serialization/stable writing; they differ from timer call-context samples, replica/callee costs and physical allocated pages. Governance completions and Ledger counters have the precise scopes recorded in their JSON; management-canister calls are not instrumented. Cycle deltas cover all jobs. The reserve-fault scenario additionally includes its deliberate allocation drain.

[Native coverage scopes](../../dist/history/rc3-qualified/evidence/coverage-scopes.json) and [full counters](../../dist/history/rc3-qualified/evidence/coverage.json):

| Native file scope | Lines | Regions | Functions |
|---|---|---|---|
| accounting | 533/552 (96.56%) | 990/1021 (96.96%) | 48/54 (88.89%) |
| stable_migration | 1081/1135 (95.24%) | 1335/1422 (93.88%) | 68/94 (72.34%) |
| payout_lifecycle | 0/493 (0.00%) | 0/719 (0.00%) | 0/67 (0.00%) |
| maturity_lifecycle | 35/496 (7.06%) | 29/695 (4.17%) | 2/39 (5.13%) |
| policy | 191/217 (88.02%) | 337/371 (90.84%) | 21/27 (77.78%) |
| clients | 426/1109 (38.41%) | 596/1575 (37.84%) | 37/207 (17.87%) |
| transitions | 1139/3199 (35.60%) | 1379/4346 (31.73%) | 71/373 (19.03%) |
| unchanged_evaluator | 1879/1902 (98.79%) | 2498/2529 (98.77%) | 134/152 (88.16%) |

These are module-file scopes from the existing LLVM workflow and include in-file native test bodies. No aggregate threshold or exhaustive production-branch claim is imposed. Payout timer/await/dispatch paths have zero native credit; maturity native coverage is limited to pure helpers. Their financial, authorization, outage and callback transitions are exercised through production Wasm integration tests. Those Wasm executions do not increase native counters. Defensive overflow/corruption exits are not exhaustively forced. The unchanged evaluator is reported separately.


The [whole-workspace RustSec scan](../../dist/history/rc3-qualified/evidence/security.json) passed: 291 locked dependencies, zero vulnerabilities, four unmaintained notices, no ignored advisories; database `2295466c4e9df26647fd67d8fa1c705ac2fc7f81` (updated 2026-10-30T12:12:39+01:00). `backoff` 0.4.0 (RUSTSEC-2025-0012), `instant` 0.1.13 (RUSTSEC-2024-0384) and `serde_cbor` 0.11.2 (RUSTSEC-2021-0127) are native PocketIC-tooling dependencies absent from production. `paste` 1.0.15 (RUSTSEC-2024-0436) remains a production build-time proc macro. These informational notices are disclosed; no dependency migration was introduced to remove non-vulnerability notices. The [production graph](../../dist/history/rc3-qualified/evidence/production-tree.txt) passed isolation and unchanged evaluator checksum checks. The [CycloneDX 1.6 SBOM](../../dist/history/rc3-qualified/evidence/sbom.cdx.json) has 291 locked components; SHA-256 `c5e18037671fcd6b56701d79f1ceccf750e2a5fa2512a45ae712495883dc94ce`. This does not replace independent security review.


Two forced-clean Docker builds with `--no-cache`, digest-pinned Rust 1.94.1 image `rust:1.94.1-slim-bookworm@sha256:cf9dd0ec73e75f827fe59123fff9dc65af1a1c8363c3c31ee8d7f8ad0b6a5fb2`, `linux/amd64` and `SOURCE_DATE_EPOCH=0` produced identical two-file sets and bytes. Actual outputs remain under `dist/canonical-1/` and `dist/canonical-2/`. Their exact Docker-built Wasm is used by canonical qualification.

| Canonical file | Bytes | SHA-256 |
|---|---:|---|
| [d_quorum.wasm](../../dist/history/rc3-qualified/release/d_quorum.wasm) | 2305823 | `27f8ad3ce2beceb0cb0def098e96ce982686e6822481ecf126b3b6b5bc3fafbb` |
| [d_quorum.did](../../dist/history/rc3-qualified/release/d_quorum.did) | 6314 | `ce15b307ce8b19b09df0d9abb723828099c87b52fdc2aa012d67c9f327940ad0` |
| [manifest.json](../../dist/history/rc3-qualified/release/manifest.json) | 8956 | `f8f7bd919951108d4bee1be23d6b950c12fb9342f69aaa98ba4c49d10d88e4da` |

The manifest binds every tracked source/configuration input to the qualified source and artifacts. [Release checksums](../../dist/history/rc3-qualified/release/SHA256SUMS), [execution record](../../dist/history/rc3-qualified/evidence/acceptance-run.json), [full log](../../dist/history/rc3-qualified/evidence/full-acceptance.log) and [executed requirement matrix](../../dist/history/rc3-qualified/evidence/acceptance-matrix.json) provide separate provenance. Evidence checksums remain under `dist/evidence/SHA256SUMS`.


The review bundle contains the canonical production Wasm, generated Candid, manifests/checksums, exact qualified source, full execution record and logs, executed matrix, coverage, audit, SBOM, prepared/canonical capacity and lifecycle evidence, clean-build proof and historical releases. The archive path is `dist/review-rc3/d-quorum-rc3-review.tar.gz`, with adjacent `.sha256` receipt and `review-bundle-validation.json`; the final response supplies its exact outer SHA-256. The archive's own checksum necessarily remains external; the underlying evidence referenced here is included and verified. Its root source tree is the exact qualified commit, including the source-time pending report needed for manifest verification; the completed report is under `handover/qualification.md`, identified by `REVIEW.txt`. No generated release binary is added to production dependencies or committed against the repository's artifact policy.

Hosted CI is **unrun**; no push was authorized. Workflow changes retain the existing xtask entry points, all required cases and read-only credentials, give production/capacity and canonical jobs 360-minute limits, disable automatic cancellation of essential runs, run canonical qualification for PRs, retain artifacts on failure and require behavioural/security/coverage jobs first. No deployment secrets or automatic deployment exist.

## F. Scope audit

The only new production module is frozen V2 wire compatibility. The maintenance worker is one bounded function using the existing scheduler, completed plans and transfer refresh fields; it is not a new subsystem. Persistent additions are exactly those required for cadence, maintenance observability and durable terminal recovery. Status variants expose those transitions through existing queries. No dependency, production canister, public method, administrator control or generic workflow framework was added.

Test infrastructure additions extend existing mocks and integration files, add an actual-RC2 checkpoint generator/fixtures and record the required resource counters. Existing qualification scripts gain gate logs/checksums, executed-name checks, scoped coverage, interface compatibility, metric preservation and separate managed-server process lifetime. The latter focused change addresses qualification shutdown ambiguity without altering workloads or runtime code. Documentation stays consolidated, with RC2 moved intact to historical evidence. Ranking, evaluator, production identities and reward economics are unchanged.

## G. Operator handover

Retain the review archive and checksum, both canonical build directories, release Wasm/Candid/manifest/checksums, qualified source and handover commits, executed matrix/logs, coverage, audit and SBOM. Independently review current real-network Governance/Ledger API/module/economics compatibility, especially the pinned neuron-lock proof and optional voting defaults, before considering activation. Review controllers, hotkey, management membership, proposer funding/reserve, cycle capacity, schema migration, client decoders and actual hosted CI after a separately authorized push.

Deployment/live mode, production funding/staking, NNS proposals, following/hotkey/controller changes and other mainnet actions require separate explicit operator/NNS authorization. Never reinstall a funded or active canister; use the reviewed upgrade procedure. No push or production/mainnet deployment, funding, staking/disbursement, proposal, transfer, hotkey/controller change or other mainnet write occurred. All described financial effects used local PocketIC canisters and test funds.
