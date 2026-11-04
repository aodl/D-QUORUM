# Scoped authentication integration qualification

This candidate is **not yet qualified**. Implementation and targeted regressions are
being completed; the required clean-source combined acceptance run and current release
bindings remain outstanding. No historical result qualifies these changed frontend
bytes. The [initial integration qualification](releases/integration-initial-qualification.md)
retains the failed genuine-II positive case, successful safety refusal and historical
artifact identities. RC1, RC2, RC3 and the barrier qualification remain historical.

The corrected authority path is **II app-origin parent → SDK-signed Governance-only
child → direct browser-to-NNS operations**. An unscoped II parent is private bootstrap
authority. Only the restricted child reaches transaction code. Every ancestor must
permit Governance, all links must remain live, the child is bounded by parent expiry
and the eight-hour application cap, and the original app principal is preserved.
The broader SDK session is signed out before publishing the scoped signer; no durable
bootstrap restoration is used. Structural checks supplement actual SDK signatures and
replica verification. Same-origin compromise while bootstrap authority is accessible
remains a threat, and local sign-out is not network-wide revocation.

Fresh manager configuration comes from replicated list_neurons. Fresh scalar replicated
get_neuron_info supplies the registered known-neuron metadata omitted by actual batch
responses. The narrow consumer Candid adds only that method and id, timestamp,
visibility and known-neuron fields; generated reads retain update annotations. Public
canister Candid and D-QUORUM stable V3, ranking, reward economics and financial recovery
logic are unchanged. Historical helper negative controls must fail their positive
regressions.

The extended browser world uses real pinned Governance/Ledger, genuine II with dummy
authentication disabled, actual virtual WebAuthn and the compiled local frontend.
Separate users submit and reach management quorum through signed browser operations.
Independent Governance reads verify exact actions and ballots. The same world then
runs production D-QUORUM scanning, direct proportional scores, roster application,
browser-approved maturity harvesting, actual finalisation and two equal-share payout
cycles. Initial maturity is explicitly seeded; the existing separate real reward-event
test proves genuine accrual. HTTP response loss and incompatible verifier upgrades are
labelled scripted faults; they are not fabricated authentication or Governance outcomes.

Current and final executed counts, capacity, coverage, audits, canonical hashes,
source identities and review-bundle checksum must come from the new execution records,
not this implementation description. Raw tooling findings are retained. The two
remaining moderate optional XML native-build advisories have specific expiring
applicability checks; they are not described as fixed or as production-only audit
success. Both component security gates and SBOMs remain mandatory.

Historical Dendrite source/artifact, historically recorded deployed predecessor and
new undeployed candidate are separate identities. Agreement between two clean current
builds does not imply equality to an older deployment binding or establish what is
currently live. The current candidate binding will be updated only from qualified
release outputs, followed by local no-write verification.

Remote CI is **unrun**. No push, production query from a test, mainnet deployment,
funding, staking, proposal, transfer, hotkey/controller change or mainnet write is
authorised or performed. Final-origin II validation, current real-network compatibility,
a controlled real management transaction, deployment, authority, funding, cycles and
activation remain separately approved operator gates. Retain complete component
outputs, manifests, comparison sets, logs, requirement maps, security/SBOM, coverage,
capacity, local-config artifacts and the checksummed review bundle.
