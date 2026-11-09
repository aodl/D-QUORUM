# Scoped authentication integration qualification

Historical report for qualified source `9fbc41ca135c996bfad3d1716ec2e10a587e989c`. Its facts are preserved; relative links now resolve inside the separately checksummed original review context. This is not the current creation qualification.

Evidence index: [readiness](../../dist/history/scoped-auth-9fbc41c/dist/evidence/integrated-readiness.json), [actual lane gate index](../../dist/history/scoped-auth-9fbc41c/dist/evidence/local-required-lane-gates.json), [component requirement mapping](../../dist/history/scoped-auth-9fbc41c/dist/evidence/local-component-requirement-mapping.json), [source/artifact verification](../../dist/history/scoped-auth-9fbc41c/dist/evidence/integration-final-source-validation.json), [replica scope proof](../../dist/history/scoped-auth-9fbc41c/dist/ci-evidence/system_browser/dist/evidence/browser-system/scoped-signing/scope-probe.json), [browser management](../../dist/history/scoped-auth-9fbc41c/dist/ci-evidence/system_browser/dist/evidence/browser-system/team-management/proposal-evidence.json), [same-world economic evidence](../../dist/history/scoped-auth-9fbc41c/dist/ci-evidence/system_browser/dist/evidence/browser-system/team-management/economic-evidence.json), [native coverage scopes](../../dist/history/scoped-auth-9fbc41c/dist/ci-evidence/coverage/dist/evidence/coverage-scopes.json), [raw npm inventory](../../dist/history/scoped-auth-9fbc41c/dendrite/dist/security/npm-advisory-inventory.json), [tested pair](../../dist/history/scoped-auth-9fbc41c/dist/integration-manifest.json).

Implementation and regressions: [scoped authentication](../../dist/history/scoped-auth-9fbc41c/dendrite/canisters/dendrite/web/src/auth.js), [transaction metadata](../../dist/history/scoped-auth-9fbc41c/dendrite/canisters/dendrite/web/src/transaction.js), [authenticated actor boundary](../../dist/history/scoped-auth-9fbc41c/dendrite/canisters/dendrite/web/src/nns-actor.js), [minimal Governance consumer Candid](../../dist/history/scoped-auth-9fbc41c/dendrite/candid/nns-governance/governance-transaction.subset.did), [manager metadata regressions](../../dist/history/scoped-auth-9fbc41c/dendrite/canisters/dendrite/web/test/manager-metadata.test.js), [real browser coordinator](../../dist/history/scoped-auth-9fbc41c/tests/pocketic/tests/browser_system.rs), [actual UI driver](../../dist/history/scoped-auth-9fbc41c/tests/browser/team-management.mjs), [runner verdict tests](../../dist/history/scoped-auth-9fbc41c/tests/system/test_qualification.py).

Historical evidence remains separate: [initial integration](../../dist/history/scoped-auth-9fbc41c/docs/releases/integration-initial-qualification.md), [prebinding failure](../../dist/history/scoped-auth-9fbc41c/dist/history/scoped-prebinding-29bbe69/evidence/integrated-acceptance.json), [binding-test failure](../../dist/history/scoped-auth-9fbc41c/dist/history/scoped-binding-test-f934d2a/evidence/integrated-acceptance.json), [source-9fbc monolithic timeout](../../dist/history/scoped-auth-9fbc41c/dist/history/scoped-timeout-9fbc41c/evidence/integrated-acceptance.json).

## 1. Source and history

Local qualification: COMPLETE required local lane matrix and readiness; undeployed, with remote CI unrun. This is an undeployed candidate, not deployment approval.
Mission starting HEAD: 52b546f93734f51d5719a7527b7e4aa4da5e1024. At the latest resumption, HEAD was f934d2a6812721b24f3dba688ee13ddb044d6cad; that attempt is preserved as failed history. The final result below belongs only to 9fbc41ca135c996bfad3d1716ec2e10a587e989c.
Implementation and qualified source: 9fbc41ca135c996bfad3d1716ec2e10a587e989c.
Qualified Git tree: 4bcb62edd08c7a93d4c90c2c47013ce6a12bc45e.
Documentation handover: documentation-only commit after the qualified source; exact hash is recorded in Git and the adjacent review-bundle receipt (documentation only after qualification).
Final local-lane campaign starting HEAD: 9fbc41ca135c996bfad3d1716ec2e10a587e989c.
Branch: integration/dendrite-system. The complete source remained clean and byte-unchanged throughout all final required local lane executions; the source guard, retained log hashes and both build comparison sets were independently rechecked.

Destination: /home/codexdev/src/D-QUORUM. Original sibling /home/codexdev/src/Dendrite remains clean at b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291, tree 7556ae7a34d0faead9e8451413721239254a0e37. Its previous full-history, unsquashed subtree import 2c06753d40c8f9bca35caecdf2eeb6f2d0778ab3 is preserved. No re-import or history rewrite occurred. Both Cargo workspaces and lockfiles remain independent.

