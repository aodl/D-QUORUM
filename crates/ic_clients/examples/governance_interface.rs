#![allow(dead_code)]
use quorum_ic_clients::governance::*;
#[candid::candid_method(query)]
fn list_known_neurons() -> KnownResponse {
    unreachable!()
}
#[candid::candid_method(query)]
fn get_neuron_index(_: IndexRequest) -> Result<IndexPage, GovernanceError> {
    unreachable!()
}
#[candid::candid_method(query)]
fn list_neurons(_: ListNeurons) -> ListNeuronsResponse {
    unreachable!()
}
#[candid::candid_method(query)]
fn get_neuron_info(_: u64) -> Result<NeuronInfo, GovernanceError> {
    unreachable!()
}
#[candid::candid_method(query)]
fn get_network_economics_parameters() -> Economics {
    unreachable!()
}
#[candid::candid_method(query)]
fn list_proposals(_: ListProposals) -> Proposals {
    unreachable!()
}
#[candid::candid_method(query)]
fn get_proposal_info(_: u64) -> Option<ProposalInfo> {
    unreachable!()
}
#[candid::candid_method(update)]
fn manage_neuron(_: ManageRequest) -> ManageResponse {
    unreachable!()
}
candid::export_service!();
fn main() {
    print!("{}", __export_service());
}
