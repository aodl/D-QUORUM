# Security

## Threat boundaries

The route-loaded public report never invokes Dendrite. Transaction
controls rely on fresh transaction-scoped Dendrite review and final preflights; the
public report itself never authorizes a mutation.
Explicit operation ownership also prevents an old success, old failure, or old
`finally` block from mutating a replacement route or clearing its loading state.

Dependency query failures retain their bounded typed failure kind, message, and exact
requested IDs. Invalid batches are rejected atomically, failed promise-cache entries
remain retryable, and no analysis cache is persisted.

All neuron fields, strings, URLs, principals, errors, routes, IDs, and upstream
collections are untrusted. Typed clients enforce bounds and reject unexpected or
duplicate records before map construction. Successful omission is factual evidence;
rejection, decode failure, or structurally invalid evidence remains unavailable.
Unknown protocol semantics require a standard update.

The frontend creates text-safe DOM nodes, validates HTTPS links, never uses dynamic
`innerHTML`, and keeps NNS IDs as decimal strings or `bigint`. Production uses a
validated build-time canister principal, a fixed API origin, no root-key fetching,
strict CSP, and no third-party runtime content.

The rules interface preserves policy status as visible text; check, cross, question,
warning, and update symbols are decorative and hidden from assistive technology.
Each native row-disclosure button exposes `aria-expanded` and `aria-controls`; pointer
activation across the summary row delegates to that button without turning the table row
into an ARIA button. Links, copy controls, and text selection do not toggle a row.
Repeated copy actions use 44-pixel icon targets with complete accessible names and
transient `aria-live` feedback. Responsive rows wrap status and long titles without page
overflow, all frequent targets are at least 44 CSS pixels, focus uses a two-pixel
high-contrast perimeter, and reduced-motion and forced-colour modes are supported.
Status filtering, disclosure, and Raw Report copying issue no network request and persist
no preference. Canonical-origin authentication lives in the navbar; authority, receipts,
and mutation controls are kept in a top account workspace visible only when applicable.
Rule-group disclosures use the same native-button semantics, expose complete status
counts in their accessible names, retain focus while closing, and remove hidden child
controls from navigation. Controller diagnostics construct one exact Dashboard URL
from the structured target-controller principal through the reviewed HTTPS-link helper;
the visible link never initiates a fetch or preflight. Retained controller and hotkey
principals remain copyable text and are not assumed to identify canisters.

Public report loading adds separate anonymous read boundaries. Its generated actor
exposes only `list_neurons` and explicit-ID `get_neuron_info`, fixes Governance as the destination, explicitly requests
only public full neurons for bounded IDs, and verifies query signatures. Every response
batch is rejected atomically for unexpected/duplicate IDs, invalid paging, duplicate
topic keys, collection or string bound violations, invalid topic variants, contradictory
stake arithmetic, or inconsistent target timestamps. The in-memory promise cache is
route-scoped, never uses browser storage, and evicts failed entries. The browser does
not call management-canister `canister_info`; it performs only `read_state` for
the exact controller returned by validated Governance evidence. Controller rules can
pass or fail only after signature, freshness, effective-ID, delegation/range, exact
CBOR, controller bound, principal length, and module-hash status validation. Failure is
indeterminate and yields no partially trusted result.

Internet Identity introduces a browser-only boundary. Its app-origin parent may be
unscoped and remains private bootstrap authority. A signed child restricts the final
transaction key to fixed NNS Governance. Credentials are never logged, rendered,
serialized to Dendrite, or sent to the canister. Every mutation requires fresh authority evidence, an immutable exact review,
explicit confirmation, strict response validation, and no automatic retry. Ambiguous
outcomes block another mutation until acknowledged; this coordination and the single
current receipt are bounded, heap-only, and lost on reload.
Crossing the NNS update boundary with no conclusive response immediately removes
mutation controls. The public report stays visible. A later transaction-scoped
`check_neuron` does not clear the unresolved-outcome lock; acknowledgement
clears only that lock and never fabricates a verification. Known Governance rejection
and final-preflight failure remain non-ambiguous and do not take this path.