Local implementation commits since the starting handover:
b4aa01dbe9b9ccf75ed4e85950ce716849889097 Derive ephemeral Governance-scoped II child sessions and read fresh manager registration
cde61df6699287f87085c554f1a5230723bdd030 Guard idle teardown and dispatch-time session validity; rebuild production frontend
e0c528b66679bd73656d1a2429dac915290275ad Reject cyclic delegation keys and regenerate scoped transaction assets
8c585a548185be1a81ead7dca6de39b98ca243c4 Update vulnerable browser and SBOM tooling with exact optional-build applicability checks
bebba2ff4afe3301fe602f879a4bdc8a49a31bc0 Exercise real-II scoped signing, browser quorum and two economic cycles in one protocol world
037a1f61c73f1a2e399de46c579800e57452c2b6 Require source-bound named integration evidence and preserve the initial failed qualification
f26e0915a9af8e0279d622d441d15b1f8e3db2e4 Check exact current fixture verdict and neuron identity in local browser qualification
cab9f74d37b6e7cfa323438fe83e9df5a3471fa1 Measure journey cycles from actual canister balance including fixture creation credit
db4e8431ccb22f9c41d2680c21a59e854e8407e4 Exclude credentials and operator results from both canonical build contexts
29bbe69609b4fa5ecb63f36f0e61314ee43615a5 Retain an independent Dendrite source and artifact manifest alongside the tested pair
9bd27bf6fc15c684c9481270fe0431e4290074ea Verify cross-topic payment deduplication in the browser journey and isolate CI evidence
f934d2a6812721b24f3dba688ee13ddb044d6cad Bind the undeployed scoped-auth candidate and distinguish historical release evidence
9fbc41ca135c996bfad3d1716ec2e10a587e989c Align release guards and isolate independent qualification lanes

## 2. Authentication correction

The former boundary required every II delegation link to be Governance-targeted. Genuine pinned II returns an unscoped app-origin parent, so the old positive flow could never authenticate. The corrected path is II app-origin parent -> SDK-signed Governance-only child -> direct browser-to-NNS operations.

Dendrite auth.js now uses the installed @icp-sdk/auth 7.1.0 and @icp-sdk/core 5.4.0 mechanisms: a fresh nonextractable bootstrap key, genuine II authentication, a separate fresh nonextractable ECDSA transaction key, DelegationChain.create with previous and exactly the Governance target, and DelegationIdentity.fromDelegation. Existing root public key and parent signatures are retained. The final identity principal must equal the original II app principal. Raw unrestricted bootstrap input is refused by the transaction actor before agent creation. No fabricated session, replacement root, edited signed delegation, signing proxy or broader transaction identity is used.

## 3. Custody, scope and expiry

Every link must be structurally valid, live, within the protocol's 20-link bound, and compatible with Governance. Omitted ancestor targets are permitted; empty targets deny; an excluding ancestor cannot be bypassed. The final child must have exactly one target, rrkah-fqaaa-aaaaa-aaaaq-cai. Unsupported fields/restrictions, malformed principals/expiries, invalid key/signature byte bounds, cyclic/repeated keys and wrong key/principal binding fail closed. DER and signature acceptance are independently enforced by the real replica. Child expiry is bounded by every parent and the existing eight-hour session cap.

The supplied ephemeral bootstrap identity and credential-discarding adapter prevent SDK credential restoration and persistence. The SDK's separate non-secret localStorage expiry marker is explicitly cleared using supported signOut before publishing the child; no unrelated origin storage or II passkey is erased. The broader client and signer references are released. Full reload requires authentication again. Generation fences, idle handling, cancellation, route/sign-out invalidation and a final post-await dispatch check prevent stale publication or submission.

The pinned SDK IdleManager.exit also invokes idle callbacks during manual teardown. Clearing its reference before exit and guarding the callback prevents recursive sign-out; regression 'actual SDK idle teardown never recursively signs out or reloads on manual sign-out' uses the actual SDK manager. Dispatch-time session validity is checked again after awaited preparation, rather than relying on entry-time validation.

Structural checks do not verify every signature: the SDK signs and the real replica verifies. Hostile same-origin JavaScript while bootstrap authority is accessible remains a threat. Local sign-out removes local authority; it does not revoke accepted requests or already issued delegations network-wide.

## 4. Actual II and replica scope proof

Fresh real-II scenario passed in 70.8187856 host seconds. Public app principal u4t46-mdtj5-wueo7-hgp4e-dnfy4-kucbv-x5exx-4lbdl-4i47t-k2ykh-3ae is preserved across the two-link chain. Governance read succeeded. A suitable control identity successfully called the harmless non-Governance destination, while the restricted child's same request received replica HTTP 400 with a delegation/target diagnostic. Raw bootstrap transaction input was rejected. All six malformed/expired/excluding-parent probes were also rejected by the replica. Parent expiry 1793903068709220482 and child expiry 1793903068709000000 (nanoseconds) demonstrate the child does not outlive its parent. No nonlocal origin was requested.

Named regression: real_ii_scoped_child_is_enforced_by_replica. Actual passkey authentication uses pinned real II with dummy authentication disabled. A successful control call to the same working non-Governance canister/method excludes missing-method or stopped-canister false positives. The restricted child's matching request is rejected by the replica for delegation/target scope. Expired parent/child, wrong key, invalid DER, self-delegation and excluding-ancestor probes are separately rejected. Only bounded public outcomes and scope/expiry summaries are retained, never reusable credentials or ingress envelopes.

