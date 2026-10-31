# Hardening candidate qualification and handover

**All mandatory local acceptance gates passed at source `e14c9cb2fcc511472dfe273f9cee355c5d9f4a83`. This is a new undeployed candidate.** No production write, deployment, funding, staking, controller change or push occurred. Remote CI and activation remain separate operator prerequisites.

The starting boundary was `1ad0d89c8eeae5277afdfb1557e20f362ee27d28`. Historical release source `85f38e22e223d1d503988f776b21dcde51733a1d` and its hashes remain [historical](releases/rc1-qualification.md); they do not qualify this candidate. A subsequent documentation-only commit records this report without changing the accepted production sources.

There are **98 distinct named tests** and **165 passing executions** in this clean run. Coverage and production/canonical repetitions are executions, not additional unique tests. Empty helper libraries and validators add no invented tests.

All 81 gate records passed. The executed acceptance matrix covers 53 behavioural requirements, including the exact adversarial await boundaries and long outages; gate records include validators and repeated executions.

## Local commits

```text
10a8898 Harden eligible scoring, bounded scheduling and durable recovery
e01ecaa Use the supported public observation endpoint in real protocol fixtures
2c255f4 Migrate genuine historical V1 checkpoint envelopes losslessly
227b930 Verify staking refreshes independently of following-map serialization order
e147ebe Record dense capacity cycle costs and scoped neuron-read counts
d584b58 Bound controller observations through reply completion and recheck report age
f032591 Reconcile malformed proposal success IDs without resubmission
8fa9a23 Preserve payout cadence when fresh rosters resume blocked admission
c5a49a3 End selected revalidation promptly on conclusive ineligibility
e14c9cb Exercise setter changes during the original following write await
```

## Defects and regressions

| Requirement | Correction and regression evidence |
|---|---|
| Eligible direct support | Ballot eligibility uses validated dissolve state at the observation time plus recorded effective economics. Real Governance compares positive raw VP against actual ballots for dissolved, short-delay, boundary and eligible neurons, including optional-default compatibility. Native and natural-timer scans retain the 19,000-VP example and reject transitive support. Missing evidence is unresolved, not zero. |
| Coherent, deadline-safe scheduling | Batches of up to fifty configurations pair with a concurrent complete known-neuron registry read; the pinned multi-query omits metadata. Round caches reuse managers/controllers within 300 seconds. Bounded bursts and one-second continuations retain ten-second fallback timers. Final validation, cycle safety and destination drafts retain 1,800-second bounds. Dense capacity cases include shared-manager contenders, five-to-fifteen managers, a conclusively invalid 30-plus-dependency graph, latency, retry and upgrade. Selected NonCompliant results end the round promptly; a strengthened paused-read regression separately exercises a still-compliant manager change, conclusive ineligibility and a downstream cycle before any write. |
| Historical reconciliation | Support interval, candidate validation, intended write, readback and reward validity are distinct. Thirty-day lost-reply recovery records historical following without making it reward-eligible, then promptly scans again. Cycle reserve and upgrades are exercised. Fresh rosters wake blocked/in-flight admission while preserving the daily wait after completed payouts; the unchanged partial-payment/fee/roster/deposit regression exposed and verifies this correction. Controller response-end bounds and final report age checks prevent late awaits from freshening old configuration. |
| Configuration/readback race | Dispatched intent survives for readback. New dispatch/retry rereads current mode/revision and atomically checks worker ownership and intent version. The real Governance-only setter is invoked during a paused sent-intent target readback; a mismatching reply produces zero obsolete retries. Setter-during-original-write remains a distinct regression. |
| Obligations versus attempts | Prepared obligations have no dispatch timestamp. First dispatch journals exact amount/destination/fee/memo/time before await. Known no-execution refusals differ from unknown execution, candidate block verification and confirmation. A lost success is recovered after more than 24 hours, while never-sent B/C remain payable once each across upgrades and fee changes. Unresolved A retains its exact identity and all liabilities. |
| Proposal outcome classification | Audited precreation typed refusals terminate that attempt with backoff and fresh preflight. Real permission/insufficient-funds refusals charge no fee or proposal ID. Transport loss, missing/zero IDs and unbound positive IDs retain ambiguity and recover exact history without resubmission. A submitted proposal voted down is separate. Target, proposer, marker, action and explicit destination remain bound. |
| Stake-cache maintenance | Owned proposer refreshes by verified controller/account/nonce before fee affordability. Real top-up recovery and production recipient refresh are tested. Refresh verifies protected configuration using topic-map equality rather than wire order. Maintenance failure survives upgrade without resending confirmed ICP; no keys, hotkeys or controllers are added. |
| Authorization/checkpoints | Unauthorized setter calls reject before mutation/checkpointing, with internal authorization retained. Dense populated-state tests compare stable bytes and mutation/write counters before and after denied calls. Actual encoding/stable-write costs are measured. |

