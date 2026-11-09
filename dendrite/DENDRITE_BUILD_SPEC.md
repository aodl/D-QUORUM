# Dendrite build specification

**Status:** normative browser-to-NNS management and per-neuron creation tranche

**Standard identifier:** `nns-dendrite/1.1-draft`

**Pinned NNS source:** `d55a0f4d4edfabe49d8fd543aff473084cb741f2`

## 1. Product

Dendrite does exactly seven things:

1. serves a certified landing page from one Rust canister;
2. accepts a canonical NNS neuron ID;
3. executes one live consensus-backed verification;
4. displays the complete NNS Dendrite Standard report; and
5. stores no application data;
6. lets the browser authenticate with Internet Identity without authenticating to
   Dendrite; and
7. compares that browser principal locally with manager authority evidence in the live
   report.

Typed proposal construction, review, submission, manager voting, and readiness
assistance run only in the browser through one fixed NNS Governance actor. Internet
Identity supplies an app-origin parent. The pinned SDK appends a genuinely signed
Governance-only child before exposing the transaction signer; all ancestor restrictions
remain effective. Dendrite never receives or reconstructs a delegation or authenticated
principal. The creation workflow may provision one temporary bootstrap canister per
new neuron, retaining bounded state until its code and controllers are removed. It
is not a shared factory, wallet, treasury, signing proxy, or application database.
Dendrite itself remains stateless and D-QUORUM's independent automation is unchanged.
General proposal-history browsing, new reward policy, timers, indexers, analytics,
and background work remain out of scope. Creation recovery may explicitly search
one bounded page of actual Governance proposals for its original marked request;
a possible match is not authority, proof of execution, or permission to resubmit.

## 2. Fixed standard constants

- Alpha-vote: `2947465672511369`.
- Omega-vote: `18363645821499695760`.
- Omega-reject: `18422777432977120264`; it is never omega-vote.
- Source revision: `d55a0f4d4edfabe49d8fd543aff473084cb741f2`.
- `ONE_DAY_SECONDS = 86_400`, `ONE_YEAR_SECONDS = (4 * 365 + 1) *
  ONE_DAY_SECONDS / 4`, and `ONE_MONTH_SECONDS = ONE_YEAR_SECONDS / 12`.
- Maximum dissolve delay: `2 * ONE_YEAR_SECONDS = 63_115_200` seconds, established by
  the pinned post-Mission-70 Governance source. A future change requires a new
  standard/source revision, not a runtime economics call.
- Recent voting-power refresh threshold: `6 * ONE_MONTH_SECONDS = 15_778_800`
  seconds.
- Maximum followees per topic: 15.
- Minimum distinct managers: 5.
- Target hotkeys: empty.
- Target `not_for_profit`: false.

NNS IDs are `nat64`; JavaScript uses canonical decimal strings or `bigint`, never
`number`.

## 3. Result semantics

Rule statuses are `PASS`, `FAIL`, `WARNING`, `INDETERMINATE`, and
`STANDARD_UPDATE_REQUIRED`. Overall status is, in order:

1. `NON_COMPLIANT` if any mandatory rule fails;
2. `STANDARD_UPDATE_REQUIRED` if none fail and any requires a standard update;
3. `INDETERMINATE` if neither above applies and mandatory evidence is unavailable;
4. otherwise `COMPLIANT`.

Factual mismatches are `FAIL`. Rejected, undecodable, oversized, or otherwise
unavailable upstream evidence is `INDETERMINATE`. Unknown protocol semantics are
`STANDARD_UPDATE_REQUIRED`. Evaluation emits every independent result supported by
available evidence and never invents a pass.

The returned `ComplianceReport` contains:

- standard version, pinned source revision, target ID, and NNS evidence snapshot timestamp;
- explicit target summary where available;
- raw ordered manager summaries with explicit found, confirmed-missing, or unavailable
  evidence status and bounded controller/hotkey evidence only when found;
- committed-topic summaries;
- non-committed-topic checks;
- controller-canister evidence;
- rule results;
- bounded typed source failures; and
- overall status.

Each `RuleResult` contains only a stable rule ID, status, concise message, optional
observed and expected values, optional topic code, and related neuron IDs. The report
does not contain a digest, cache timestamp, stale flag, provenance graph, or flattened
generic summary-field list.