## 5. Manager metadata and replicated reads

Actual pinned Governance list_neurons omits known_neuron_data while scalar get_neuron_info returns registered metadata. The isolated historical helper fails the positive scalar-registration regression. transaction.js now uses bounded, deduplicated exact-ID configuration reads and fresh scalar registration reads, with concurrency four and the existing 300-second consistency bound. Both preparePrimaryFollow and prepareStandardSetFollowing use this path; final submission recollects evidence. Missing registration remains a failure, and unavailable/malformed/private/wrong-ID/duplicate/unexpected/skewed data cannot authorize an operation. The anonymous analysis cache is not transaction authority.

The narrow consumer Candid adds get_neuron_info(nat64), NeuronInfo {id; retrieved_at_timestamp_seconds; known_neuron_data; visibility}, its Ok/Err result and the corresponding typed neuron_infos pairs. FullNeuron gains visibility. The exact scalar fields are id : opt NeuronId, retrieved_at_timestamp_seconds : nat64, known_neuron_data : opt KnownNeuronData, and visibility : opt int32; the response is variant { Ok : NeuronInfo; Err : GovernanceError }. List neuron_infos becomes vec record { nat64; NeuronInfo }. The established generator transforms all five transaction read methods to replicated update modes []; it does not expose a new application-canister method. Public Dendrite and D-QUORUM Candid remain unchanged.

Exact native regression names include: 'replicated manager preparation uses scalar registration despite omitted list metadata; old helper negative control'; 'manager metadata missing unavailable private wrong-ID malformed and skew remain distinct failures'; 'manager batch rejects duplicates unexpected IDs missing configurations and private records'. The real-browser management test executes the repaired path against real list/scalar behavior.

## 6. Browser majority and independent management oracle

Fresh browser management/economic scenario passed in 337.434111926 host seconds. Four independent II principals, in manager order 11 controller, 12 controller, 13 hotkey and initially unauthorized 21 controller:
ft5o4-duw65-r6vxp-4cyov-6bpgz-6c3dc-zcjbx-5rnm6-owz63-hgq4x-dqe
sgars-6hv2l-u6wgb-w2tvw-sltwo-nbf3v-um2p4-aximx-mot3t-ue5gk-eae
wpuul-hn7cu-xqwjt-mdgt6-i7qrj-4k3jk-gfzex-jgzfr-b2bjn-7mulk-uae
kb3ke-jr7pr-un4ym-rvczs-gvdsz-nxd36-3begc-6ekep-2zpku-batjp-fqe
Local proposal 1: proposer 11, target 100, topic 1; original electorate [11,12,13,14,15]. Actual recorded votes are Yes from 11/12/13 and Unspecified from 14/15, each voting power 1. Status Executed and resulting management following [11,12,13,21,22] were independently read from Governance. The other authorized browsers, rather than the coordinator, cast the deciding votes.

The positive test uses four independently authenticated II principals and separate browser contexts. Manager 11 proposes and receives Governance's automatic Yes; managers 12 and 13 cast genuine signed browser ballots to reach the original three-of-five quorum, electorate 11–15. Manager 13 uses its actual hotkey. Neuron 21 initially has no authority and later gains it through the proposal. The coordinator does not supply a deciding manager sender.

Independent Governance reads verify the proposal action, target, proposer, original electorate, individual ballots, execution and resulting following [11,12,13,21,22]. Ballot visibility is resolved through the union of authorized readbacks, not an assumption that every public query exposes every ballot. Existing committed delegates 11–13 remain managers, so the intended result remains compliant. The browser reloads the actual result.

## 7. One causally connected economic world

Same-instance local maturity proposal 3 was approved through the actual Dendrite manager-vote controls by managers 11/12, alongside owned proposer 300's automatic vote. Exact marker: D-QUORUM pgzwa-ud777-77776-aaaba-cai operation 1; fingerprint: e2690f436dea27c4c47bc8067d27e8a1c1b88fb6de48462b24414440499d0646. Authoritative Ledger mint block 37 credits 5,000,000,000 e8s. Confirmed first payments to neurons 100/106 are blocks 38/39, net 2,499,990,000 e8s each, with fee 10,000 each. Later payments to 112/118 are blocks 41/42, net 990,000 each, fee 10,000 each. These divisible fixture pots leave zero dust; accounting property tests separately cover remainder conservation. Exact attempt numbers, memos, creation times, staking subaccounts and confirmed block evidence are retained, without substituting manager wallets. First payment snapshots are financially Confirmed with refresh Pending; final maintenance and financial liability counts are both zero.

World resource record: 1,469,534 virtual seconds, 337.293243575 workload host seconds; 56,572,234,929 cycles consumed from the actual initial balance; 15_564_026 bytes canister memory; 11,546 serialized stable bytes and 129 physical stable pages. Full-state checkpoints: maximum 21,744,780 instructions, total 15,564,807,951, 741 writes. This is a measured local fixture, not a universal mainnet bound. All browser requests quiesce before the long virtual-time advance; later backend observations remain causally connected to this same world, without claiming later browser actions.

