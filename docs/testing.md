# Testing and release gates

Use `cargo run --locked -p xtask -- COMMAND`. Unit discovery uses Cargo workspace metadata and all library/binary targets; the runner reconciles discovered and executed libtest counts. Empty individual helper libraries are accounted for but cannot make an overall behavioural gate pass. Explicit ignored integration targets are required, and any successful zero-match behavioural command fails. Validators have no invented test counts. Required absent tools/suites fail.

| Command | Evidence |
|---|---|
| unit | Pure policy, accounting, durable-state and unchanged Dendrite parity/property tests |
| mock | Recording nominal Governance/Ledger and separately scripted malformed/lost replies, through production timers |
| hardening | Adversarial await races, long outages, unsent obligations, typed proposal refusals and cache-maintenance recovery through production timers |
| capacity | Dense 20/80/240-recipient fixtures, sixteen topics, coherent shared observations, latency/retry/upgrade and checkpoint costs |
| protocol | Checksum-pinned real Governance/Ledger, real archives, canister-origin reads, permissions, manager proposal, maturity delay and monetary effects |
| production | Complete actual export set, embedded Candid bytes, natural production timers and upgrades |
| scale | Synthetic large neuron index, actual Wasm timers, stable pages, serialized bytes, instructions, calls and cycles |
| coverage | Native Rust line/region/function coverage; does not attribute Wasm execution to native coverage |
| security | Cargo audit, scoped production dependency isolation, locked CycloneDX inventory/graph |
| canonical_artifact | Exact Docker-built candidate through natural mock timers and real production financial lifecycle |
| reproducible | Two no-cache digest-pinned Docker builds, exact filenames/bytes and source/artifact manifests |
| acceptance | All gates and mandatory behavioural matrix; incomplete requirements fail |

Wasm is compiled before fixtures start. The runner owns a checksum-pinned local PocketIC server with an explicit twelve-hour wall-clock hard lifetime and stops it on exit; this avoids the SDK implicit server's ten-minute hard exit during long suites. It does not alter virtual production time, job timers or freshness bounds. Direct ignored-test invocations without the runner use the SDK default lifetime. `protocol-pins.json` verifies the PocketIC executable and real protocol gzip/raw hashes. Test package imports do not add their dependencies or exports to production Wasm. Mock scripts do not establish NNS permissions. Real tests explicitly install the separately pinned Governance and Ledger; PocketIC's CMC and Registry provide the modulation environment. Real transfers compare exact account IDs, amounts and fees. Real archive creation/readback is exercised. Cached neuron stake is tested separately from a Ledger stake-account top-up.

The production module has no debug drivers. Tests advance virtual time and observe bounded public queries. A CDK self-only timer executor is an explicit infrastructure export. The export validator rejects all unreviewed application exports and checks embedded Candid against the committed interface. `didc 0.6.2` checks public types and dependency subtyping against pinned upstream DIDs; response variants are retained or rejected safely, not silently interpreted.

The large-index fixtures exercise 10,000 synthetic public neurons both without candidates and with one compliant candidate, exact score accumulation and selected-candidate revalidation. They measure those bounded workloads, not worst-case candidate graph/score-map costs or universal mainnet capacity. The hardening capacity suite separately measures dense candidate/score workloads with twice as many compliant contenders, shared-manager conflict exclusions, five-to-fifteen managers per candidate, and actual snapshot checkpoint costs at 20, 80 and 240 selected recipients; its results must pass before claiming those supported workloads. Instructions recorded in health cover the timer call context up to sampling; final checkpoint encoding and replica/callee work are not universal cost guarantees. Cycle deltas, instruction samples, serialized bytes, physical stable pages and actual canister heap/total memory are distinct measurements.

Evidence is written under `dist/evidence`, including per-command suite results, coverage, security, SBOM, actual export checks and scale samples. These ignored local artifacts should be retained alongside the release manifest. The consolidated qualification report records which exact suites actually ran and which mandatory requirements remain open. Remote workflow source is not a CI run or branch-protection proof.

Required tools are Rust 1.94.1 with rustfmt/Clippy/llvm-tools/Wasm target, Python 3, Docker for canonical release, cargo-llvm-cov 0.6.16, cargo-audit 0.22.2 and pinned didc/PocketIC. icp-cli 1.2.0 and local launcher `15.0.0-2026-08-20-03-30` are recorded for future local deployment; PocketIC tests use the independently checksum-pinned 15.0.0 release binary. Tests do not inspect DFX identity storage. If dfx is used for any separately authorised local inspection, use `DFX_IDENTITY=codex_local`.

Repository owners must separately configure and verify required checks: `Behavioral (unit)`, `Behavioral (mock)`, `Behavioral (hardening)`, `Behavioral (protocol)`, `Production artifact`, `Dependency security`, and `Native coverage`. Canonical release promotion additionally requires `Canonical reproducibility` and a retained passing full acceptance run. Ordinary PR CI should be observed after an authorised push. No workflow deploys or uses deployment secrets.

The source acceptance matrix maps implemented coverage. It does not assert that a run occurred. A successful full acceptance command writes the executed matrix into `dist/evidence/acceptance-matrix.json`, with its exact source commit and suite results.

Native coverage is also reported separately for policy, accounting, clients and transitions, excluding the unchanged evaluator from those figures. Integration execution of Wasm-only await/timer branches is reported as integration coverage, without adding fictitious native-covered lines. See [hardening contracts](hardening-design.md) for exact scan economics, observation-age, attempt and migration semantics.
