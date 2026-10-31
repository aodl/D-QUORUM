# Historical RC1 qualification and handover report

This record qualifies only the historical RC1 source and artifacts below. It does not qualify the hardening successor. See [current qualification](../qualification.md). Preserved local RC1 evidence is under `dist/history/rc1/`.

Installable, undeployed initial candidate. **All mandatory local acceptance gates executed and passed** at source commit `85f38e22e223d1d503988f776b21dcde51733a1d`. This is not a claim of full production qualification or authorization: deployed compatibility, capacity review, operator approvals and remote CI remain prerequisites. No production operation or push occurred.

The definitive execution record is [acceptance-run.json](../../dist/history/rc1/acceptance-run.json), with the [full log](../../dist/history/rc1/full-acceptance.log) and [executed requirement matrix](../../dist/history/rc1/acceptance-matrix.json). Earlier preflight records are not substitutes for this clean full run. The final handover documentation is committed after the release-source commit; production code remains identical to its manifest.

## Executed gates

| Suite | Passed | Failed | Ignored |
|---|---:|---:|---:|
| unit/property/upstream-parity | 47 | 0 | 0 |
| mocked | 13 | 0 | 0 |
| protocol:canister_origin_reads_hotkey_permissions_manager_proposal_and_real_maturity | 1 | 0 | 0 |
| protocol:production_bootstrap_roster_manager_maturity_payout_upgrade_natural_timers | 1 | 0 | 0 |
| protocol:real_ledger_duplicate_archive_staking_destination_and_cache_refresh | 1 | 0 | 0 |
| production natural timers and upgrade | 1 | 0 | 0 |
| scale | 2 | 0 | 0 |
| instrumented unit/property coverage | 47 | 0 | 0 |
| canonical:production_timers_ignore_private_support_and_recover_upgrade_configuration | 1 | 0 | 0 |
| canonical:production_bootstrap_roster_manager_maturity_payout_upgrade_natural_timers | 1 | 0 | 0 |

There are **65 unique named tests**: 47 native tests (5 canister, 25 unchanged upstream evaluator, 6 accounting, 5 clients, 6 policy), 13 fault-injection tests, 3 real-protocol tests and 2 scale tests. Native tests include two property/permutation tests. Full acceptance records **115 passing executions**, including instrumented native coverage and repeated production/canonical smoke tests; repeated executions are not counted as new unique tests. Formatting, warnings-denied workspace Clippy, Candid generation/subtyping, actual Wasm exports, dependency isolation, integrity and build validators are separate gates, not invented tests. Three negative runner probes separately reject zero-match behavioural filters, missing suites and absent executables.

Mocks test malformed/non-progressing data, private-but-readable support, pre-bootstrap proposer feedback, expired/reordered callbacks, partial batch failure, configuration changes during a dispatched write, changed candidates and cycles, empty rosters/CatchAll, proposal loss/rejection, transfer loss/duplicates, partial payments, fees, insufficient funds, expired deduplication/history lag and upgrades. They do not establish NNS permissions.

Pinned real Governance/Ledger tests establish canister-origin reads, ordinary hotkey following, forbidden hotkey management-following and direct maturity, exact manager proposals, other-manager approval/rejection, not_for_profit=false maturity execution, the real seven-day finalization path, explicit default-account minting, real staking-account transfers/fees/deduplication/archives and separate cached-stake refresh. The production lifecycle uses natural timers, deterministic separately funded bootstrap, real roster/proposal/mint/payment and an upgrade before payment. The exact Docker-built canonical Wasm repeats both the natural timer smoke test and the real production lifecycle. An Index is not used for reconciliation, so no Index-lag assumption is made.

## Canonical release and exact pins