One PocketIC instance contains real pinned Governance/Ledger, real II, actual empty controllerless candidate controllers, Dendrite and production D-QUORUM. After browser management executes, D-QUORUM's own natural-timer worker discovers and validates that resulting configuration, computes independently checked direct proportional scores, and applies the real following roster on topics 4 and 7. The 201 -> 202 -> 106 chain contributes only 202's direct VP to 106. The two selected neurons appear on both topics but produce exactly two payment obligations per pot.

Owned proposer 300 submits the exact 100% DisburseMaturity management proposal for 4713806069430754115 with explicit automation-default-account destination. Genuine signed browser approvals from managers 11/12, plus proposer's automatic ballot, reach quorum. Manager-change submission, deciding manager ballots and maturity-approval ballots all use the actual Dendrite controls. The automation creates the harvesting proposal; managers select their actual neurons and review/vote on that exact proposal through the existing manager-vote UI. No test-only signing client, fabricated session or coordinator-supplied deciding ballot is used in this journey. Browser sessions close before long deterministic time advancement. The same coordinator observes pending disbursement, actual finalisation and mint, then exact Ledger staking payments, fees, dust, bindings and independent cache maintenance. A changed-support weekly round applies the new roster and a later funded daily-admission cycle pays it without repeating old obligations. Initial maturity is explicitly seeded; the separate connected_real_maturity_rewards_and_later_harvest case proves actual voting-reward accrual, another distinct executed harvest and payments to the changed roster. Terminal maturity recovery does not invent attribution of a particular unrelated mint.

## 8. Adversarial and upgrade evidence

Real-II popup closure and SDK timeout cleanup, an actual wrong local provider origin and an actually unauthorized II user, actual replica expiry/scope rejection, route/sign-out during held preparation, and coordinator-prepared real manager hotkey removal before final preflight are covered. The application-origin allowlist also has native frontend regressions; these are not claimed as final production-origin II validation. A signed dispatch held after preflight while actual authority is revoked receives genuine Governance rejection. A separately labelled scripted lost HTTP reply yields one submitted ingress identity and one actual open proposal, an unresolved UI, no duplicate activation and no automatic resubmission after reload.

A deliberately incompatible verifier rejects old-frontend final preflight; restoring a compatible verifier with changed local assets preserves the authenticated principal. Later automation and payouts proceed independently. Anonymous qualification uses the actual compiled local application at five viewports, real query/controller certificate validation, keyboard/copy/filter/overflow and no-unintended-update assertions. A test-only post-certification response-body mutation returns 200 directly but the gateway rejects it with a response verification error; restoring healthy code restores 200. No certificate, query signature, delegation validation or freshness check is disabled.

Historical V1 and V2 genuine checkpoints, V3 upgrades, ambiguous financial/proposal states, long outages, independent maintenance, refusal cooldowns and typed error-14 maturity lock-barrier recovery remain mandatory and passed in the final run. The known RC3 barrier negative control and new isolated historical auth/metadata helper failures remain separately retained. Expected negative-control failures are not counted as passing behavioural executions. Scripted faults are labelled separately from real protocol permission rules.

## 9. Security, dependencies and provenance

Both locked-workspace security gates, production dependency isolation and CycloneDX SBOM generation passed. Fresh root RustSec reports zero vulnerabilities; four specific inherited unmaintained notices remain documented. Fresh production-only npm audit passes with zero vulnerabilities. Full-development npm audit retains eight moderate affected package chains, zero high/critical findings and two distinct advisories; neither advisory is described as patched. OSV and dependency-policy gates pass with the four documented Rust notices and two narrowly validated optional native-build applicability exclusions. Exact paths, raw findings, dependency inventory and positive module-load rejection control are retained.

All 14 production npm package versions and integrity values are unchanged, including auth 7.1.0/core 5.4.0. Seventy development lockfile entries changed through the focused Puppeteer 25.16.0, CycloneDX 6.0.1 and compatible patch updates, including brace-expansion 5.0.12. Chromium is 156.0.8078.47, pinned image sha256:956a72e3d523c76606efaad23392fbe33950370189f749715222c7427f57392b; executable SHA-256 230f0db8c5086182f46c59c867c0d461eb525d6552dfad226ea6b4d9ec249db2. No browser/auth framework migration or production dependency was added.

Raw full-development findings remain visible. GHSA-3g3m-2fjr-6pw4 (glob 10.5.0) and GHSA-g3hv-75wg-m249 (minimatch 9.0.9) occur only in CycloneDX -> optional libxmljs2 -> node-gyp -> make-fetch-happen -> cacache. Exact dependency graph/version checks and a positive module-load trap prove that guarded JSON SBOM generation/schema validation does not load those packages. Installation and execution disable scripts. These are specific applicability exclusions expiring 2026-12-04, not patched vulnerabilities, severity downgrades or blanket suppressions. Four inherited Rust unmaintained notices retain specific documented reasons. Both workspace SBOMs and raw scans are included.

