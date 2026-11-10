# Dendrite creation qualification — undeployed local candidate

The creation-completion corrections continuing source `102806f7ebdbe47becd91f603e9bff302a34dbdd` are **in progress and unqualified**. The historical 22-lane result below applies only to its explicitly pinned source `97343f8dbb714a0a12f90a474805518c83017184`; it is not evidence for the corrected implementation. New source-stable integrated acceptance, signed-browser completion and canonical repeat gates must pass before another release-evidence bundle is assembled.

Local result: **qualified through all 22 required local lanes and the existing readiness aggregator**. Qualified implementation source: `97343f8dbb714a0a12f90a474805518c83017184`. Documentation handover: the subsequent documentation-only commit, identified in Git and the adjacent review-bundle validation receipt. Hosted CI and mainnet acceptance remain unrun. No deployment or production write is part of this result.

Evidence: [22-lane capture](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/launcher.json), [readiness](../dist/evidence/integrated-readiness.json), [tested creation](../dist/evidence/tested-creation-manifest.json), [tested pair](../dist/integration-manifest.json), [unchanged core audit](../dist/creation-qualification/unchanged-core-97343f8dbb714a0a12f90a474805518c83017184.json). The deterministic review archive and its external checksum are under `dist/review-creation/97343f8dbb714a0a12f90a474805518c83017184/`; its validation receipt identifies the exact handover commit without a self-referential archive hash.

## 1. Starting point, history and source boundary

Starting HEAD was `c886700619ac353d32184f590cf76e966334c228`, on `integration/dendrite-system`, with a clean tracked worktree. Both the reviewed integrated handover `77bbb210ae9d2ec2ab5905d1ea5f4bb6a1f73a51` and prior qualified source `9fbc41ca135c996bfad3d1716ec2e10a587e989c` remain ancestors. Newer legitimate work and ignored operator files were preserved. There was no reset, history rewrite, re-import or modification of the historical sibling repository.

The implementation and final required executions are bound to one unchanged clean source, `97343f8dbb714a0a12f90a474805518c83017184` (Git tree `41455b46c8e105d72d36293ad37b584ca71781cf`). The lane capture verifies HEAD, every tracked file hash and clean status before and after each existing xtask command. Final documentation is a descendant changing documentation only; it is not represented as a newly tested binary revision. Both workspaces and lockfiles remain independent. Every IC runner uses `DFX_IDENTITY=codex_local`.

Logical local commits:

```text
47f7e90 Pin creation protocols and verify real provisioning deduplication and refunds
a24856a Correct not-for-profit explanations without changing compliance predicates
67d1e8f Add temporary per-neuron bootstrap and replica-verified provisioning scopes
60aa4f4 Bind bootstrap progress to durable intents and certified readiness
e432c13 Verify stopped bootstrap seals through replicated controller history
c11e3f4 Add reviewed browser creation and receipt-based finalisation workflow
237e8c0 Quiesce bootstrap recovery upgrades and validate replicated creation proofs
061f88e Extend integrated creation journeys and source-bound canonical qualification lanes
0ccee88 Preserve historical lane receipts during new local qualification
73a9fdc Keep execution-accounting fixture output separate from test receipts
b5c3579 Keep provisioning cleanup independent of the application idle singleton
b044d5f Verify registered topic metadata and await post-finalisation management controls
df351cd Retain ambiguous Governance external errors until original financial proof
0195738 Resume fixed-account recovery through fresh installed-controller bindings
4ee7957 Bind the real provisioning scope probe to its workflow cycles subaccount
c2e8320 Archive consolidated canonical source from the repository root
97343f8 Use one bounded loopback port across real II browser fixtures
```

