# NNS Dendrite Standard 1.1 draft — implementation summary

The normative contract is `DENDRITE_BUILD_SPEC.md`; this document is a reviewer index. A target must be returned as a full public neuron with valid `known_neuron_data`, structurally configure at least one concrete committed topic, remain not dissolving at 63,115,200 seconds, have positive effective stake, and retain undecayed voting power refreshed within six nominal months (15,778,800 seconds). The dissolve delay and refresh threshold are compile-time constants derived from pinned `dfinity/ic@d55a0f4d4edfabe49d8fd543aff473084cb741f2`; the verifier does not query network economics.

Its controller must resolve via `canister_info` to a canister with no module hash and
no controllers. The target has exactly zero hotkeys. Proposal-based dissolution must
be disabled with `not_for_profit = false`, preventing the manager group from using a
Neuron Management proposal to start dissolving the neuron.

The browser may evaluate those same controller rules from fresh IC-certified system
state for the exact controller principal reported by its validated, replica-signed
Governance query. This certifies controller state, not the neuron-to-controller
relationship. Certificate or decoding failure remains indeterminate, and only a
replicated Dendrite report can authorize management controls.

Neuron Management has 5–15 raw, distinct, non-self known managers. The displayed
quorum is the actual NNS ballot quorum, `floor(distinct manager IDs / 2)+1`; the
separate Standard rule still rejects duplicate raw manager entries. Each structurally
committed topic has at least three distinct manager delegates; each delegate follows
exactly Omega-reject — neuron `18422777432977120264` — on that same topic. Every
currently recognised uncommitted concrete topic and CatchAll follows exactly one
approved default: Alpha-vote — neuron `2947465672511369`, Omega-vote — neuron
`18363645821499695760`, or Omega-reject — neuron `18422777432977120264`.
Omega-reject is not omega-vote.

Commitment is derived only from numeric following configuration: a concrete topic
configured with a non-empty list other than one approved singleton default is
committed. Known-neuron `committed_topics` entries are bounded but decoded as opaque
`reserved` values, so a future Governance variant cannot break response decoding and
does not silently acquire semantics. This lets future numeric topics use the same
structural delegate rules without upgrading Dendrite; additional future topics using
an approved singleton default are uncommitted and inert.

Each raw manager entry is reported in its original order with explicit found,
confirmed-missing, or unavailable evidence. Found records include the bounded public
controller and hotkey evidence already returned by Governance. The browser may compare
an Internet Identity principal locally with those fields, but this read-only
recognition is not part of compliance, grants no authority, and causes no additional
canister call or NNS mutation.

The `nns-dendrite/1.1-draft` public catalogue contains 23 direct rules in six groups:
Neuron identity and commitments; Lock and voting power; Control and immutability;
Manager group; Committed-topic delegation; and Default following. The former global
data-handling assertions are internal evaluator invariants, not neuron rules. The
reference neurons' known-neuron registration is likewise not scored; only the direct
following requirements compare their exact IDs.

Confirmed defects are `NON_COMPLIANT`; unavailable data makes each affected direct
rule `INDETERMINATE`; unknown semantic variants are `STANDARD_UPDATE_REQUIRED`. A
successful response omitting a requested neuron is factual data, while rejection or
decode failure is unavailable. Report version, source revision, timestamp and
construction consistency are preconditions: an invalid report fails with a bounded
analysis error rather than blaming the neuron. Results never short-circuit when
independent data remains.

`DENDRITE-ACTIVE-001` uses the target's NNS Governance
`NeuronInfo.retrieved_at_timestamp_seconds`, and the report exposes that same NNS
snapshot as `checked_at_timestamp_seconds`. A refresh after the snapshot is a
contradictory response and therefore indeterminate, not a factual neuron failure.
Dendrite local time is used only by the heap-only abuse guard.

Browser management does not change these rules or the canister API. Manager minted
stake excludes fees and staked maturity, raw Neuron Management followees preserve order,
and `omega_ready_topics` identifies exact singleton omega-reject following. These added
report fields support browser preflight; a new live `check_neuron` remains authoritative.

`DENDRITE-COMMIT-004` checks every manager that the target follows as a delegate on
the same topic, independently of whether that topic is otherwise classified as
committed. Each such manager must follow only omega-reject on that topic. Neuron
Management is exempt because it defines the manager set rather than delegating a
proposal topic.

The interface presents each stable normative requirement separately from its factual
outcome explanation. All report disclosures start collapsed. The six rule groups, Team
Members, and Topic Delegation remain closed until the user opens them. Header
characteristics and the copy-only Raw Report control remain directly available. Status totals are the only rule filters and
never expand a section. Multi-topic entries retain every evaluation but count once as
their aggregate Standard rule.