Release source: `85f38e22e223d1d503988f776b21dcde51733a1d`. Canonical image: `rust:1.94.1-slim-bookworm@sha256:cf9dd0ec73e75f827fe59123fff9dc65af1a1c8363c3c31ee8d7f8ad0b6a5fb2`; platform linux/amd64; SOURCE_DATE_EPOCH=0. Two clean no-cache builds produced identical file sets and bytes.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| [d_quorum.did](../../dist/history/rc1/release-d_quorum.did) | 4510 | `e20a8e4e3c044b4d65f9ad26ff39977175cba4b7cc723eca8af634842c48f922` |
| [d_quorum.wasm](../../dist/history/rc1/release-d_quorum.wasm) | 1852213 | `1cac858b906c615c1cb9444b3177cf1a04b3a52e9e46b0c4adc32a455eb9a3e1` |

[Canonical source/configuration/artifact manifest](../../dist/history/rc1/release-manifest.json) SHA-256: `087ec4bb746c8b38f7abaa32aac539843ffdcddffed675df70bb7de3b4e0f379`. It hashes every tracked input file, including configuration, policy, interfaces, tests, workflows and licences. [SHA256SUMS](../../dist/history/rc1/release-SHA256SUMS) includes both artifacts and that manifest.

| Source role | Pin |
|---|---|
| Jupiter testing/operations reference | `e60b79fc428b63cde629174a0f1c40d5fa372623` |
| Dendrite evaluator/policy | `b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291` |
| Evaluator internal NNS policy source | `d55a0f4d4edfabe49d8fd543aff473084cb741f2` |
| Governance/Ledger/archive/API source | `83f29e0803496ba6aaea3d6b43f6c6bebea12dd9` |
| PocketIC client/server | `15.0.0`; server source `8258578e6212d445aeeafb71c1160fa4ea356d60` |
| PocketIC server SHA-256 | `29472ea4433b30a280676c4e22e369d79d5ba6ee1b4d48bab32ebe7d0ad2b4bb` |
| Rust / didc / icp-cli inspected | `1.94.1` / `0.6.2` / `1.2.0` |

The policy and protocol pins are deliberately distinct. This does not assert that the reviewed API commit is deployed on mainnet. [protocol-pins.json](../../protocol-pins.json) contains immutable URLs and compressed/raw checksums for all four protocol artifacts and pinned test tools. [Provenance](../provenance.md) records reviewed references and the archive compression contract.

| Protocol artifact | Decompressed Wasm SHA-256 |
|---|---|
| governance-canister.wasm.gz | `dbcf97ae8729a956521a0a928f1b1bcb93f6e9c0dafd0e42aa985588713b88c0` |
| ic-icp-index-canister.wasm.gz | `7d03320c828446d71d1a3d0a283b69b1b7b49cd758dce774b1d8583251fc3de7` |
| ledger-archive-node-canister.wasm.gz | `a3e4e9f334fbcb93ccb168b5f5440edf2d2ac505388e5f16f8ebba6f82637cfd` |
| ledger-canister.wasm.gz | `538fc204379c53f6cb9ddc70c11122a0a26f6a7a7a01a0a2a6c30c5d3c76ef4d` |

The real archive installation reports the compressed artifact digest `b0fb2c30b82d7517b0566d9de624caad1a58f54f57f2136bdfa298a7ae1d459e`; both encodings and the installation are checked. The optional Index artifact is pinned for provenance and is not a production dependency. PocketIC built-in Registry/CMC provide the tested modulation environment; installed module hashes are recorded in [real-environment.json](../../dist/history/rc1/real-environment.json). Their test-runtime source is separate from the explicit Governance/Ledger pin.

## Coverage, scale and security

Native LLVM coverage covers the workspace, including the unchanged evaluator, and does not measure Rust code executed inside PocketIC Wasm.

| Metric | Covered / total | Percent |
|---|---:|---:|
| lines | 2734 / 4836 | 56.53% |
| functions | 224 / 593 | 37.77% |
| regions | 3784 / 6803 | 55.62% |

Full data: [coverage.json](../../dist/history/rc1/coverage.json).