The previous [scoped browser qualification](releases/scoped-browser-qualification.md) is retained as history, along with older release reports, production records and failed development attempts. Its original public review context is preserved separately with [3,677 file checksums verified](../dist/history/scoped-auth-9fbc41c-copy.json); historical links resolve there rather than into the new campaign. Earlier source-changing or interrupted qualification attempts are not counted toward this final result. The 0195738 campaign also retained a real scope-probe failure: its default cycles account did not match the supported workflow-subaccount burn verifier. The test fixture was corrected in 4ee7957; no production verification was relaxed. The 4ee7957 campaign completed 19 lanes, including its canonical 240-recipient repeat, then the Dendrite builder failed because Git applied the nested working-directory prefix twice. Its two dependent canonical lanes could not run. Commit c2e8320 fixes the archive working directory and extends the real-Git standalone/consolidated regression. The c2e8320 campaign passed the Dendrite/bootstrap and root two-build gates, then the initial II capability probe attempted hardcoded port 4943, which another workspace occupied. Commit 97343f8 makes both browser fixtures share the bounded configured port and passes it to II/Chromium; a focused real-II probe passes on 4944 without disturbing 4943. Final results were rerun rather than carried forward from earlier sources. On the final source, the first recoverable browser attempt lost its SDK heartbeat channel; the next attempt passed recoverable creation but the owned PocketIC server exited with SIGSEGV during production bootstrap installation. Both failed lane attempts and their public evidence are retained. Resumption verifies the same HEAD, tracked-file hashes, clean worktree and prior successful receipt/log checksums before retaining any same-source pass; failed lane results are replaced only by actual later executions, never waived.

## 2. Protocol contracts, route and exact pins

The supported positive route is browser P → P-owned deterministic ICP workflow subaccount → CMC conversion → P-owned Cycles Ledger workflow subaccount → Cycles Ledger `create_canister` with controllers exactly `[P]` → browser `install_code` of the checksum-bound raw bootstrap. It uses neither a shared factory nor provisional management creation. Stake funding is separate: an external wallet can pay Governance's staking account derived from C and the fixed creation nonce. No Dendrite or D-QUORUM service account receives creation funds.

The [operation/authority/recovery contract](../dendrite/docs/architecture.md) records exact argument types, callers, fees, deduplication/readback and irreversible effects. The [exact protocol/tool/artifact pins](../protocol-pins.json) and [locked frontend package integrity](../dendrite/package-lock.json) are part of the review source. Executable sources, Candid, compressed/raw artifacts and source-contract checksums are retained in the bundle. Source pins are local test provenance, not proof of the currently deployed mainnet revision.

| Component | Pin |
| --- | --- |
| IC Governance, ICP Ledger/archives, CMC | IC source `83f29e0803496ba6aaea3d6b43f6c6bebea12dd9` |
| Governance raw Wasm | `dbcf97ae8729a956521a0a928f1b1bcb93f6e9c0dafd0e42aa985588713b88c0` |
| ICP Ledger raw Wasm | `538fc204379c53f6cb9ddc70c11122a0a26f6a7a7a01a0a2a6c30c5d3c76ef4d` |
| CMC raw Wasm | `1473c16c544f3ee6b86449107c4118f336e648eed3146b60edd0a8e143e89d56` |
| Cycles Ledger | v1.1.0, source `58f1d01ce1e5e41e61005f8103cc7560e9d81cc2`; raw Wasm `a19eb3490ce67255ac6f4873f25b9f7d20abf78030f4782f8ee1b66f42cd2763` |
| ICP archive installed gzip / raw | `b0fb2c30b82d7517b0566d9de624caad1a58f54f57f2136bdfa298a7ae1d459e` / `a3e4e9f334fbcb93ccb168b5f5440edf2d2ac505388e5f16f8ebba6f82637cfd` |
| Standard | reviewed source `d55a0f4d4edfabe49d8fd543aff473084cb741f2`, 1.1-draft, 23 rules, fixed 63,115,200-second lock, three existing approved singleton defaults |
| PocketIC | 15.0.0, source `8258578e6212d445aeeafb71c1160fa4ea356d60`; exact executable hash in protocol pins |
| II and SDK | genuine pinned II 2026-06-20; `@icp-sdk/auth` 7.1.0, core 5.4.0; exact artifact and package integrity in manifests |

Current minimum stake, fees, conversion rate and network voting capabilities are read separately. Production preflight blocks an incompatible pinned protocol/policy combination before spending. A fresh claim's actual seven-day dissolve delay is used for the recoverable profile; it is not fabricated as unlocked. Production still requires the Standard's exact two-year non-dissolving delay. The executable Governance permits economic commands with `not_for_profit=false`; focused explanatory strings were corrected in both evaluator copies without changing any predicate, status or policy constant.

## 3. New component, API and dependency scope

