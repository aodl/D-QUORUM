# Upstream source baseline

Dendrite's checked-in NNS and management-canister interface subsets are reviewed
against the official [`dfinity/ic`](https://github.com/dfinity/ic) repository at
commit `d55a0f4d4edfabe49d8fd543aff473084cb741f2`. GitHub reports this
official commit as signed and verified; it is the immutable research baseline named by
`DENDRITE_BUILD_SPEC.md`.

Pinned paths:

- `rs/nns/governance/canister/governance.did`
- `rs/nns/governance/proto/ic_nns_governance/pb/v1/governance.proto`
- `rs/nns/governance/src/governance.rs`
- `rs/nns/governance/src/neuron/types.rs`
- `rs/nns/governance/src/pb/mod.rs`
- `rs/types/management_canister_types/src/lib.rs`
- `rs/execution_environment/src/execution_environment.rs`
- `rs/execution_environment/src/ic00_permissions.rs`

`tools/scripts/check-interface-drift.sh` downloads only these official pinned
sources, uses Candid structural compatibility for Governance, extracts the
official management request/response Candid documentation and checks strict
structural equality, and proves deliberately incompatible fixtures are rejected.
