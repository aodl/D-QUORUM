# D-QUORUM

One stateful Rust Internet Computer canister for deterministic, topic-specific Dendrite delegation and equal ICP rewards to selected neuron staking accounts.

**Release status: final financial-lifecycle hardening is undergoing qualification; this candidate is undeployed.** RC2 source `e14c9cb` and its results remain [historical](docs/releases/rc2-qualification.md). See the [current qualification and handover report](docs/qualification.md) for actual gate results and remaining prerequisites. Installation defaults to `ObserveOnly`; CI and activation require separate authorization. Mandatory requirements are tracked in [the acceptance matrix](docs/acceptance-matrix.json). No production write or push is authorized by local qualification.

The provisional reward policy gives **one equal net share to each distinct neuron in the latest fully applied, sufficiently fresh roster**, regardless of how many topics select it. VP ranks delegates; it does not weight payment. Managers get no additional share. Reward-receiver declarations do not redirect ICP. Review this policy before any deployment.

The production workspace consists of `canisters/d_quorum`, `crates/policy`, `crates/accounting`, `crates/ic_clients`, and the unchanged vendored Dendrite evaluator. Test-only recording canisters live in `tests/mocks`; real and mock PocketIC suites live in `tests/pocketic`. There is no frontend or dfx configuration.

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
```

All long suites are explicitly executed with `--ignored` by xtask. Missing tools, zero executed behavioural matches and incomplete required qualification fail. Wasm is prepared before starting fixtures. Required test artifacts are downloaded only from immutable URLs and verified against `protocol-pins.json`.

Read the [specification](docs/specification.md), [security model](docs/security.md), [testing contract](docs/testing.md), [operations procedure](docs/operations.md), [source provenance](docs/provenance.md), the [hardening changes](docs/hardening-design.md), and the [current qualification report](docs/qualification.md), the [historical RC1 qualification report](docs/releases/rc1-qualification.md), and [historical RC2 qualification](docs/releases/rc2-qualification.md). The public API is [candid/d_quorum.did](candid/d_quorum.did).
