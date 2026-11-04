# D-QUORUM + Dendrite integration handover

**Integrated release qualification is incomplete.** Repository consolidation, shared real-protocol economic tests and component reproducibility are demonstrated. Actual II authentication returns an unrestricted delegation, which Dendrite correctly refuses. The mandatory signed-management journey fails, and the full security scan has unresolved findings. No publication, deployment or activation is authorized by this report.

## A. Git and import

Initial repositories were `/home/codexdev/src/D-QUORUM` (main, `448bcd2129240be7cd4caee3984d74ae70ad9030`, tree `b56bd066e69f71e1b47d170e86d4df89ee3a4d6b`) and `/home/codexdev/src/Dendrite` (main, `b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291`, tree `7556ae7a34d0faead9e8451413721239254a0e37`). Both were clean and equal to their local origin/main tracking references at inspection. Neither had tags. The ignored operator `results.txt` was preserved. [Baseline](integration-baseline.json) records pins and initial state.

The unsquashed subtree merge `2c06753d40c8f9bca35caecdf2eeb6f2d0778ab3` imports the exact Dendrite tree under `dendrite/`; its original commit is an ancestor. No submodule, copied `.git`, history rewrite or sibling modification occurred. Local branch: `integration/dendrite-system`.

Other local commits are `e489740` (nested Git worktree deployment guard), `3c2f56b` (seven native security patches), `d07c70e` (runner/shared protocol/II tests), `f60f191` (CI and scope documentation), `ac61d2b` (compatible runtime Candid extractor), and `867f7a0` (suite bookkeeping/provisioning). The exact tested implementation source is **`867f7a0e84fb498ea973b491b09c8970a929c3ed`**. D-QUORUM component acceptance passed at this source; there is **no fully qualified integrated source**. The following documentation handover commit is identified in the external bundle receipt and uncommitted results file.

The full attempt took 10,912.85 host seconds, ended at the same commit with a clean worktree, and returned **1**. All recorded source bytes and gate-log hashes were verified after completion. One earlier interrupted diagnostic attempt was retained under `dist/history/integration-ac61-diagnostic`; it does not qualify this candidate.

## B. Preserved functionality and provenance

Root and nested Cargo workspaces/lockfiles remain independent. D-QUORUM still uses its vendored evaluator; manifest, pure Rust source, licence and differential fixture match the imported evaluator byte for byte. Standard `nns-dendrite/1.1-draft` and evaluator source `d55a0f4d4edfabe49d8fd543aff473084cb741f2` are unchanged. Runtime Governance/Ledger/archive pin remains `83f29e0803496ba6aaea3d6b43f6c6bebea12dd9`; PocketIC is 15.0.0. Rust 1.94.1, Node 24.15.0 and npm 11.12.1 remain pinned.

D-QUORUM production Rust, vendored policy and public Candid have no changes from the starting tree. Direct public voting-eligible VP, exact proportional division, no transitive scoring, feedback exclusions, deterministic manager-disjoint ranking, five initial seats, Governance-only setter, equal distinct-neuron net rewards, verified Governance staking destinations, transfer identities, reserves, daily cadence and maturity authority are preserved. Stable schema remains **V3**, with unchanged V1/V2 migrations. No financial liability is reclassified by this import.

The original sibling remains at the same HEAD/tree and clean. Jupiter reference `/home/codexdev/src/Jupiter_Faucet_Suite`, `7af493a3ee46640c92e3d1021129a32c26fc09f7`, supplied testing-discipline documentation only. No Jupiter runtime was imported. [RC1](releases/rc1-qualification.md), [RC2](releases/rc2-qualification.md), [RC3](releases/rc3-qualification.md) and [barrier qualification](releases/barrier-qualification.md) remain historical.

## C. Integration infrastructure

The existing root `xtask` orchestrates preserved component commands, evaluator consistency, inventory, shared real protocol, real II browser, canonical pair repeats and combined acceptance. Independent lanes continue after failure. Missing prerequisites and zero behavioural matches fail. [Executed inventory](../dist/evidence/integration-inventory.json), [counts](../dist/evidence/integration-counts.json) and [full run](../dist/evidence/integrated_acceptance-run.json) distinguish discovery, execution, repeats and validators.

Shared backend scenarios extend the existing PocketIC fixture: both production-feature applications, real pinned Governance/Ledger/archives, Registry/CMC features, actual empty controllerless canisters and synthetic neurons/assets share one instance. Cases use independent instances. Both canonical applications repeat the connected tests.