Every new browser page, including the II popup before its first request, is paused under early CDP target/network controls; local-only guards and Chromium DNS denial supplement interception. No test contacts a mainnet API host. Test-only coordination carries public principals, IDs and bounded observations, never passkey secrets, session cookies, private keys or usable delegations.

## 10. Historical and current release identities

Historical undeployed bound Dendrite candidate: 74f6090a729fa467908985c8ef8adc415e237fdf2e6eda8fa7d6a68a0aade972. Initial integration's two agreeing builds: a11efe497e802c6f93b54540043b73505c2271b46219785d2dd90657146933af. Latest unchanged historical production record: installed predecessor 5b20aa2aa7b3d3b6706698bbd75dfaf6775a96d27c744fd230e7fd709ba448eb, source 694e1c2a47f3a2fc238b9b3799748610ca22b274, recorded verification 2026-07-29T20:18:12Z. No current live-state query was made.

The saved 74f release uses app.b621ba522c99801f/styles.1ebbbb16b0d22189, while imported b9/initial integration use app.ddb8548b03894194/styles.008b98904943b9ca. Current scoped-auth production assets use app.eb36d22b3c1a1093 and the unchanged 008b CSS. Historical/current build configuration files agree, but these actual frontend build inputs differ. The missing historical build/source binding is not invented. The initial agreeing builds were reproducible; comparison to an older bound artifact was a distinct identity discrepancy, not a failed two-build reproducibility result.

The new undeployed candidate is bound in dendrite/icp.yaml only after matching clean build evidence; the final source-stable run and original local no-network release verifier recheck that binding. Historical production records remain unchanged.

## 11. Final acceptance counts, coverage, timing and CI

All seventeen required existing local CI lanes and integrated_readiness passed on the unchanged clean source. The actual record contains 182 passed xtask gate records: 54 behavioural and 128 validator records. Root formatting and warnings-denied Clippy are two further successfully captured commands, matching the unit CI job; nested formatting/Clippy remain inside Dendrite's preserved check gate. Readiness checked 13 integrated requirements and 78 component requirements. Its final status is complete/qualified with zero missing evidence or failed requirements.

Observed passing test executions: 922; distinct passing printed names: 353. Component-qualified distinct cases are 378 (D-QUORUM 134, Dendrite Rust 65, frontend 170, Python runner 9); 25 byte-identical shared evaluator cases are deliberately collapsed in the 353 substantive-name count. Discovery and validators do not count as test executions. All 65 deliberately ignored D-QUORUM cases were explicitly selected; executed behavioural gates report zero failures and zero ignored tests.

Execution classifications: 321 native/property/Python executions, 510 frontend component executions, 60 recording-fixture PocketIC executions, 25 real pinned-protocol executions, and six real-browser case executions. These are disjoint accounting categories, not a claim that fault injection cannot occur inside a real-protocol case. Dendrite's three PocketIC fixtures execute twice and are included in the recording-fixture category, not native coverage. Repeated coverage/canonical runs do not create new unique cases. Expected historical negative-control failures remain separately labelled validators.

Lane | Passing executions | Gate records
--- | --- | ---
unit | 69 | 2
mock | 13 | 10
hardening | 26 | 10
protocol | 15 | 25
production | 1 | 11
scale | 2 | 10
capacity | 3 | 13
coverage | 69 | 2
security | 0 | 3
integration_inventory | 9 | 7
component_dendrite | 690 | 13
system_protocol | 2 | 11
system_browser | 6 | 15
component_dendrite_canonical | 0 | 12
reproducible | 0 | 1
canonical_artifact | 15 | 25
system_protocol_canonical | 2 | 12


Fresh capacity results; all use production constants, natural timers, discovery retries, latency and upgrade:

Fixture | Seats | Contenders / score entries | Selection / total virtual s | Validation-to-readback s | Workload host s
--- | --- | --- | --- | --- | ---
20 recipients | 5 | 40 / 640 | 454 / 1074 | 69 | 75.408001487
80 recipients | 5 | 160 / 2560 | 1374 / 3814 | 199 | 389.193853737
240 prepared recipients | 15 | 480 / 7680 | 5595 / 12865 | 829 | 2622.521470353
240 canonical recipients | 15 | 480 / 7680 | 5595 / 12865 | 829 | 2422.294429320

Exact resource/call/checkpoint measurements (Ledger counters are balance/fee/history/transfers):

20: cycles 97,337,472,397; heap 3,932,160 bytes; stable snapshot 178,541 bytes / 129 physical pages; maximum checkpoint 48,397,563 instructions, total 68,875,816,627, 1,687 writes. Governance replies / public-neuron reads 194 / 148; Ledger 47/21/21/20. Oldest destination age at plan detection 10 s; plan detection offset from applied roster 20 s. Zero remaining liabilities, pending refreshes or abandoned refreshes.

80: cycles 728,205,681,231; heap 11,534,336 bytes; stable snapshot 655,722 bytes / 129 physical pages; maximum checkpoint 124,417,534 instructions, total 621,265,527,492, 6,282 writes. Governance replies / public-neuron reads 702 / 563; Ledger 169/81/81/80. Oldest destination age at plan detection 30 s; plan detection offset from applied roster 40 s. Zero remaining liabilities, pending refreshes or abandoned refreshes.

