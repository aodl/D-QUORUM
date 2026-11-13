import {sha256Hex} from './creation-accounts.js';
// C's default account is unused by creation. This consent covers later arrivals
// too: requiring a new zero-balance observation would grant any sender a veto.
export const defaultIcpAcknowledgement=(receipt)=>['unused-controller-default-icp/v1',receipt.canister_id,receipt.neuron_id,receipt.plan_digest];
export function acknowledgedDefaultIcp(receipt){
 const digest=sha256Hex(new TextEncoder().encode(JSON.stringify(defaultIcpAcknowledgement(receipt))));
 return receipt.checkpoints.some(c=>c.kind==='DefaultIcpAcknowledged'&&c.evidence_digest===digest);
}
export function defaultIcpDisclosure(balance){return `C's unused default ICP account currently contains ${balance} e8s. This is separate from T's Governance staking account and P's workflow funds. No sweep or refund occurs. This balance and any later deposits will remain inaccessible after teardown. Retain P's control if you need to arrange recovery of a mistaken deposit before uninstalling code.`;}