One new deployable component type exists: [dendrite-bootstrap](../dendrite/canisters/bootstrap/README.md), a small Rust canister in the nested workspace. Every C binds exactly one P, plan/revision, creation identifier, nonce, profile, fixed recovery account and eventual T. The [separate bootstrap Candid](../dendrite/canisters/bootstrap/bootstrap.did) exposes three replicated owner-authenticated methods with bounded typed operations: `status`, `replace_plan`, `advance`. There is no arbitrary Governance-command, target-neuron, recipient, Wasm-upload, factory, signing-proxy or timer interface. Credentials are never forwarded to C. Its [production dependency list](../dendrite/canisters/bootstrap/Cargo.toml) is limited to the nested workspace’s candid, serde, sha2, ic-cdk, fixed-version ic-clients and shared dendrite-types; it adds no dependency on the root automation workspace.

Stable format 1 checkpoints bounded state and original operation identities before awaits. Tests retain plan/nonce/T and unknown outcomes through upgrades, reject corrupt/unsupported state and prevent stale completions from adopting a newer revision. A plan edit cannot erase dispatched work, change fixed ownership/account bindings or turn a test instance into a production finalisation authority. Sealed code refuses mutating work until a separately reviewed approved-code unseal.

The existing Dendrite verifier remains stateless. One additive update, `controller_observation(neuron_id)`, returns fixed Governance-derived C history/module/controller observations needed because browsers cannot ingress-call management `canister_info`. It accepts a neuron ID, not an arbitrary destination or command, has a separate bounded limiter and retains the old Candid compatibility check. Existing browsing, evaluator, metadata repair and management methods remain. A capability probe blocks creation against an unpaired old service before funding.

Build dependency is one-way: bootstrap → certified bootstrap bytes/manifest → frontend → Dendrite service Wasm. The browser verifies the exact certified raw asset before `install`, never accepts arbitrary Wasm and never uses `reinstall` to erase uncertain state. Raw Wasm digest and installed module hash are correctly distinguished from gzip packaging in protocol fixtures. D-QUORUM core source, interfaces, stable V3, historical migrations, selection and reward economics are unchanged. The [browser creation/recovery guide](../dendrite/docs/operations/creation.md) documents every phase and its custody boundary.

## 4. Identity, custody and real permission evidence

| Identity/phase | Authority |
| --- | --- |
| P | stable real-II application principal, preserved by every child delegation; not the ephemeral key's standalone principal and not assumed to equal the NNS dapp principal |
| C before teardown | sole canister controller `[P]`; P can replace its code through normal IC authority; C application commands independently authenticate actual caller P |
| T | Governance neuron controlled by C; zero target hotkeys throughout; management followees are the selected existing M neurons |
| Ordinary team signer | existing Governance-only child, unchanged pipeline and compliance preflight |
| Provisioning signer | separately consented memory-only named profiles: Ledger/CMC/Cycles Ledger funding; management plus exact C; exact C application calls; maximum 15 minutes, inherited target/expiry restrictions |
| Dendrite/D-QUORUM/developers | no controller, treasury, shared signer or stake custody |
| C after finalisation | no code, no canister controllers; its principal remains T's Governance controller; configured managers retain permitted proposal authority |

Real II/passkey browser identities and [replica scope evidence](../dist/evidence/browser-system/scoped-signing/scope-probe.json) establish allowed and denied calls. Funding and exact-C-only credentials cannot use management. Expired/wrong-target chains are rejected by the replica. Wrong-creator receipt/controller checks are additionally covered by the explicitly separate native/recording fault cases; those fixture senders are not counted as II credential proof. Management-target delegation does **not** constrain `canister_id`, method, amount or arbitrary arguments: the same P-owned second canister is manageable when the genuine controller check permits it. Exact reviews and sole-controller checks provide additional workflow safeguards; this is not claimed as argument-level cryptographic capability scoping.

Sign-out, route changes, cancellation generations and final post-await checks invalidate stale signers. No reusable delegation/private key is persisted in application storage or exported receipts. The ordinary application owns the SDK idle singleton; disposing one creation capability no longer reloads or tears down that session. Same-origin browser compromise and P's provisional code replacement authority remain explicit trust boundaries.

## 5. Funding, claim, configuration, registration and rehearsal

The complete signed-browser recoverable journey authenticates P, selects one real known manager, provisions C through CMC/Cycles Ledger, installs the approved bootstrap, funds the exact staking subaccount, claims T as C, verifies public visibility/topic-1 following and zero target hotkeys, and submits an executed normal manager proposal. The target stays NonCompliant, C stays solely controlled by P and irreversible finalisation is unavailable. The signed browser separately starts dissolution and returns unused workflow ICP, independently checked against Ledger effects. Its stake remains locked in that browser case; a separate real-protocol case advances the actual seven-day wait and proves fixed-account stake disbursement. The complete signed-browser disbursement-after-wait step is not claimed as run.