## 4. Direct Standard rules

The public catalogue contains only requirements of the neuron and its configured
governance relationships. It has 23 distinct rules in six explicit groups; a topic
rule may have multiple underlying evaluations without increasing the distinct-rule
count.

### Neuron identity and commitments

- `DENDRITE-KNOWN-001`: Neuron data is public.
- `DENDRITE-KNOWN-002`: Neuron is registered as a known neuron.
- `DENDRITE-KNOWN-003`: At least one topic is committed.

### Lock and voting power

- `DENDRITE-LOCK-001`: Neuron is locked.
- `DENDRITE-LOCK-002`: Dissolve delay is 2 years.
- `DENDRITE-LOCK-003`: Effective stake is positive.
- `DENDRITE-ACTIVE-001`: Voting power was refreshed within 6 months.
- `DENDRITE-ACTIVE-002`: Deciding voting power equals potential voting power.

### Control and immutability

- `DENDRITE-CONTROL-001`: Controller is a canister.
- `DENDRITE-CONTROL-002`: Controller canister has no installed code.
- `DENDRITE-CONTROL-003`: No principal controls the controller canister.
- `DENDRITE-CONTROL-004`: Neuron has no hotkeys.
- `DENDRITE-CONTROL-005`: The neuron must have `not_for_profit = false`.
  This flag restricts certain Governance proposal commands. It does not establish a
  universal prohibition on dissolution, maturity disbursement or economic operations.

### Manager group

- `DENDRITE-NM-001`: There are 5–15 managers.
- `DENDRITE-NM-002`: Manager list contains no duplicates.
- `DENDRITE-NM-003`: Neuron is not its own manager.
- `DENDRITE-NM-004`: Every manager is a public known neuron.

### Committed-topic delegation

- `DENDRITE-COMMIT-001`: Each committed topic has at least 3 delegates.
- `DENDRITE-COMMIT-002`: No committed topic repeats a delegate.
- `DENDRITE-COMMIT-003`: Every committed delegate is also a manager.
- `DENDRITE-COMMIT-004`: Every manager that the target follows as a delegate follows
  only omega-reject, neuron `18422777432977120264`, on that same topic. This applies
  independently of commitment classification. Neuron Management is exempt.

### Default following

- `DENDRITE-DEFAULT-001`: Every currently recognised uncommitted topic follows exactly
  one approved default: alpha-vote neuron `2947465672511369`, omega-vote neuron
  `18363645821499695760`, or omega-reject neuron `18422777432977120264`.
- `DENDRITE-DEFAULT-002`: Catch-all follows exactly one approved default from that same
  set.

Report integrity is an implementation invariant, not a scored neuron rule. Every
unavailable lookup makes all and only its dependent substantive rules indeterminate;
required unavailable data can never pass. Standard version, source revision,
timestamp validity, source-failure bounds, and construction consistency are
preconditions for a normal report. A broken precondition returns a bounded analysis
error, including during transaction preflight, and never blames the neuron.

Commitment is determined structurally from the numeric following map so a blackholed
Dendrite does not depend on an evolving topic-name catalogue. A concrete topic is
committed when it is declared by known-neuron metadata or has a non-empty following
list other than an approved singleton default. Unknown declared Candid variants are
descriptive compatibility evidence only; additional uncommitted numeric topics are
inert. CatchAll and Neuron Management never become committed topics.

Raw following vectors and map-like Candid vectors must remain intact until duplicate
checks finish. Duplicate topic keys, duplicate target/dependency records, unexpected
records, and contradictory records are invalid responses, not values to overwrite.
Activity is evaluated against `NeuronInfo.retrieved_at_timestamp_seconds` from the
target response. A refresh timestamp after that NNS snapshot invalidates the target
batch; Dendrite canister time is not cross-compared with NNS timestamps.

## 5. Topics and graph bound

Recognise the current topic-code domain from the pinned source for labels and default
coverage: CatchAll,
Neuron Management, Exchange Rate, Network Economics, Governance, Node Admin,
Participant Management, Subnet Management, Application Canister Management, KYC,
Node Provider Rewards, IC OS Version Deployment, IC OS Version Election, SNS and
Community Fund, API Boundary Node Management, Subnet Rental, Protocol Canister
Management, and Service Nervous System Management. Reserved topic code 11 and future
numeric codes use safe numeric fallback labels and structural commitment evaluation.

