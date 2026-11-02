# Maturity lock-barrier correction qualification

**Qualification pending.** Historical [RC1](releases/rc1-qualification.md), [RC2](releases/rc2-qualification.md) and [RC3](releases/rc3-qualification.md) records remain historical. No prior green run qualifies this correction.

Starting HEAD: `b54d3cdbc7eb87c068c054924ce69e353de81a38`, descending from RC3 implementation `55152c59bb2524f4304d2cd3c5c5d8d0c4cc0e04`. Worktree was clean. No reset, push or mainnet write is authorized.

The ordinary Governance adapter converts every typed Error to a string. The RC3 terminal barrier therefore could not observe its intended error-14 branch. A restricted existing-neuron-by-ID barrier now preserves the typed response internally and accepts only the exact refreshed neuron ID or the audited post-lock InsufficientFunds enum value. Ordinary manage semantics, stable V3, public Candid and all policy remain unchanged. Exact Executed evidence, empty progress before/after, protected configuration and the 300-second bound remain required; no Ledger receipt attribution is inferred.

Fresh regression, acceptance, canonical and bundle evidence will be recorded after source-stable qualification. Hosted CI is unrun. The candidate remains undeployed.