Browser infrastructure uses the existing Puppeteer 24.36.0 image, Chrome 144.0.7559.96 and virtual WebAuthn. The II production backend/frontend artifacts from `release-2026-06-20` match the PocketIC source pins. Both default dummy-auth configurations are explicitly cleared before registration; the backend configuration is queried to prove this. `id.ai.localhost` maps to frontend `uqzsh-gqaaa-aaaaq-qaada-cai`, with backend `rdmx6-jaaaa-aaaaa-aaadq-cai`. Gateway certificate verification remains enabled. Local frontend assets are built in an isolated tracked-source copy, with recorded local host/origin/root-key configuration and a separate Wasm hash. Production assets are untouched.

The passing browser safety scenario installs II and the compiled local Dendrite application. Authentication is refused before the fixture proceeds to Governance/Ledger provisioning. It therefore proves no positive browser-to-Governance transaction. The exploratory CLI local network was stopped. Its default dummy-auth behaviour is not real-authentication evidence.

## D. Scenarios and independent oracles

- `connected_dendrite_and_automation_use_one_real_governance_and_ledger`: replicated Dendrite compliance and D-QUORUM eligibility agree for the real fixture; real Governance following and exact Ledger blocks verify selection/payments. Recipients: 100 and 106. Prepared and canonical pair pass.
- `connected_real_maturity_rewards_and_later_harvest`: exact proposal 1, manager approval, missed progress window, upgrade, actual 8,000,000,000-e8s credit and confirmed payments at blocks 37/38. Initial maturity was seeded; a later real NNS voting reward event produces maturity, distinct proposal 5 executes, and payout 2 pays new recipients 112/118. Old confirmations remain unchanged. Historical mint attribution remains unresolved. Prepared and canonical pair pass. This is a backend economic journey, separate from the browser world.
- `actual_ii_page_and_virtual_webauthn_capability`: actual certified II page and virtual authenticator setup pass; this alone is not authentication proof.
- `real_ii_unrestricted_delegation_is_rejected_before_governance`: actual Create → Create with passkey → Create identity UI, dummy auth disabled, followed by the production scope refusal and **zero Governance requests**. Pass.
- `real_ii_compiled_frontend_known_managers_and_signed_governance`: mandatory positive journey **fails** at the same scope check. No proposal, ballot or management change is claimed.

Existing financial lifecycle, authority, archive, ordinary-ballot eligibility, 19,000-VP/direct-versus-transitive, ambiguity, cooldown, maintenance fairness, setter race, stale observation, natural-timer and genuine V1/RC2 checkpoint upgrades all remain selected. The current test source was also run against actual historical RC3 Wasm `27f8ad3c…`; it failed at the intended typed-barrier terminal assertion. This one intentional recording-fixture counterfactual is separate from qualifying passes and real-Governance error-14 evidence.

## E. Defects and unresolved findings

1. Nested deployment guard incorrectly required a physical `.git` directory. Existing frontend regression failed before the one-line worktree check correction, then all 162 frontend tests passed. No deployment authority changed.
2. The inherited native lockfile had 12 RustSec vulnerabilities. Seven native-only dependency versions were updated; all seven are absent from the production dependency graph. RustSec now reports zero vulnerabilities. Prepared application Wasm hashes remain unchanged.
3. Real II does not honour the requested Governance-only target scope in the pinned delegation handler (`66bd7bcf6350f51811057f4c4dae1ff12aa67b8c`). The application refuses the resulting unrestricted chain. No authentication policy was relaxed. This blocks signed management and its dependent browser journeys.
4. Real Governance confirms that all five known managers 2010–2014 omit `known_neuron_data` in full list records while scalar metadata calls return it. The transaction helper still relies on the omitted field. It is **not fixed**: the required real-II signed-browser reproduction cannot reach it. Fixtures were not made conveniently different from Governance.
5. The newly reproduced Dendrite artifact differs from the historical deployment binding. The original release verifier fails with `icp.yaml Wasm hash mismatch` in an isolated copy. Historical release assets use an older frontend manifest; current committed/prepared frontend assets match the newly reproduced build. Prepared bytes are unchanged by relocation. No historical hash or deployment binding was relabelled or updated.

OSV still reports **36 findings affecting 14 packages** across npm development tooling and four existing unmaintained Rust notices. Production-only npm audit reports zero; RustSec reports zero vulnerabilities. No new exceptions suppress failures. Consumer Candid checks pass with optional-variant warnings retained; these do not prove every transaction variant. Complete signed-browser cancellation/expiry/authority faults, authenticated Dendrite upgrades, full browser/economic golden journey and integrated browser capacity remain unqualified. The old anonymous mainnet-query browser smoke was not run under the local-only boundary; legacy host-only reproducibility commands remain available but were not separately rerun. Docker reproducibility gates did run.