240 prepared: cycles 6,236,683,553,912; heap 34,275,328 bytes; stable snapshot 1,962,913 bytes / 129 physical pages; maximum checkpoint 327,128,002 instructions, total 5,625,455,364,590, 22,172 writes. Governance replies / public-neuron reads 2173 / 1789; Ledger 494/241/241/240. Oldest destination age at plan detection 60 s; plan detection offset from applied roster 70 s. Zero remaining liabilities, pending refreshes or abandoned refreshes.

240 canonical: cycles 6,236,683,208,885; heap 34,275,328 bytes; stable snapshot 1,962,913 bytes / 129 physical pages; maximum checkpoint 327,128,002 instructions, total 5,625,455,364,590, 22,172 writes. Governance replies / public-neuron reads 2173 / 1789; Ledger 494/241/241/240. Oldest destination age at plan detection 60 s; plan detection offset from applied roster 70 s. Zero remaining liabilities, pending refreshes or abandoned refreshes.

Manager counts range from five to fifteen; the dense fixtures include shared-manager contenders and a conclusively invalid contender with more than thirty dependencies. The separate 10,000-index scale fixtures passed in 91.485517976 and 55.108702625 workload host seconds (zero and one compliant candidate respectively); they are not claimed as dense qualification. Prepared and canonical maximum virtual/call/instruction counts agree. Host wall times are provisioning observations, not guaranteed mainnet performance.

Fresh Node frontend coverage: 95.87% lines / 87.37% branches / 93.70% functions. Changed authentication module: 98.73 / 88.57 / 95.83; transaction module: 99.49 / 89.02 / 100; anonymous actor.js: 100 / 92 / 87.50; authenticated nns-actor.js: 100 / 80 / 66.67. Uncovered auth lines 33-34 are the anonymous-identity rejection guard; transaction lines 307-308 and 495-496 concern unchanged reward-receiver bounds and malformed-controller handling. These counters are not claimed to prove every asynchronous browser interleaving; actual browser/replica cases provide separate evidence.

Root native line coverage: policy 88.02%, accounting 96.56%, clients 41.14%, canister transitions 35.74%, stable migration 95.24%; unchanged vendored evaluator 98.79%, reported separately. Native payout lifecycle is 0% and maturity lifecycle 7.23%: timer/await/dispatch paths execute inside PocketIC Wasm, and those runs do not add native coverage credit. Dendrite native report: server lib 88.79%, assets 87.97%, rate limits 100%, client library 67.33%, pure evaluator lib 99.73%; full per-file and stable/nightly branch tables are retained in coverage logs. Dendrite's 65 Rust cases include 62 native cases and three PocketIC recording-fixture cases; they are not all described as native unit tests. Existing coverage gates passed, without imposing a new aggregate threshold or inflating changed-code coverage with the shared evaluator.

The journey cycle metric now subtracts the actual initial canister balance, including PocketIC creation credit, rather than an assumed fixture top-up; this corrects a measurement underflow without changing production accounting. Local anonymous assertions check the current fixture verdict and neuron ID.

Measurement limit: real canister internal call totals are not instrumented. Public browser request paths/counts and exact recording-fixture Governance/Ledger counters are retained separately; no universal real-network call or performance bound is claimed.

The integrated verdict requires named executed tests, hash-verified logs, every mandatory suite, stable clean source and actual positive browser management. Nine pure runner regressions cover all-pass, required failure, missing log, changed source, absent positive browser, matrix-only edits, the acyclic CI DAG, refusal to restart a dead server within a lane, and idempotent cleanup of only owned handles. A failed attempt stays unqualified even if later independent lanes pass. Historical initial failed genuine-II authentication and successful safety refusal are preserved. The first complete prebinding source 29bbe69609b4fa5ecb63f36f0e61314ee43615a5 remained unqualified: 177 gates/175 pass/two fail, one canonical PocketIC request timeout and the historical deployment binding. Its exact fresh-instance diagnostic passed without increasing the SDK timeout; the original timeout's cause remains unproven. Neither prior results nor the diagnostic certify this final source.

The subsequent f934d2a6812721b24f3dba688ee13ddb044d6cad attempt passed the complete D-QUORUM component and both component build comparisons, but ended unqualified: 175 gate records, 171 passing and four failing; 344 unique passing printed names, 908 passing executions and four failed executions. Three frontend-invoking gates failed the same stale historical-hash assertion. The owned fixture server then exited during Governance installation, producing an incomplete HTTP response; browser and canonical-pair lanes were unavailable. The exit cause is unproven. Inspection also found the deployment guard still pinned the historical hash. Both current candidate constants are now aligned, with a strict regression requiring the guard and icp.yaml to match the exact intended candidate. An isolated old-guard negative control fails; the corrected pair passes. The runner now closes only its owned server after a completed top-level lane, starts a fresh owned server for a later independent lane, retains distinct generation logs, and reports unexpected exit status. It never restarts within a case or combines worlds; this follows the isolation already provided by separate hosted jobs. Both ownership regressions and a real two-empty-server lifecycle probe passed. This earlier attempt remains unqualified and is retained separately. The reported final counts and hashes come only from the final required-lane campaign, never a union of earlier attempts.