| End-of-round local measurement | No candidates | One compliant candidate |
|---|---:|---:|
| Synthetic public sources | 10000 | 10000 |
| All public observations | 10000 | 10010 |
| Score entries | 0 | 1 |
| Index pages including final empty page | 101 | 102 |
| Full-neuron batches | 200 | 201 |
| Governance calls | 302 | 345 |
| Selection instruction samples summed | 7024429864 | 7856291397 |
| Largest sampled step | 26672523 | 27625933 |
| Serialized stable snapshot bytes | 2076 | 2528 |
| Physical stable pages | 129 | 129 |
| Reported stable memory bytes | 8_454_144 | 8_454_144 |
| Reported Wasm heap bytes | 1_376_256 | 1_376_256 |
| Reported total canister memory bytes | 11_700_352 | 11_700_352 |
| Cycle delta across all canister jobs | 27656559389 | 32117382968 |
| Wall seconds | 53.878574967 | 71.841238082 |

The populated fixture checks the exact score from 10,000 u64::MAX-VP sources plus the baseline follower and selected-candidate revalidation. These are actual bounded local workloads, not universal mainnet or worst-case dense-score/large-graph guarantees. Heap/total memory are end-of-round measurements, not peak-host-RSS claims. Instruction samples are taken before the final checkpoint, exclude callee/replica work, and are not complete universal execution-cost bounds. [Scale evidence](../../dist/history/rc1/scale-populated.json) preserves the scope.

Cargo audit 0 known vulnerabilities; 4 unmaintained-package notices; no advisory ignores. RustSec database commit `2295466c4e9df26647fd67d8fa1c705ac2fc7f81`. `backoff`, `instant` and `serde_cbor` are test-tool dependencies; `paste` is a Candid proc-macro/build dependency. The production tree excludes PocketIC, mocks, property tools, reqwest and xtask. Vendored-policy checksums pass. These checks are not an independent security audit.

[CycloneDX 1.6 SBOM](../../dist/history/rc1/sbom.cdx.json): 291 locked components with dependency graph; SHA-256 `c5e18037671fcd6b56701d79f1ceccf750e2a5fa2512a45ae712495883dc94ce`. [Audit findings](../../dist/history/rc1/security.json) and [production dependency tree](../../dist/history/rc1/production-tree.txt) retain the scope.

## Implementation and public interface

Fixed production identities are Governance `rrkah-fqaaa-aaaaa-aaaaq-cai`, ICP Ledger `ryjl3-tyaaa-aaaaa-aaaba-cai`, D-QUORUM neuron `4713806069430754115` and Governance's expected NNS Root controller `r7inp-6aaaa-aaaaa-aaabq-cai`. The future automation principal and its separately established proposer neuron remain distinct from D-QUORUM and recipient neurons.

The production canister is `canisters/d_quorum`: versioned stable state, four resumable timer jobs, target-authority checks, following reconciliation, proposer bootstrap, maturity-proposal investigation, staged-balance observation and immutable payout recovery. `crates/policy` implements the pinned-evaluator adaptation, exact scores and deterministic manager-disjoint selection. `crates/accounting` owns payout identities, arithmetic, reservations and invariants. `crates/ic_clients` contains narrow bounded typed Governance, Ledger, archive and Management clients. The unchanged pure evaluator and parity fixture are in `vendor/dendrite`; its licence, provenance and file checksums are retained. Test canisters and PocketIC dependencies are excluded from the production dependency tree.

The [reviewed public Candid](../../dist/history/rc1/release-d_quorum.did) contains the complete interface. Its sole application update is `set_delegates_per_topic(nat8) -> variant { Ok: nat64; Err: text }`, authorized with the actual IC caller and accepted only from fixed NNS Governance. Initial count is five, permitted range 1..15. Accepted changes increment the stable revision, invalidate unfinished computations and recipient drafts, and preserve dispatched intents and financial obligations. Controllers and anonymous callers have no configuration backdoor.