## Policy, interface and stable schema

D-QUORUM policy is `selection-2-eligible-ballots/reward-roster-equal-1`; stable storage is V2. The Dendrite evaluator remains byte-identical at `b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291` with its retained checksums and standard name. Runtime protocol tests remain pinned to `83f29e0803496ba6aaea3d6b43f6c6bebea12dd9`.

Direct-only public support, equal attribution over all distinct effective followees, exact arithmetic, exclusions, topic eligibility, greedy manager disjointness, numeric ties, five default delegates and the Governance-only count setter are preserved. No favoured seats or roster override was added. Support eligibility validates public visibility, dissolve-state/aging semantics and the actual Governance observation time; a confirmed eligible source must also have deciding VP. An absent whole voting-power-economics record resolves to the pinned DEFAULT of 15,778,800 seconds (six nominal months). An existing record with an absent inner minimum resolves to 1,209,600 seconds (fourteen days) under the pinned production Mission 70 flag. Optional defaults require the exact reviewed Governance module hash; unknown compatibility stops publication. The recorded context is checked around support batches and again before publication/admission. See [the hardening contracts](hardening-design.md) for the observation intervals and reviewed coherent-round policy, which detects observed changes and does not claim an atomic snapshot or proof against a transient change-and-restore between calls.

Public response records expose scan economics, observation/intent/readback/reward times, checkpoint metrics, immutable obligations/attempts, extra fee funding, confirmed cost, refresh state and typed proposal rejection. Clients must regenerate decoders for the expanded records and response variants. Public methods and setter authority remain unchanged. The [Candid](../candid/d_quorum.did) passes export, embedded-interface and dependency subtype checks.

V1 migration retains liabilities, paid status and dispatched identities. Prepared V1 payments become unsent obligations; every legacy Held record remains possibly executed. Old rosters lose reward eligibility and migration defaults to ObserveOnly. The native matrix covers every financial status. A committed snapshot generated by the actual checksum-verified RC1 Wasm proves V1 → V2 → V2 upgrades through both prepared and canonical production Wasm. The original one-variant V1 envelope is checked losslessly, rather than re-encoded using the new envelope.

## Supported capacity and timing

All rows use natural production timers and freshness constants. Each includes twice as many compliant contenders as distinct recipients, dense scores, shared-manager conflicts, unshared dependencies, one injected three-second configuration-read delay, a transient read failure and an upgrade during discovery. Every obligation is paid once and refreshed. These are bounded fixture results, not a universal mainnet throughput or worst-case guarantee.

| Recipients / seats | Artifact | Contenders / dense scores | Selected (virtual s) | Validation → intent / readback (s) | Oldest destination age at plan detection (s) | Total virtual s | Snapshot bytes / maximum checkpoint instructions | Host wall s |
|---|---|---|---:|---|---:|---:|---|---:|
| 20 / 5 | prepared | 40 / 640 | 433 | 59 / 69 | 10 | 1053 | 177,913 / 43,619,646 | 281.62 |
| 80 / 5 | prepared | 160 / 2560 | 1344 | 189 / 199 | 30 | 3784 | 655,094 / 119,501,489 | 2767.94 |
| 240 / 15 | prepared | 480 / 7680 | 5575 | 809 / 819 | 60 | 12845 | 1,962,285 / 322,712,726 | 8901.71 |
| 240 / 15 | canonical | 480 / 7680 | 5575 | 809 / 819 | 60 | 12845 | 1,962,285 / 322,712,726 | 2279.97 |

