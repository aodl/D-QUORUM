# Dendrite repository instructions

## Mission

Build Dendrite as the smallest credible anonymous verifier of the NNS Dendrite
Standard. This tranche is one certified Rust canister, one live verification update
method, and no application data storage. Read `DENDRITE_BUILD_SPEC.md` completely
before changing files and do not weaken a MUST requirement silently.

## Working method

- Keep changes small and reviewable and commit useful checkpoints.
- Prefer deletion, direct calls, compile-time constants, and one narrow client trait.
- Preserve useful pure-rule, interface, frontend-safety, reproducibility, and test work.
- Run relevant checks after meaningful changes and the full suite before completion.
- Never vendor keys, delegations, tokens, identities, or mainnet credentials.
- Do not deploy to mainnet unless explicitly requested.

## Fixed protocol constants

- `ALPHA_VOTE_NEURON_ID = 2_947_465_672_511_369u64`.
- `OMEGA_VOTE_NEURON_ID = 18_363_645_821_499_695_760u64`.
- `OMEGA_REJECT_NEURON_ID = 18_422_777_432_977_120_264u64`.
- Omega-reject is not omega-vote.
- The pinned source revision is `d55a0f4d4edfabe49d8fd543aff473084cb741f2`.
- The maximum dissolve delay is `63_115_200` seconds, derived as two nominal years
  from that revision.
- The active refresh threshold is six nominal months (`15_778_800` seconds).
- A target has no hotkeys, has `not_for_profit = false`, and has at least five
  distinct Neuron Management managers.
- JavaScript NNS IDs are decimal strings or `bigint`, never `number`.

## Architecture constraints

- Exactly one production canister named `dendrite`.
- Public application methods are only update `check_neuron : (nat64) ->
  (CheckResult)` and certified static-asset query `http_request`.
- Every check is live and consensus-backed. Store no result, history, configuration,
  counter, cache, or other application data in stable memory.
- No timer, heartbeat, indexer, background job, off-chain service, analytics, remote
  font, arbitrary outbound call, or generic transport exists.
- Canister outbound calls are fixed to NNS Governance `list_neurons` and management
  canister `canister_info` only.
- The frontend is embedded and served with HTTP certification v2.
- A tiny heap-only global abuse guard may reset on upgrade and has no public counters.
- Future privileged operations are browser-to-NNS and never relay a delegation through
  Dendrite. Authentication and governance controls are deliberately out of scope now.

## Verification rules

- Use `Neuron.known_neuron_data`; do not call a known-neuron catalogue or economics API.
- Preserve raw following vectors and detect duplicate IDs and duplicate topic-map keys
  before constructing maps or sets.
- Batch dependency `list_neurons` requests at 50 IDs or fewer and enforce the hard
  graph bound derived from pinned topics and the 15-followee limit.
- Successful omission of a target or dependency is factual evidence, not a transport
  failure. Rejection/decode/unavailable evidence is indeterminate. Unknown protocol
  semantics require a standard update.
- Blackholing requires `canister_info` success, no Wasm, and no controllers.
- Emit every independent rule supported by available evidence.

## Security and engineering

- Treat all upstream strings and URLs as untrusted. Use text-safe DOM helpers, never
  dynamic `innerHTML`, and allow only validated HTTPS links.
- Validate decimal IDs canonically and reject signs, whitespace, overflow, fractions,
  exponent notation, zero, and ambiguous leading zeros.
- Use pinned tools and lockfiles, narrow checked-in Candid subsets with semantic drift
  checks, strict Clippy, unit/PocketIC/frontend tests, reproducible builds, scans, and
  SBOMs.
- Keep PocketIC-only packages out of the production Wasm dependency tree and document
  narrowly scoped dev/test exceptions.

## Required root commands

- `cargo xtask check`
- `cargo xtask test`
- `cargo xtask coverage`
- `cargo xtask build`
- `cargo xtask build-reproducible`
- `cargo xtask verify-reproducible`
- `cargo xtask security-scan`
- `cargo xtask sbom`
- `npm test`
- `npm run test:coverage`

Do not report completion until all mandatory flows and checks pass, two clean builds
are byte-identical, Rust workspace line coverage exceeds 85%, frontend coverage passes,
and the final report records commands, hashes, exceptions, limitations, and deferred
Internet Identity/governance work.