The production journey uses five genuine known managers and valid committed-topic delegates/defaults. It creates and funds C/T through the browser/bootstrap path rather than seeding the completed target. Reversible configuration/readbacks precede the separately reviewed long-lock increase. Fresh public Governance reads verify account/controller/stake, exact following, visibility, hotkeys, `not_for_profit=false`, non-dissolving lock and current voting power. Uncertain additive lock operations read back the current delay and never blindly add again.

Known-neuron registration uses an exact global `RegisterKnownNeuron` proposal through the existing Governance-only signer and separately selected eligible proposer. Actual adoption, execution and metadata/topic readback are required. Name collision, rejection, fee refusal, unavailable or adopted-but-unexecuted status cannot become registration success. Exported Candid supports an external authorised proposer; browsing submits nothing. Proposal text truthfully identifies the provisional controller.

Finalisation additionally requires an executed benign manager refresh proposal for exact T with current electorate and actual quorum. The pinned API filters ballots: C alone cannot see the full electorate. The authorised browser independently checks all readable manager ballots; this initial workflow blocks the long-lock commitment when P cannot read all selected manager ballots. That limitation is a creation safety gate, not a new Standard rule or proof of independent human ownership.

Actual hotkey permission tests show a target hotkey cannot substitute for controller setup authority, and neither positive journey adds one. The unchanged evaluator remains authoritative. Creation rehearsal reuses the existing Governance request builders and review UI under its own replicated, controller-authorised bootstrap reservation and exact-target preconditions. It does not weaken ordinary team-management compliance preflight or add a global non-compliant-management bypass.

## 6. Two-step finalisation and interruption

Production uses one policy: **register first, then finalise**. Test instances cannot seal or finalise. Fresh readiness proves exact C/T/P/plan/module binding, actual registration, managers/delegates/rehearsal, empty hotkeys, settled work, sufficient reserve and exported final receipt. The actual evaluator may show only CONTROL-002 (installed code) and CONTROL-003 (retained P controller) as precisely expected outstanding bootstrap conditions; arbitrary Fail, Indeterminate or update-required results block the action.

Seal reconciles dispatched work. C's replicated seal binds management `canister_info.total_num_changes`; ordinary application execution and stopping do not increment that history counter. An approved unseal upgrade changes it and invalidates old teardown approval. The pinned replica does not expose the assumed direct certified-data read-state path, so that unsupported path is not used as proof. Stop and fresh independent observations establish quiescence; removing code does not cancel a remote Governance call already dispatched.

First, a full-identity confirmation authorises `uninstall_code(C)`. Certified reads must prove module absence and controllers still exactly `[P]`; the checkpoint is exported. After a browser reload and genuine reauthentication, provenance and fresh chain reads resume with no bootstrap module call or automatic reinstall. A separate full-identity irreversible confirmation authorises `update_settings` with controllers explicitly `[]`. Certified absence/empty controllers and a fresh full report establish the resulting state. Only its observed Compliant verdict is displayed.

The real production browser then executes another genuine manager proposal through the existing normal UI. Old creator credentials cannot execute C code, reinstall or use controller-based neuron commands through C. The negative premature-controller-removal fixture demonstrates why code removal must come first. These management and NNS calls are not atomic; concurrent legitimate manager changes can invalidate a later report, and there is no promised rollback after controllers are removed.

## 7. Recovery and financial uncertainty limits

Before spending, cancellation is local. Later, preserve C and all original bindings; never delete a possibly funded controller to restart. ICP payment, CMC notify/refund, Cycles Ledger creation, installation, claim, configuration, registration and finalisation have separate reconciliation contracts. A lost reply, elapsed deduplication window or lower balance never authorises a replacement spend/create/claim. A duplicate without recoverable C remains Unknown. Real failed conversion/creation fixtures verify fee/refund block references rather than inferring success from balance movement.

Unused P-owned workflow ICP can return only to the plan-bound account with its own saved exact intent. Successfully converted or spent cycles are not ICP refunds. The seven-day test stake can separately start dissolution, wait the protocol delay and disburse to the fixed return account. A two-year production lock cannot be shortened or immediately refunded. A positive unrelated C-default-account ICP balance blocks teardown; no general payment endpoint silently spends it.