The 240-recipient row is one distinct test executed on both artifacts. Host wall time varies with shared-machine contention; the observation/dispatch ages use the production timer clock. The [first maximum-capacity measurement](../dist/evidence/capacity-240-prepared.json) is preserved separately from the canonical repeat. Its prepared-artifact run consumed 6,042,819,334,851 automation cycles and recorded 1,789 public-neuron read requests; the two-trillion-cycle reserve remains enforced. Detailed cycle deltas, scoped neuron-read counts, heap, stable pages and checkpoint totals are in the [capacity evidence](../dist/evidence/capacity-240.json). Recorded neuron reads exclude economics, management-canister and Ledger calls; cycle deltas include all jobs. Instruction/call/cycle burst limits are soft yield thresholds: one bounded transition can cross one before yielding. Checkpoint measurements cover serialization and stable writing; host/replica/callee costs and physical stable pages are distinct. The 10,000-neuron scale fixtures additionally run with zero and one compliant candidate.

## Financial invariants and recovery

Each distinct selected neuron receives the same fixed net amount at its verified Governance-owned staking subaccount, deduplicated across topics. Managers cannot redirect ICP. Maturity proposals retain explicit 100% D-QUORUM disbursement to the automation canister default account. `not_for_profit=false` is not a blanket prohibition on all dissolution, splitting or maturity operations; the real maturity test demonstrates the supported command.

For each plan, confirmed cost plus reserved liabilities plus fixed dust never exceeds original funding plus explicitly reserved extra fee funding. Later deposits cannot enlarge entitlements. Fee changes affect only unsent or conclusively rejected attempts; unknown attempts retain their original fee and identity. Insufficient extra fee funding remains observable and does not discard liabilities or redistribute residual balance across paid recipients. Authoritative history absence does not prove non-execution.

Stale observations block new payout admission; already admitted funded obligations remain durable and payable after outages. Confirmed payment and cache maintenance are separate. Lost following, transfer and proposal replies, long outages, exact Ledger/archive history, definite refusal, ambiguity, fee changes and upgrades are covered in the executed matrix.

## Executed gates and coverage

| Gate | Passing executions |
|---|---:|
| unit/property/upstream-parity | 60 |
| mocked | 13 |
| hardening | 15 |
| protocol:canister_origin_reads_hotkey_permissions_manager_proposal_and_real_maturity | 1 |
| protocol:production_bootstrap_roster_manager_maturity_payout_upgrade_natural_timers | 1 |
| protocol:production_owned_proposer_recovers_after_real_staking_topup | 1 |
| protocol:raw_positive_deciding_vp_is_distinct_from_real_ballot_eligibility_and_feature_default | 1 |
| protocol:real_ledger_duplicate_archive_staking_destination_and_cache_refresh | 1 |
| production natural timers and upgrade | 1 |
| scale | 2 |
| capacity:eighty_recipients_sixteen_topics_default_five | 1 |
| capacity:twenty_distinct_selected_with_shared_dependencies_and_latency | 1 |
| capacity:two_hundred_forty_recipients_fifteen_seats | 1 |
| instrumented unit/property coverage | 60 |
| canonical:production_timers_ignore_private_support_and_recover_upgrade_configuration | 1 |
| canonical:production_bootstrap_roster_manager_maturity_payout_upgrade_natural_timers | 1 |
| canonical:reviewed_v1_snapshot_upgrades_to_v2_and_survives_a_second_upgrade | 1 |
| canonical:setter_during_paused_sent_intent_readback_never_retries_obsolete_revision | 1 |
| canonical:expired_a_is_confirmed_from_history_then_never_sent_b_c_get_fresh_attempts_and_fees | 1 |
| canonical:two_hundred_forty_recipients_fifteen_seats | 1 |

Formatting, warnings-denied Clippy, interface/export checks, dependency isolation, security and build validators are separate successful gates. Full [execution record](../dist/evidence/acceptance-run.json), [log](../dist/evidence/full-acceptance.log) and [executed acceptance matrix](../dist/evidence/acceptance-matrix.json) bind these results to the unchanged source above. Earlier preflights and interrupted runs do not qualify this source.

