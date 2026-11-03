# Production deployment

## Purpose and safety boundary

This is the sole executable `icp-cli` 1.2.0 procedure for installing or upgrading the exact
reviewed prebuilt artifact. It never creates a canister, changes controllers, tops up
cycles, retries, or supports `reinstall`. PocketIC supplies the automated local
canister environment; the repository has no dfx project configuration.

## Prerequisites

Use Rust 1.94.1, Node 24.15.0, npm 11.12.1, `icp-cli` 1.2.0, Docker 28.0.1,
Docker buildx 0.21.1, and PocketIC 15.0.0. Require a clean reviewed commit, the
tracked mapping, a production controller identity selected in `icp-cli`, adequate
cycles, Docker daemon/buildx access, and all automated gates. `codex_local` is
local-only and must never be the production identity.

Ordinary browser analysis uses the configured API host anonymously for fixed Governance
queries and certified system-state reads for only the controller principal returned by
validated Governance evidence. It never uses the operator identity. Deployment does not
alter this evidence policy or authorize browser transactions.

## Production identifiers

| Name                       | Value                                         |
| -------------------------- | --------------------------------------------- |
| Canister                   | `dendrite`                                    |
| Mainnet canister ID        | `hp4av-oiaaa-aaaar-qcaha-cai`                 |
| Canonical origin           | `https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io` |
| Alternative origins        | None                                          |
| NNS Governance             | `rrkah-fqaaa-aaaaa-aaaaq-cai`                 |
| Internet Identity provider | `https://id.ai/authorize`                     |
| IC API host                | `https://icp-api.io`                          |
| Mainnet environment        | `ic`                                          |

## Controller policy

The Dendrite application is distinct from the target-neuron controller canister.
Dendrite retains reviewed upgrade control during development and qualification because
a controller can replace both verifier code and the served transaction-signing
frontend. Its intended terminal state is an irreversible blackhole.

Blackholing Dendrite is a separate final operator gate, never part of routine
deployment. It requires the final reviewed artifact and module hash, byte-identical
reproducible builds, completed automated and manual qualification, frozen origin and
identity configuration, adequate cycles, and an explicit public record. Remove all
Dendrite controllers only after those conditions pass. Afterwards no defect, upstream
compatibility break, or frontend issue can be repaired. Never call Dendrite immutable
unless live controller state proves the empty controller list.

## Cycles policy

The live check guard requires a 2T liquid-cycle reserve. It admits at most two
concurrent checks, one check per neuron, and 20 starts per 60 seconds; stale in-flight
entries prune after 300 seconds. Inspect balance independently and never combine a
top-up with deployment.

## Reserving an empty canister ID

Reservation is an earlier, operator-controlled action. The public result is already
tracked as `dendrite -> hp4av-oiaaa-aaaar-qcaha-cai` under `.icp/data/mappings/`.
Do not recreate it. `.icp/cache/` is transient and ignored.

## Choosing the canonical origin

The exact origin is `https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io`; alternatives are
exactly `{"alternativeOrigins":[]}`. Changing the canonical origin changes browser
principals and requires a separately reviewed migration.

## Canonical release build

Export the production inputs in the [README](../../README.md), run
`tools/scripts/docker-build-release.sh`, then
`tools/scripts/verify-docker-reproducible.sh`. Update `icp.yaml` from
`sha256sum dist/release/dendrite.wasm` and rerun
`tools/scripts/verify-release-artifacts.sh`. `@dfinity/prebuilt@v2.0.0` only verifies
and selects that file; no production source rebuild is configured.

## Fresh installation

| Situation                  | Mode                          | Effect                                              |
| -------------------------- | ----------------------------- | --------------------------------------------------- |
| Reserved empty canister    | `install`                     | Installs the first reviewed Wasm                    |
| Existing Dendrite canister | `upgrade`                     | Replaces code; no application stable state exists   |
| Reset or recovery          | Unsupported routine operation | `reinstall` is not part of the production procedure |

Set `DENDRITE_CONFIRM_MAINNET` to the exact canister ID. Run
`tools/scripts/mainnet-deploy.sh dry-run`, review commit, identity/principal, mapping,
status/settings, module absence, hash, and exact command. Then run
`tools/scripts/mainnet-deploy.sh install` and type the ID at its interactive prompt.
The executed form is:

```sh
icp canister install dendrite --environment ic --mode install \
  --wasm dist/release/dendrite.wasm
```

## Routine upgrade

Repeat every source/build/verification step, require an existing module, run dry-run
with `DENDRITE_DRY_RUN_MODE=upgrade`, then execute the guarded `upgrade` mode. Never
use automatic mode or `reinstall`. Dendrite has no application stable state; upgrade
replaces code and certified assets and resets only heap-local guards. Browser sessions,
receipts, and unresolved-outcome markers are also outside canister stable state.

## Post-install verification

Pinned 1.2.0 resolves a name with `icp canister status dendrite -e ic --id-only`
(`icp canister id` is not available in this version). Read-only commands are:

```sh
icp canister status dendrite -e ic
icp canister settings show dendrite -e ic
(cd dist/release && sha256sum -c SHA256SUMS)
DENDRITE_CANISTER_ID=hp4av-oiaaa-aaaar-qcaha-cai \
  tools/scripts/verify-mainnet-readonly.sh
```

Status reports module hash, cycles, and controllers. The verifier checks `/`,
`/asset-manifest.json`, and `/.well-known/ii-alternative-origins` for success, content
type, IC certification, COOP, CSP/security headers, well-known CORS/no redirect/exact
body, and referenced hashed assets. Optionally set public
`DENDRITE_SMOKE_NEURON_ID` for one anonymous live update; never store an operational ID.

## Rollback and recovery

There is no automatic rollback or retry. Stop, preserve evidence, inspect whether the
write occurred, and prepare a new reviewed `upgrade` artifact if correction is needed.
Do not delete/recreate the canister and do not use `reinstall` as a generic remedy.

## Target-neuron operational boundary

Dendrite verifies but does not perform target-neuron setup. A target needs 5–15
distinct known managers, committed-topic delegates, approved singleton defaults,
following, maximum locked delay, no hotkeys, and `not_for_profit = false`. Blackholing
is the final irreversible step: uninstall the separate controller canister's Wasm and
remove all controllers only after every other failure is resolved. A failed lookup,
stopped canister, or retained recovery controller is not proof of blackholing.

## Troubleshooting

- ID/mapping/controller/origin mismatch: stop and reconcile operator evidence.
- Empty canister contains code or lifecycle mode is wrong: stop; identify the installed
  module and choose an explicitly reviewed mode.
- Module/release hash mismatch or stale assets: rebuild canonically and update the
  prebuilt hash only after equality.
- Insufficient cycles: top up in a separate reviewed operation.
- Package registry, Docker, or buildx failure: preserve the clean source and retry the
  build only after the dependency/daemon is restored.
- Alternative-origin or popup failure: verify certified bytes, final origin, popup
  policy, and Gate 1; do not mutate NNS.
- Live verifier failure: distinguish transport/unavailable evidence from factual
  failure.
- Unresolved transaction outcome: block retry and investigate Governance before a new
  request.
