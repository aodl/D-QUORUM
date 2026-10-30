# Source and artifact provenance

| Role | Immutable revision |
|---|---|
| Operational/testing reference | [JUPITER_FAUCET_SUITE e60b79fc428b63cde629174a0f1c40d5fa372623](https://github.com/aodl/JUPITER_FAUCET_SUITE/tree/e60b79fc428b63cde629174a0f1c40d5fa372623) |
| Unmodified eligibility evaluator | [NNS_Dendrite_Standard b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291](https://github.com/aodl/NNS_Dendrite_Standard/tree/b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291) |
| Evaluator's internal NNS policy source | `d55a0f4d4edfabe49d8fd543aff473084cb741f2` |
| API and monetary test artifact source | [dfinity/ic 83f29e0803496ba6aaea3d6b43f6c6bebea12dd9](https://github.com/dfinity/ic/tree/83f29e0803496ba6aaea3d6b43f6c6bebea12dd9) |
| PocketIC client/server | `15.0.0`, server uncompressed SHA-256 `29472ea4433b30a280676c4e22e369d79d5ba6ee1b4d48bab32ebe7d0ad2b4bb` |
| Rust | `1.94.1`, with locked dependencies and Wasm target |
| Canonical container | `rust:1.94.1-slim-bookworm@sha256:cf9dd0ec73e75f827fe59123fff9dc65af1a1c8363c3c31ee8d7f8ad0b6a5fb2` |
| didc | `0.6.2`, official MUSL archive SHA-256 `ced232a08d12190f7124110b6a39d8023732160838c062285e015d2c03bcc930` |

`protocol-pins.json` records immutable artifact URLs plus compressed and raw Wasm checksums. Governance, Ledger, archive and optional Index artifacts are from the API source revision above. The optional Index pin is provenance only: production uses authoritative Ledger/archives directly, without an Index lag assumption. The real archive test exercises the archive embedded in the pinned Ledger.

The PocketIC fixture uses its checksum-pinned built-in Registry and CMC features to supply the real maturity finalizer's modulation environment. Their exact module identities are to be retained in protocol evidence; this does not assert they are deployed-mainnet artifacts. The explicit Governance and Ledger installations use our separate source/artifact pin rather than accepting PocketIC's default Governance/Ledger versions.

The reviewed API source is not asserted to be the revision currently deployed on mainnet. Activation requires a read-only compatibility review of the deployed APIs, limits, controller identity and capabilities. Source semantics, artifact tests and a deployed identity check are distinct evidence.

Reference study includes Jupiter's testing guide, xtask README, disburser README/runtime/accounting, lost-transfer and mid-upgrade PocketIC tests, real Ledger/Index helpers, behavioural and canonical workflows. Reused patterns are explicit ignored-suite execution, artifact preparation before long fixtures, durable transfer identities, natural-timer production tests and exact reproducibility manifests. Jupiter's fixed-recipient clear/rebuild policy and controller/rescue policy are intentionally not used.

Dendrite study includes the build spec, current standard, pure Rust evaluator/evidence, bounded collector, fixture and tests. Only the pure evaluator/types and exact parity fixture are vendored. Its source files are byte-identical to the pin; `vendor/dendrite/SHA256SUMS` and its retained Apache-2.0 licence document this boundary. No deployed Dendrite dependency exists.

PocketIC 15.0.0 release server source is IC commit `8258578e6212d445aeeafb71c1160fa4ea356d60`; its release-repository tag resolves to `07bfae058ce2aa56994759b563531a7e8d98ba96`. These identify the test runtime, separately from the Governance/Ledger artifact source pin. The local CMC and Registry modules are built-ins from the checksum-pinned server and their installed module hashes are recorded in test evidence.
