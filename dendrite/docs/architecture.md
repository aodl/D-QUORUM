# Architecture

Dendrite is exactly one stateless Rust canister. It embeds and certifies the frontend,
accepts anonymous update `check_neuron` calls, obtains bounded live evidence from fixed
NNS Governance `list_neurons` and management-canister `canister_info` calls, evaluates
the standard, and returns the report. Certified assets are served by the sole query
application method, `http_request`.

```text
Public route report:
Browser -> anonymous signed Governance list_neurons and get_neuron_info queries
        -> strict browser validation/normalisation
        -> certified controller read_state -> browser evaluator

Privileged:
Browser -> Internet Identity -> Governance-only browser delegation
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
copy-only Raw Report control, optional authenticated account workspace, Team Members,
Standard Rules, Team Members, and Topic Delegation. All six rule groups, Team Members, Topic Delegation,
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

Internet Identity and privileged operations run only in the browser. The at-most
eight-hour delegation targets NNS Governance, never Dendrite. The browser compares its
principal with live manager evidence locally and sends reviewed typed mutations
directly to Governance. It never constructs an authenticated Dendrite actor.
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