The transaction pipeline performs a Dendrite `check_neuron` update when preparing an
exact review and performs a new one immediately before mutation.
`LowCycles`, rate limiting, concurrency, duplicate-in-flight, transport, or decode
failure affects only Management; the public verdict remains unchanged and no NNS
mutation is sent after a failed final preflight. Successful mutation triggers a new
route-owned public report and discards the transaction-scoped preflight result.

Replicated controller blackholing is proven only by successful `canister_info`, no Wasm,
and no controllers. The browser report requires certified empty controllers and
certified module-hash absence. The neuron-to-controller relationship is replica-signed
Governance query evidence, not certified system-state evidence. A failed lookup is
indeterminate. During development and qualification, Dendrite's own controller can
replace both verifier code and the transaction-signing frontend and therefore remains
an explicit operator trust boundary. The intended terminal blackhole removes that
boundary irreversibly only after the documented final gate; it also removes every
recovery path. Other boundaries are the certified frontend, browser
runtime, Internet Identity, NNS Governance, management-canister reads, target and
manager neurons, build environment, release artifacts, and production lifecycle
identity.

Cycle exhaustion is bounded by a fixed 2T liquid-cycle reserve, at most two concurrent
checks, one in-flight check per neuron, and 20 admitted starts per 60 seconds. Guard
entries are heap-only, prune after 300 seconds, expose no counters, and reset on
upgrade.

Receiver checks request only explicit deduplicated IDs and distinguish readable,
not-returned-to-caller, and unavailable evidence. Final transaction preflight
fingerprints security-relevant authority and configuration while allowing ordinary
stake, time, and voting-power progression. A changed refresh timestamp or receiver
controller/hotkey set invalidates the review.

## Dependency exceptions

Creation's additional trust boundary is the provisional controller P: P can replace
C's reviewed code until all canister controllers are removed. A module checksum
does not constrain its controller's future actions. The bootstrap authenticates P,
fixes its one plan/neuron/return account, and retains dispatched effects across
upgrades; the service stores no onboarding state. Separately consented creation
delegations use named short-lived targets and memory-only keys. Management target
scoping does not restrict arguments or prevent another P-owned canister being
addressed. Exact request review and replica controller checks remain essential.

Receipts contain public operation identities and certified transition evidence,
never credentials. Imported JSON is bounded, schema checked and independently
verified; a checksum supplies no authority. Registration and rehearsal are observed
Governance decisions, not creator-supplied flags. Readiness uses current evaluator
results and replicated controller history. Uninstall precedes empty controllers,
with fresh checks at both steps and an unavoidable non-atomic gap. See
[creation and recovery](operations/creation.md) for the financial and restart limits.

| Package/version | Reachability | Exception and removal condition |
| --- | --- | --- |
| `paste 1.0.15` | Transitive Candid compile-time macro | RUSTSEC-2024-0436 abandonment; review on Candid update or 2026-12-04 |
| `pocket-ic 15.0.0` | Workspace development only | Required local consensus scenarios; remove on compatible replacement |
| `backoff 0.4.0` | PocketIC development tree only | Remove when PocketIC removes it or if production reachability changes |
| `instant 0.1.13` | PocketIC development tree only | Remove when PocketIC removes it or if production reachability changes |
| `serde_cbor 0.11.2` | Official certification libraries and PocketIC | Not directly used by application code; review when certification reachability changes |

Automated dependency reachability fails if `pocket-ic`, `backoff`, or `instant` enters
the production Wasm normal/build tree. Lockfiles, advisory scans, reproducible
comparison, and SBOMs are compensating controls. The existing Apache-2.0 LLVM
toolchain expression remains the narrow license-policy exception.

## Scoped browser credentials and reviewed tooling findings

The final transaction key is restricted by a signed Governance-only child delegation.
An unscoped II parent is accepted only as private bootstrap authority. It is not an
acceptable transaction identity. All ancestor restrictions still apply, the original
app principal is preserved, and every link must be live. Real replica tests exercise
allowed Governance requests, denied non-Governance requests against a working control
destination, and invalid signing keys/expired or excluding ancestors. Client structural
checks alone do not verify all cryptographic signatures.

Narrowing limits the final transaction key. Hostile same-origin JavaScript while the
bootstrap signer is accessible can still misuse bootstrap authority. Local sign-out
removes local authority; it does not revoke already accepted requests or promise
network-wide revocation of an issued delegation. No browser credentials, private keys,
WebAuthn material, cookies, or complete delegation chains belong in retained evidence.
The pinned signer SDK can take its 120-second establishment timeout to report a popup
closed before the handshake; the browser cancellation regression uses that actual bound.

