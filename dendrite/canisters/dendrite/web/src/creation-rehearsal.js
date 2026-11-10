// Governance filters individual ballots by caller. Its replicated execution and
// aggregate tally remain authoritative. This proves execution with a majority of
// the recorded electorate, not the unobservable historical identities of voters.
// Fresh target following must independently equal the reviewed manager set.
export function verifyExecutedCreationRehearsal(p,{proposalId,neuronId,startedAt,managers}){
  const action=p?.proposal?.[0]?.action?.[0]?.ManageNeuron;
  const target=action?.neuron_id_or_subaccount?.[0]?.NeuronId?.id??action?.id?.[0]?.id;
  if(!p||p.id?.[0]?.id!==proposalId||p.topic!==1||p.status!==4||p.executed_timestamp_seconds===0n||p.failed_timestamp_seconds!==0n||typeof startedAt!=='bigint'||p.proposal_timestamp_seconds<startedAt||target!==neuronId||Object.keys(action?.command?.[0]??{}).join(',')!=='RefreshVotingPower')throw Error('Rehearsal is not the exact freshly executed RefreshVotingPower proposal for T.');
  const tally=p.latest_tally?.[0],total=BigInt(managers.length);
  if(!tally||tally.total!==total||tally.yes<=total/2n||tally.yes>total||tally.no>total||tally.yes+tally.no>total)throw Error('Rehearsal does not prove the actual manager quorum.');
  return p;
}

// Pinned governance.rs::make_proposal overwrites only a ManageNeuron title
// before storing it. Reconstruct that one field from the reserved request only
// after checking the exact protocol-generated target title. Callers still hash
// the complete reconstructed typed request against C's immutable reservation.
export function creationProposalBeforeTitleRewrite(observed,original,kind,neuronId){
  if(kind!=="Rehearsal")return observed;
  if(observed?.title?.length!==1||observed.title[0]!==`Manage neuron proposal for neuron: ${neuronId}`)throw Error("Governance management title does not bind the exact target.");
  return {...observed,title:original?.title};
}
