# Creation authentication fixture and qualification boundary

Release status remains **unqualified until every mandatory gate passes on one
unchanged source and its actual artifacts**. The prior [qualification report](qualification.md)
and its failed runs remain historical evidence. Neither its 20 successful lanes
nor qualification of source `97343f8` qualifies a new candidate.

The recovered starting HEAD was `d4d11ef629f3e74d841df53de5ee0707a6a85ea6`,
with a clean tracked worktree/index. The reviewed implementation was
`743910057f1685711b67b1bc7adcd4c653dd7082`. Later legitimate work and ignored
operator files were retained; the original sibling repository was untouched.

The fixture uses the existing Puppeteer/CDP target owner and local network guard.
Each synthetic participant has one private in-memory credential record. Native
WebAuthn registration supplies it; credential events and supported CDP commands
capture updated counters and applicable properties. Only that participant's
credential is restored before a normal application-triggered II popup executes.
II authenticates it, the production factory derives its scoped child, and the
replica verifies actual signed requests. Expected public principals are checked.
Counter rollback, wrong principals, wrong contexts and stale generations fail
closed. Failed attempts cannot replace another participant's record.

This substitutes for persistent authenticator hardware only in isolated local
tests. Application signing keys, delegation chains, completed sessions, fabricated
assertions and fake II responses are excluded. Credential-bearing CDP failures
become fixed errors without their parameters or causes. Protocol debug logging is
disabled. Evidence writers reject private credential/session fields and known
credential values. Browser profiles and raw CDP traces are excluded. Cleanup
clears fixture references and closes the browser; reliable JavaScript memory
erasure is not claimed. Physical/cloud passkey providers are outside this proof.

The fixture no longer suppresses popup closure, shares a global Signer, replaces
AuthClient window providers, changes transport-close options, rewrites
`window.opener`, exchanges WindowProxy handoffs, holds II script requests or
patches retained-window heartbeat subscriptions. Creation authentication has no
whole-attempt retry. DOM observations may reobserve normal closing targets;
unclassified errors propagate. The ordinary pre-authority setup retry remains
bounded and still discards its failed context.

The reviewed production heartbeat policy remains separate and unchanged:
`@icp-sdk/signer@5.4.0`, input SHA-256
`c3175343e72a2a5a40f147af8a69463a67ead2cb22f6358e9a75706c3666bf23`,
output `a07e9c5eca1bed7446f5eeb02ee64c764b306e274b7725844a50bf980f2c4425`.
Historical source predates its loader, so the test builder supplies that same
reviewed production loader and declares the adapter. Current builds apply it
once; a focused actual-build comparison verifies this. No SDK timeout or
certificate/delegation limit changes. Build-delta manifests pin AuthClient and
Signer inputs, record unchanged loaded bytes and the separate production policy,
and declare local configuration, historical selection and bounded negative
authority instrumentation. Mutation-loss injection and coordinated clocks remain
explicit test instrumentation. These locally configured assets are not canonical
production frontend bytes.

Execution evidence is under [creation-auth-diagnostics](../dist/creation-auth-diagnostics/).
The runtime prerequisite used Chrome `156.0.8078.47`, CDP protocol `1.3` in the
pinned Puppeteer image. Attempts 1–3 failed (launch configuration, then an
incorrect initial counter expectation); attempts 4–6 passed native credential
continuity/counter/isolation checks. These are hardware/CDP tests, not II proof.

The real-II diagnostic retained every fresh attempt:

| Attempt | Result | Reason or scope |
| --- | --- | --- |
| 1 | Fail | Diagnostic HTML path was outside the production asset allowlist. Five initial II participants authenticated. |
| 2 | Fail | Diagnostic omitted the pinned provisioning-component setup; the application correctly blocked an unreviewed CMC before spending. Four real capability checks completed. |
| 3 | Fail | Harness DOM observation raced normal popup closure after cancellation. Receipt import, second tab, wrong-participant/controller refusal and cancellation completed. |
| 4–6 | Pass | Three consecutive fresh worlds on `71e62575807e23e873eb6b28c1d16493d0e72d88`, unchanged input hashes, no scenario retries. Each has 16 replica allow/deny checks and 24 completed authentications with normal popup closure. |

The small diagnostic covers five distinct II principals, production Governance,
funding, management and bootstrap factories, a real minimal local controller,
sign-out/reauthentication, an actual downloaded draft receipt/reload/import,
another tab, wrong-participant authority refusal, cancellation without stale
factory authority, expiry rejection and renewed sessions at 31 and 90 days.
It performs no economic creation and does not replace either full journey.

The isolated historical build first reproduced a missing policy-file assumption;
the declared production-loader adapter repairs it. The full recoverable journey
then exposed two UI observation defects: Chrome reported a click on a hidden
disclosure button without dispatching it, and a subsequent render hid active
status from `innerText`. Native Chrome and actual-driver regressions cover the
restored disclosure opening and original `textContent` status observation. No
production code correction was required.

On `6d0b5f48341a143d7989d5a431ccf7d2a75915f6`, the full recoverable journey's
third recorded attempt passed in 250.64 seconds, including historical upgrade,
late/lost payment reconciliation, receipt recovery and renewed genuine sessions.
The first full five-participant production-candidate attempt passed in 501.93
seconds, including real registration/refusal recovery, independent browser votes,
membership checks, unsolicited deposits, sealing, uninstall, receipt resume,
empty-controller update and post-finalisation management. These use actual pinned
protocol components and locally configured frontend assets. Native world setup
and injected faults are labelled separately from browser authority. They prove
distinct synthetic II participants, not independent human ownership.

The original reviewed script-loading failure is explicitly in the removed
five-second handoff mechanism. The SDK-internal cause of the reviewed channel
closure was not conclusively isolated; it must not be called harmless. The
production-equivalent path above succeeds without that topology. Original failure
logs/screenshots and sanitized bounded timelines remain in the diagnostic history;
missing old target/generation/timing fields are marked unavailable, not invented.

Production assets must be regenerated and the final source/artifact identities
bound by the existing complete 22-lane campaign, including both Rust workspaces,
frontend coverage, runner tests, actual protocol/browser cases, 20/80/240 capacity,
historical migrations, canonical repeats, two forced-clean builds, exports,
security/SBOM, negative controls and readiness. Fresh authentication repetitions
are mandatory inside `system_browser`; each repetition's public evidence is
preserved before the next world replaces the current pointer. No pass crosses a
source or artifact change. Diagnostic checksums and final readiness results are
execution artifacts, not promises in this document. A deterministic release-review
bundle is permitted only after every mandatory gate passes. Otherwise retain a
checksummed diagnostic bundle and an explicit unqualified verdict.

Dendrite policy, creation custody/recovery, D-QUORUM economics/stable state/API,
production identities and authority boundaries are unchanged. No push, merge,
deployment or production/mainnet operation is authorized or performed. Hosted CI
requires actual execution against the exact source; local results are distinct.
