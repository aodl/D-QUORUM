// Only historical Governance refusal proofs depend on executable semantics.
// These exact bindings match bootstrap/proposal_refusal.rs: audited errors in
// these implementations precede proposal insertion. Unknown refusals remain
// unresolved for that request; no current protocol operation is version-gated.
const historicalRefusalModules=new Set([
  "dbcf97ae8729a956521a0a928f1b1bcb93f6e9c0dafd0e42aa985588713b88c0",
  "7f85124ee08c3f59c0050009268807c7aea2b80ee296c23338b05458888f19df",
  "5ddc11d2c59d0199c48e50dcc29c5ac6d10011daa6a7594eee954bfc140e3944"
]);
export function provesHistoricalGovernanceRefusal(hash){return historicalRefusalModules.has(hash);}