A monolithic attempt on 9fbc41ca135c996bfad3d1716ec2e10a587e989c also remains unqualified: 102 gate records, 101 passing and one failing; 824 passing executions and one failed execution, with 342 distinct passing printed names. The typed-error-14 real-protocol case timed out during Governance installation after 7,856.26 host seconds. Later independent Dendrite, shared protocol, browser and Dendrite canonical lanes passed, but the root remainder never ran and the canonical pair correctly rejected the stale root manifest. The cause of the installation timeout is unproven. This failed attempt is archived separately.

Final qualification uses the 17 existing required local CI-lane commands, each in its own process, followed by the existing integrated_readiness aggregator on the same unchanged source. This is the checked-in CI execution topology, not a new runner or weaker matrix. The root unit invocation also runs formatting and warnings-denied Clippy, as its CI job does. Each actual lane receipt, source fingerprint and log hash is retained; the readiness verdict requires all 17 receipts and named positive browser/behavioural evidence. This does not claim a successful monolithic integrated_acceptance exit or a hosted CI execution.

Remote CI is UNRUN. No push or workflow dispatch occurred. The root workflow is read-only and retains every mandatory component/capacity/canonical lane, with corrected evidence artifact copying and measured job limits. Its push trigger covers main, not this integration branch. Workflow source is not hosted execution or branch-protection proof. Operators must observe all 12 named checks after separately authorized publication/PR/dispatch and configure branch protection separately.

## 12. Canonical pair, local artifact and review bundle

Fresh canonical output identities (SHA-256):

D-QUORUM Wasm: 07b1b54ba965303a00e072d3d9f4cc717dc27b10250b0e51cf37d6109919c3a8
D-QUORUM Candid: ce15b307ce8b19b09df0d9abb723828099c87b52fdc2aa012d67c9f327940ad0
D-QUORUM manifest: 32bcbfec4497943c7dbb88afe51ca336035d28cc8d9c2acda2ca06d16f6c2299
Dendrite Wasm: 5ff6e1d3c79fa310f45d9f314ebb578d7f5b71abed15cd7f236fa5b7b122cf8d
Dendrite extracted Candid: 905c2919fe5fb18d0cc1ee09719b739a803fabbe8d7dc45cf349fa60ebb9b55f
Dendrite manifest: 7d629459544cf35d3c0496488ad525d1f1d78bf656273f45f3c171f504846cff
Tested-pair manifest: 054e8c623dd405b32cce6b7e3e64a69bf392e4ee8cf6d03496380b559a54856f
Local-browser journey Wasm: 1e8f1fae8fbc86e9b34d0f5b48f731a9892fdf3e9ce097ecc0ba42deadf55057
Root CycloneDX SBOM: c5e18037671fcd6b56701d79f1ceccf750e2a5fa2512a45ae712495883dc94ce
Dendrite frontend CycloneDX SBOM: bf0847ded2a4689bf6c770285457a3cbf1b1f1c64dd8f0f185c6a6d7901df7e5

D-QUORUM has two identical canonical output files; Dendrite has ten. Each pair was built twice with forced-clean/no-cache Docker builds. Build command capture times: D-QUORUM 180.260026191 s, Dendrite 168.286612041 s. Rust 1.94.1, Node 24.15.0/npm 11.12.1, linux/amd64 and SOURCE_DATE_EPOCH=0 are pinned; the manifests retain full image/configuration/source identities. Canonical Dendrite uses hp4av-oiaaa-aaaar-qcaha-cai, its https icp0.io derivation origin, https://icp-api.io, https://id.ai/authorize and root-key fetching false.

The local-browser delta is recorded verbatim: local mode; API http://127.0.0.1:4943; canister pi33i-pt777-77776-aaaaa-cai; derivation origin http://pi33i-pt777-77776-aaaaa-cai.localhost:4943; II http://id.ai.localhost:4943/authorize; alternative origins []; local root-key fetching true. Additional local-only scope/evidence/fault probes and upgrade/corrupt-HTTP negative controls are explicitly labelled and excluded from canonical assets. This artifact is not production-byte-identical.

NNS Governance/Ledger/archive runtime pin: 83f29e0803496ba6aaea3d6b43f6c6bebea12dd9. PocketIC 15.0.0 server source: 8258578e6212d445aeeafb71c1160fa4ea356d60; executable SHA-256 29472ea4433b30a280676c4e22e369d79d5ba6ee1b4d48bab32ebe7d0ad2b4bb. II release-2026-06-20 backend module SHA-256 83b3b13186ec2501dbd58ef23f8df22921d06b3082541154b0d891217c94805a, frontend 4082ae79ce441a5b4a23e0da9e5804d26fa3b3391654b4c0b5a2a96d43458f27; dummy authentication is disabled in both. The backend is rdmx6-jaaaa-aaaaa-aaadq-cai and the local II frontend uqzsh-gqaaa-aaaaq-qaada-cai. Captcha is disabled only in this synthetic fixture, while actual WebAuthn proof is required. Compressed/uncompressed digests and source references remain in protocol-pins.json. Pinned evaluator/upstream provenance remains d55a0f4d4edfabe49d8fd543aff473084cb741f2 and nns-dendrite/1.1-draft. No claim is made that this runtime pin is the currently deployed mainnet revision.