Public queries are `configuration`, `scan_progress`, `candidate_page`, `score_page`, `roster_page`, `exclusion_page`, `proposal_progress`, `payout_page`, `transfer_page` and `health`. Pages are capped at 100 records. Actual Wasm export validation also checks lifecycle exports, embedded Candid bytes and the pinned CDK's self-only timer executor. No debug, test, administrator, generic Governance, direct-vote, arbitrary-proposal, arbitrary-transfer or arbitrary-destination endpoint is exported.

## Discovery, support and selection

Candidates come from bounded complete `list_known_neurons`, never an index-wide discovery heuristic. A resumable collector reads actual public configuration, metadata and replicated controller-canister information, retaining timestamps and exact evaluator provenance. Only conclusively Compliant candidates enter scoring; the pinned evaluator's structural committed-topic semantics determine eligibility. Its 23 direct rules are unchanged; the 25 vendored tests are test cases, not a different rule catalogue. Names and reward-receiver declarations do not replace configuration. Temporary evidence failures invalidate completeness rather than becoming confirmed ineligibility.

The support scan uses the explicit exclusive-ID neuron-index cursor, 100-record pages and full public reads in batches of 50. Only visibility Public contributes, including when the caller can read private neurons. Voting power and following come from the same full observation; index voting power is ignored. IDs, visibility, bounds, following maps and voting-power consistency are validated. Batch scores and cursor progress commit together. Retried pages and upgraded scans cannot count a batch twice. A non-progressing, failed or incomplete scan cannot replace the applied roster. Start/end times, progress, failures and configuration revision remain observable. The interval is not an atomic NNS snapshot; round age is capped at three days.

Scores use deciding VP and exact checked `u128` arithmetic with scale 360360. Every distinct effective followee belongs to the denominator, including ineligible candidates. Contributions are direct, exclude self-following and do not propagate recursively. D-QUORUM and the owned proposer are excluded as support sources under the explicit anti-feedback policy, including the deterministic owned staking account before bootstrap records its ID. CatchAll and Neuron Management are not elected topics. Topics 4 and 14 do not inherit CatchAll; other ordinary topics follow the reviewed fallback semantics. Raw vectors are bounded before distinct-followee deduplication. The regression `12000 -> X`, `9000 -> X,Y,Z`, `8000 -> X,Y` gives X exactly 19000 VP, even when Z is ineligible.

For each of the 16 supported ordinary topics, positive scores sort descending, then by ascending numeric neuron ID. Selection compares each candidate's complete manager set only with already accepted candidates. In the A>B>C overlap chain, A/B share m1 and B/C share m2 while A/C are disjoint: A and C are accepted; B is excluded. Lower-ranked manager copying cannot veto a higher-ranked candidate. Exclusions identify the selected conflicting candidate and shared IDs. Manager-ID disjointness does not prove independent human ownership. Short and empty rosters are valid; there are no favored seats, discretionary weights or roster overrides.

## Applying and reconciling following

Before writing, the canister verifies target neuron 4713806069430754115, the reviewed expected controller, its hotkey, Governance's exact NNS Root controller, unchanged configuration, revalidated selected candidates, the 15-followee bound, uniqueness and absence of a voting-dependency path back to D-QUORUM. Traversals are bounded at 4096 nodes per topic; unavailable/private dependencies prevent application. Material compliance, topic or manager changes invalidate the draft. Candidate validation expires after 30 minutes.

Only changed ordinary topics enter one atomic pinned-API `SetFollowing`. Neuron Management is never changed. The target's CatchAll must already be empty through a separately authorized operator/NNS operation; automation does not clear it. This prevents excluded defaults from silently reappearing after an empty selection. The complete intended map is persisted before sending. All replies, including lost replies, lead to readback before retry or publication. Rewards require a fully reconciled applied roster with the current revision and age at most eight days. A failed scan retains the previous applied roster.

## Proposer bootstrap and maturity

The owned proposer is distinct from D-QUORUM, the automation principal and recipients. Its fixed nonce is 0x4451554f52554d31. A separately funded Governance staking account derives from the canister principal and this nonce using the reviewed staking-domain hash. Claim/refresh is restricted to that deterministic account; the returned ID, controller and actual staking subaccount are verified durably. Reward-pool ICP never funds bootstrap. Missing hotkey or manager membership is a waiting condition. The proposer retains empty Neuron Management following and cannot automatically approve unrelated proposals. Proposal resources must cover the current management fee plus the minimum-stake reserve.

