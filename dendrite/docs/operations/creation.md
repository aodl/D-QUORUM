# Browser-led creation and recovery

This is an undeployed candidate workflow. A local development result is not a
release qualification or a mainnet compatibility assertion. The consolidated
qualification receipts identify the tested source, protocol modules and browser
build. No production writes are authorised by this document.

## Identities and custody

| Phase | Canister C | Neuron T | User's authority |
| --- | --- | --- | --- |
| Plan | Does not exist | Does not exist | P owns a deterministic workflow funding subaccount. Cancellation is local. |
| Provision/install | Empty, then approved bootstrap; sole controller `[P]` | Does not exist | P may replace C's code using normal management authority. Dendrite does not enforce immutability against its creator. |
| Fund/configure/register | Approved bootstrap, sole controller `[P]` | Governance neuron controlled by C; no target hotkeys | P authenticates C's narrow application commands. Managers may use Governance's existing management proposals. |
| Sealed/stopped | Approved module, quiesced, sole controller `[P]` | Registered and freshly checked | Explicit unseal before uninstall can restore the recoverable configuration path and invalidates readiness. |
| Code removed | No module or application state; sole controller `[P]` | Still controlled by principal C | P still has canister control. Resume from exported provenance and fresh external reads; no automatic reinstall. |
| Finalised | No module and no controllers | Still controlled by principal C | Ordinary creator controller authority is gone. Managers retain only commands the NNS actually permits. Developers cannot restore it. |

P is the stable II application principal for the reviewed Dendrite origin. An
ephemeral signing key's standalone principal is never installed as controller.
The NNS dapp may derive a different principal/account from the same II identity.
Dendrite and D-QUORUM receive no custody, controller authority or creation funds.

## Profiles and a reviewed plan

Use **Create a Dendrite** from the landing page. A recoverable test uses one
distinct public known manager, including your own if you have authority. The
pinned Governance claim starts with a seven-day lock. This profile stays visibly
NonCompliant and cannot finalise, even if a receipt is edited to claim otherwise.

A production candidate uses the shared Standard: 5–15 distinct known public
managers, valid topic delegates/defaults, all required following, public visibility,
zero target hotkeys, `not_for_profit=false`, positive stake, the exact
63,115,200-second non-dissolving lock and current voting power. Current network
minimum stake, proposal fees and voting eligibility are read separately. A network
whose voting minimum conflicts with that fixed lock blocks production creation;
the application does not revise the Standard to fit it.

Review P, origin/API/network, managers and observed authority, topic following,
stake, independent cycle budget, reserve, fixed recovery account, proposed metadata,
nonce, artifact and policy identities. Known registration is not proof of consent
or independent human ownership. Creation never changes an existing manager's keys
or following automatically. A profile change requires another fresh plan and
cannot promote a test receipt into finalisation authority.

The pinned Governance API filters management ballots to neurons readable through
the caller's authority. Automatic finalisation currently needs P to read every
manager ballot. The application therefore blocks the long-lock commitment if P
lacks authority on any manager. That is an evidence limitation of this workflow,
not a new compliance rule. Separate manager-authority changes need their existing
authorised workflow and review.

## Separate provision and stake budgets

The supported route is a P-owned workflow ICP subaccount, CMC conversion into the
same P-owned Cycles Ledger subaccount, Cycles Ledger creation with `[P]`, then
installation of the certified, checksum-bound bootstrap asset. No factory or
provisional management creation API is part of the positive journey.

Copy the displayed account owner, subaccount and legacy identifier into your
external wallet. Its funding fee is additional. The application reviews its own
exact CMC payment, current ICP fee, fresh conversion rate, Cycles Ledger deposit
and creation fees, authorised creation amount and estimated leftover cycles.
Conversion is irreversible after successful minting; spent/converted cycles are
not refundable ICP. Costs depend on network economics and execution. There is no
promise of a perpetual cycle balance or universal fixed provisioning cost.

Before a staking address appears, the browser verifies the original certified
creation reply, sole P controller, economical settings, never-installed status,
exact module hash and replicated plan binding. It uses `install`, never `reinstall`.
An uncertain install reply is resolved by checking that exact module/state.

Stake is paid separately to Governance's C-and-nonce-derived staking subaccount.
It is neither C's default ledger account nor an address derived from a numeric
neuron ID. Direct external-wallet payment is preferred. The optional application
payment is restricted to that exact address and reviewed amount. Underpayment
pauses; overpayment is displayed and needs a fresh constrained review before
claiming. Extra deposits confer no creator authority and are not silently spent.