The defensive graph proof uses the bounded following map rather than the current topic
catalogue. With at most 64 topic entries and 15 followees per entry, the unique
dependency set cannot exceed `64 * 15 = 960` IDs. Alpha-vote, omega-vote, and
omega-reject are not added solely as reference metadata dependencies.

Known-neuron data is bounded in bytes exactly as in the pinned source: name 200,
description 3,000, at most 10 links, and 100 per link. Valid strings are preserved
exactly rather than truncated. `committed_topics` entries are decoded as bounded
`reserved` values: they remain descriptive metadata and a future Governance variant
cannot make the response undecodable. Numeric following keys alone supply
future-stable compliance semantics and labels use the current 18-code catalogue.
Target committed-topic and following-map wire vectors have a defensive bound of 64
entries. Dependency committed topics are not interpreted. Each followee vector
remains bounded to 15. Hotkeys, controller lists, module hashes, and returned full-
neuron collections retain their pinned bounds. Impossible stake subtraction or
addition invalidates the batch.

## 6. Production architecture and API

There is exactly one long-lived Dendrite service, `dendrite`. It embeds deterministic frontend
assets, serves them through HTTP certification v2, collects fixed public evidence, and
runs the pure rule engine.

Its application API is exactly:

```candid
service : () -> {
  check_neuron : (nat64) -> (CheckResult);
  controller_observation : (nat64) -> (variant { Ok : ControllerObservation; Err : DendriteError });
  http_request : (HttpRequest) -> (HttpResponse) query;
}
```

Generated Candid support methods do not count as application APIs. There is no cached,
refresh, configuration, proposal, authentication, stored-history or generic outbound
method. `check_neuron` is an update call and its response is the trusted live result.
`controller_observation` is the bounded replicated read described below; it exposes
the actual public T-to-C binding and management-history counter without storing it.
Dynamic compliance certification and client-side Merkle proofs do not exist.

The canister has no stable application state. It stores no report, digest, configuration,
counter, rate-limit record, history, delegation, or user data. Asset certification is
recreated from embedded assets at install and upgrade. The only mutable runtime state is
a tiny heap-only abuse guard, which may reset on upgrade and is not publicly exposed.

## 7. Minimal evidence client and interfaces

Use one narrow `EvidenceClient` trait with exactly:

- `list_neurons(ids)`; and
- `get_neuron_info(id)`; and
- `canister_info(controller)`.

Provide one fixed-destination production implementation and one recording fake for
tests. No caller can supply a destination, method name, principal, or Candid blob.
Production Governance calls go only to the compile-time NNS Governance principal and
methods `list_neurons` and `get_neuron_info`. Management calls go only to the management canister method
`canister_info` with `num_requested_changes = 0`.

Use a small checked-in reviewed Candid subset containing only exact wire types required
by those methods. Production builds do not fetch interfaces, run bindgen, depend on
broad `dfinity/ic` crates, or include generic transport. Keep semantic drift checks
against the pinned upstream source.
The `NeuronInfo` subset retains only `retrieved_at_timestamp_seconds`; additional
upstream record fields are skipped by Candid decoding.

Known-neuron status comes only from the `known_neuron_data` returned for the exact
requested neuron. Never call
`list_known_neurons`, `get_network_economics_parameters`, proposal methods, or mutation
methods.

Typed source failures remain typed through collection and are bounded. Each records the
fixed method, kind, concise message, and affected neuron IDs. The taxonomy is
`Rejected`, `DecodeFailed`, `InvalidResponse`, and `ResponseTooLarge`. A successful
response that omits a requested full public neuron is evidence, not a source failure.

## 8. Exact live call plan

1. Call `list_neurons` for the target with public full-neuron inclusion enabled.
2. Validate the target batch atomically, including page count, full-neuron and
   neuron-info IDs, duplicates, topic keys, pinned collection bounds, stake arithmetic,
   and a nonzero matching target NNS snapshot timestamp.
3. If a valid successful response omits the target, return a completed `NON_COMPLIANT`
   report. If no valid NNS snapshot timestamp exists, return a bounded analysis error.
   In either case, make no dependency or controller call.
4. Otherwise preserve raw following vectors; extract raw managers and committed-topic
   delegates; build the unique dependency set. Do not add alpha-vote, omega-vote, or
   omega-reject solely to inspect their metadata.