Both components were built twice from clean no-cache canonical Docker builds; exact file sets and bytes match independently for each component. Canonical backend-pair scenarios repeat with the exact production Wasms. The browser uses a separately built, source-bound local artifact with explicitly recorded local API/II/origin/root-trust configuration; it is not described as production-byte-identical or modified in transit. Each component retains its own source/configuration/artifact manifest; the integration manifest additionally binds the tested pair, protocol pins and local delta.

Review output: dist/review-scoped-browser/d-quorum-dendrite-review.tar.gz. Its adjacent SHA256SUMS and review-bundle-validation.json are external receipts, containing the archive's SHA-256, byte size, total member count and regular-file count, source and exact documentation handover. An archive cannot contain its own checksum receipt; the final uncommitted results.txt handover appends those actual external values after assembly. The bundle reuses the existing deterministic archive functions, verifies every member against SHA256SUMS, verifies all report links, and compares two normalized archives byte-for-byte.

The review archive contains the exact qualified Git archive, final handover documentation, both canonical output comparison sets, pair/component manifests, full acceptance logs and requirement matrices, bounded browser evidence, actual proposal/Ledger oracles, historical migration/negative controls, capacity, coverage, security/SBOM, pins and reproducibility. The same normalized archive is generated twice byte-identically; every member checksum and report reference is verified. The adjacent verification receipt carries the archive's external checksum. No credential material or unrelated operator results prefix is bundled.

## 13. Scope and compatibility audit

D-QUORUM production Rust, dependencies/lockfile, public Candid, stable V3, historical migrations, scoring, voting eligibility, Dendrite evaluator, manager-disjoint selection, seat policy, accounting, retry identities, maintenance/cadence, maturity proof and authority changes: NONE. Dendrite Rust backend, public server methods/Candid, persistent state, pinned Standard/evaluator and economic changes: NONE. New production canisters, production dependencies, administrator controls, signing proxy, generic framework and roster override: NONE.

Necessary production changes: the existing Dendrite auth/session implementation, actor scope check, dispatch-time session recheck, fresh manager metadata collection, exported existing pure validator and narrow generated Governance consumer read types. Generated frontend assets and the current undeployed deployment hash are refreshed accordingly. The existing guarded deployment script's fixed hash is synchronized with icp.yaml and its strict release regression; its lifecycle behavior and authority checks are unchanged, and it was never executed against a real mainnet CLI.

Test-only additions: five small browser helpers (probe build, early local network guard, scoped signing, held/lost mutation fault, public evidence), expanded existing PocketIC/browser fixtures, nine pure verdict/ownership/DAG regressions, two isolated historical helper negative controls, an isolated old-release-guard negative control, and the narrow tooling-audit applicability validator. Existing xtask/CI/evidence machinery is extended for inventories, named evidence validation, independent Dendrite manifests and readiness aggregation. New test source modules are tests/browser/{build-scope-probe.mjs,local-network-guard.mjs,mutation-fault-probe.js,public-evidence-probe.js,scoped-signing-probe.js}, frontend manager-metadata.test.js, tests/system/test_qualification.py and tools/scripts/check-tooling-audit.py under Dendrite. The regenerated app.eb36d22b3c1a1093.js replaces the previous generated bundle; the initial failed qualification is preserved in docs/releases/integration-initial-qualification.md. No new production source module is added. New ephemeral JS helper exports and the NeuronInfo consumer wire type support only scoped signing and fresh metadata; they are not persistent state or canister methods. Credential/operator-file exclusions protect both Docker build contexts. No competing runner, production debug method, persistent recovery mechanism or frontend redesign was introduced.

## 14. Remaining operator-only work

Retain the complete checksummed bundle, individual canonical artifacts/manifests and comparison sets. Publication requires a separately authorized push; observe the actual root CI jobs and enforce branch protection. Independently verify current real-network Governance/economics compatibility, production origin and II derivation/delegation behavior, and a separately approved controlled management transaction. Review exact canister/controller/hotkey/proposer bindings, deployment/upgrade plan, cycles, separate bootstrap/reward funding and ObserveOnly-to-live activation approvals. Never reinstall a funded or active production canister. Local II proves the isolated pinned contract, not the final production origin. No production operator gate is marked complete by this qualification.

## 15. Final worktree and safety

The qualified source was clean throughout all required lane executions. The final documentation-only handover is committed locally; the worktree is clean apart from preserved ignored operator/generated files. The original sibling remains clean and unchanged. The original first 41,086 bytes of results.txt retain SHA-256 a0c705d0f68551a2557071248bf817bd937c88c9be2b61df48df3fdbc1625891; the requested report is appended without committing that file.

No push, mainnet deployment/upgrade/query from tests, real funding/staking/disbursement/proposal/ICP transfer, hotkey/controller change, production configuration write or live activation occurred. All protocol effects used isolated PocketIC and synthetic identities/assets. The original sibling repository and operator files are preserved; results.txt remains ignored and uncommitted.