The daily maturity job builds only a Neuron Management proposal on D-QUORUM for 100% DisburseMaturity, with explicit destination owner=this canister and subaccount=None. It checks membership, ownership, unstaked maturity, current fees, matching open/adopted proposals and disbursements already in progress. The conservative minimum reserves 5% modulation headroom above the source's one-ICP minimum. A stable operation ID, exact fingerprint and unique marker precede MakeProposal. The marker is not treated as protocol idempotency. Lost replies remain ambiguous while authorized paginated history matches proposer, target, action, destination, URL, summary and marker. No conclusive match means no resubmission. Rejected/failed proposals permit bounded-backoff later attempts.

Creation, adoption, execution, finalization and receipt are separate states. Other managers decide adoption; the percentage is evaluated at execution, not promised as a fixed ICP amount at creation. Real Governance tests exercise its seven-day delay and modulation path, including `not_for_profit=false`. The earlier assertion that this flag prevents all dissolution, splitting or maturity operations is not used. The production command scope comes from executable validation and tested permissions.

A later matching in-progress disbursement, its finalization time, an actual Ledger Mint and an empty in-progress list can produce `FinalizedReceiptUnattributed`. That name deliberately avoids claiming cryptographic attribution of an arbitrary mint to one proposal: this protocol source provides no per-disbursement block reference. A long outage missing the whole in-progress interval may leave the proposal job unresolved. This cannot authorize a duplicate proposal. Distribution observes actual staged funds independently.

## Recipients, accounting and uncertainty

The prominently provisional reward policy gives one equal net share to each distinct neuron in the latest fully applied fresh roster. Selection on multiple topics still gives one share; VP does not weight payment. Managers have no bonus and reward-receiver conventions do not redirect funds. No valid recipient set means funds are retained. A new plan snapshots recipients once and never recalculates after a roster change.

Each recipient destination is resolved from Governance's actual full public neuron record: fixed Governance owner and the bound 32-byte staking subaccount. Numeric neuron IDs are never used to derive recipient accounts. Missing, private, malformed or conflicting accounts prevent a plan. No caller supplies a destination. Real tests separately prove that staking-account balance grows and that cached Governance stake needs its supported refresh; production does not alter recipient control, following or dissolution settings.

For spendable balance B, N recipients and current fee F, each net share is floor((B-N*F)/N), after checked subtraction and a minimum positive share of one e8s. Dust stays for a later plan. Before any send, the canister persists payout ID, roster and destination snapshot, balance, fee, amounts, deterministic 24-byte memos, created_at_time, Ledger anchor and per-transfer statuses. There is one active plan. Incoming and unsolicited deposits belong to future plans. Confirmed costs plus retained liabilities and dust reconcile to the original plan; apparently available balance cannot discard unresolved reservations.

Prepared becomes Unknown before sending, then Verifying and Confirmed only after exact authoritative block matching. Ok and Duplicate both retain and verify the block reference. Retries preserve memo, timestamp, destination, amount and payout ID inside a conservative 23-hour margin within the reviewed 24-hour deduplication window. After expiry, replicated Ledger history and validated archive callbacks are searched; no Index is used. Missing/lagging history or authoritative absence never licenses a new transfer identity. Balance changes alone do not prove payment. Fee changes and insufficient-funds replies retain original entitlements; completed recipients are never repaid or included in a balance rebuild. Permanent uncertainty and fee changes can require separately reviewed recovery code; no liability-reset override exists.

## Upgrade, scheduling and limits

