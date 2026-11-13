fn main() {
    use dendrite_bootstrap::model::{INITIAL_CLAIM_LOCK_SECONDS, MIN_RESERVE, VERSION};
    use dendrite_types::*;
    println!(
        "{{\"version\":{VERSION},\"standard_version\":\"{STANDARD_VERSION}\",\"source_revision\":\"{SOURCE_REVISION}\",\"initial_claim_lock_seconds\":\"{INITIAL_CLAIM_LOCK_SECONDS}\",\"production_lock_seconds\":\"{MAX_DISSOLVE_DELAY_SECONDS}\",\"minimum_cycle_reserve\":\"{MIN_RESERVE}\",\"recognised_topics\":{RECOGNISED_TOPICS:?},\"default_neuron_ids\":[\"{ALPHA_VOTE_NEURON_ID}\",\"{OMEGA_VOTE_NEURON_ID}\",\"{OMEGA_REJECT_NEURON_ID}\"]}}"
    );
}
