# Dendrite

## Overview

Dendrite is one stateless Rust canister that serves a certified frontend and retains
anonymous `check_neuron` only for transaction-scoped safety preflights. Ordinary
browsing loads one public report from strictly validated Governance queries and
certified controller state in browser memory. There is no manual report action or
public consensus-report mode. The public canister methods are update
`check_neuron`, bounded read-only update `controller_observation`, and certified
asset query `http_request`. Existing report interfaces and evaluator semantics
remain unchanged.

The undeployed [creation workflow](docs/operations/creation.md) additionally uses
one temporary bootstrap per new neuron. The browser provisions it with only the
user's stable II application principal P as controller. A one-manager test remains
recoverable and NonCompliant. A production candidate requires actual registration
and demonstrated manager governance before separate code-removal and empty-controller
confirmations. Qualification of these new paths is recorded separately from prior
production records.

The neuron page names the known neuron, states the direct Standard verdict with its
complete ID, presents key neuron characteristics in the header, and then presents Team
Standard Rules, Team Members, and Topic Delegation. Every section disclosure starts collapsed.
Distinct-rule status totals are the only rule filters. The six direct rule-family
disclosures show complete, right-aligned semantic-colour totals and never open merely
because of a result or filter.
The header's Raw Report copy control copies the complete public `ComplianceReport` JSON
without duplicating it on the page. A branded navbar provides canonical-origin Internet
Identity sign-in; authenticated controls appear in a top account workspace.

Production identifiers and configuration have one authoritative source in
[deployment](docs/operations/deployment.md). Factual lifecycle evidence is retained in
the [production record](docs/operations/production-record.md).

Dendrite retains upgrade control only during development and qualification. Its
intended terminal state is a reviewed irreversible blackhole after the final artifact,
configuration, reproducibility evidence, and operator gates are complete.

## Trust model

Dendrite stores no application state, cache, report, transaction history, or proposal
history. The browser report loaders have only route-scoped in-memory promise
caches. The anonymous Governance query agent verifies query signatures; the controller
reader verifies fresh IC certificates for the exact controller principal returned by
that query. Neither fetches the root key in production. Internet Identity supplies a
private app-origin bootstrap parent. The existing SDK
appends a signed Governance-only child, preserving the app principal; only that
restricted signer reaches transaction code. Bootstrap credentials are not persisted,
and reload requires fresh II authentication. Neither identity reaches Dendrite.
Privileged mutations go directly from the browser to fixed NNS Governance and still
require a fresh authoritative Dendrite preflight. See [security](docs/security.md).
Creation uses separately consented short-lived named Ledger/CMC/Cycles Ledger,
management and exact-bootstrap scopes. These preserve P and are held only in memory;
target restrictions do not constrain management method arguments. The temporary
bootstrap stores only its bounded versioned plan and recovery intents, authenticates
the actual P caller, and never receives browser credentials. Exported non-secret
receipts restore no authority without fresh authentication and chain evidence.
Report-loading work is owned by route-generation operations, so navigation and
transaction settlement cannot publish stale completions or strand a loading state.

## Production deployment

`icp-cli` is the sole production lifecycle CLI. Release source verification, guarded
deployment, final-origin identity testing, and controlled transaction testing are
separate phases. The latter two are independently signable
[operator gates](docs/operations/operator-gates.md). PocketIC is the automated local
canister environment; no repository-local dfx project configuration is used.

## Source verification

The canonical public artifact comes from the digest-pinned Docker build. Its raw Wasm
SHA-256 is bound in `icp.yaml`, checked against `dist/release/SHA256SUMS`, and compared
with the installed module hash after deployment. See
[reproducible builds](docs/operations/reproducible-builds.md).

## Repository layout

`canisters/dendrite/` contains the canister and frontend, `canisters/bootstrap/` the
per-neuron temporary component, `crates/` the pure rules and
fixed evidence client, `candid/` reviewed interface subsets, `tools/` release and test
tooling, and `docs/` architecture, development, operations, security, and the standard.

## Documentation

Start with [architecture](docs/architecture.md),
[testing matrix](docs/development/testing.md), [deployment procedure](docs/operations/deployment.md),
[reproducible-build evidence](docs/operations/reproducible-builds.md),
[operator gates](docs/operations/operator-gates.md), and [security](docs/security.md).