## F. Security, authority and scope audit

New production dependencies, public methods, persistent state, production canisters, policy changes and economic changes: **None**. Existing Dendrite was imported, not replaced. Its browser-to-NNS signing architecture and anonymous backend remain intact. No signing proxy, administrator override, roster control, reward redirection, frontend redesign or creation wizard was added.

New test-only modules are two Rust browser test targets and two Node drivers, plus helpers in existing protocol support. They provide the required gateway, real II configuration, isolated local build and bounded public coordination. Existing runner/export validators, CI and artifact retention were extended. Seven existing native dependency versions changed for demonstrated security findings; no production dependency graph changed. A supplemental observational screenshot hook captures only the application's refusal page and substitutes no identity/session/actor. No private keys, WebAuthn credential material, cookies or delegation chains are retained.

## G. Qualification evidence

The main stable-source attempt has **172 gate records: 170 pass, two fail; 50 behavioural commands; 332 unique passing names, 885 passing executions and one failed positive-browser execution**. The 25 unchanged evaluator names compiled in both workspaces are deduplicated in that global name count. Validators never count as tests. Supplemental validators and intentional counterfactuals are separate.

| Suite | Unique names | Passing executions |
|---|---:|---:|
| D-QUORUM native/property | 69 | 138 including coverage |
| D-QUORUM recording mocks | 13 | 15 including production/canonical repeats |
| D-QUORUM hardening/migrations | 26 | 33 including canonical repeats |
| D-QUORUM real protocol | 15 | 21 including canonical repeats |
| Large-index scale | 2 | 2 |
| 20/80/240 capacity | 3 | 4 including canonical 240 |
| **D-QUORUM component total** | **128** | **213** |
| Dendrite native | 62 | 174 |
| Dendrite mock-Governance PocketIC | 3 | 6 |
| Dendrite frontend | 162 | 486 |
| Additional shared backend repeats | 0 | 4 |
| II capability/refusal | 2 | 2 |

D-QUORUM's **114 component gates and all 78 existing requirements pass**. Formatting, warnings-denied Clippy, unit/property, mocks, hardening, real Governance/Ledger/archive, natural timers, upgrades, coverage, security/SBOM, production exports/Candid, two clean builds and canonical repeats pass. Dendrite native/frontend/fixture/coverage/SBOM and canonical builds pass; its security gate fails. Six additional source-stable interface/export/runtime-Candid validators pass, retaining warnings. The supplemental historical deployment-binding validator fails. One additional repeat of the existing II-refusal case passed to capture a public application screenshot; this adds one passing execution and no unique test, outside the 885 main-run passes. The generated [integration matrix](../dist/evidence/integrated-acceptance.json) remains unqualified.

Capacity uses recording fixtures with production Wasm, natural timers and unchanged freshness constants, not a claim of 240-recipient real-Governance/browser capacity. All rows finish with zero unpaid liabilities, pending refreshes and abandoned maintenance.

| Recipients/artifact | Contenders/scores | Virtual selection/total s | Validation→intent/readback s | Host s | Cycles used | Heap/state bytes | Max checkpoint instructions |
|---|---:|---:|---:|---:|---:|---:|---:|
| 20 prepared | 40/640 | 454/1074 | 59/69 | 64.10 | 97,337,472,397 | 3,932,160/178,541 | 48,397,563 |
| 80 prepared | 160/2560 | 1374/3814 | 189/199 | 489.40 | 728,205,681,231 | 11,534,336/655,722 | 124,417,534 |
| 240 prepared | 480/7680 | 5595/12865 | 819/829 | 2313.60 | 6,236,683,553,912 | 34,275,328/1,962,913 | 327,128,002 |
| 240 canonical | 480/7680 | 5595/12865 | 819/829 | 2449.10 | 6,236,683,208,885 | 34,275,328/1,962,913 | 327,128,002 |

Governance endpoint/neuron-read counts are 194/148, 702/563 and 2173/1789. Ledger balance/fee/history/transfer calls are 47/21/21/20, 169/81/81/80 and 494/241/241/240. Stable allocation is 129 pages. The 240 case records 22,172 checkpoints and 5,625,455,364,590 sampled checkpoint instructions. Management calls and whole-replica instruction costs are not instrumented. Host timings are provisioning observations, not mainnet bounds.

