# Security and deployment boundary

The runtime has one application update: the Governance-only roster-size setter. It has no generic Governance command, direct vote, arbitrary proposal, transfer, destination, manager-list editor, controller setter or rescue endpoint. All financial and following effects arise from persisted typed timer jobs. Installation is observe-only unless an explicit typed mode is supplied. Upgrades preserve the mode unless an explicit mode argument changes it or a changed policy/evaluator/protocol pin returns the canister to ObserveOnly. Actual canister controllers retain IC upgrade authority; this software does not reduce, replace or hide that authority.

Production IDs are compile-time constants. Write modes require a reviewed target controller at installation, and the runtime checks the exact target ID, expected controller, hotkey and Governance controller before following/proposal preflight. Bootstrap verifies the proposer against the one deterministic canister staking account. The proposer never follows Neuron Management automatically. The only proposal built by the production maturity adapter is 100% DisburseMaturity on D-QUORUM to the explicit canister default account.

Dendrite CONTROL-005 still checks `not_for_profit=false` exactly as pinned. Its upstream narrative about proposal-based dissolution is not a reliable executable permission boundary. The reviewed Governance command validator limits Disburse and DisburseToNeuron for this flag; it does not impose a universal ban on configure, split, maturity or dissolution operations. D-QUORUM's safeguards come from its command allow-scope, ownership/manager checks, and real protocol tests. The policy pin is not silently edited to fit another NNS runtime.

Response size and decoding/skipping quotas cap Candid work. IDs, pagination, visibility, map keys, collection bounds, account binding and arithmetic are checked before state commits. Optional unknown response actions must not silently become interpreted success. Client entry points reject absent/unrecognised required actions and commands. Metadata topic declarations intentionally remain opaque because the pinned evaluator uses structural numeric semantics. This is distinct from ignoring unknown commands.

Every financial intent is flushed before await. Callbacks commit only under their current job generation. A stale reply can leave an intent Unknown; it cannot replace newer state or create a second identity. Ledger confirmation requires exact history matching, including sender, validated destination, fee, amount, memo and timestamp. A complete balance change is not a proof of any individual transfer. Expired uncertainty is retained indefinitely when history is unavailable. There is no emergency reset that discards liabilities.

Stable-state restoration rejects unsupported/lossy schemas and invalid accounting. **Never reinstall a funded or previously active canister**: reinstall destroys its state and is not an upgrade/recovery procedure. Back up the exact module, source manifests and operational evidence under the operator's governance process. This initial snapshot-cell design trades simplicity for full-state encoding costs; production capacity needs measured review with populated candidate scores, including larger candidate graphs and score maps beyond the bounded scale fixtures.

Timers stop initiating work below a two-trillion-cycle reserve. This is an operational default, not a guarantee of solvency or recovery time. Controller monitoring, cycle funding, deployed NNS capability drift, target controller review, live activation and incident governance are external operator responsibilities.

The dependency audit and SBOM cover the locked workspace and separately record production reachability. Unmaintained-package notices are reported rather than silently ignored. A dependency scan, Clippy or mock test is not a full independent security audit. No secrets, private keys, identity exports or environment-secret files are required. CI has read-only repository permission and no deployment secrets. No self-controller or autonomous rescue mechanism is installed.

The embedded Candid metadata uses a narrowly allowed Rust `link_section` attribute. No executable unsafe Rust is introduced. The CDK's internal timer executor is the one reviewed non-application update export; the pinned timer implementation restricts it to self-calls. Production export validation permits only that exact hook and the reviewed API/lifecycle exports.

RC2 introduced eligible-voter scoring and stable V2. This financial lifecycle candidate uses V3 while preserving the scoring policy and evaluator. See [the hardening contracts](hardening-design.md). Historical RC1/RC2 hashes and results do not qualify it. Review the exact migration, preserved operating mode, current observations and separate maintenance status before any separately approved activation.

Financial settlement is independent of recipient stake-cache availability. Only authoritative confirmed transfers can retire; unknown execution stays a funded active obligation. Maintenance has its own bounded, fair timer job and explicit terminal failure/retention reporting, with no new administrator authority. The daily financial admission deadline survives roster changes and upgrades. Definite no-execution refusals may recover after cooldown; ambiguous attempts never gain a fresh identity on elapsed time or retry exhaustion.

Missed maturity progress is recoverable only with retained exact execution proof and the pinned shared-neuron lock barrier followed by fresh empty progress. Empty progress while a mint is in flight is insufficient. Historical receipt attribution can remain unprovable; no proposal status creates spendable ICP, and no unrelated deposit is attributed to an operation. The pin-derived barrier needs independent compatibility review before operating against another Governance revision.

V3 preserves exact V1/V2 financial identities and confirmations. Migration never interprets a Held reason string as proof. Completed non-financial maintenance retention is bounded and visible; active financial liabilities are never pruned. Release evidence must include the ignored canonical artifacts and complete execution records in a separately checksummed review bundle. Historical RC1/RC2 reports cannot qualify the new source.

The twelve-entry exact refusal history is audit detail for attempts already proven not to have executed. Its eviction cannot remove a payment obligation or clear execution uncertainty. The current attempt number never resets; unknown/current identities and confirmed payment evidence are retained exactly. No hash commitment, event log or archive mechanism was added for failed attempts.

## Repository integration boundary

Dendrite is a nested independent product, not an authenticated backend for D-QUORUM. Its browser signs directly to Governance; its verifier remains anonymous. Importing source does not merge controllers, hotkeys, accounts, stable state, policy or reward authority. Test-only II, browser coordination, synthetic fixture provisioning and local-root trust configuration never enter production exports. Production frontend configuration continues to reject local root-key fetching and arbitrary API destinations. Local browser artifacts have distinct configuration and hashes and must never be deployed as canonical production assets. Component mocks do not prove II authentication or signed Governance authority.

The scoped browser integration uses non-extractable ephemeral bootstrap and transaction
keys. Only the SDK-signed Governance-only final identity reaches the fixed Governance
actor; private bootstrap SDK state is signed out before session publication. Every
ancestor remains effective and every expiry is checked again at dispatch. Same-origin
script compromise during bootstrap is still a threat. Local sign-out invalidates local
session ownership, not already accepted requests or network-wide delegation validity.
See Dendrite's security document for the narrowly validated, expiring optional native
build-tool applicability exclusions and retained raw full-development findings.