Only specifically audited pre-dispatch Governance error codes establish no execution. `External` (12), future/unknown or malformed responses retain the original financial effect. A real Ledger/Governance negative test produces code 12 with stale stake/cache and proves there is no second disbursement or unrelated-block acceptance. Recording tests also model committed transfer followed by an ambiguous error. An actual refusal without publicly provable outcome can require external investigation; the UI does not clear it merely to continue.

Receipts are strict bounded versioned untrusted JSON, containing public plans, original requests/references and transition evidence, never authority or secrets. Ordinary resume reauthenticates P and reconstructs current account/C/T bindings. Historical transition proof has an explicit 30-day verification window; current certificate freshness is unchanged. Missing/expired original provenance blocks full workflow/finalisation, and pruned proposal history, a lost dispatch grant or an expired creation deduplication response without C can remain unprovable.

An explicit recovery-only import supports an already claimed public T whose approved C still has exactly `[P]`. Before every recovery write it requires fresh certified code/controllers, owner-authenticated replicated plan state and exact public Governance C/T/staking-account binding. Only fixed-account recovery, actual waiting/dissolution and narrowly reviewed same-code checkpoint/unseal recovery are available. Provisioning, plan edits, registration, long-lock setup and teardown are blocked. This does not extend old certificate validity or promote a receipt checksum into authority. Missing code, wrong owner, mismatched plan/stake or unavailable binding fails closed. After uninstall, original historical teardown evidence is still required; no automatic code replacement occurs.

The recoverable browser test deliberately drops historical creation evidence, reloads, reauthenticates, enters recovery-only mode and proves the actual fixed-account unused-ICP Ledger return after fresh binding. Browser restart tests use application reloads and new real-II SDK sessions with a retained native virtual-passkey hardware window. They do not claim a physical cross-device migration or a separate Chrome-process restart. No fake session or substituted PocketIC sender is used for delegation permission proof.

## 8. Real protocol/browser evidence and independent oracles

The two host-build journeys have [separately preserved public evidence and module hashes](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/host-signed-browser-evidence/manifest.json). Each journey maintains one coherent Governance/Ledger/II history; cases use isolated local worlds, which can reuse deterministic canister principals.

| Signed host journey | P | C | T | Independently checked outcome |
| --- | --- | --- | --- | --- |
| creation-recoverable | `j2mjz-4tkwl-tn5lt-iejno-kdjww-ys5oz-qepan-d2qro-r6ob5-k6k6m-6qe` | `pp254-cl777-77776-aaaaq-cai` | `1741783069489904376` | NonCompliant; sole `[P]` retained; refresh proposal 1 Executed; unused-ICP return block 8 |
| creation-production | `y2chk-7k36q-c26c4-ooefz-by7fj-3owkv-olmnb-wy4xj-a5zo3-mytws-2qe` | `pp254-cl777-77776-aaaaq-cai` | `11434783037773080687` | Compliant; no module/controllers; registration 1, rehearsal 2, post-final manager proposal 3 Executed |

The separate [canonical signed production journey](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/canonical-signed-browser-evidence/manifest.json) passed with P `6qj27-cp2bs-jvkmj-hbglj-lgviy-s5oyp-pytjb-rf3t7-itrph-ovyja-nae`, C `pp254-cl777-77776-aaaaq-cai` and T `13522283460105066335`. Registration proposal 1, rehearsal 2 and post-final management proposal 3 executed. Independent chain observations confirmed absent code, empty controllers and a full Compliant report. This browser build installed the exact canonical raw bootstrap `fef1735bb08b92bad58ec761f199741fa459292b81864c219aff5442e7423265`; its local-origin Dendrite service Wasm is `89fc3f9de5955b20b84f30944a91436c4a96ac607d551f33f777e867ebd4d8aa`, deliberately distinct from canonical production-origin service bytes.

In these synthetic host journeys, each plan separately authorised a 100,000,000-e8s provisioning budget and 200,000,000-e8s stake. The CMC payment was 99,990,000 e8s plus the observed 10,000-e8s ICP fee; the runtime quote was 50,000 XDR permyriad per ICP. Cycles Ledger creation used 2,000,000,000,000 cycles with the current 100,000,000-cycle fee and a reviewed 100,000,000,000-cycle reserve. The unused P cycles balance was 2,999,300,000,000 cycles. The recoverable browser returned 399,990,000 e8s plus a 10,000-e8s return fee; its stake remained in T. The production browser left 400,000,000 e8s of P-owned workflow ICP visible for separately reviewed return. These are pinned synthetic observations, not hardcoded live economics or universal cost/refund promises.

