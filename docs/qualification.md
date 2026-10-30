# Qualification record

This is an initial implementation candidate, **not a fully qualified production release**. The authoritative open-gate inventory is `acceptance-matrix.json`. Final local evidence, source/artifact hashes, exact counts and remaining operator-only work are recorded in the handover report. A mandatory unrun or failing gate prevents a qualification claim.

The implementation includes real bounded adapters, durable timer jobs and financial intents. Its real-protocol suite is distinct from recording mocks. Native coverage does not measure code executed inside PocketIC Wasm. Large-index measurements for an empty candidate set do not qualify a populated worst-case score map.

The release scripts produce an installable, undeployed Wasm and byte-identical two-build evidence when the canonical gate succeeds. Remote CI awaits a separately authorised push; there is no remote execution or branch-protection evidence in this local tranche.
