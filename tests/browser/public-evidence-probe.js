// Anonymous read diagnostics only; no authentication state or request envelopes.
import { createAnonymousGovernanceReadActor } from '@dendrite-public';
import { createNeuronLoader, collectPreliminaryEvidence } from '@dendrite-evidence';
export async function inspect() {
 const actor=await createAnonymousGovernanceReadActor();
 const loader=createNeuronLoader({listNeurons:r=>actor.list_neurons(r),getNeuronInfo:id=>actor.get_neuron_info(id)});
 const evidence=await collectPreliminaryEvidence(100n,loader);
 return {targetKind:evidence.target.kind,timestamp:evidence.nowSeconds.toString(),failures:evidence.sourceFailures.map(f=>({method:f.method,kind:f.kind,message:f.message}))};
}