Both creation browser profiles also passed a 390px viewport, actual 2x page scale, reduced-motion and keyboard-visible-focus check, with no horizontal overflow. The separate anonymous suite retains its five viewport/certification checks.

The six creation-native cases cover real provisioning/refunds/deduplication, recoverable claim/recovery, production registration/rehearsal/finalisation, premature controller removal, D-QUORUM discovery/reward integration and ambiguous External financial errors. Positive browser paths create C using the browser's real delegated Cycles Ledger call, claim T through C and remove controllers through P. Test coordinators install system fixtures/fund synthetic accounts and create manager fixtures; they do not substitute for those positive creation operations.

D-QUORUM discovers the newly created compliant target only on actually eligible topics. Direct public voting-eligible support and unchanged selection are checked against private, transitive and short-lock controls. The provisional/test target is not elected simply because Dendrite created it. A real reward transfer reaches the new target's actual Governance staking account. This dedicated creation-integration scenario uses a synthetic pre-funded reward pool; it is not claimed as new maturity accrual. The existing connected two-cycle real-maturity economic journey remains separately mandatory and passes on the same frozen source.

Recording faults, mocks and native/property tests are separately classified. Upgrade fault injection restores a captured pre-await stable checkpoint after the actual callback has drained, without rolling back remote effects; it is not represented as a real browser crash permission proof. Actual Ledger/Governance state, certified system properties and independently decoded proposals are the completion oracles, not wizard phase flags. Negative controls cover wrong stake destinations, duplicate claims, premature controller removal and unscoped provisioning input.

## 9. Regression, capacity, migrations, coverage and security

All 22 existing required lanes passed on the same unchanged clean source. Both root formatting/Clippy preflights passed. Counts below include repeated coverage/canonical executions; validator-only build lanes correctly have zero behavioral executions.

| Existing lane | Result | Passing executions | Gate records | Evidence |
| --- | --- | ---: | ---: | --- |
| `canonical_artifact` | Pass | 15 | 25 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/canonical_artifact/evidence/canonical_artifact-run.json) |
| `capacity` | Pass | 3 | 13 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/capacity/evidence/capacity-run.json) |
| `component_dendrite` | Pass | 962 | 13 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/component_dendrite/evidence/component_dendrite-run.json) |
| `component_dendrite_canonical` | Pass | 0 | 12 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/component_dendrite_canonical/evidence/component_dendrite_canonical-run.json) |
| `coverage` | Pass | 69 | 2 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/coverage/evidence/coverage-run.json) |
| `creation_browser` | Pass | 2 | 12 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/creation_browser/evidence/creation_browser-run.json) |
| `creation_canonical` | Pass | 2 | 12 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/creation_canonical/evidence/creation_canonical-run.json) |
| `creation_protocol` | Pass | 6 | 17 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/creation_protocol/evidence/creation_protocol-run.json) |
| `creation_pure` | Pass | 34 | 1 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/creation_pure/evidence/creation_pure-run.json) |
| `creation_recording` | Pass | 55 | 2 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/creation_recording/evidence/creation_recording-run.json) |
| `hardening` | Pass | 26 | 10 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/hardening/evidence/hardening-run.json) |
| `integration_inventory` | Pass | 17 | 7 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/integration_inventory/evidence/integration_inventory-run.json) |
| `mock` | Pass | 13 | 10 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/mock/evidence/mock-run.json) |
| `production` | Pass | 1 | 11 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/production/evidence/production-run.json) |
| `protocol` | Pass | 15 | 25 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/protocol/evidence/protocol-run.json) |
| `reproducible` | Pass | 0 | 1 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/reproducible/evidence/reproducible-run.json) |
| `scale` | Pass | 2 | 10 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/scale/evidence/scale-run.json) |
| `security` | Pass | 0 | 3 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/security/evidence/security-run.json) |
| `system_browser` | Pass | 6 | 16 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/system_browser/evidence/system_browser-run.json) |
| `system_protocol` | Pass | 2 | 11 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/system_protocol/evidence/system_protocol-run.json) |
| `system_protocol_canonical` | Pass | 2 | 12 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/system_protocol_canonical/evidence/system_protocol_canonical-run.json) |
| `unit` | Pass | 69 | 2 | [receipt](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/ci-evidence/unit/evidence/unit-run.json) |