Native line coverage: policy 88.02%, accounting 96.56%, clients 41.14%, stable migration 95.24%, maturity 7.23%, payout 0.00%; unchanged evaluator 98.79%. Wasm timer/await execution receives integration evidence, **no native coverage credit**. Dendrite native workspace lines 89.97%, pure-engine lines 98.79%/branches 95.51%; frontend lines 95.53%, branches 86.60%, functions 93.36%. No new aggregate threshold was invented. Root CycloneDX SBOM has 291 components, SHA-256 `c5e18037671fcd6b56701d79f1ceccf750e2a5fa2512a45ae712495883dc94ce`; nested Rust/npm SBOMs retain their own checksums.

## H. Scope audit, artifacts and independent review

Production additions: dependencies **None**; public methods **None**; persistent state **None**; canisters **None**; policy changes **None**; economic changes **None**. Test-only additions are the shared protocol scenarios, II/browser targets and drivers, existing-runner extensions, artifact checks and observational screenshot capture described above. Seven existing native dependency versions changed solely for demonstrated security findings.

Each component has two forced-clean no-cache Docker builds with identical output file sets and bytes. Canonical pair backend tests pass. The [pair manifest](../dist/integration-manifest.json) supplements individual manifests and records protocol/II/browser pins, local configuration delta and tested-suite source hashes.

| Artifact | SHA-256 |
|---|---|
| D-QUORUM Wasm | `07b1b54ba965303a00e072d3d9f4cc717dc27b10250b0e51cf37d6109919c3a8` |
| D-QUORUM Candid | `ce15b307ce8b19b09df0d9abb723828099c87b52fdc2aa012d67c9f327940ad0` |
| D-QUORUM source/artifact manifest | `f940f251ba9985dc5e08c92ff832bce9c596966878d853ed00e4f534fea2d354` |
| Dendrite Wasm | `a11efe497e802c6f93b54540043b73505c2271b46219785d2dd90657146933af` |
| Dendrite extracted canonical Candid | `905c2919fe5fb18d0cc1ee09719b739a803fabbe8d7dc45cf349fa60ebb9b55f` |
| Dendrite canonical SHA256SUMS | `719f5a36a5825a0a6481ff2b1affad9ee3fa1eb65cffdb72cf046c31ad5dfd14` |

Dendrite's committed interface is byte-unchanged; extracted Candid differs in formatting/type aliases and passes strict structural comparison. Its Wasm exposes `get_candid_pointer`, not an embedded Candid custom section. The exact production export set is checked. Local-browser Wasm is separately labelled and must not be confused with canonical production bytes.

The review archive is `dist/review-integrated/d-quorum-dendrite-review.tar.gz`, with adjacent `SHA256SUMS` and `review-bundle-validation.json`. Its size/hash and final handover commit are external to avoid self-reference. It contains exact tested source, current handover, both components' canonical outputs and clean repeats, manifests, full execution/requirement records, logs, coverage, security/SBOM, capacity, public browser evidence and historical records. The existing assembler's sorted epoch-zero tar/gzip procedure is reused, generated twice and compared; every member checksum is verified. This is an **incomplete-qualification review bundle**, not a release approval.

## I. Operator handover

This merged repository is ready for review, **not publication as a fully qualified release**. Resolve actual II target-scope compatibility without silently broadening authority; then reproduce/fix known-manager metadata through the real browser and complete the missing golden, security, cancellation and upgrade scenarios. Address development-tool findings and requalify; only then bind the appropriate Dendrite deployment checksum. Preserve ambiguity where protocol evidence cannot attribute a mint or execution remains unknown.

Remote CI is **unrun** because no commits were pushed. Root workflows retain existing jobs, add component/shared/browser coverage and block canonical readiness on incomplete mandatory requirements. Permissions are read-only, with no deployment secrets or automatic deployment. The owner must observe actual hosted runs and separately enforce the documented checks through branch protection; no repository settings were changed.

Before any production operation, independently verify current Governance/Ledger/economics compatibility, final-origin II behaviour, a controlled real management transaction, artifact/configuration bindings, controllers/hotkeys, proposer binding/funding, cycles and upgrade plan. Local tests do not complete these operator-only gates. Funding, staking, management/following changes, proposals, transfers, deployment and activation need separate explicit approval. Never reinstall an active or funded production canister.

Retain source/handover commits, archive/checksums/validation receipt, both clean output sets, all manifests, execution logs, coverage, security/SBOM, capacity and negative-control evidence. **No push, mainnet deployment, funding, staking, real proposal, real transfer, hotkey/controller change or other mainnet write occurred.** All financial effects used isolated test canisters and synthetic assets.