Readiness also checks C's default ICP account. A positive balance there blocks
irreversible teardown: it is separate from the Governance staking account, and
the narrow bootstrap has no general payment endpoint to spend it. Preserve P's
recoverable canister authority while resolving a mistaken deposit; do not treat
removing code/controllers as financial recovery.

While P still controls C, inspect its fresh cycle balance/settings through the separately
consented management capability. Maintain at least the reviewed reserve and enough
for retries and teardown. If external maintenance is necessary, the exact C
principal is the destination; independently review the external cycle provider's
method and fees. The application does not silently convert more ICP or expand a
saved provisioning budget. Empty immutable controllers retain only system state;
this workflow does not promise infinite retention or an emergency recovery key.
After P's controller authority is removed, its management credential cannot read
the private cycle balance. The handover's balance is the last observation before
that boundary, rather than continuing public balance monitoring.

## Consent, signing and browser lifetime

Normal team management retains its Governance-only child identity. Creation uses
separate named, memory-only capabilities with a maximum 15-minute lifetime:
Ledger/CMC/Cycles Ledger funding, management plus exact C, and exact C application
calls. Each derives from genuine II authentication, preserves P, inherits parent
restrictions and is discarded on cancellation, sign-out or route changes.
The ordinary application login owns the SDK's shared idle manager; disposing one
creation capability does not exit that singleton or reload the receipt handover.
Application inactivity still clears the browser heap through the existing reload,
and each provisioning child independently retains its short expiry.

A management target `aaaaa-aa` does not constrain method or `canister_id`/amount
arguments. Real replica controller checks and exact reviewed requests remain
necessary. Same-origin script integrity and the user's provisional ability to
replace C are residual trust boundaries. Certified assets establish served bytes,
not freedom from a compromised browser or hostile creator.

## Receipts and uncertain outcomes

Save the non-secret recovery intent before each application-originated monetary
or proposal dispatch. Check the exact source, destination, amount, fees and
request identity, then confirm. Save updated checkpoints after creation and before
uninstall. Receipts contain public plan/revision history, account derivations,
request arguments/digests, protocol references and certified historical transition
evidence. They contain no keys, seeds or reusable signed delegation chains.

Use **Resume creation**, import the saved JSON and reauthenticate as the same P.
No localStorage, IndexedDB, cookie or shared registry restores a creation receipt.
Imported Prepared operations become Unknown because they may have crossed the
dispatch boundary. Strict schema/size checks and checksums detect malformed data;
neither a checksum nor an imported phase grants authority. C, T, accounts, plan,
module and current controllers are re-established independently.

| Uncertain boundary | Supported evidence and limitation |
| --- | --- |
| ICP transfer | Exact original block, or a bounded search from its saved ledger anchor; Ledger-endorsed archive retrieval. Time or a lower balance does not prove absence. |
| CMC conversion | Re-notify the original verified ICP block; verify any refund block. Purged notification history may remain unresolved. Never replace the payment just because it is old. |
| Canister creation | Prove the original permanent cycles burn, then the exact deduplication request. Duplicate without C or expired deduplication cannot authorise another creation. |
| Install | Exact current module and replicated initial binding; never wipe an unknown module. A prior code-removal checkpoint/version blocks fresh installation. |
| Claim/configuration | C's durable original effect and fresh Governance account/configuration readback. Same nonce cannot intentionally produce a second target; additive lock is never blindly repeated. |
| Registration/rehearsal | Original reserved operation, proposer, exact marked payload and Governance proposal ID. A bounded descending Governance history search can suggest original IDs for explicit replicated bootstrap verification; it never submits or clears uncertainty. Filtered/pruned history, a lost dispatch grant, or no match can remain blocked and require external investigation. |
| Teardown | Historical sealed provenance plus current certified module/controllers and fresh Governance/evaluator facts. Separate calls have a non-atomic gap. |

Historical receipt evidence has an explicit 30-day verification window in this
first implementation. Current certificates retain normal freshness checks.
Missing/expired provenance blocks automatic finalisation; time does not confer
authority to substitute another user-owned canister. Retain the original files for
independent investigation rather than inventing a replacement success record.

