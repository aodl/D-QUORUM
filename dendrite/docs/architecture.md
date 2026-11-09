# Architecture

Dendrite's long-lived service is one stateless Rust canister. It embeds and certifies the frontend,
accepts anonymous update `check_neuron` calls, obtains bounded live evidence from fixed
NNS Governance `list_neurons` and management-canister `canister_info` calls, evaluates
the standard, and returns the report. Certified assets are served by the sole query
application method, `http_request`.

## Creation authority and protocol contract

One temporary bootstrap C is permitted per new neuron T. P is the stable II-derived
application principal, not a child key's standalone principal. Initially C's sole
controller is P, and application calls authenticate P. P can replace provisional
code. After finalisation T still names C, but C has neither module nor controllers.
Managers then use Governance's actual supported commands. Neither service controls
creations or receives funds. D-QUORUM policy, financial state and stable V3 are unchanged.

The single route is P-owned ICP funding -> CMC `notify_mint_cycles` -> P-owned Cycles
Ledger subaccount -> Cycles Ledger `create_canister` -> P installs the pinned
bootstrap. Stake is a separate direct payment to Governance's
`SHA256(0x0c || "neuron-stake" || C || nonce_be64)` subaccount. Provisioning spend is
not stake; converted/spent cycles are not an ICP refund.

Contracts below use executable IC source `83f29e0803496ba6aaea3d6b43f6c6bebea12dd9`
and Cycles Ledger `58f1d01ce1e5e41e61005f8103cc7560e9d81cc2` (release 1.1.0).
Artifact checksums are in root `protocol-pins.json`; none assert current mainnet
deployment. The separate Standard policy pin remains `d55a0f…`. Execution evidence
must distinguish actual signed-browser calls, native real-protocol probes and mocks.