The [evidence checksums](../dist/evidence/SHA256SUMS) cover the final execution records, capacity measurements, coverage, audit and SBOM files.

Native coverage separates changed production areas from the unchanged vendored evaluator. Wasm-only client/await/timer/commit paths are exercised by integration suites and are not credited as native covered lines.

| Native scope | Lines | Regions | Functions |
|---|---|---|---|
| policy | 191/217 (88.02%) | 337/371 (90.84%) | 21/27 (77.78%) |
| accounting | 365/391 (93.35%) | 696/733 (94.95%) | 35/43 (81.40%) |
| clients | 426/1109 (38.41%) | 596/1575 (37.84%) | 37/207 (17.87%) |
| transitions | 747/2700 (27.67%) | 837/3675 (22.78%) | 48/329 (14.59%) |
| unchanged_evaluator | 1879/1902 (98.79%) | 2498/2529 (98.77%) | 134/152 (88.16%) |

Pure/native tests, scripted faults through natural timers, dense natural-timer capacity tests and real pinned-protocol tests are distinct evidence classes. Real protocol coverage includes ballot eligibility/defaults, permissions, precreation refusals, proposer top-up recovery, manager proposals, actual maturity finalization/minting, recipient payment/cache refresh, duplicate transfers and real archives.

## Security, SBOM and canonical artifacts

The whole-workspace RustSec audit, locked dependency SBOM and production dependency isolation passed. [Audit findings](../dist/evidence/security.json); [CycloneDX inventory](../dist/evidence/sbom.cdx.json), SHA-256 `c5e18037671fcd6b56701d79f1ceccf750e2a5fa2512a45ae712495883dc94ce`; [production dependency tree](../dist/evidence/production-tree.txt). The audit checked 291 locked dependencies against RustSec database commit `2295466c4e9df26647fd67d8fa1c705ac2fc7f81` (updated 2026-10-30): zero vulnerabilities and four unmaintained notices, with no ignored advisories. `backoff` 0.4.0 (RUSTSEC-2025-0012), `instant` 0.1.13 (RUSTSEC-2024-0384) and `serde_cbor` 0.11.2 (RUSTSEC-2021-0127) are absent from the production graph and belong to the native PocketIC toolchain. `paste` 1.0.15 (RUSTSEC-2024-0436) is a production build-time proc macro. These notices remain documented; local workflow source is not a remote CI run.

Two forced-clean, no-cache Docker builds produced identical filenames and bytes, using the digest-pinned Rust 1.94.1 image on `linux/amd64` with `SOURCE_DATE_EPOCH=0`. The exact canonical Wasm then passed the required canonical tests.

| Canonical file | Bytes | SHA-256 |
|---|---:|---|
| [d_quorum.did](../dist/release/d_quorum.did) | 5945 | `6a06f8c56ed0b856f8e834be15518953d318910c238326653dc4ac391d0ccebb` |
| [d_quorum.wasm](../dist/release/d_quorum.wasm) | 2177169 | `867a31ec9a95b68b2d8a983d1e3ed406119b67a67b96270c3ef666093dc57019` |

[Canonical manifest](../dist/release/manifest.json), SHA-256 `6d06f6a5ade222a33113f5f7b637aef81b1687364079cb552a54b063b54c5443`, records every tracked input file and the accepted source. [Release checksums](../dist/release/SHA256SUMS) include its artifacts. Historical RC1 files remain under `dist/history/rc1/`.

## Operator prerequisites

No remote CI run is claimed: no push was authorized. Repository owners must verify required checks and branch protection after a separately authorized push. Before separately authorizing activation, review the policy/schema migration, current deployed Governance API/module/economics compatibility, authority/controller bindings, target hotkey and manager membership, proposer funding/reserve and cycle capacity. Unknown feature-dependent defaults stop publication. Installation/migration defaults and operational write modes require explicit review; never reinstall a funded or active production canister.

No deployment, funding, staking, maturity command, transfer, following update, NNS proposal, controller change or other production write was performed during this work.