V1 stable storage uses lossless canonical Candid roundtrip validation, accounting checks and a 64 MiB serialized-state cap. Every cursor and financial intent commits before an effectful await. Job generations and 600-second leases fence stale callbacks. Upgrades preserve obligations, turn pending proposal intents into ambiguous investigation and rearm one timer per job. A stored policy/evaluator/protocol pin change invalidates unfinished computations, increments the configuration revision and returns to ObserveOnly, while retaining dispatched following intents for readback and all immutable financial obligations. Future policy changes must advance the application revision, and schema changes require an explicit migration.

Default schedules are weekly selection and daily maturity/staged-balance checks, with ten-second bounded work quanta and bounded backoff. Work waits below a two-trillion-cycle reserve. Virtual-time jumps can create temporary CDK timer concurrency deferrals; they do not bypass generation checks. Completed payout history retains 32 plans; unresolved records are not pruned. Whole-state snapshot encoding has capacity costs: the measured large-index fixtures do not establish worst-case candidate-graph, dense-score-map or mainnet capacity.

## Operator-only work and remaining prerequisites

Remote CI has not run: no push occurred. The PR, main-branch and manual workflows use read-only repository permissions, full-SHA action pins, pinned tools and no deployment secrets. Operators must separately push when authorized, retain actual successful run IDs, and configure/verify required branch-protection checks. Workflow YAML is not protection or execution evidence.

Before production, separately authorize each stage in `docs/operations.md`: reserve/deploy the intended canister in ObserveOnly; review controllers and upgrade authority; verify D-QUORUM's expected controller and the deployed Governance/Ledger capabilities; separately fund and establish the deterministic proposer; add the exact proposer as a manager and the automation as hotkey without removing existing managers; separately clear CatchAll; observe and review a complete scan; review the provisional policy, first roster and a payment-plan rehearsal; then separately authorize Live operation. Observe/bootstrap modes cannot manufacture a financially usable applied roster. Live mode authorizes all implemented scheduled jobs, so review that activation boundary explicitly.

Deployment review must also address the four dependency-maintenance notices, independent security review, capacity beyond the measured fixtures, current deployed protocol compatibility, cycle funding and incident governance. Preserve unresolved financial records and use upgrades, never reinstall, for recovery. Permanent history unavailability, a missed full maturity-finalization interval or a fee change can require a separately reviewed typed recovery upgrade. No generic override or self-controller/rescue mechanism is installed.

All value movement, funding, staking, authority installation, controller changes and proposals during qualification occurred only in local PocketIC instances using synthetic ICP. No production write, production funding, production deployment, mainnet staking, mainnet hotkey/manager installation, mainnet proposal, mainnet Ledger transfer, mainnet controller change or push occurred. No wallet key, private key, seed phrase, identity export, PEM or environment-secret file was inspected.


## Local implementation commits

```text
c3fa71b Pin reviewed policy and protocol sources; add exact selection and immutable accounting
c57f3f6 Implement durable canister jobs, authority checks, proposal investigation and ledger reconciliation
724418e Add protocol and fault-injection qualification, pinned release tooling and operator handover
3fb8c0d Fence expired workers and recheck observation age immediately before following writes
127d79f Qualify ambiguous proposals, stale evidence, scan outages and callback recovery
96fa1d8 Bound history catch-up and strengthen monetary and observation validation
9d6ab94 Fence policy upgrades and extend negative protocol and populated scan tests
5c498f1 Generate acceptance attestations from completed suites and retain CI evidence
f542c98 Verify vendored policy integrity and support Python 3.10 in SBOM gate
ff99701 Cover insufficient funds and every durable financial phase before qualification
a822dd5 Require one unchanged clean source commit throughout full acceptance
914fec2 Check CatchAll refusal before validation expires during retry backoff
013a3ae Verify archive installation hash against pinned gzip bytes
9f970f8 Start a new configuration round promptly after reconciling an old write
85f38e2 Exclude the deterministic proposer account before its bootstrap ID is recorded
```

All commits are local on `main`. The final documentation-only handover commit follows this implementation history. The worktree is checked clean after that commit; exact final HEAD and evidence checksums are retained in `dist/evidence/handover.json`. No push or production write occurred.
