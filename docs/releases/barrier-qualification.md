> Historical report from `448bcd2129240be7cd4caee3984d74ae70ad9030`; qualification binds source `2180db49928d7535c744937eedf16b8c2ed8ffc8`. Artifact links point to the preserved historical extraction. Current integration results are in [qualification.md](../qualification.md).

# Maturity lock-barrier correction qualification

**All mandatory local gates passed for this undeployed candidate.** The source-stable full acceptance command exited normally with status 0 on 2026-11-02. [The actual launcher receipt](../../dist/history/barrier-qualified/evidence/launcher-exit.json) records the result. Hosted CI is unrun. No push or mainnet write occurred.

## A. Commits and source

Actual starting HEAD was `b54d3cdbc7eb87c068c054924ce69e353de81a38`, descending from reported implementation `55152c59bb2524f4304d2cd3c5c5d8d0c4cc0e04`. The worktree was clean. No reset or discarded work occurred.

- `2180db49928d7535c744937eedf16b8c2ed8ffc8`: restricted typed maturity barrier, regressions, pinned-source proof and qualification selection. This is the exact qualified implementation source.
- The following documentation-only handover commit records the completed report; its exact ID is in the bundle's external validation receipt and final handover. Runtime, tests, pins, stable layout and Candid do not change in that commit.

Historical [RC1](rc1-qualification.md), [RC2](rc2-qualification.md) and [RC3](rc3-qualification.md) reports and hashes remain historical. Exact RC3 release/evidence/build outputs are preserved under `dist/history/rc3-qualified`; the original RC3 review archive is untouched.

## B. Correction and regressions

The ordinary [Governance adapter](../../crates/ic_clients/src/governance.rs) converts every typed Governance Error into `Err(String)`. RC3's subsequent error-14 match in [proposal.rs](../../canisters/d_quorum/src/proposal.rs) was therefore unreachable: `await?` had already returned. The correction adds `maturity_finalization_barrier(id)` with the private `validate_maturity_finalization_barrier` validator, restricted to by-ID ClaimOrRefresh and replaces that single production call site. Ordinary `manage` and its error conversion remain unchanged.