An unresolved cycles-only creation does not consume untouched ICP. A separately
saved fixed-account return may recover currently available workflow ICP while the
original creation remains Unknown. This does not recover cycles, infer C's identity
or enable replacement provisioning. Other potentially executed financial operations
remain blocking until their own protocol evidence resolves them.

A callback trap can leave the in-memory execution guard held while its original
durable effect remains pending. The explicit same-code recovery upgrade uses only
the certified original Wasm, sole P authority, saved receipt and existing stable
checkpoint. It neither reinstalls an empty canister nor dispatches a Governance
command. It first stops C and waits for its original unbounded remote calls to
drain, restarts only the approved code to read the settled checkpoint, and skips
the upgrade if that operation has already completed. A still-pending checkpoint
is stopped again before the same-code upgrade; after restart the whole replicated
checkpoint is compared. Concurrent progress causes a mismatch and needs fresh
readback. If quiescence cannot be established, no upgrade is sent. The replica
must permit the upgrade, then the original effect still needs reconciliation. Sealed
or unknown modules cannot use this path. An upgrade is not cancellation of a remote
effect and does not prove that an ambiguous financial call did not execute.

## Registration, rehearsal and irreversible finalisation

Production follows **register first, then finalise**. Registration assistance
exports exact `RegisterKnownNeuron` Candid or submits it through a separately
selected eligible proposer using the existing Governance-only identity. Review the
current fee and truthful provisional-controller description. This is a global NNS
proposal; adoption/execution and actual metadata readback are required. Rejection,
name collision, unavailable status or adopted-but-unexecuted status are not success.
Final readiness also checks the registered committed-topic variants against the
reviewed plan; changed, duplicate, unknown or unavailable topic metadata blocks it.
Browsing or finishing configuration submits no proposal automatically.

Next, managers demonstrate an executed benign refresh proposal for exact T. The
application verifies the target/action, execution, current electorate and actual
quorum. Registration and this rehearsal do not prove independent human ownership.

Readiness runs the unchanged evaluator. Only the two specifically expected
bootstrap failures (installed code and P's retained controller authority) may
remain. All financial/configuration work must be settled, registration and
manager/delegate facts fresh, target hotkeys absent, current approved code and sole
P control proven, reserve sufficient and final receipt saved.

Seal and reconcile outgoing work. The replicated sealed reply binds C's management-history
counter (`total_num_changes`). Approved code permits no configuration work while sealed; unsealing
requires P first to upgrade the same approved module, changing that counter. Stop C
and verify quiescence and the unchanged history counter. The direct `certified_data`
read-state path is unsupported by the pinned replica and is not used as evidence.
After uninstall, require exactly the next history counter as well as certified
module absence and retained P. Another tab's upgrade/unseal invalidates an old
sealed receipt. Stop/uninstall does not undo an already dispatched remote command.

1. Confirm complete C and T identities and **remove code**. Verify certified module
   absence with controllers still exactly `[P]`. Save the Code removed checkpoint.
2. Independently recheck C/T, absent module, retained P and fresh target state.
   Enter the complete identities again, acknowledge the separate irreversible
   action and **remove every controller** using an explicit empty list.

A restart between these steps uses exported provenance and chain reads without
calling removed code. After controller removal, verify certified empty controllers
and absent module, then obtain a new full report. Only its actual Compliant result
can be labelled Compliant. Concurrent legitimate manager changes can invalidate
the final report; the UI does not fabricate a rollback. Fresh preflight cannot
make NNS and management calls atomic.

The handover view includes T/C, managers, topics, receipt and existing management
controls. Ongoing governance and voting-power refresh obligations continue;
creation does not maintain perpetual compliance.

## Cancellation limits

Before spending, cancel locally. After provisioning or possible stake funding,
preserve C and its bindings. Return unused workflow ICP only to the plan's fixed
account with a separate exact review. A claimed seven-day test neuron must
separately start dissolution and wait the real lock before fixed-account stake
disbursement. A production two-year lock cannot be reduced or immediately refunded.

The bootstrap disburses only a proven dissolved neuron, binding the reviewed
amount/fee and fixed destination. A lost reply is reconciled through the original
ledger block rather than a second disbursement. After code removal, bootstrap state
is gone; after controller removal, routine creator recovery is gone. No developer
or service recovery controller remains.

See [architecture](../architecture.md), [bootstrap](../../canisters/bootstrap/README.md)
and the consolidated source-bound qualification report for exact protocol pins,
supported evidence and any failed/unrun release gates.
