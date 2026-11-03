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

Internet Identity introduces a browser-only boundary. Delegations target only fixed NNS
Governance and are never logged, rendered, serialized to Dendrite, or sent to the
canister. Every mutation requires fresh authority evidence, an immutable exact review,
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

| Package/version | Reachability | Exception and removal condition |
| --- | --- | --- |
| `paste 1.0.15` | Transitive Candid compile-time macro | RUSTSEC-2024-0436 abandonment; review on Candid update or 2026-10-17 |
| `pocket-ic 15.0.0` | Workspace development only | Required local consensus scenarios; remove on compatible replacement |
| `backoff 0.4.0` | PocketIC development tree only | Remove when PocketIC removes it or if production reachability changes |
| `instant 0.1.13` | PocketIC development tree only | Remove when PocketIC removes it or if production reachability changes |
| `serde_cbor 0.11.2` | Official certification libraries and PocketIC | Not directly used by application code; review when certification reachability changes |

Automated dependency reachability fails if `pocket-ic`, `backoff`, or `instant` enters
the production Wasm normal/build tree. Lockfiles, advisory scans, reproducible
comparison, and SBOMs are compensating controls. The existing Apache-2.0 LLVM
toolchain expression remains the narrow license-policy exception.