5. Enforce the derived 960-dependency invariant.
6. Split dependencies into batches of at most 50 IDs and call `list_neurons` once per
   batch.
7. Validate each batch atomically. Every requested ID becomes `Found`,
   `ConfirmedMissing`, or `Unavailable`; an invalid batch retains no partial record.
8. Treat confirmed omissions as factual failure of their known-neuron requirements and
   unavailable evidence as indeterminate only for rules that require affected IDs.
9. Call `canister_info` for the target controller with zero requested changes.
10. Normalize evidence, run the pure engine, return the report, and store nothing.

## 9. Abuse protection

Before admission, reject a zero ID and reject when liquid cycles are below the fixed
reserve. In heap memory only, reject a simultaneous check for the same neuron, cap total
concurrent checks at two, and cap globally admitted starts in a short fixed window.
Return one bounded suggested delay for temporary rejection. The guard resets on upgrade,
has no stable persistence, no per-user state, and no public counters. Each admission
prunes in-flight entries at least 300 seconds old so a post-await trap cannot consume a
slot indefinitely.

### Per-neuron creation exception

One additional deployable component type, `dendrite-bootstrap`, is permitted. Each
instance binds actual creator caller P, one immutable creation identifier/nonce, a
reviewed plan, a fixed return account, and at most one claimed neuron T. The canister
principal C remains T's controller after code and controller removal. Initially C's
exact controller list is `[P]`; P can replace its provisional code. The bootstrap
receives no browser credentials and has no arbitrary command, recipient, target,
upload, forwarding, factory or timer endpoint. Its bounded versioned stable state
preserves dispatched intents across upgrades. Existing Dendrite methods/results and
the D-QUORUM API and stable V3 remain unchanged. The additive stateless controller
observation is required for creation's stopped-canister readiness proof.

Production candidates require registration first and verified manager rehearsal,
then explicit uninstall followed by a separate explicit empty-controller update.
Only the two known bootstrap code/controller failures may remain at readiness; the
unchanged evaluator supplies the actual final verdict. Recoverable one-manager test
creations remain non-compliant and cannot enter irreversible finalisation. Imported
non-secret receipts establish no authority and never substitute for replicated
Governance/ledger evidence and fresh certified system state. Financial ambiguity
retains its exact operation identity, even after deduplication windows expire.
An explicitly selected recovery-only resume MAY use current approved installed
code, exactly `[P]` controllers, a fresh owner-authenticated replicated original
plan and the current public Governance C/T/account binding when historical creation
proof is unavailable. Before dissolution or any return payment it MUST re-establish
those bindings and the fixed return destination. It MUST NOT enable provisioning,
plan edits, configuration, registration, code removal or controller removal. Missing
code cannot use this path. Existing original financial identities and uncertainty
remain binding. This exception does not relax certificate/delegation freshness or
the historical provenance required for irreversible finalisation; P's provisional
ability to replace code remains explicit.
Historical transitions MUST retain signature, exact request and subnet/canister
binding checks; their age alone MUST NOT expire a creation. Present authority and
credentials MUST retain ordinary freshness checks. Supported historical modules
MUST be source-reviewed static identities, never arbitrary receipt-nominated Wasm.
The permanent staking nonce MUST remain distinct from each payment's dispatch
identity. Definitive refusal recovery MUST prove the original request did not
execute; missing history MUST NOT clear uncertainty. Teardown MUST disclose and
require acknowledgement of unused controller-default ICP, including later arrivals,
without permitting an unsolicited deposit to veto a reviewed finalisation.
The creation contracts in `docs/architecture.md` define funding and recovery boundaries.
The local canister clock is used only for this operational guard, including rate-window
and in-flight expiry behavior; it is never exposed as the NNS evidence timestamp.

## 10. Certified frontend

Use pinned maintained `ic-asset-certification`, `ic-http-certification`, and
`include_dir` with `AssetRouter`, HTTP certification v2, certified status/headers/body,
and deterministic paths. Serve `/`, `/index.html`, content-hashed JS and CSS,
`/404.html`, and a deterministically generated
`/.well-known/ii-alternative-origins`.