The [execution accounting](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/execution-accounting.json) records **1301 passing behavioral executions**, 468 distinct printed passing names and 19 passed integrated requirement mappings. Identical printed names can collapse across shared packages; these figures are not a semantic independence claim. Discovery, expected-failing negative controls and validator-only commands are excluded from the execution total. The component matrix retains 78 requirement entries. Gate kinds: 67 behaviour, 160 validator. Native fixture senders and recording faults are not counted as genuine-II delegation proof.

Coverage is explicitly scoped. The unchanged root native LLVM run covers 4,225/7,046 lines (59.96%); policy is 88.02%, accounting 96.56%, stable migration 95.24% and the shared evaluator 98.79%. Native payout/async client counters are not represented as Wasm coverage. The nested workspace passes its preserved 85% floor at 85.61% lines; pure evaluator coverage is 98.79% lines, 98.77% regions and 95.51% branches. Frontend coverage is 95.11% lines, 85.56% branches and 90.73% functions.

For the new bootstrap specifically, native engine lines are 84.33%, model 91.59%, wire protocol 25.14% and IC entry points 0%; excluding its test module, the native source aggregate is 969/1,469 lines (65.96%). Those low entry/wire counters are not hidden by quoting the workspace total as component coverage: actual IC entry/wire effects run in the independent real-PocketIC/browser lanes and are not merged into native LLVM counts. See [bootstrap coverage scope](../dist/creation-qualification/final-97343f8dbb714a0a12f90a474805518c83017184/bootstrap-native-coverage-scope.json) and the retained complete coverage logs.

All native 20/80/240 cases and the mandatory canonical 240 repeat passed. All obligations were paid once and refreshed, with zero financial liabilities, pending refreshes or abandoned refreshes. These use production constants and natural timers with bounded recording fixtures; they are not a worst-case or mainnet bound.

| Recipients / artifact | Workload wall seconds | Selection / total virtual seconds | Maximum checkpoint instructions | Heap / serialized state bytes | All-job cycle consumption |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 host | 185.709 | 454 / 1074 | 48526332 | 4063232 / 178541 | 97339166984 |
| 80 host | 929.808 | 1384 / 3824 | 125075578 | 11927552 / 655722 | 732041404881 |
| 240 host | 4009.409 | 5595 / 12865 | 328739622 | 32243712 / 1962913 | 6238725202982 |
| 240 canonical | 2540.934 | 5595 / 12865 | 328739622 | 32243712 / 1962913 | 6238724836042 |

Host validation-to-readback ages were 20: 69 seconds, 80: 199 seconds, 240: 829 seconds. The 240 case used 15 seats, 480 compliant contenders and 7,680 dense score entries. Each run retained 129 allocated stable pages; serialized-state bytes in the table are distinct from allocated stable memory. Recorded neuron reads are a subset of Governance endpoint completions; Ledger counters include fixture calls made by Governance refresh. Management calls are not instrumented, and cycle deltas cover all jobs. The long wall times include shared-host contention; deterministic instruction/state bounds are retained separately in the raw receipts.

Both locked Rust workspace audits, OSV/dependency policy checks, production dependency isolation and SBOM gates pass. RustSec reports zero vulnerabilities and retains four explicitly reviewed inherited maintenance notices. Production npm audit reports zero vulnerabilities across 15 production dependencies. The raw full-development scan retains eight moderate affected package chains from two distinct advisories, with zero high/critical findings. GHSA-3g3m-2fjr-6pw4 (glob 10.5.0) and GHSA-g3hv-75wg-m249 (minimatch 9.0.9) occur only through CycloneDX's optional XML/native-build tooling chain. Exact graph/version and positive module-load controls prove the guarded JSON SBOM path does not load them; installation/execution scripts remain disabled. These are narrow applicability exclusions, not patched vulnerabilities, and their 2026-12-04 expiry was not extended. Raw scans, dependency paths and the new bootstrap's separate CycloneDX SBOM are included.

The preserved suites include ordinary scoped II/browser calls, known-manager scalar metadata repair, connected two-cycle economics, shared policy parity, financial hardening, historical migrations and capacity 20/80/240. Explicit ignored-test discovery prevents zero-execution success. Formatting, warnings-denied Clippy, exact Candid/export and old-interface compatibility, dependency isolation, coverage, complete raw security scans and component SBOMs are retained. Remote CI remains unrun until separately authorised publication and actual execution.

## 10. Canonical artifacts and review delivery