An installed module hash binds the exact `install_code.wasm_module` bytes, including
gzip packaging when used. The bootstrap is installed as raw Wasm, so its file and
installed-module hashes coincide. System fixtures install the reviewed raw protocol
modules; the ICP Ledger itself uploads its pinned gzip archive, whose observed
module hash therefore matches the compressed pin (`sha256`), while `wasm_sha256`
records the decompressed executable. The real archive-recovery gate checks both
identities. Source/artifact equivalence does not establish a live deployed module;
the browser requires its exact reviewed observed protocol hashes before spending.
See the [interface specification](https://docs.internetcomputer.org/references/ic-interface-spec/abstract-behavior/)
for the module-hash contract.

| Operation | Actual caller, destination and exact argument | Charges, deduplication and readback | Authority or irreversible effect |
| --- | --- | --- | --- |
| ICP payment | P -> ICP Ledger `icrc1_transfer(TransferArg { from_subaccount; to: Account; fee; amount; memo; created_at_time })` | Fresh `icrc1_fee`; save exact intent before signing. Reuse all fields; Duplicate names the original block. Exact block proves execution; TooOld alone proves no absence. | Only workflow-bound CMC, stake or return accounts. External-wallet sender is not assumed to be P. |
| Quote | Replicated anonymous read -> CMC `get_icp_xdr_conversion_rate()` | Fresh timestamp/rate and maximum independently authorised ICP spend. | Before spending, protocol/policy, fee, quote and manager preflight must pass. |
| Conversion | P -> CMC `notify_mint_cycles(record { block_index: nat64; to_subaccount: opt blob; deposit_memo: opt blob })` | Original ICP payment pays CMC's principal-derived P subaccount with MINT memo `0x544e494d`. Reuse that block; stored result, Processing and purged history are distinct. Refund response's optional ICP block must be independently verified. | Credits only P's chosen Cycles Ledger account. Successful conversion burns ICP; refund goes to original payer less protocol charges. |
| Create C | P -> Cycles Ledger `create_canister(record { from_subaccount; created_at_time; amount: nat; creation_args: opt record { settings; subnet_selection } })` | Current `icrc1_fee` plus amount. Success names block/C. Duplicate may omit C: unresolved, never permission to create again. Failure names fee/refund blocks. Deduplication does not bind arbitrary settings, so exact reviewed request digest must. | Explicit `[P]`, zero compute/memory reservations, reviewed reserve. No provisional creation API in the claimed path. |
| Install | P -> management `install_code(record { mode = variant { install }; canister_id = C; wasm_module; arg; sender_canister_version })` | Execution cycles; lost reply reconciles certified module hash and replicated initial plan binding. Never reinstall. | Actual controller check plus exact reviewed module; bind P, plan, nonce and fixed return account. |
| Claim | C -> Governance `manage_neuron(record { id = null; neuron_id_or_subaccount = null; command = opt variant { ClaimOrRefresh = record { by = opt variant { MemoAndController = record { memo: nat64; controller = opt C } } } } })` | Current minimum stake; same C/nonce resolves same staking account. Independently read T/controller/account/stake/initial state. | No delegation goes to C; conflicting binding is an error. |
| Configure | C -> Governance typed `manage_neuron`: `Configure(SetVisibility { visibility = opt 2 })`, `Follow { topic; followees }`, `Configure(IncreaseDissolveDelay { additional_dissolve_delay_seconds: nat32 })`, `RefreshVotingPower {}` | One bounded intent at a time and readback per effect. Reconcile additive lock before calculating remaining increase. | Reversible setup before separately reviewed long lock; no target hotkey, invented not-for-profit setter or shortening promise. |
| Register | Existing eligible M -> Governance `manage_neuron(MakeProposal { action = RegisterKnownNeuron { id = opt T; known_neuron_data }; title; summary; url })` | Fresh rejection fee/eligibility review. Lost proposal reply stays unresolved pending exact readback. | Network-wide Governance decision, never nested management command or automatic browse action. Registration is neither immutability nor manager consent. |
| Rehearse | M -> Governance `MakeProposal(ManageNeuron(T, RefreshVotingPower {}))`; other M vote through reviewed controls | Verify exact target/action, Executed status, execution timestamp, tally and readable electorate. Caller-supplied success flags are insufficient. | Ballots are filtered to caller-controlled/hotkey neurons. Insufficient independently readable electorate evidence blocks automatic finalisation. |
| Recover stake | C -> Governance `manage_neuron(Disburse { to_account = opt fixed_return; amount })` after proven dissolved state | Exact fixed return account; ledger block proves the transfer. Ambiguity stays pending. Underpayment may require separately reviewed top-up before claim. | No immediate locked-stake refund or delay reduction. Starting dissolution requires separate consent. |
| Quiesce | P -> management `stop_canister(record { canister_id = C })` | Verify settled intents and stopped state. Stop does not undo remote effects. | Seal before stopping; only explicitly safe unseal before uninstall can resume mutation. |
| Remove code | P -> management `uninstall_code(record { canister_id = C; sender_canister_version })` | Certified module absence with controllers still `[P]`; export checkpoint before next step. | Destroys code/state; P still controls C. Resume using receipt and external reads, without automatic reinstall. |
| Remove controllers | P -> management `update_settings(record { canister_id = C; settings.controllers = opt vec {}; sender_canister_version })` | Separate full-ID confirmation and fresh C/T association, module absence and sole P controller. Reconcile lost reply by certified system state. | Irreversible ordinary authority removal. Fresh full evaluator report determines compliance; no routine rollback. |

Management delegation targets do not restrict methods, `canister_id` arguments or
amounts. Exact review, real controller checks, inherited restrictions, short expiry
and operation/route generations remain essential. The real-replica management and
effective-canister routing gate must pass before enabling those capabilities. Fresh
preflight cannot make separate Governance and management calls atomic or lock out
concurrent legitimate managers.

Sealing records management `canister_info.total_num_changes` in replicated state
and its certified reply. Ordinary canister execution advances `canister_version`,
so that execution counter is unsuitable for a persistent seal. Approved bootstrap
code rejects every sealed mutation except unseal; unseal requires an independently
observable controller-history change. The browser's explicit unseal path upgrades
only the same approved module, compares the stable checkpoint, then calls unseal.
Old sealed provenance is invalid after that history change. Native protocol gates
must establish that stop preserves the history count and uninstall advances it.

The additive anonymous update `controller_observation(neuron_id)` is the narrowly
required backwards-compatible API extension. Pinned management `canister_info`
cannot be called by browser ingress, and direct certified-data reads are forbidden.
The stateless verifier already performs this management read for its reports. This
helper returns the same replicated history counter with the exact public T-to-C
binding, module/controllers and Governance observation time. It accepts no caller-
supplied canister, command, credentials, payment or success flag and stores no
creation/user data. Its two calls use a separate bounded operational guard with
the same limits; the existing report budget and `check_neuron` interface/results
remain unchanged. A retained predecessor Candid verifies compatibility. No Standard
predicate, evaluator status, D-QUORUM API, state version or policy changes.

The pinned HTTP endpoint implementation rejects direct requests for the
`canister/C/certified_data` path with 404. It permits controllers, module hash and
time, which remain independently certified. Source contract SHA-256 is in root
`protocol-pins.json` (`read_state.rs`, revision `83f29e…`). Readiness does not
request or trust an unsupported certified-data path. Failed browser attempts and
the disproved legacy-route diagnostic are retained separately from qualification.

The initial native real-protocol probe
`real_cmc_conversion_and_cycles_ledger_creation_deduplicate` passed the pinned
conversion/creation path, transfer/conversion/creation duplicates, a real failed
creation with refund, a duplicate lacking a recoverable canister ID, and a failed CMC
deposit with an independently decoded ICP refund to the original funding subaccount.
For the pinned invalid-subnet case the loss was two Cycles Ledger fees plus CMC's
100M-cycle bad-request penalty; this is not a universal refund/cost promise. The CMC
deposit failure refunded original ICP less its two-transfer-fee penalty and refund
transfer fee. These native probes use fixture callers and do not count as real-II
delegation or positive signed-browser journey proof.

The development real-II scope probe subsequently passed the actual signed funding,
CMC conversion, Cycles Ledger creation and duplicate, bootstrap installation/call,
stop, uninstall, certified empty-module/empty-controller and refused-reinstall path.
The funding-only child was denied management by the replica. A child targeted only
at C could call C but could not call management; the named management child targeting
`[aaaaa-aa, C]` succeeded. The same management child could read another canister
actually owned by P. Thus inclusion of `aaaaa-aa` does **not** constrain management
arguments to C. Production UI must independently bind each reviewed request to its
verified creation and recheck sole P authority. These are development probes, not the
final unchanged-source browser-creation qualification or a mainnet compatibility claim.

Pinned Governance initially claims a neuron with a seven-day dissolve delay
(`INITIAL_NEURON_DISSOLVE_DELAY = 7 * ONE_DAY_SECONDS`), verified by real claim and
configuration readback. The recoverable test profile therefore uses that short lock;
it does not promise immediate disbursement. The native journey separately started
dissolution, advanced the actual seven-day wait, verified an executed management
proposal and independently decoded the eventual fixed-destination ledger return.
The production Standard remains exactly 63,115,200 seconds.

The repeated real-II development probe also verified public request-content plus
IC-certified reply witnesses after code removal. They contain no signed ingress
envelopes, keys or reusable delegations. Historical provenance uses an explicit
30-day SDK verification window; it does not prove current authority. Expired or
incomplete provenance blocks automatic finalisation. Current canister state uses
ordinary SDK certificate freshness checks independently. Local qualification may
bind loopback port 4944 when another workspace owns 4943; origin, API and port must
match in the reviewed plan and II fixture configuration.

First installation additionally requires management `canister_status.version = 0`,
an absent module, sole P control and the original certified Cycles Ledger creation
reply. The pinned management response calls this field `version`, not
`canister_version` (source `rs/types/management_canister_types/src/lib.rs`, SHA-256
`929c3330996802635006b50ce71ccfadf63109fd112133c4b33e6de36c71a37b`). Installation
or code removal changes that version. An old pre-install receipt is therefore not
enough to authorise installing into a previously emptied controller. This check
uses replicated controller-authorised status; management `canister_info` is not
accepted as an ingress update. Every read/write pair still has a non-atomic gap.

The receipt retains every reviewed plan revision and binds each financial/proposal
intent to its original plan digest. A proposed replacement is exported before
dispatch and reconciled by a replicated read at its exact revision after a lost
reply. Profile, P, network/origin, provisioning amounts/fee, deterministic account
inputs, bootstrap digest and fixed return account cannot change. A changed manager,
metadata or reviewed stake invalidates old readiness approvals. Open/adopted or
unresolved external proposals block replacement. A profile change starts a separate
creation and cannot turn a test receipt into finalisation authority.

The plan digest is SHA-256 over the domain `dendrite-creation-plan-v1` and an
explicit ordered binary encoding of every Plan field. Integers use fixed-width
little endian; blobs/UTF-8 strings and vectors carry a 32-bit length; profile,
network and metadata presence use one-byte tags. The implementation and
Rust-generated cross-language vectors define the exact order. It is not a hash of
Candid bytes: equivalent Rust/SDK Candid type tables may produce different bytes.
The monetary request digest, in contrast, binds the exact original wire argument
that was reviewed and sent. Candid-decoded integer vectors are normalised to plain
JSON arrays in receipts.

Proposal submission reserves one exact operation in C before the browser sends
Governance its separately reviewed request. C grants dispatch once, persists that
grant across upgrades and resolves the exact proposer, creation/operation marker,
target and action through Governance. A grant whose reply is lost before the browser
can send, or a MakeProposal response lost without any discoverable proposal ID, can
remain unresolved. Time passing does not release that grant. This deliberate
fail-closed boundary can require external investigation; receipts cannot prove a
negative or confer a force-clear privilege. An external proposer can instead export
the exact typed registration payload/Candid, review their own eligibility and fee,
and submit independently. Registration remains pending until actual metadata agrees.

Pinned Governance filters management ballots by the reader's controller/hotkey
authority. This first automatic finalisation verifier requires P to read the whole
manager electorate. If any selected manager lacks that authority for P, the UI
discloses the limitation and blocks the irreversible long-lock commitment. It never
adds manager hotkeys or modifies their following as part of creation. This is a
workflow proof limitation, not a new Standard rule or evidence of independent humans.

Unused workflow ICP returns only to the reviewed legacy account, with its own exact
intent, fee, timestamp and ledger history anchor. Unknown replies are reconciled
against direct or Ledger-endorsed archived blocks. Dissolved-stake recovery similarly
binds the exact amount and current Governance fee in C's typed command; changed
amounts/fees fail before dispatch. C retains an ambiguous disbursement and accepts
only its matching fixed-destination block, including time and amount/fee checks.
Converted/spent cycles are never counted as returned ICP. Locked stake must wait;
there is no promise that all provisioning costs can be recovered.

Anyone can call the pinned `ClaimOrRefresh(MemoAndController)` for an explicitly
named controller. This does not transfer neuron control to the payer or caller.
The bootstrap refuses an externally pre-existing neuron unless its own durable
claim intent or existing binding proves continuity. Such interference is a visible
conflict, not permission to adopt a different neuron, nonce or creation canister.

```text
Public route report:
Browser -> anonymous signed Governance list_neurons and get_neuron_info queries
        -> strict browser validation/normalisation
        -> certified controller read_state -> browser evaluator

Privileged:
Browser -> II app-origin parent -> SDK-signed Governance-only child -> Governance
        -> fresh Dendrite check_neuron review and final preflights
        -> fixed NNS Governance mutation -> receipt -> unverified resulting state
```

There is no application stable state, result cache, report or transaction history,
timer, polling, analytics, off-chain service, or background work. A small heap-only
abuse guard resets on upgrade. Dependencies are requested in batches of at most 50,
within the derived 272-ID graph bound.

The public-report path uses a separately generated, query-only Governance declaration
whose methods are `list_neurons` and explicit-ID `get_neuron_info`. Its production `HttpAgent` is anonymous, fixed to
`rrkah-fqaaa-aaaaa-aaaaq-cai` and `https://icp-api.io`, enables query-signature
verification, and never fetches a root key. The target is loaded first; required
anchors, managers, and committed-topic delegates are then sorted, deduplicated and
loaded in batches of at most 50. Known metadata comes only from `get_neuron_info`
because `list_neurons` omits it. Found, confirmed-absent, malformed, and unavailable
metadata remain distinct, and retrieval timestamps must be ID-bound, nonzero, and
within 300 seconds. Promise caches are memory-only and rejected entries are evicted.

Browser validation rejects an entire malformed batch before normalisation. The
browser evaluator mirrors the Rust evidence and policy model. For the exact controller
principal in the validated Governance response, one anonymous `read_state` verifies
controllers, module-hash presence or certified absence, certificate time, effective
canister binding, delegation, and canister range. Invalid or ambiguous certified state
is discarded as a whole. A public report never enables
transaction controls and never satisfies transaction final preflight.

The report presentation consumes the `ComplianceReport` without changing it. A focused
diagnostic view model derives factual outcome explanations, observed/expected values,
safe related links, topics, and IDs from structured report fields. It never parses a
message to discover a principal. Stable `RULE_DESCRIPTIONS` remain normative
requirements and are rendered after the outcome explanation. A presentation-only
aggregation model groups entries by exact `rule_id`, retains every entry, orders
topic instances canonically, and chooses the aggregate status using `Fail`, standard
update required, indeterminate, warning, then pass precedence. The page order is branded
authentication navbar, identity and direct-verdict header with key characteristics and a
copy-only Raw Report control, optional authenticated account workspace, Standard Rules,
Team Members, and Topic Delegation. All six rule groups, Team Members, Topic Delegation,
and every rule row start collapsed. The rule result remains visible in the right-aligned group counts while its
supporting rows are collapsed.
Multi-entry detail rows show the reviewed explanation and aggregate result followed by
every exact topic evaluation, message, observed/expected value, and related neuron in a
compact internal table. The technical rule ID remains in each rule detail; the header
copies the complete public report without rendering duplicate JSON. Unknown future IDs use an
explicit technical fallback. Policy states
remain `Pass`, `Fail`, `Indeterminate`, `Warning`, and
`Standard update required`.

The distinct-rule totals are native, single-select `aria-pressed` filters for All,
Pass, Fail, and nonzero additional statuses. Filtering hides nonmatching rows and empty
groups, leaves visible disclosure state unchanged, never opens a group, closes hidden
child rows, and never changes complete group totals. Every group is a native-button
disclosure and starts closed regardless of severity. Closing a group clears every
child rule disclosure. One shared summary model counts each aggregate once, always
shows pass and fail (including zero), and records the distinct-rule total.
Row and group expansion remain ephemeral DOM state. These controls
never alter the route, report, evaluator, or network. Semantic section IDs remain valid
anchor targets. Team Members and Topic Delegation each have one disclosure level.

The visual system uses a local system-font stack, a seven-step spacing scale, two
non-pill radii, a pale canvas, white and subtle surfaces, strong text, restrained green
accent, and distinct pass, fail, warning, and indeterminate colours. Status always pairs
an icon with text and has no rule-row pill. Summary segments reuse those semantic
colours. The report header has no action toolbar. Whitespace and dividers replace
decorative shadows, nested cards, and filled disclosure controls.

Each live load has a unique operation owner bound to
the route generation and canonical neuron ID. Route changes, landing transitions,
replacement loads and potentially executed mutations revoke
older owners and release their loading state. Only the current owner may publish a
report, error, route transition, or loading completion.

Internet Identity and privileged operations run only in the browser. II supplies its
normal app-origin parent delegation, which may be unscoped. A fresh ephemeral bootstrap
key receives that parent privately. The pinned core SDK signs and appends a child
restricted to exactly NNS Governance, preserving the II root and application principal.
Only the child signing identity reaches the Governance actor and transaction pipeline.
The child expires no later than any ancestor or the existing eight-hour application cap.
Every ancestor must permit Governance; omitted targets and an empty target vector have
different meanings. Unsupported restrictions, malformed chains, and expired links fail
closed. Structural client checks complement SDK signing and real replica verification;
they do not authenticate a canister signature themselves.

The bootstrap client uses an explicitly supplied fresh identity and a credential-discarding
storage adapter. This bypasses the pinned AuthClient's legacy restore/migration path.
AuthClient still writes its non-secret localStorage expiry marker; its supported signOut
API removes that marker before the scoped session is published. Bootstrap keys/chains
are not persisted. Reload requires fresh II authentication. Sign-out and idle expiry
invalidate the local session generation; a cancelled generation cannot publish a late
signer. The browser compares the original II principal with live manager evidence locally
and sends reviewed typed mutations directly to Governance. It never constructs an
authenticated Dendrite actor.

Manager replacement obtains public full configuration and timestamps from replicated
list_neurons, and registered known-neuron metadata from replicated exact-ID
get_neuron_info. Batch known_neuron_data is deliberately omitted by Governance and is
never registration evidence. Each preparation uses fresh bounded reads, up to four
scalar calls in flight, exact IDs, public visibility, complete response bounds, and the
existing 300-second timestamp-skew limit. Both single-topic and SetFollowing preparation
use this path; the anonymous public-analysis cache cannot authorise a transaction.
Once the update boundary may have been crossed, an unknown transaction outcome
immediately removes mutation controls while retaining the public report, request digest,
and the explicit no-retry acknowledgement lock.

The certified frontend binds served bytes to installed Wasm. It does not prove browser
integrity, operator intent, or controller policy. Dendrite's application controller is
distinct from a target neuron's blackholed controller canister. It retains reviewed
upgrade authority during development and qualification, then reaches its intended
terminal state only through the separately reviewed irreversible blackhole gate.

The canonical Internet Identity derivation origin is an immutable production build
input. Changing it changes Dendrite principals and is a security migration. Alternative
origins are normalized, unique, bounded, certified, and operator-controlled;
unexpected origins cannot authenticate. Production configuration and identifiers are
authoritative only in [deployment](operations/deployment.md).