At pinned executable revision `83f29e0803496ba6aaea3d6b43f6c6bebea12dd9`, [the protobuf enum](https://github.com/dfinity/ic/blob/83f29e0803496ba6aaea3d6b43f6c6bebea12dd9/rs/nns/governance/proto/ic_nns_governance/pb/v1/governance.proto) defines InsufficientFunds as 14. [Refresh](https://github.com/dfinity/ic/blob/83f29e0803496ba6aaea3d6b43f6c6bebea12dd9/rs/nns/governance/src/governance.rs) acquires the neuron lock before the Ledger balance await and minimum-stake refusal. [Both lock implementations](https://github.com/dfinity/ic/blob/83f29e0803496ba6aaea3d6b43f6c6bebea12dd9/rs/nns/governance/src/neuron_lock.rs) use the same in-flight-command map. [Finalization](https://github.com/dfinity/ic/blob/83f29e0803496ba6aaea3d6b43f6c6bebea12dd9/rs/nns/governance/src/governance/disburse_maturity.rs) holds that lock while popping progress and awaiting the mint, restoring progress or retaining the lock on failure. The [consolidated audit](../hardening-design.md#final-financial-lifecycle-contracts-v3) records source checksums; reviewed source bytes and checksums are included under `dist/history/barrier-preflight/pinned-source`. Error-message text supplies no proof.

Only exact expected-neuron-ID success or that typed post-lock error 14 establishes the barrier. Other codes/variants, wrong or absent IDs, empty/malformed replies and rejected/unknown transport results remain unresolved. Existing exact Executed proof, empty progress before and after, protected configuration and the 300-second bound remain required. No historical mint is attributed by this recovery.

The four new exact regression names are:

1. Native: `governance::tests::maturity_barrier_preserves_only_exact_success_or_typed_post_lock_insufficient_funds`.
2. Recording adapter: `maturity_barrier_adapter_decodes_typed_results_without_relaxing_ordinary_refresh`.
3. Production state machine with recorded faults: `executed_maturity_typed_insufficient_funds_barrier_recovers_but_uncertain_barriers_do_not`.
4. Actual pinned Governance/Ledger with production timers: `missed_real_maturity_window_accepts_only_typed_post_lock_insufficient_funds_barrier`.

[Hardening regressions](../../tests/pocketic/tests/hardening.rs) exercise wrong/missing IDs, unrelated error codes, missing/unexpected responses, malformed Candid and rejected calls before typed 14. They preserve one exact proposal through a thirty-day outage and upgrade, block another proposal on failed/uncertain barriers, then terminate without receipt attribution. Native tests additionally classify generic unknown-transport errors; recording rejections are not represented as real IC SysUnknown events. Ordinary refresh still fails on error 14.

The [real-protocol regression](../../tests/pocketic/tests/protocol.rs) seeds the target's actual staking balance at 50,000 e8s, obtains actual typed error 14 from pinned Governance, and verifies ordinary refresh remains an error. Another manager approves the exact maturity proposal. Automation misses the complete progress window, Governance executes/finalizes, and the upgraded production canister recovers with no duplicated original proposal or invented receipt. Actual error 14 is verified before and after recovery. A separate unrelated deposit remains funds rather than receipt evidence. All three integration regressions repeat in the canonical suite. The direct adapter table uses the test-only recording probe; the state-machine and real-protocol cases execute the helper inside the actual canonical production canister.

The state-machine recording-fixture test was also run against the actual historical RC3 production Wasm, SHA-256 `27f8ad3ce2beceb0cb0def098e96ce982686e6822481ecf126b3b6b5bc3fafbb`. It failed at the intended terminal-barrier assertion with exit 101; the corrected Wasm passes. [Negative-control and preflight records](../../dist/history/barrier-preflight/results.json) are separate from passing qualification gates. This negative control uses recorded Governance responses; it is not claimed as a real-protocol negative control.

## C. Preserved safety and compatibility

No scoring, eligibility, proportional division, Dendrite evaluation, manager-disjoint ordering, seat/count authority, payout allocation, staking destination, Ledger identity, refusal cooldown, financial settlement/maintenance, cadence, controller or hotkey logic changed. No Ledger/proposal ambiguity is cleared by an uncertain barrier. Payment entitlements, confirmations, reservations and fees are untouched. Terminal maturity proof creates no spendable funds; payout admission still uses authoritative Ledger funds and its existing roster/cadence checks.

Stable schema remains **V3**, with byte-identical state and V1/V2 conversion source. Existing frozen-wire native migrations and actual V1/RC2-Wasm checkpoint upgrades run against prepared and canonical candidates. Public Candid remains byte-identical to RC3 (6,314 bytes); no production method or response type changed. Governance/Ledger runtime pins, Dendrite pin `b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291`, evaluator checksums and policy `selection-2-eligible-ballots/reward-roster-equal-1` are unchanged.

Receipt attribution can remain genuinely unprovable because a Ledger mint lacks the proposal fingerprint. Unknown creation, unavailable proof/history and failed/uncertain lock barriers retain their fail-closed treatment. Termination and receipt attribution remain distinct.

## D. Qualification evidence

The complete qualifying run has **126 unique named tests, 211 passing executions, 37 behavioural commands and 105 passing gate records**. All **78 behavioural/release requirements** in the [executed matrix](../../dist/history/barrier-qualified/evidence/acceptance-matrix.json) are executed. Repeated tests and validators do not become additional unique tests.

| Suite | New distinct names in this run | Passing executions |
|---|---:|---:|
| Native unit/property/upstream parity | 69 | 69 |
| Recording/mock integration | 13 | 13 |
| Adversarial hardening | 26 | 26 |
| Actual pinned Governance/Ledger/archive | 13 | 13 |
| Production natural-timer/upgrade repeat | 0 | 1 |
| Large-index scale | 2 | 2 |
| Prepared 20/80/240 capacity | 3 | 3 |
| Instrumented native repeat | 0 | 69 |
| Canonical artifact repeats | 0 | 15 |
| **Total** | **126** | **211** |

The 69 native names include 25 unchanged evaluator tests. Four names are new relative to RC3. All existing ranking, voting eligibility, configuration-race, migration, financial lifecycle, natural-timer and real archive cases remain selected. No mandatory suite was skipped. Formatting, warnings-denied Clippy, Candid generation/subtyping, production no-debug exports, dependency isolation, RustSec, SBOM, coverage, both clean builds, canonical behaviour and final source guards pass. Workflow configuration is not remote CI execution.

Additional preflight executions are excluded from these qualification counts: 12 native client passes observed in the terminal (rerun with retained logs in the complete run), three targeted PocketIC passes with [retained records](../../dist/history/barrier-preflight/results.json), and one expected failing actual-RC3 negative control. Thus this tranche observed 226 passing executions of the same 126 names, plus that one intentional baseline failure. Historical RC1/RC2/RC3 runs are not added to these counts.

The full command ran 2026-11-02T15:37:26Z–19:11:30Z (12,844.67 host seconds), with test-profile debug disabled, Rust 1.94.1 and the unchanged pinned PocketIC 15.0.0/didc 0.6.2. The source-map SHA-256 is `68b464b74beda375ac70e523c2f8b950a52fb488c352eab10cf4423fb8d971c4`. Every source/artifact/log checksum was checked after successful completion.

All capacity cases use production constants and natural timers, dense scores, shared/unshared managers, discovery retry, latency, upgrade and the thirty-plus-dependency invalid contender. The 20/80 cases use five seats; 240 uses fifteen seats across sixteen topics. Every obligation is paid once and refreshed; each finishes with zero pending financial liabilities, pending refreshes and abandoned maintenance.

| Fixture | Contenders / score entries | Selection / total virtual s | Validation→intent / readback s | Oldest destination / plan after roster s | Host s |
|---|---:|---:|---:|---:|---:|
| [20 prepared](../../dist/history/barrier-qualified/evidence/prepared-capacity-20.json) | 40 / 640 | 454 / 1074 | 59 / 69 | 10 / 20 | 99.30 |
| [80 prepared](../../dist/history/barrier-qualified/evidence/prepared-capacity-80.json) | 160 / 2560 | 1374 / 3814 | 189 / 199 | 30 / 40 | 501.79 |
| [240 prepared](../../dist/history/barrier-qualified/evidence/prepared-capacity-240.json) | 480 / 7680 | 5595 / 12865 | 819 / 829 | 60 / 70 | 3720.94 |
| [240 canonical](../../dist/history/barrier-qualified/evidence/capacity-240.json) | 480 / 7680 | 5595 / 12865 | 819 / 829 | 60 / 70 | 2542.88 |

| Fixture | Cycle delta | Governance completions / neuron reads | Ledger balance / fee / history / transfer calls | Heap bytes / snapshot bytes / stable pages | Checkpoint writes / max sampled instructions |
|---|---:|---:|---:|---:|---:|
| 20 prepared | 97,337,472,397 | 194 / 148 | 47 / 21 / 21 / 20 | 3,932,160 / 178,541 / 129 | 1,687 / 48,397,563 |
| 80 prepared | 728,205,681,231 | 702 / 563 | 169 / 81 / 81 / 80 | 11,534,336 / 655,722 / 129 | 6,282 / 124,417,534 |
| 240 prepared | 6,236,683,553,912 | 2173 / 1789 | 494 / 241 / 241 / 240 | 34,275,328 / 1,962,913 / 129 | 22,172 / 327,128,002 |
| 240 canonical | 6,236,683,208,885 | 2173 / 1789 | 494 / 241 / 241 / 240 | 34,275,328 / 1,962,913 / 129 | 22,172 / 327,128,002 |

The 240-recipient run records 22,172 checkpoints and 5,625,455,364,590 total sampled checkpoint instructions in each artifact case. Stable pages are physical 64-KiB pages; snapshot size and heap size are different measurements. Governance neuron reads are a subset of recorded endpoint completions; Ledger counters include Governance refresh reads, while management-canister calls are not instrumented. Cycle deltas cover all jobs. Instruction samples do not claim whole-replica/callee costs. All original freshness limits remain unchanged. Virtual timing/call/checkpoint results are consistent; host wall-time differences are provisioning observations, not performance guarantees.

Native coverage ([scopes](../../dist/history/barrier-qualified/evidence/coverage-scopes.json), [complete counters](../../dist/history/barrier-qualified/evidence/coverage.json)):

| Scope | Covered / total lines | Native line coverage |
|---|---:|---:|
| Policy (unchanged) | 191 / 217 | 88.02% |
| Accounting (unchanged) | 533 / 552 | 96.56% |
| Clients | 483 / 1174 | 41.14% |
| Maturity state machine | 35 / 484 | 7.23% |
| Payout state machine (unchanged) | 0 / 493 | 0.00% |
| Stable migration (unchanged) | 1081 / 1135 | 95.24% |
| Vendored evaluator (unchanged, separate) | 1879 / 1902 | 98.79% |

The changed Governance adapter file has 317/639 covered lines (49.61%). The exercised native instantiation of its private barrier validator records 15 calls and all 10 regions covered; an unused library instantiation also appears with zero counts. LLVM reports no branch-count metric here, so this is not a branch-coverage percentage. Native file totals include in-file test bodies and generated implementations. Asynchronous dispatch and terminal-state await paths receive real/recording PocketIC and canonical integration evidence, **not** native coverage credit. No aggregate coverage threshold is invented.

[Whole-workspace RustSec](../../dist/history/barrier-qualified/evidence/security.json) reports zero vulnerabilities, no ignored advisories and four existing unmaintained notices: backoff 0.4.0 (RUSTSEC-2025-0012), instant 0.1.13 (RUSTSEC-2024-0384), paste 1.0.15 (RUSTSEC-2024-0436), serde_cbor 0.11.2 (RUSTSEC-2021-0127). Existing [security review](../security.md) and the [production dependency tree](../../dist/history/barrier-qualified/evidence/production-tree.txt) retain their scope; no dependency was added or replaced. Database commit `263a4d951a0867d4bddc29dddd6d59427c78f9a7` was updated 2026-11-02T12:45:44+01:00. The [CycloneDX SBOM](../../dist/history/barrier-qualified/evidence/sbom.cdx.json) contains 291 locked components, SHA-256 `c5e18037671fcd6b56701d79f1ceccf750e2a5fa2512a45ae712495883dc94ce`. Production dependency isolation passes; tests/mocks/PocketIC remain outside the production graph.

## E. Canonical artifacts and review bundle

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| [d_quorum.wasm](../../dist/history/barrier-qualified/release/d_quorum.wasm) | 2306339 | `07b1b54ba965303a00e072d3d9f4cc717dc27b10250b0e51cf37d6109919c3a8` |
| [d_quorum.did](../../dist/history/barrier-qualified/release/d_quorum.did) | 6314 | `ce15b307ce8b19b09df0d9abb723828099c87b52fdc2aa012d67c9f327940ad0` |
| [manifest.json](../../dist/history/barrier-qualified/release/manifest.json) | 9066 | `dd651e0d60fb1c30042b3cf87d6f31cd32f9c68a1306563de9b0bd91a8fd711f` |

The manifest binds source/configuration files to `2180db49928d7535c744937eedf16b8c2ed8ffc8`. Both forced-clean Docker builds use `--no-cache`, the pinned Rust 1.94.1 image, Linux amd64 and `SOURCE_DATE_EPOCH=0`; their exact Wasm/Candid file sets and bytes match. Production no-debug export and embedded Candid checks run on prepared and canonical artifacts. [Release checksums](../../dist/history/barrier-qualified/release/SHA256SUMS), [full execution record](../../dist/history/barrier-qualified/evidence/acceptance-run.json), [full log](../../dist/history/barrier-qualified/evidence/full-acceptance.log), [actual launcher receipt](../../dist/history/barrier-qualified/evidence/launcher-exit.json) and [executed requirement matrix](../../dist/history/barrier-qualified/evidence/acceptance-matrix.json) retain separate provenance.

The refreshed deterministic archive is `dist/review-barrier/d-quorum-barrier-review.tar.gz`, with adjacent SHA-256 and `review-bundle-validation.json` receipts. Its exact size/checksum and final handover commit are external to the archive and supplied in the final handover/results file, avoiding a self-referential hash. Root source files are the exact qualified Git archive, including the source-time pending report; completed consolidated documentation is under `handover/qualification.md`. The reused generator verifies source/artifact/log hashes, requirement/gate outcomes, referenced report files and every bundled file, generates the archive twice and requires identical archive bytes. Generated binaries and evidence remain ignored and uncommitted.

Hosted CI is **unrun** for this local, unpushed candidate. The existing workflow retains all mandatory suites, 360-minute production/canonical limits, read-only credentials, artifact retention, dependency ordering and no automatic deployment. The existing xtask canonical list adds the three new integration cases without removing any prior case. No missing-tool or zero-test gate is accepted.

## F. Scope audit

Production changes are one restricted Rust adapter helper/private validator and one existing call-site replacement. There is no new module, dependency, persistent type/field, production canister, public Candid method, administrator control or manual recovery path. Existing test infrastructure gains three test-only methods: `maturity_barrier_probe`, `refresh_probe` and `refresh_reply_for`. The existing refresh-refusal collection becomes a neuron-keyed map of the existing Script type so another job cannot consume the injected barrier response. The fixture helper `lifecycle_real_with_target_stake` changes only test seeding; the original helper retains its original default stake. These establish adapter transport, adversarial state transitions and actual protocol error-14 evidence. Four tests and five behavioural requirements are added; three integration tests join canonical repeats. The historical RC3 report is retained separately. The existing local review-bundle generator is reused; no production reporting or scheduling subsystem is introduced.

## G. Operator handover

Retain the qualified source and handover commits, review archive/checksum/validation receipt, both clean build outputs, canonical Wasm/Candid/manifest/checksums, complete executed matrix/logs, coverage, audit, SBOM, capacity measurements and negative-control evidence. Independently review current real-network Governance/Ledger module/API/economics compatibility before any deployment, especially the exact lock-ordering proof. Local pinned-protocol tests do not establish future live-network compatibility. Observe actual hosted CI after a separately authorized push and verify the deployment checksum/configuration, authority, mode, proposer binding/funding, cycles and upgrade procedure.

Push, deployment/live activation, funding/staking, NNS proposals, transfers, following/hotkey/controller changes and all other mainnet writes require separate explicit authorization. Never reinstall a funded or active production canister. No push, deployment, funding, staking, real proposal, real transfer, hotkey/controller change or other mainnet write occurred. All financial effects described here used local PocketIC canisters, test identities and test funds.