HTML, error pages, and well-known files use no-cache. The well-known response is JSON,
has `Access-Control-Allow-Origin: *` and
`Cross-Origin-Resource-Policy: cross-origin`; ordinary application assets retain
`same-origin`. Application responses use
`Cross-Origin-Opener-Policy: same-origin-allow-popups`. Content-hashed assets use immutable
caching. Responses have correct MIME types, CSP, `X-Content-Type-Options`, referrer and
permissions policies, frame restrictions, and HSTS where appropriate. No second asset
canister or unrelated routing/compression/social-image machinery exists.

The frontend validates a canonical non-zero decimal `u64`. Its one route-loaded public
report uses
replica-signed Governance queries and fresh IC-certified controller system state.
There is no public refresh, verification, or consensus-report mode. `check_neuron`
remains transaction-scoped: each exact review and each final submission performs a
fresh fail-closed preflight before a direct browser-to-NNS update.

All dynamic content uses constructed text nodes or `textContent`; never `innerHTML`.
Validate HTTPS links, preserve keyboard access and responsive status/error rendering,
and never convert an NNS ID through JavaScript `number`. `DENDRITE_CANISTER_ID` is a
mandatory build input (with `CANISTER_ID_DENDRITE` accepted as an explicit
environment input) and is validated
with `Principal.fromText`; it never comes from a hostname. Production accepts only
`https://icp-api.io`, root-key fetching defaults off, and production builds reject
root-key fetching. Local mode accepts only `http://127.0.0.1:4943` and
`http://localhost:4943` and may enable root-key fetching. Certified `connect-src`
permits exactly those origins plus same-origin.

Production additionally requires `DENDRITE_DERIVATION_ORIGIN`, one exact HTTPS origin
without a trailing slash. Changing it changes users' principals and artifact bytes, so
it must be finalized before hotkey onboarding. `DENDRITE_ALTERNATIVE_ORIGINS_JSON`
defaults to `[]`, is a sorted unique list of at most ten exact operator-controlled HTTPS
origins, and excludes the canonical origin. The production identity provider is fixed
to `https://id.ai/authorize`; only exact `localhost`, `127.0.0.1`, or `.localhost`
providers are accepted in local mode. These are immutable build inputs, not canister
state or upgrade arguments.

An ephemeral browser `AuthClient` obtains the private bootstrap identity. Its fresh
non-extractable key and credential-discarding storage prevent durable bootstrap restore;
SDK sign-out clears its temporary expiry marker before publishing the Governance-only
child session. Every ancestor must permit Governance and remain unexpired. The child
preserves the II app principal and expires no later than any parent or the eight-hour
session cap. A reload requires fresh authentication. Identity attributes are not
requested and identity material is never sent to Dendrite. Canonical
pages authenticate normally; approved alternatives supply the canonical derivation
origin; unexpected origins cannot sign in. The exact principal is displayed and
copyable. Local comparison against every raw manager entry reports controller, hotkey,
both, no authority, unavailable evidence, or missing manager. Controller-only onboarding
uses the single reviewed direct-operation pipeline and is confirmed by a later live
report. The authenticated NNS actor exists only in the browser and targets Governance.

The selected SDK wrapper exposes no PIN-policy option, so Dendrite makes no separate
PIN-authentication claim. The in-memory restoration check completes before the initial route is rendered; it
does not read older durable credentials.
Popup, session, and storage errors are bounded and retryable; permanent origin failure
remains closed. Failed sign-out retains the displayed principal.

## 11. Required tests and quality gates

Rust tests cover a compliant fixture and one focused mutation per mandatory rule,
duplicate manager/delegate IDs, duplicate topic-map keys, unknown topics, rejection,
decode failure, target/dependency omission, controller Wasm/controllers, hotkeys,
`not_for_profit`, batches at 50/51/>100, unexpected responses, and exact omega-reject
`u64` round trip. Collector tests use one recording fake and assert exact calls, batches,
early exit, and the absence of a generic destination/method boundary.

The verifier's PocketIC suite covers one compliant and one non-compliant end-to-end check with a minimal
fixed-principal Governance mock, upstream rejection, real empty controller inspection
where supported, certified landing response, and certified assets after upgrade.
Creation additionally requires the consolidated real-artifact and genuinely
signed local-II browser lanes, including recovery and interrupted finalisation.