The November 2026 tooling review upgrades Puppeteer 24.36.0 to the supported 25.16.0
release and pins its matching Chrome 156.0.8078.47 container digest. The old 24.x
candidate remains affected by the reviewed chromium-bidi range. CycloneDX npm 6.0.1
fixes its Windows workspace shell-injection advisory; the trial of 6.0.1 and retained
5.0.0 established that staying on 5 leaves that high-severity finding. Compatible
lockfile fixes and brace-expansion 5.0.12 remove the other high findings. Runtime auth
7.1.0/core 5.4.0 are unchanged. Raw before/after full-development scans remain evidence;
zero production-only findings do not stand in for this review.

Two moderate advisories remain present in the development lockfile:
GHSA-3g3m-2fjr-6pw4 (glob 10.5.0 cancellation traversal) and
GHSA-g3hv-75wg-m249 (minimatch 9.0.9 pattern amplification). Their only logical path is
CycloneDX npm → optional libxmljs2 → node-gyp → make-fetch-happen → cacache → glob →
minimatch. They are native XML binding build dependencies, not the JSON SBOM serializer
or JSON validator. Installation and execution use --ignore-scripts; SBOM output is
explicitly JSON and retains schema validation. check-tooling-audit.py rejects any new
advisory or changed path/version and requires JSON generation to succeed while loading
these exact modules throws. A positive control must also demonstrate the trap rejects
an actual glob load. This is a specific non-executable-path applicability exclusion,
not a severity change, a general ignore, or a claim the packages are fixed. Raw npm and
OSV findings are retained. The two OSV exclusions expire 2026-12-04 and require renewed
review if the tool/path/configuration changes. The four previously reviewed Rust
maintenance notices retain their individual reasons and the same next-review date.

Creation recovery separates authentic historical transitions from fresh current
power. Historical certificate verification still checks the BLS signature, subnet
delegation and canister range, exact original ingress request and reply. Its SDK
clock is anchored narrowly to that certificate's signed time, with original-request
and present-future bounds. This does not renew a signing credential or substitute
for fresh module/controller, Governance and controller-history observations. A
static source-reviewed artifact map permits the two qualified V1 build variants;
unknown modules fail closed. An explicit upgrade binds the old module and new
module while preserving the original plan, accounts, nonce and pending operations.
Removed code is never reinstalled to resume finalisation.

Governance ballots are caller-filtered. Exact proposal execution and its aggregate
tally demonstrate the network's decision under that proposal's electorate. Fresh
following establishes present configuration. Neither proves historical voter IDs,
uninterrupted membership, independent humans or creator authority over every
manager. Other managers vote under their own existing authority, without granting
the creator hotkeys. Proposal refusal recovery requires a certified typed response
for the pre-reserved full ingress request ID, not just equal arguments or an error
message. Unavailable original evidence preserves uncertainty.

The unused controller-default ICP account is distinct from stake and user-owned
workflow accounts. Teardown requires an explicit C/T/plan-bound acknowledgement
of its observed balance and later arrivals. Unsolicited deposits do not revoke it.
There is no new sweep endpoint. Actual creation liabilities must still settle.
Financial attempts retain their independently prepared timestamps and ingress IDs;
the permanent staking nonce is never renewed. A bounded purpose-specific ICRC-2
compare-and-set reservation prevents competing tabs from both gaining dispatch
authority. Its additional fees and prior consumed reservation fees are reviewed;
its management-principal spender is not an application signing credential.

The pinned signer 5.4.0 heartbeat source receives a digest-bound build patch in
`canisters/dendrite/web/sdk-heartbeat-policy.mjs`. It retains recent pending IDs,
checks the source and JSON-RPC shape for both ready and pending replies, and
schedules polls only after matching replies. Production and local builds apply
the same patch. Original and patched source hashes are fixed; drift fails the
build. Timeout durations, delegation expiry and certificate checks are unchanged.
Focused SDK tests include unpatched negative controls; they are not replica or
II authentication evidence. Same-origin script compromise remains within the
provisional controller trust boundary described above.