| Artifact | SHA-256 |
| --- | --- |
| Canonical bootstrap raw Wasm | `fef1735bb08b92bad58ec761f199741fa459292b81864c219aff5442e7423265` |
| Bootstrap Candid | `5337880b780d1bfda11f243d7608bf832b23f681fb4cdce5e088dd127eca9d4d` |
| Canonical Dendrite runtime Candid | `93fd83ce529cc6a37e8e098214a13f0c28e293e37d00646d6aa6ccbb0aa7b488` |
| Canonical Dendrite service raw Wasm | `f909d3410d8654a13c586c9e79f2bd8b02b56d1c371b1907e6b0808898aea76e` |
| Canonical D-QUORUM raw Wasm | `2b989ffa9849b687e9f4bbf2e7c2ca1855faaabfd5c805bad766d984e54ee843` |
| D-QUORUM Candid | `ce15b307ce8b19b09df0d9abb723828099c87b52fdc2aa012d67c9f327940ad0` |
| Canonical active frontend JavaScript | `c5598c95570ddeaba53293edd9dccfb7c53b65241478f19f5575c2a3b41335ea` |

[Canonical Dendrite/bootstrap manifest](../dist/dendrite-canonical/97343f8dbb714a0a12f90a474805518c83017184/manifest.json), [canonical root manifest](../dist/d-quorum-canonical/97343f8dbb714a0a12f90a474805518c83017184/release/manifest.json), and the tested creation/pair manifests bind the source and complete artifacts. The canonical bootstrap is 1146279 raw bytes, with source fingerprint `046e464cfe0e11571c176c6cd8df697e60487d2a420b9f0f290159a9be578150`. The active canonical frontend references `/generated/bootstrap.fef1735bb08b92ba.wasm`; its certified bytes equal the standalone canonical bootstrap. Both complete clean-build file sets also retain previously tracked generated assets, which are listed separately rather than confused with the selected canonical manifest. The tracked host bootstrap is `dba5a21617c739d39e05f12c32454fd7dace2f9bef6b5eb0293e15e0e7de489b`; the host root Wasm is `29b68b59be3b9136d9ae5d6b68c25e8e33b9179b42426f95b00d36b87a0c28c8`. Local-origin browser service hashes and configuration overrides are recorded per case.

Both changed deployables have two forced-clean canonical builds with identical complete file sets and bytes. The root D-QUORUM component is also rebuilt and compared through its preserved canonical lane. The canonical creation lane installs the exact canonical bootstrap, and its real signed-browser production journey reuses the matching embedded manifest. Source-only build contexts exclude ignored operator files and credentials. Local-origin browser service builds are identified separately and never relabelled as canonical production frontend assets.

The deterministic review bundle contains the exact qualified source archive, configuration/source pins, all canonical artifacts and Candid, bootstrap manifest, both comparison sets, named receipts and retained failed attempts, protocol effects, allowlisted redacted browser evidence, security/SBOMs, migrations/capacity and source-history/handover. Its repeated archive generation is byte-identical and all member checksums are verified. The archive's own SHA-256 is necessarily adjacent rather than embedded into itself. No credentials, test private keys, passkey/Chrome profiles or reusable signed delegations are included.

## 11. Unrun operator gates and supported limits

Hosted CI and live mainnet revision/capability/economic compatibility remain unrun. Publication/push, production deployment, real ICP/cycle funding, staking, proposal submission/voting, controller changes and blackholing are also unrun and require individual authorisation before any such write. Local source pins are not a live-mainnet attestation. Existing production service records and deployment configuration remain preserved; the new candidate recipe/artifacts are separate. A service lacking the additive observation API blocks creation before spending.

The user must still review the pinned policy/network combination, same-origin risk, canister reserve/retention costs, registration rejection and complete manager ballot visibility. The first implementation deliberately has a single provisioning route and registration-first finalisation. Missing proof stays blocked; long-lived recovery and post-uninstall provenance limits are stated above. No blanket refund, perpetual compliance, infinite canister retention, independent-human-ownership or developer recovery promise is made.

## 12. Release boundary and unchanged automation

This work produced **undeployed candidates only**. No push, mainnet deployment, production financial action, target hotkey addition or production controller change occurred. No existing production canister was upgraded, blackholed or used as a test target. D-QUORUM's direct-only proportional public voting-eligible VP, manager-disjoint selection, configuration authority, equal-recipient rewards, stable V3 and financial recovery semantics are unchanged. The evaluator's compliance predicates/status semantics remain unchanged; only misleading not-for-profit explanatory text was corrected.
