# D-QUORUM

One stateful Rust Internet Computer canister for deterministic, topic-specific Dendrite delegation and equal ICP rewards to selected neuron staking accounts.

**Integration status: local development in progress; the combined repository is not qualified for release.** Dendrite is imported with its full history under [`dendrite/`](dendrite/README.md), retaining its own workspace, frontend, authority and release process. The earlier D-QUORUM maturity-barrier candidate remains historical evidence; see [qualification](docs/qualification.md) and [integration baseline](docs/integration-baseline.json). Installation defaults to `ObserveOnly`. Publication, deployment and activation require separate authorization.

The provisional reward policy gives **one equal net share to each distinct neuron in the latest fully applied, sufficiently fresh roster**, regardless of how many topics select it. VP ranks delegates; it does not weight payment. Managers get no additional share. Reward-receiver declarations do not redirect ICP. Review this policy before any deployment.

The production workspace consists of `canisters/d_quorum`, `crates/policy`, `crates/accounting`, `crates/ic_clients`, and the unchanged vendored Dendrite evaluator. Test-only recording canisters live in `tests/mocks`; real and mock PocketIC suites live in `tests/pocketic`. The nested Dendrite workspace has its existing verifier/asset canister and team-management frontend. The canisters remain independently deployable; their controllers and hotkeys are not combined.

```sh
cargo run --locked -p xtask -- unit
cargo run --locked -p xtask -- mock
cargo run --locked -p xtask -- hardening
cargo run --locked -p xtask -- capacity
cargo run --locked -p xtask -- protocol
cargo run --locked -p xtask -- production
cargo run --locked -p xtask -- scale
cargo run --locked -p xtask -- coverage
cargo run --locked -p xtask -- security
cargo run --locked -p xtask -- reproducible
cargo run --locked -p xtask -- acceptance
# Additional integrated gates (the complete integrated matrix is mandatory):
cargo run --locked -p xtask -- integration_inventory
cargo run --locked -p xtask -- component_dendrite
cargo run --locked -p xtask -- system_protocol
cargo run --locked -p xtask -- system_browser
cargo run --locked -p xtask -- component_dendrite_canonical
cargo run --locked -p xtask -- integrated_acceptance
```

All long suites are explicitly executed with `--ignored` by xtask. Missing tools, zero executed behavioural matches and incomplete required qualification fail. Wasm is prepared before starting fixtures. Required test artifacts are downloaded only from immutable URLs and verified against `protocol-pins.json`.

Read the [specification](docs/specification.md), [security model](docs/security.md), [testing contract](docs/testing.md), [operations procedure](docs/operations.md), [source provenance](docs/provenance.md), the [hardening changes](docs/hardening-design.md), and the [current qualification report](docs/qualification.md), the [historical RC1 qualification report](docs/releases/rc1-qualification.md), and [historical RC2 qualification](docs/releases/rc2-qualification.md). The public API is [candid/d_quorum.did](candid/d_quorum.did).
