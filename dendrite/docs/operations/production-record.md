# Production record

**Status: UPGRADED — module and public certified assets verified.**

Only an operator-supplied real deployment result may change this into completed
evidence. Never include private identity or authentication material.

## Experimental stable-interface creation upgrade — 2026-11-20

**DEPLOYED — exact qualified canonical bytes, certified frontend/bootstrap and
read-only production preflight verified.** This release supersedes the external
executable-allowlist policy in the November 13 historical record below. NNS module
upgrades alone no longer block plan review, provisioning, dispatch, configuration
or ordinary financial recovery. No current CMC hash was added to an allowlist.

| Field | Observed value |
| --- | --- |
| Qualified application source | `1e419015bf63b3343bd45fce63f78554b538d0ad` |
| Dendrite source subtree | `eddd01800df20a5855938c5c6be9d5e043e75422` |
| Hosted qualification | [Run 44717045537](https://github.com/aodl/D-QUORUM/actions/runs/44717045537), all 16 jobs successful |
| Hosted canonical artifact | `canonical-candidate`, ID `14623469793`; ZIP `sha256:56c4580d7a80262c78cdcbf5d94e0f79dadd794db658aa6b80e4ed97f1845481` |
| Canister / origin | `hp4av-oiaaa-aaaar-qcaha-cai` / [Create a Dendrite](https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io/?release=e00000c2#/create) |
| Previous installed module | `682ea727371a7d7cc110e29f89e331620efd545dea2412020f06bb2c6a4d54ec` |
| New installed module / canonical Dendrite SHA-256 | `e00000c2ce9d0a27f78f619e4225fa3b78049412ffcfc2661a35431542b904cb` |
| Certified bootstrap SHA-256 | `099836276a1282afd94f5676282ff20cbcbbb0f0451dfaa94166f9b78dd88bc2`; unchanged bytes, `1462077` bytes |
| Bootstrap source fingerprint | `1c27759adfcf9765a6f7e618608e00712a7616d616ca23290634c803153fe001` |
| Asset manifest SHA-256 | `9ceaa30b1b64a65a138593d95b3da7ee1aeca0f2014ac97e13a069f903635db4` |
| Active JavaScript SHA-256 | `0ca6c5e7e7e8cccd6e3d1a4135c2190421ac60fd80dd303d267ea425a0ad30de` |
| Stylesheet SHA-256 | `7b2188f014be364ac6ea3ffcd7b37365bb352a7df3185e21efbf6e35f5def453` |
| Operator / tooling | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` / `codex_local` / `dfx 0.31.0` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles immediately before / after | `4_606_548_744_088 Cycles` / `4_537_806_133_620 Cycles` |
| Observed cycle decrease | 68742610468 |
| Freezing threshold before / after | `7_776_000 Seconds` / `7_776_000 Seconds` |
| Upgrade invoked / status verified | `2026-11-20T11:25:40.947956+00:00` / `2026-11-20T11:25:58.750884+00:00` |
| Certified assets verified | `2026-11-20T11:26:45.093Z`; ten paths |
| Post-upgrade production preflight | `2026-11-20T11:26:32.655Z`; successful conditional read-only check |

The existing operator principal was confirmed in the current controller list.
One upgrade was issued, returned exit code zero, and was read back independently:

```sh
DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity \
  dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade \
  --wasm /home/codexdev/src/D-QUORUM/dendrite/dist/candidates/1e419015bf63b3343bd45fce63f78554b538d0ad/dendrite.wasm \
  --argument '()'
```

Canister ID, controllers, zero compute/memory allocations, freezing threshold,
reserved-cycle limit, Wasm memory settings, public log visibility, canonical
origin, `https://id.ai/authorize`, `https://icp-api.io` and
`{"alternativeOrigins":[]}` remained unchanged. Only ordinary upgrade cycles
were spent. There was no D-QUORUM deployment/activation, ICP transfer, neuron
creation/funding, Governance proposal, controller/hotkey change or blackholing.

The hosted artifact ZIP digest, complete Dendrite source manifest (179 files),
source subtree, canonical configuration, both byte-identical clean exports,
checksums, bootstrap source/bytes/Candid/policy, embedded asset binding and canonical
run receipts/log digests were independently verified. Artifact upload omitted
only the hidden origins sidecar: its exact configured bytes were restored and
matched the hosted manifest checksum in both exports. No Wasm was reconstructed
or substituted. The previous verified release remains available under
`dist/candidates/9863d7b0dbe19756579b4c57192b3101d0dc7115/` and the prior local release
was retained under `dist/release-before-api-compatibility-20261120/`.

The default local release directory, tracked recipe and guarded deployment hash
were updated to these exact bytes after deployment verification. These are
release-binding/documentation changes, not a new application binary or a claim
of new hosted qualification for the record commit.

All 16 exact-source hosted jobs succeeded, including separate signed-II, full
signed creation/finalisation, creation protocol with the fixed published test
executables, canonical reproducibility/creation and complete integrated
requirement selection. Frontend tests passed 359/359; hosted line/branch/function
coverage was 95.50% / 85.99% / 91.30%. Rust workspace line coverage was 85.82%.
All unchanged 85% thresholds passed. Creation recording passed 29 bootstrap tests
and 119 browser coordination tests; pure creation passed 92 tests; the real
creation-protocol lane passed 15 cases and five archived-certificate checks.
Python qualification-runner regressions passed 24/24. Local creation-protocol
cases also passed and the owned fixture server shut down cleanly.

Superseded run 44712962037 exposed only an unformatted relocated fixture path;
its exact failed unit-job log was retained and formatting corrected. Run
44713139929 was superseded by the additional conservative generic-approval
refusal correction. Neither superseded run qualifies this release. An optional
local repeat for superseded source 65ae215 hit Docker storage exhaustion; it is
not qualification evidence. The final release uses the successful source-bound
hosted canonical exports, not that incomplete local repeat.

Financial replies retain exact certified destination/sender/argument/nonce/request
identity and actual outcomes across external upgrades. Typed public-API failures,
fees, amounts, accounts, bounded reservations, deduplication and unresolved-outcome
protections remain. Implementation-specific generic approval errors stay
unresolved, including legacy denial code 100001. The original executable binding
is retained only for the narrowly audited historical Governance no-creation
refusal proof; an unproven refusal reserves that operation and does not prevent
unrelated plans. Exact bootstrap checksum, controller/neuron authority and the
Dendrite Standard are unchanged. The old executable registry is retained only as
PocketIC test data at `tests/pocketic/fixtures/protocol-releases.json` in the
consolidated repository, never as production compatibility policy.

Independent post-upgrade certified-state reads confirmed the installed Dendrite
hash and original controllers. Ten HTTP paths matched canonical bytes with IC
certificate BLS/delegation/canister/time verification, certified-data witnesses,
certification v2 and popup-compatible COOP/CSP/nosniff headers. The current and
historical bootstrap assets remain available. Anonymous Chrome 156 rendered the
23-rule neuron report, exact new JavaScript and the RecoverableTest creation form
without page errors or any update attempt. `DENDRITE_SMOKE_NEURON_ID` was unset.

Fresh external module observations are **diagnostic only**, not prerequisites or
an allowlist. All certificate chains verified against the production root key:

| Dependency | Canister | Observed installed module |
| --- | --- | --- |
| CMC | `rkp4c-7iaaa-aaaaa-aaaca-cai` | `8e759916db8e5ec420efc2f54573d13f37f44640ec553d536ad64756c43fe006` |
| Governance | `rrkah-fqaaa-aaaaa-aaaaq-cai` | `7f85124ee08c3f59c0050009268807c7aea2b80ee296c23338b05458888f19df` |
| ICP Ledger | `ryjl3-tyaaa-aaaaa-aaaba-cai` | `51f4be010f23064137defacd627ffbec024c5133210c68ca3b80ab8f257101d6` |
| Cycles Ledger | `um5iw-rqaaa-aaaaq-qaaba-cai` | `70f8bd40d022374622b34266d2c182d2a5b711d965f3bef9e505467a84c40bce` |

The CMC differs from the November 13 fixture/reviewed identity. The deployed
planner no longer treats this as incompatibility. Actual production Governance
manager/economics reads, Ledger and Cycles Ledger fees, and the CMC quote decoded
successfully. One-manager RecoverableTest preflight succeeded for public manager
`428687636340283207` and observed authority
`mucdz-5afc2-k53bs-7cxj4-nb35w-4ofwx-ju435-o6zg7-vtqas-ulmvx-mqe`. This is conditional evidence: no signer
or II session as that authority was obtained, and it does not prove the user's
authority or a future financial outcome.

At `2026-11-20T11:26:32.655Z`, the conversion rate was `15642`
XDR permyriad/ICP, ICP fee `10000` e8s and Cycles Ledger fee `100000000` cycles.
The fresh minimum for a two-trillion-cycle allocation was **1.27900067 ICP for
provisioning**, separately from stake. The default 1 ICP budget was not silently
increased and is insufficient for that quote. Obtain a fresh quote and choose an
adequate provisioning budget before funding.

Manual acceptance remains: hard-reload the canonical origin, sign in as an actual
controller/hotkey of the selected public known manager, choose the one-manager
RecoverableTest profile and Review creation plan. Mainnet II/popup/sign-out UX and
any voluntarily funded creation/stake/recovery are for the user to test. No
mainnet financial success is claimed. RecoverableTest remains non-compliant,
controller-recoverable and ineligible for irreversible finalisation.

Raw status, command, artifact, certificate, browser and API evidence is retained
locally under ignored `dist/api-compatibility-20261120/`; these are local retention
paths, not persistent artifact hyperlinks. Hosted canonical artifact
`14623469793` is retained until `2027-02-18T10:11:08Z` under the recorded run.
Earlier production releases, qualification and failure records remain unchanged.

## Experimental reviewed-mainnet compatibility upgrade — 2026-11-13

**DEPLOYED — exact canonical application, certified assets and read-only creation
preflight verified.** This is the explicitly authorised experimental upgrade of
the existing Dendrite canister only. Earlier release and failure records remain
intact below; no mainnet financial or Governance update was performed.

| Field | Recorded value |
| --- | --- |
| Application source | `9863d7b0dbe19756579b4c57192b3101d0dc7115` |
| Hosted qualification | [Run 43474576752](https://github.com/aodl/D-QUORUM/actions/runs/43474576752), all 16 jobs successful |
| Hosted canonical artifact | `canonical-candidate`, ID `14068419377`; ZIP SHA-256 `576655599095436852b92dd529222ff931fdd48ccc83488d9292fcc6a3d59ae7` |
| Signed-browser qualification source | `9863d7b0dbe19756579b4c57192b3101d0dc7115`; identical Dendrite subtree `608c1f874ceee24d6451fe8dd793c00512823994` |
| Canister / canonical origin | `hp4av-oiaaa-aaaar-qcaha-cai` / [Dendrite creation](https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io/#/create) |
| Previous installed module | `3fd6a1c02093841b9fe8ae2df8c52e9ec82082c103ec48e6392a5036cb7e51fc` |
| New installed module / canonical Wasm SHA-256 | `682ea727371a7d7cc110e29f89e331620efd545dea2412020f06bb2c6a4d54ec` |
| Embedded certified bootstrap SHA-256 | `099836276a1282afd94f5676282ff20cbcbbb0f0451dfaa94166f9b78dd88bc2` |
| Bootstrap manifest SHA-256 | `54d1c7fb254024f12d77e7269b7babb2ef850f1355f80989321873874a1c68a6` |
| Bootstrap source fingerprint | `464aca60a3c6298f051dff7b2d1e9e707b3acacb6bab5240ad67cb13bd92cea0` |
| Asset manifest SHA-256 | `0ba1f562bc19d48a3c62cc24a272bb99a916947982d70fdd85d19265a74708a3` |
| Content-addressed JavaScript SHA-256 | `61a8f3bbe0a275e3a21d115f64fd00b11a6d3d9fdcabd135885b0ae282a31b75` |
| Stylesheet SHA-256 | `7b2188f014be364ac6ea3ffcd7b37365bb352a7df3185e21efbf6e35f5def453` |
| Lifecycle client / identity / operator | `dfx 0.31.0` / `codex_local` / `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles immediately before / after | `4_698_232_983_577 Cycles` / `4_629_419_411_030 Cycles` |
| Observed cycle decrease | `68813572547` including upgrade and intervening normal activity; no top-up |
| Freezing threshold before / after | `7_776_000 Seconds` / `7_776_000 Seconds` |
| Upgrade invoked / status verified | `2026-11-13T19:16:23.480525+00:00` / `2026-11-13T19:16:55.830388+00:00` |
| Certified public assets verified | `2026-11-13T19:17:45.947Z` |
| Conditional actual production preflight | `2026-11-13T19:17:37.216Z`, successful, no signer or updates |

The current `codex_local` principal was independently checked in the live
controller list. The upgrade command was issued once, followed by status readback:

```sh
DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity \
  dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade \
  --wasm /home/codexdev/src/D-QUORUM/dendrite/dist/candidates/9863d7b0dbe19756579b4c57192b3101d0dc7115/dendrite.wasm \
  --argument '()'
```

The warning setting only suppresses the existing plaintext-identity warning.
No private credential was read out or exported. Controllers, canister ID,
allocation settings, freezing threshold, reserved-cycle limit, Wasm memory settings
and public log visibility were unchanged. Only ordinary upgrade execution cycles
were spent; there was no transfer, funding, neuron creation, NNS proposal,
controller mutation, blackholing, D-QUORUM deployment or activation.

Two independent clean no-cache canonical builds produced byte-identical exports.
Their complete checksums, production configuration, runtime Candid and embedded
bootstrap manifest/bytes were verified. The explicit candidate recipe prevented
selection of the preceding release. After installed-module and asset verification,
`dist/release`, the tracked recipe and deployment guard were bound to the exact
new bytes. These final binding/documentation edits are release metadata, not a
new application binary or a claim of another hosted qualification.

Source-bound hosted run 43474576752 passed all 16 jobs, including signed creation, canonical reproducibility and integrated readiness. Required component checks, unit/protocol tests, coverage, dependency scan
and SBOM generation passed. Python qualification-runner regressions passed 24/24;
bootstrap Rust units 29/29; fresh-versus-historical protocol regressions 87/87;
frontend coverage 356/356; pure creation 94/94; canonical scope-builder regressions
17/17; archived BLS refusal/receipt checks 5/5. Rust line coverage was 85.82%;
frontend line/branch/function coverage 95.51% / 85.70% / 91.31%, above unchanged 85%
thresholds. Eight focused real PocketIC scenarios passed: three retain the exact
local fixture pins and five execute checksum-verified published mainnet binaries,
including mint/create deduplication, dispatch reservation, recoverable creation,
production registration/finalisation and Governance refusal behavior. The exact
canonical bootstrap passed the native production lifecycle and canonical real-II
production creation/finalisation journey. The separate full signed-browser lane
also passed historical one-manager creation/migration, 90-day payment recovery
and controller recovery using its reviewed local-build fixture, and the production
registration, refusal retention, quorum rehearsal, finalisation and management journey.
These monetary scenarios ran only in PocketIC, never mainnet.

Failures are retained separately: the mainnet-ledger companion archive expectation
was corrected in test fixtures; two bounded orchestration timeouts and initial-II
channel closures did not qualify their runs; the historical recovery scenario's
initial-module assertion was corrected to require its archived executable before
migration and the canonical executable afterwards. Initial unbound II setup uses the existing one-retry fresh-context policy before any manager authority or funds exist; failed attempts are retained and bound capability sessions never restart. An unsuccessful public-asset warmup diagnostic was removed; ordinary SDK loading is retained. Production SDK, certificate,
delegation, transaction and financial recovery limits were not relaxed. The
[exact-source hosted run 43474576752](https://github.com/aodl/D-QUORUM/actions/runs/43474576752)
passed all 16 jobs. The earlier failed run 43434102278 remains retained as failure
evidence; its quinn-udp advisory was fixed by the 0.5.16 lockfile update, and the
browser driver now skips disabled Continue controls before selecting the remembered
identity. No old passing run substitutes for the new exact-source qualification.

All active public assets, index/manifest and alternative-origin document matched
the canonical export byte-for-byte. IC certificate BLS signatures, production root
key/delegation/canister/time checks and certified-data witness roots verified;
certification v2 and popup-compatible COOP/CSP/nosniff headers remained present.
The current `099836276a1282afd94f5676282ff20cbcbbb0f0451dfaa94166f9b78dd88bc2` bootstrap and previous `ac7e2907…32b107` asset remain
available with exact reviewed hashes. Identity provider `https://id.ai/authorize`,
API `https://icp-api.io` and `{"alternativeOrigins":[]}` are unchanged. Anonymous
Chrome browsing still renders the factual 23-rule compliance report and the
updated creation form without an update call. `DENDRITE_SMOKE_NEURON_ID` was unset.

Fresh read-only production evidence supports all four exact installed versions
listed in the **Read-only mainnet protocol review** below. The original CMC error
was a real module mismatch, not missing certified evidence; all four installed
identities differed from local fixture pins. Cycles Ledger is the same executable
in a verified compressed encoding. Published artifact digests and source reviews
are separate provenance evidence from certified installed-module state. Unknown
versions and missing/malformed certificates continue to block monetary actions;
historical financial/refusal witnesses retain their original executable binding.

The actual conditional one-manager preflight succeeded for public manager
`428687636340283207` and its observed controller authority
`mucdz-5afc2-k53bs-7cxj4-nb35w-4ofwx-ju435-o6zg7-vtqas-ulmvx-mqe`. This does not claim an authenticated
session as that person or prove the user's authority. Nine actual anonymous
production API probes passed. At the observed conversion rate the 1 ICP default
provisioning budget was below the existing guard's required amount for 2 trillion
cycles plus fees; obtain a fresh quote and increase the budget before funding.
Fresh post-upgrade quote observed `2026-11-13T19:17:46.914Z`: `19156` XDR permyriad per ICP; the existing guard requires at least **1.04441592 ICP for provisioning 2 trillion cycles**, separately from stake. The default 1 ICP budget was not changed.
RecoverableTest remains non-compliant, controller-recoverable and ineligible for
irreversible finalisation. Final-origin II/popup/sign-out, UX and voluntarily funded
creation remain manual acceptance work; no mainnet financial success is claimed.

Bounded generated evidence is retained locally, ignored by Git, under
`dist/protocol-review-20261113/`, including canonical exports, prior verified
release, original failures, qualification logs, `upgrade-invocation.json`,
`upgrade.log`, status before/after, `deployment-result.json`, certified asset and
read-only mainnet reports, and browser screenshots. These plain paths are local
operator retention locations, not published artifact URLs. Earlier records below
are preserved.

## Experimental creation workflow upgrade — 2026-11-13

**DEPLOYED for hands-on acceptance testing. Creation remains blocked before
spending by the existing live protocol-module checks.** The operator explicitly
authorised this existing-canister upgrade, its normal execution cycles, and the
previously working `dfx` / `codex_local` route, without a second approval. This is
an experimental release, not authorisation for financial or controller operations.

| Field | Recorded value |
| --- | --- |
| Application source on `main` | `4dcf91d80efdc12b27817d1ece2561c9fdf45597` |
| Qualified PR source | `f9cf96e27ff2ec0401310630f32f504f5ea7ba2e` |
| Identical Git tree | `3a1beac3a77f0e4ba8a7aa4e9f5d4af4e2bd510e` |
| Hosted qualification | [PR run 43320120629](https://github.com/aodl/D-QUORUM/actions/runs/43320120629), 16/16 jobs successful, integrated readiness qualified |
| Subsequent main qualification | [Main run 43385211598](https://github.com/aodl/D-QUORUM/actions/runs/43385211598), still running at deployment; 14 prerequisites passed by final verification, canonical qualification still running, no known security or application failure |
| Canonical artifact | `canonical-candidate`, artifact ID `13995151112`; hosted checkout `56e60650f82d75357b63f9b72dc7864b02b311f2`, identical qualified tree |
| Artifact ZIP SHA-256 | `8bc918e067851506b9acb48e43f1bf7bdbeac3f6f70f46e75d39941013623dc2` |
| Mainnet canister | `hp4av-oiaaa-aaaar-qcaha-cai` |
| Canonical frontend | [Dendrite](https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io), [creation](https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io/#/create) |
| Lifecycle client / selected identity | `dfx 0.31.0` / `codex_local` |
| Verified operator principal | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Previous installed module | `5ff6e1d3c79fa310f45d9f314ebb578d7f5b71abed15cd7f236fa5b7b122cf8d` |
| New installed canonical Wasm SHA-256 | `3fd6a1c02093841b9fe8ae2df8c52e9ec82082c103ec48e6392a5036cb7e51fc` |
| Certified bootstrap SHA-256 | `ac7e2907b323f980b108548978837b114cb7bfcce35034ed0f19f8ee9932b107` |
| Asset-manifest SHA-256 | `ac078e585c806cc07987e56f4b28da73ae529f0ae864cb9df5ad96e118af138d` |
| Active JavaScript SHA-256 | `1d89ca625b5982767419fa81c916c95eecf290468133dd0d8cee048daa228105` |
| Active stylesheet SHA-256 | `7b2188f014be364ac6ea3ffcd7b37365bb352a7df3185e21efbf6e35f5def453` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles immediately before / after | `4_759_923_594_720` / `4_699_820_631_354` |
| Observed cycle decrease | `60_102_963_366`, including upgrade execution and normal intervening activity; no top-up or transfer |
| Freezing threshold before and after | `7_776_000` seconds |
| Upgrade invoked / independent verification completed | `2026-11-13T07:55:01Z` / `2026-11-13T08:04:31Z` |

The command was executed once and returned success. Independent status readback
confirmed the exact approved module and running state:

```sh
DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity \
  dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade \
  --wasm /home/codexdev/src/D-QUORUM/dendrite/dist/candidates/4dcf91d80efdc12b27817d1ece2561c9fdf45597/dendrite.wasm \
  --argument '()'
```

The operator principal was confirmed in the live controller list before the write.
Controllers, allocation settings, freezing threshold, reserved-cycle limit, Wasm
memory settings and log visibility were unchanged. No secret identity material was
read out or exported. The warning flag only suppressed the plaintext-identity warning;
it did not change credential protection.

The hosted canonical export was reused without rebuilding application or bootstrap
bytes. Its manifest, both identical exports, complete release checksums, production
configuration, runtime Candid and embedded bootstrap identity were verified. The
ZIP omitted the hidden alternative-origin file; the identical tracked source blob
was restored only after matching its canonical manifest checksum. The candidate
was explicitly bound and checked before installation. Afterwards the current
`dist/release` binding, `icp.yaml` and guard were updated to the deployed hash.
These are deployment metadata changes, not qualification of a different binary.
The previously installed, checksum-verified Wasm is retained locally at
`dist/deployment-20261113/previous-dendrite.wasm` for a later corrective upgrade.

Nine public paths returned HTTP 200 and bytes identical to the approved export:
`/`, `/index.html`, `/asset-manifest.json`, `/.well-known/ii-alternative-origins`,
and every active manifest asset, including the canonical bootstrap and its manifest
and Candid file. IC certificate signatures and certified-data witness roots were
verified with the production root key, without disabling freshness verification.
Certification v2, MIME/cache policy, CSP, nosniff and popup-compatible
`Cross-Origin-Opener-Policy: same-origin-allow-popups` were present. The identity
provider remained `https://id.ai/authorize`, API `https://icp-api.io`, and alternative
origins exactly `{"alternativeOrigins":[]}`.

A limited headless Chrome check loaded public neuron `2947465672511369` anonymously,
rendered its factual `Not Compliant` result and all 23 rules, and then displayed
the actual creation profiles and review form. No page error or update request
occurred. `DENDRITE_SMOKE_NEURON_ID` remained unset; no deployment-verification
`check_neuron` update was sent.

### Live creation dependency limitation

Fresh, IC-certified module-state reads found these exact identity mismatches:

| Dependency | Compiled creation pin | Observed live module hash |
| --- | --- | --- |
| Governance `rrkah-fqaaa-aaaaa-aaaaq-cai` | `dbcf97ae8729a956521a0a928f1b1bcb93f6e9c0dafd0e42aa985588713b88c0` | `7f85124ee08c3f59c0050009268807c7aea2b80ee296c23338b05458888f19df` |
| ICP Ledger `ryjl3-tyaaa-aaaaa-aaaba-cai` | `538fc204379c53f6cb9ddc70c11122a0a26f6a7a7a01a0a2a6c30c5d3c76ef4d` | `51f4be010f23064137defacd627ffbec024c5133210c68ca3b80ab8f257101d6` |
| CMC `rkp4c-7iaaa-aaaaa-aaaca-cai` | `1473c16c544f3ee6b86449107c4118f336e648eed3146b60edd0a8e143e89d56` | `c5e9adf7c953f1922fd75d502a38aa4c0f1fefb6ce877845a8e374c07ca2f950` |
| Cycles Ledger `um5iw-rqaaa-aaaaq-qaaba-cai` | `a19eb3490ce67255ac6f4873f25b9f7d20abf78030f4782f8ee1b66f42cd2763` | `70f8bd40d022374622b34266d2c182d2a5b711d965f3bef9e505467a84c40bce` |

Nine anonymous query probes passed: Governance economics and public neuron info;
ICP Ledger fee, standards and zero-length history; CMC conversion rate; Cycles
Ledger fee, standards and zero-length history. This checks only those read APIs,
not financial write compatibility. The observed Cycles Ledger hash equals the
already recorded compressed release digest; no inference that every mismatch is
a different executable was used to bypass the exact production allowlist.

`creationPreflight` rejects these mismatches before spending. Production pins and
their checks were not changed. **Do not fund a live creation until the deployed
protocol identities and write contracts receive a separate reviewed qualification.**

Manual acceptance remains outstanding for final-origin II sign-in/popup/sign-out,
responsive presentation, and unfunded form/plan behaviour. Financial creation,
registration, recovery, finalisation and post-final management were not exercised
on mainnet. No ICP transfer, NNS proposal, neuron creation/funding, controller
modification, blackholing, D-QUORUM deployment or activation occurred.

Bounded generated evidence is retained outside Git under
`dist/deployment-20261113/`: `release-verification.json`, `candidate.icp.yaml`,
`upgrade-invocation.json`, `upgrade.log`, `status-preinstall.txt`, `status-after.txt`,
`live-assets.json`, `live-protocol.json`, `browser-readonly.json`, screenshots and
`deployment-result.json`. These are local operator evidence paths, not published
artifact URLs. This tracked entry retains the durable deployment result; all
earlier production records below are preserved.

## Scoped authentication frontend upgrade — 2026-11-08

The user explicitly requested deployment of the latest Dendrite frontend using
`dfx` and `codex_local`. This authorizes the lifecycle-client and identity exceptions
to the default `icp-cli` procedure for this upgrade. The frontend is embedded in the
single Dendrite canister, so the operation upgraded the complete canonical Wasm.

| Field | Recorded value |
| --- | --- |
| Release source Git commit | `d1793f7728447b58232f5542dac95a07ee5e199b` |
| Latest main source comparison | `origin/main` at `49f8d57`; identical Dendrite subtree `fce567a2259bb3aacafb8eeb6730a6d7ea8d236b` |
| Browser harness repair commit | `7cca8bc`; test tooling only, no production asset or canister source changes |
| Lifecycle client / identity | `dfx 0.31.0` / `codex_local` |
| Operator identity principal | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm --argument '()'` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before / after | `4_794_414_414_333` / `4_771_790_289_394` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `bc75d0510e40affcc57d164df764ea2274ea044ca5c4332c6ed9ae3e66b4a501` |
| Installed canonical Wasm SHA-256 | `5ff6e1d3c79fa310f45d9f314ebb578d7f5b71abed15cd7f236fa5b7b122cf8d` |
| Release `SHA256SUMS` SHA-256 | `d8c2f1e0aa927743d80fa869b023c5d56357b356204e6786f5c4a6ee3bbaff71` |
| Asset-manifest SHA-256 | `8efaded8cd5a9af029ff805e38a362cf0664a54baa4db67c95a72225e2b8c342` |
| Generated application SHA-256 | `eb36d22b3c1a1093f4cf58237728bba409ea53c5b7be24a1c8dba560b380ccc6` |
| Generated stylesheet SHA-256 | `008b98904943b9caf17647649eb069684bfad51f5887b03943c896fe64d9dbf3` |
| Build-configuration SHA-256 | `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d` |
| SBOM checksum-manifest SHA-256 | `d732ba705432c3539240b2002ffa08bd2ff1a24e411e1e1488a53b8284cd86e6` |
| Upgrade started / verification completed | `2026-11-08T11:54:08Z` / `2026-11-08T11:54:26Z` |

Required command gates passed: `npm ci --ignore-scripts`, `cargo xtask check`,
`cargo xtask test`, `cargo xtask coverage`, `cargo xtask build`,
`cargo xtask build-reproducible`, `cargo xtask verify-reproducible`,
`cargo xtask security-scan`, `cargo xtask sbom`, `npm test`, and
`npm run test:coverage`. The suite passed 62 Rust unit tests, three PocketIC scenarios,
and 172 frontend tests. Workspace line coverage was 89.97%; rule-engine line/branch
coverage was 98.79%/95.51%; frontend line/branch/function coverage was
95.87%/87.37%/93.70%. Two clean local builds and two clean no-cache canonical Docker
builds were independently byte-identical. The canonical export exactly matched the
bound release. Scans passed with the existing documented, narrowly scoped exceptions
in [security](../security.md), including the two inactive optional npm build-tool
advisories; production npm audit reported zero vulnerabilities.

Read-only verification checked the installed module hash and byte identity of `/`,
`/index.html`, `/asset-manifest.json`, `/.well-known/ii-alternative-origins`, and both
generated assets. Every response returned HTTP 200 with certification v2, its
certificate expression, expected MIME/cache policy, popup-compatible COOP, CSP, and
security headers. Alternative origins remained exactly `{"alternativeOrigins":[]}`.
Controllers and settings were unchanged. No cycle transfer, D-QUORUM deployment,
blackholing, or NNS mutation was performed. The production Candid interface and fixed
evidence destinations/methods are unchanged; the pinned NNS revision remains
`d55a0f4d4edfabe49d8fd543aff473084cb741f2`.

Additional Chromium qualification did **not** pass completely. After correcting two
harness defects with failing-then-passing regressions (public DNS containment and
automatic favicon-404 accounting), desktop and actual 200% page-scale scenarios
passed. The 720-pixel equivalent-reflow scenario measured a frequent icon target at
42.859375 CSS pixels, below its unchanged 44-pixel gate. The run stopped there;
mobile and narrow scenarios were not reached. This is a retained limitation of the
requested existing artifact, not a passing browser qualification. Final-origin II,
controlled transactions, and blackholing operator gates remain UNRUN.

Bounded local evidence locations, relative to the Dendrite root, are
`dist/deployment-20261108/`: command results in `check-results.txt`,
canonical build comparison in `canonical.log`, live verification in
`live-verification.json`, and browser failure in `browser-smoke-final.log`.
These generated files are ignored by Git and retained outside the tracked checkout
as local operator evidence. No persistent published artifact URL is recorded;
this entry retains the durable result.

## Evidence-specific rule diagnostics upgrade — 2026-07-29

| Field | Recorded value |
| --- | --- |
| Release Git commit | `694e1c2a47f3a2fc238b9b3799748610ca22b274` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Operator identity principal | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_337_452_178_658` |
| Cycles balance after | `5_315_097_916_637` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `8fec1ba048185e9020b815d0dadc499b5305550ff7f27f314885b2acc17278cd` |
| Installed module hash | `5b20aa2aa7b3d3b6706698bbd75dfaf6775a96d27c744fd230e7fd709ba448eb` |
| Release `SHA256SUMS` hash | `05b0a2f6340e8912a46cfa78d8f54591f1c330d74a3968eb4ed8a22481d3ecbb` |
| Asset-manifest hash | `c1e36dbff3b8240e32fe9878e86cdcb716bedeb3dc558f412a8f9e88b0cfad2b` |
| Generated application hash | `16a88df940fd5e9140f12806e367f907c5f152c16b9ea56b853f6163c08f1e46` |
| Generated stylesheet hash | `f4bde1b2f8652ece1ea245507bc42455c547b026ef0cb9b94e46cebe55bac235` |
| Deployment verification timestamp | `2026-07-29T20:18:12Z` |
| Verification | Installed module hash matched the canonical Wasm; `/`, `/asset-manifest.json`, `/.well-known/ii-alternative-origins`, and both generated assets returned certified HTTP 200 responses. |
| Notes | No controller, freezing threshold, authentication configuration, or other setting changed; no transaction gate, cycle transfer, or NNS mutation was performed. |

## Certified controller-evidence upgrade — 2026-07-29

| Field | Recorded value |
| --- | --- |
| Release Git commit | `fbab098a38f6f33b661e991ef50e9521e8fe7260` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Operator identity principal | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_359_743_697_857` |
| Cycles balance after | `5_337_616_559_505` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `93a9ab8dc8b16929bcf32e3dd5823f5ff8a572f8633dbccf771dc608907c4a6f` |
| Installed module hash | `8fec1ba048185e9020b815d0dadc499b5305550ff7f27f314885b2acc17278cd` |
| Release `SHA256SUMS` hash | `e3aa3286d33760f72870fa38a799d26edebff4f047c86e942689dcad79cd9578` |
| Asset-manifest hash | `f37c1fc10e138acee75baf9c0077643029c5c44423278114b6ca1efa038c74f6` |
| Generated application hash | `7a01ed2dfecd57cbb075d7b157ddfb12d73127bc6120fd95102408dd1ec8f631` |
| Generated stylesheet hash | `5c47423d8ae5798dcc30176b61e17e8552e31b192e731362b5000846f6fffaac` |
| Deployment verification timestamp | `2026-07-29T18:44:27Z` |
| Verification | Installed module hash matched the canonical Wasm; `/`, `/asset-manifest.json`, `/.well-known/ii-alternative-origins`, and both generated assets returned certified HTTP 200 responses. |
| Notes | The consolidated verifier passed artifact and status checks, then its anonymous `icp canister settings show` probe was rejected because controller authorization is required. Direct `dfx` status and public certified-HTTP verification completed. No controller, freezing threshold, authentication configuration, or other setting changed; no transaction gate, cycle transfer, or NNS mutation was performed. |

## Minimal visual-system upgrade — 2026-07-29

| Field | Recorded value |
| --- | --- |
| Release Git commit | `bd98353b9086834806c9999866841dd4c9d5e424` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm /home/codexdev/src/Dendrite/dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_382_481_336_903` |
| Cycles balance after | `5_360_394_521_990` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `f8556ca1b5d8345b734b95241e0c1aad887f3b1d826d6d3a6a4b9f79ff63efd6` |
| Installed module hash | `93a9ab8dc8b16929bcf32e3dd5823f5ff8a572f8633dbccf771dc608907c4a6f` |
| Release `SHA256SUMS` hash | `638305ff85f1fef1ac6c2465490178e7b2a05ad2b4f065acaa5433b5d0231b29` |
| Asset-manifest hash | `2dcf25b388d301acfe23a5f8fe48c2ca862d89e5415765302cfe50683a6a1661` |
| Generated application hash | `4f2a7ce261d94c9399b3fbdd3e045d0a4ef8a78d7700510bc90a89e6130ec33b` |
| Generated stylesheet hash | `5c47423d8ae5798dcc30176b61e17e8552e31b192e731362b5000846f6fffaac` |
| Deployment verification timestamp | `2026-07-29T12:24:31Z` |
| Verification | Module hash matched; `/asset-manifest.json` and both generated assets returned certified HTTP 200 responses and byte-matched the candidate |
| Notes | No controller, freezing threshold, authentication configuration, or other setting changed; no cycle transfer or NNS mutation occurred. |

## Aggregated-rule upgrade — 2026-07-29

| Field | Recorded value |
| --- | --- |
| Release Git commit | `870ddfbd08e5599b405c007d4484991d6f0998f9` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_405_034_799_652` |
| Cycles balance after | `5_382_996_288_948` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `da0b1892880866e941b1c7461c0672ccc80d44a6b93fcb4727e63f26b4d36d0e` |
| Installed module hash | `f8556ca1b5d8345b734b95241e0c1aad887f3b1d826d6d3a6a4b9f79ff63efd6` |
| Release `SHA256SUMS` hash | `57715c5c45ef57995c6ba52e5c3bc47dfec8c996b32a7248a45373eeb2dd9784` |
| Asset-manifest hash | `8cda676c9d449cf51ba4f423f566ffab3f65f40ce815317a5f689d8b5ab44e7c` |
| Generated application hash | `dfc86dcd377a4c133182f3dfe537a1040fe1007c423686ea922c18836f9bcf60` |
| Generated stylesheet hash | `b88e8e9260e1394384e1ebcdf5ea7970a3dc7b2f3259cab6b2a29fd2a6c38036` |
| Deployment verification timestamp | `2026-07-29T07:25:00Z` |
| Verification | Module hash matched; `/`, `/asset-manifest.json`, and both generated assets returned certified HTTP 200 responses and byte-matched the candidate |
| Notes | No controller, freezing threshold, authentication configuration, or other setting changed; no cycle transfer or NNS mutation occurred. |

## Rules-first upgrade — 2026-07-28

| Field | Recorded value |
| --- | --- |
| Release Git commit | `8582e64` |
| Lifecycle client | `dfx 0.27.0` |
| Operator identity | `codex_local` |
| Deployment mode | `upgrade` |
| Exact upgrade command | `DFX_IDENTITY=codex_local DFX_WARNING=-mainnet_plaintext_identity dfx canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode upgrade --wasm dist/release/dendrite.wasm` |
| Controllers before and after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `5_428_266_033_775` |
| Cycles balance after | `5_406_247_854_072` |
| Freezing threshold before and after | `7_776_000` seconds |
| Previous module hash | `e2b621207262360035803d45c3a6e144116219751c5391c517e51b625eb28a02` |
| Installed module hash | `da0b1892880866e941b1c7461c0672ccc80d44a6b93fcb4727e63f26b4d36d0e` |
| Release `SHA256SUMS` hash | `249064631886d6244e35a467792339dc18e5158632b0e769d443bbddde0a8559` |
| Asset-manifest hash | `eeb605c876ba3aa74348f2dff3b1b210015f4d001b2d322383924c1f537bfb8b` |
| Generated application hash | `6fbb6d8d0eeb471ad86be18fc8dd27db8cb0d16f62ce1aad7103fc7a457b35fc` |
| Generated stylesheet hash | `59eb7b4de6930a5126bf23b216a545a091dae5e9ef0617a418a5ba374286bcb4` |
| Deployment verification timestamp | `2026-07-28T19:37:34Z` |
| Verification | Module hash matched; `/`, `/asset-manifest.json`, both generated assets, and `/.well-known/ii-alternative-origins` returned HTTP 200 with IC certification and byte-matched the candidate |
| Notes | The consolidated anonymous verifier could not read controller-only settings, as expected. Direct public HTTP verification completed. No controller, freezing threshold, authentication configuration, or other setting changed; no cycle top-up or NNS mutation occurred. |

## Initial installation — 2026-07-26

| Field | Recorded value |
| --- | --- |
| Release Git commit | `5be98b8a8bbc51828faba655c302580a9f1086fb` |
| Release tag | UNRUN |
| Production mapping | See authoritative [deployment identifiers](deployment.md) |
| Lifecycle client | `dfx 0.27.0`, used only as the direct credential-bearing management-canister client |
| Operator identity | `codex_local` |
| Operator identity principal | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae` |
| Wallet | None; no `--wallet` option was specified |
| Deployment mode | `install` |
| Exact install command | `dfx --identity codex_local canister install hp4av-oiaaa-aaaar-qcaha-cai --network ic --mode install --wasm /home/codexdev/src/Dendrite/dist/release/dendrite.wasm` |
| Controller list before | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Controller list after | `amzih-bssz4-twanl-zf6nr-bqsnn-d7rlt-eerbc-oe7vv-uggn5-3naqo-3ae`, `zkkkd-i34qc-367ln-e2u7o-ezznu-dkfqh-gtfvz-cviph-6qa4v-evtfs-wqe` |
| Cycles balance before | `2_284_571_107_661` |
| Cycles balance after | `2_262_848_218_764` |
| Freezing threshold before | `7_776_000` seconds |
| Freezing threshold after | `7_776_000` seconds |
| Canonical Wasm SHA-256 | `1291a51cc26bcdd1ea387f6509aeef3f9c39e19f04f58495576f842873aa371a` |
| Installed module hash | `1291a51cc26bcdd1ea387f6509aeef3f9c39e19f04f58495576f842873aa371a` |
| Release `SHA256SUMS` hash | `090f2cba0cfa230323506d8051bda7b18866da3a0f4f787264dfb0e56d28ad7b` |
| Frontend tree hash | `9eca27496a792732545e4f8eba8e686db14b7f15258415a1307cc058c9618ed3` |
| Asset-manifest hash | `1791938f3a445cbaf3d5c21afe6ff5a1313d309e5e652ca8a4102f60660c82eb` |
| Build-configuration hash | `ff7d399c7f3ff4baaa79904bc76e5edcd7d1c502c0eab4e5b684da444f79121d` |
| Transaction Candid hash | UNRUN |
| Generated declaration hash | UNRUN |
| Command policy hash | UNRUN |
| Response policy hash | UNRUN |
| SBOM hashes | Recorded in `dist/sbom/SHA256SUMS` at the release commit |
| Deployment timestamp | `2026-07-26T08:23:22Z` |
| Gate 1 result | UNRUN |
| Gate 2 result | UNRUN |
| Known limitations | `tools/scripts/verify-mainnet-readonly.sh` did not complete: its anonymous `icp-cli` controller-settings read was rejected, and direct follow-up verification found `/asset-manifest.json` returns HTTP 404. Other directly checked routes (`/`, `/index.html`, `/.well-known/ii-alternative-origins`, `/404.html`, and the hashed JS/CSS assets) return HTTP 200; the well-known document is exactly `{"alternativeOrigins":[]}`. |
| Operator notes | `icp-cli 1.2.0` remained the release and no-write dry-run client. No controller, freezing-threshold, or other settings change was made. No cycles wallet was used. All `dfx` management calls ran from a temporary directory outside the repository, which was removed; no dfx project configuration was introduced. No push, NNS mutation, or blackholing was performed. |

## November 13, 2026 — creation protocol compatibility review

This review follows the experimental creation deployment above. It does not change
any Dendrite Standard predicate, custody boundary, financial request identity,
known-manager configuration or D-QUORUM behavior. Initial inspection used only
anonymous replica-signed queries and IC-root-verified `read_state` certificates
through `https://icp-api.io`, with normal certificate/delegation/time verification.
All four certificates verified at 09:33–09:34 UTC. The reported CMC failure was an
installed-module mismatch, not missing certified evidence. All four exact hashes
mismatched the local uncompressed PocketIC pins:

| Dependency | Certified installed SHA-256 | Exact local test SHA-256 |
| --- | --- | --- |
| CMC `rkp4c-7iaaa-aaaaa-aaaca-cai` | `c5e9adf7c953f1922fd75d502a38aa4c0f1fefb6ce877845a8e374c07ca2f950` | `1473c16c544f3ee6b86449107c4118f336e648eed3146b60edd0a8e143e89d56` |
| Governance `rrkah-fqaaa-aaaaa-aaaaq-cai` | `7f85124ee08c3f59c0050009268807c7aea2b80ee296c23338b05458888f19df` | `dbcf97ae8729a956521a0a928f1b1bcb93f6e9c0dafd0e42aa985588713b88c0` |
| ICP Ledger `ryjl3-tyaaa-aaaaa-aaaba-cai` | `51f4be010f23064137defacd627ffbec024c5133210c68ca3b80ab8f257101d6` | `538fc204379c53f6cb9ddc70c11122a0a26f6a7a7a01a0a2a6c30c5d3c76ef4d` |
| Cycles Ledger `um5iw-rqaaa-aaaaq-qaaba-cai` | `70f8bd40d022374622b34266d2c182d2a5b711d965f3bef9e505467a84c40bce` | `a19eb3490ce67255ac6f4873f25b9f7d20abf78030f4782f8ee1b66f42cd2763` |

Executable provenance is distinct from certified installation evidence. Downloaded
published artifacts independently hash to the certified installed values above:

- [CMC artifact](https://download.dfinity.systems/ic/237a41f0f03801f24d6eda835248bcb5ce189f0e/canisters/cycles-minting-canister.wasm.gz),
  source `237a41f0f03801f24d6eda835248bcb5ce189f0e`, raw Wasm
  `ac0e651d0363a81f85316198d08f51ce3eb0bd4cabfd5d25a95c4414ad296931`.
- [Governance artifact](https://download.dfinity.systems/ic/98c898f8de068a1fc0e97ebc805f9fa7f315d862/canisters/governance-canister.wasm.gz),
  source `98c898f8de068a1fc0e97ebc805f9fa7f315d862`, raw Wasm
  `5ddc11d2c59d0199c48e50dcc29c5ac6d10011daa6a7594eee954bfc140e3944`.
- [ICP Ledger artifact](https://download.dfinity.systems/ic/69b755062f5ef0a7d6efc9a127172b46121420c8/canisters/ledger-canister_notify-method.wasm.gz),
  source `69b755062f5ef0a7d6efc9a127172b46121420c8`, raw Wasm
  `fca0a9713133c67edf4ba0375c64afb81561123a4fe2b53b4bac740e7e1048f5`;
  [published upgrade proposal 138271](https://dashboard.internetcomputer.org/proposal/138271).
- [Cycles Ledger v1.1.0](https://github.com/dfinity/cycles-ledger/releases/tag/cycles-ledger-v1.1.0),
  source `58f1d01ce1e5e41e61005f8103cc7560e9d81cc2`, release asset digest
  `70f8bd40d022374622b34266d2c182d2a5b711d965f3bef9e505467a84c40bce`.
  Decompression produces exactly the existing local Wasm hash, not another
  executable. The release Candid hash is
  `af8f846f268d1ca34f51d1c9b00ed77f90c11e8c3aa288fd915eae5aea28457f`.

The first three published Wasms also contain `icp:public git_commit_id` sections
matching those exact source revisions and embedded Candid matching the published
source files. DFINITY's [mainnet revision catalogue](https://github.com/dfinity/ic/blob/master/mainnet-canister-revisions.json)
corroborates their hashes; that mutable catalogue and dashboard metadata do not
replace the certified installed-module reads or artifact digest checks.

The compatibility review covers these implementation assumptions:

- CMC `notify_mint_cycles` validates the original ICP payment destination/memo,
  retains per-block notification status, returns the same recorded result on
  repeated notification, and does not mint twice. Its implementation at the
  reviewed mainnet revision differs from the local source only in diagnostic
  printing. Conversion quote fields match the live signed query; timestamp,
  fee and budget freshness checks remain mandatory before dispatch.
- Cycles Ledger `create_canister`, its controller settings, exact timestamp/burn
  deduplication, duplicate canister ID, refusal/refund distinctions and bounded
  dispatch reservation use the identical v1.1.0 executable already tested locally.
  Compression changes its installed module identity only.
- ICP Ledger legacy and ICRC transfers retain exact account/memo/timestamp
  identities, fee validation, deduplication and the finite transaction window.
  Reviewed `ledger_canister_core::apply_transaction` still performs age/future and
  duplicate checks before applying a transaction and recording its block.
  Duplicate/expired/ambiguous history never grants a replacement payment identity.
  Changes to burn/mint fee validation do not authorise normal transfer retries.
- Governance claim/controller/staking-subaccount binding, configuration,
  visibility, following, dissolution and proposal handling were compared with
  the local source. `governance.rs` differs only by a return-type lifetime in
  `ready_to_be_settled_proposal_ids`; `network_economics.rs` and `governance.proto`
  are byte-identical. In particular `make_proposal` and its dispatch through
  `manage_neuron` are identical. Audited refusal codes 3–8, 11 and 14 occur before
  fee charging/proposal insertion. After insertion it returns a proposal ID even
  if execution fails; External(12), malformed and unknown codes remain unresolved.
  This source/behavior review, rather than interface compatibility alone, is the
  basis for accepting this specific Governance executable in refusal verification.

The browser now keeps the unchanged exact local pins separate from the static
reviewed mainnet registry in `src/declarations/bootstrap/protocol-mainnet.json`.
Both published gzip and raw encodings are explicitly reviewed. Unknown identities,
wrong canister IDs and missing/malformed certified evidence remain blocked.
Preflight collects and displays all four statuses before allowing funding. A
historical financial/refusal witness is checked against its own certified module;
a newer installed version cannot replace that binding. Previously accepted
historical bindings remain readable, without authorising new mainnet dispatches
under an unreviewed local fixture version. The previously deployed bootstrap
`ac7e2907…32b107` remains an exact reviewed historical asset for existing receipts
and explicitly consented same-canister migration.

Read-only production probes decoded all nine previously recorded query methods.
A complete conditional one-manager RecoverableTest preflight also succeeded with
actual public manager `428687636340283207` and its observed controller authority,
without a signer, II authentication, updates or financial effects. This proves the
read-only dependency/manager checks conditional on signing in as that authority;
it does not claim to have authenticated as that manager. Alpha-vote's public
record did not establish a self-authenticating creator authority for this probe.
RecoverableTest remains one-manager, non-compliant, controller-recoverable and
ineligible for irreversible finalisation.

Raw read-only inspection, source comparisons and downloaded artifacts are retained
locally under ignored `dendrite/dist/protocol-review-20261113/`; they are not tracked
artifact URLs. Run `node tools/scripts/inspect-creation-mainnet.mjs <manager-id>`
from `dendrite` to repeat production read-only checks. The
`creation_mainnet_protocol` qualification command executes monetary behavior only
inside PocketIC with checksum-verified published executables; it makes no mainnet
financial or Governance updates.