Frontend tests cover ID parsing, the actual application bootstrap and routes, loading,
live success/error/retry, every overall status and public error, controller evidence,
topic labels, malicious text/links/errors, mandatory custom-domain-independent
configuration, no `innerHTML`, and no numeric ID conversion. Coverage includes every
production frontend module even if a test omits an import.

Identity tests cover configuration validation and normalization, exact generated
well-known bytes and certified headers, popup-compatible COOP, session restoration and
failures, exact principal display/copy, local authority roles and duplicate raw manager
entries, recomputation on new reports, inert untrusted names, and proof that the
Dendrite actor and request remain anonymous. Rust and PocketIC tests cover every manager
evidence state and propagation without adding an outbound call to the existing
report collector. The consolidated browser harness supplies the creation acceptance
journeys without adding a frontend framework or production automation dependency.

Whole-workspace Rust line coverage must exceed 85%; frontend thresholds remain at 85%.
Do not split modules merely to manipulate coverage.

## 12. Supply chain and reproducibility

Keep pinned Rust/Node/npm versions, lockfiles, digest-pinned build images, verified
downloaded tools, deterministic asset names, byte comparison of two clean builds,
artifact hashes, and CycloneDX SBOMs. Root Cargo repository metadata is
`https://github.com/aodl/NNS_Dendrite_Standard`. All xtask Cargo invocations use
`--locked`; xtask remains a thin dispatcher.

Prove `pocket-ic`, `backoff`, and `instant` are absent from the production Dendrite Wasm
normal/build dependency tree. Test-only unmaintained dependencies receive package-
specific documented exceptions with owner and removal condition. Distinguish test-only
`serde_cbor` reachability from any production reachability through certification
libraries; do not use blanket suppressions.

Required root checks are formatting, warnings-denied Clippy, `cargo xtask check`,
`test`, `coverage`, `build`, interface drift, PocketIC, `npm ci`, `npm test`, frontend
coverage, production reachability, security scan, SBOM, reproducible build, and
reproducibility verification. A command is passing only if it actually exits
successfully. Do not lower coverage or security thresholds.

## 13. Documentation and completion

Update the existing README, standard, architecture, threat model, testing,
reproducible-build, deployment, upgrade, and operator documents; do not add documents.
They must state that every check is a live update, no result/history/timer exists, no
delegation reaches the canister, and privileged calls go browser-to-NNS Governance.

Verifier completion requires one long-lived service, one live verification update method,
the bounded stateless controller observation, no cache/stable
application state/digest/catalogue/economics call, batches of at most 50, correct
omission/failure/unknown semantics, official HTTP certification v2, live-only frontend,
production dependency isolation, passing coverage/scans/PocketIC/frontend tests, and
byte-identical clean builds. Creation completion additionally requires the temporary
bootstrap's independently qualified artifact, stable recovery and complete signed
journeys described in the creation contract; the verifier's prior completion does
not qualify those new paths.

The final report records commits; line/file deltas; Candid API; exact outbound methods,
destinations, and source revision; command results and coverage; PocketIC and dependency
reachability; scan exceptions; Wasm/frontend/SBOM/reproducible hashes; byte identity;
limitations; operator gates; and the exact browser-to-NNS capability policy.

The anonymous-verifier tranche remains complete. The browser management tranche is
complete only after all automated and reproducibility gates pass; popup and controlled
transaction smoke tests remain explicit operator gates unless actually recorded.


### Replicated controller-history observation

Creation adds one read-only update, `controller_observation(neuron_id)`, to the
stateless verifier. It derives the exact public neuron's controller through fixed
Governance reads and returns bounded management `canister_info` observations,
including `total_num_changes`. No arbitrary canister argument, command, credential,
custody, creation registry or permanent onboarding state is introduced. Existing
`check_neuron` arguments/results and all Standard predicates are preserved. The
pre-creation Candid remains a required compatibility fixture.

This extension is necessary because the pinned replica rejects direct
`certified_data` read-state paths and `canister_version` advances during ordinary
execution. The management history counter instead binds the sealed provenance
across stop/code removal, and invalidates it after another controller operation.
The browser obtains the helper's replicated, IC-certified reply, separately checks
current certified module/controllers and reads current Governance/evaluator state.
The helper has a separate bounded two-call operational budget; it neither consumes
nor expands the existing full-report rate/concurrency/cycle limits.
