# Per-neuron temporary controller

`dendrite-bootstrap` is an independent deployable in the nested Dendrite workspace.
Each instance binds one creator P, creation identifier, origin/network, immutable
funding/return accounts, reviewed plan revision and deterministic Governance nonce.
It can claim/configure/recover only the neuron controlled by its own principal C.
The existing Dendrite service stays stateless; D-QUORUM has no new authority.

The three replicated, owner-authenticated methods are `status(revision)`,
`replace_plan(revision, plan)` and `advance({revision, step})`. See `bootstrap.did`
for their exact bounded types. There is no query whose phase flag alone authorises
teardown, arbitrary Governance command, recipient, upload, proxy, factory or timer.

Stable format 1 checkpoints the plan, nonce, neuron binding, sequence, dispatched
effect and unresolved financial result before asynchronous mutations. An upgrade
validates that format and binding, retaining original operation identities. A
possibly executed additive lock increase or disbursement is never blindly resent.
Corrupt/unsupported state traps rather than requesting a reinstall.

The test profile uses one manager and the pinned protocol's initial seven-day
delay. It cannot seal. Production uses shared Standard constants, public known
managers/delegates and exact following, and requires actual known registration
before sealing. C can verify the executed rehearsal payload and tally; the browser
must additionally verify the complete readable electorate. C sees filtered ballots,
so a caller-supplied boolean is insufficient.

P remains C's sole canister controller throughout bootstrap and can replace its
code. These checks do not constrain a hostile controller with management authority.
Finalisation first seals and quiesces, then P separately uninstalls code and removes
every canister controller. Uninstall destroys this stable state. The browser must
retain non-secret certified historical provenance and independently read current
Governance and certified system state after it. No long-lived secret controls C
after controllers are removed; normal management depends on T's NNS followees.

Build from the nested workspace:

```sh
cargo test --locked -p dendrite-bootstrap --lib
cargo clippy --locked -p dendrite-bootstrap --all-targets -- -D warnings
node canisters/dendrite/web/build-bootstrap.mjs
```

The build emits raw Wasm, Candid, shared policy and a source/checksum manifest to
`target/bootstrap-release/`. Frontend builds consume these bytes before bundling;
the service then certifies their content-addressed asset paths. Docker uses the
same one-way dependency through a separate bootstrap build stage. Raw Wasm SHA-256
is both the reviewed installation digest and expected module hash. The browser
fetches only that certified content-addressed asset; arbitrary runtime Wasm URLs
and user-supplied modules are unsupported.

Development evidence lives in the consolidated root creation lanes. It is distinct
from the final unchanged-source qualification, canonical repeats and mainnet
compatibility. No production write is part of those lanes.
