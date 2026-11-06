#![forbid(unsafe_code)]

use candid::{CandidType, Deserialize, Principal};
#[cfg(test)]
use dendrite_types::{ALPHA_VOTE_NEURON_ID, OMEGA_REJECT_NEURON_ID};
use dendrite_types::{
    ComplianceReport, ControllerEvidence, EvaluationEvidence, KnownNeuron, MAX_DEPENDENCY_NEURONS,
    NeuronEvidence, NeuronLookup, SOURCE_REVISION, SourceFailure, SourceFailureKind, evaluate,
    validate_evaluation_inputs,
};
use ic_clients::{
    CanisterInfoResponse, DissolveState, KnownNeuronData, ListNeuronsResponse, Neuron, NeuronInfo,
    SourceError,
};
use std::{cell::RefCell, collections::BTreeMap};

mod assets;
mod rate_limit;
use rate_limit::{CheckGuard, Rejection};

thread_local! { static CHECK_GUARD: RefCell<CheckGuard> = RefCell::new(CheckGuard::default()); }

fn mutate_check_guard<T>(mutate: impl FnOnce(&mut CheckGuard) -> T) -> T {
    CHECK_GUARD.with_borrow_mut(mutate)
}

#[ic_cdk::init]
fn init() {
    assets::certify_assets();
}
#[ic_cdk::post_upgrade]
fn post_upgrade() {
    CHECK_GUARD.with_borrow_mut(|guard| *guard = CheckGuard::default());
    assets::certify_assets();
}
#[ic_cdk::query]
fn http_request(request: assets::HttpRequest) -> assets::HttpResponse {
    assets::http_request(request)
}

#[derive(Clone, Debug, CandidType, Deserialize)]
pub enum DendriteError {
    InvalidNeuronId(String),
    AnalysisFailed(String),
    GlobalRateLimit { retry_after_seconds: u64 },
    ConcurrencyLimit,
    DuplicateInFlight,
    LowCycles,
}

#[ic_cdk::update]
async fn check_neuron(neuron_id: u64) -> Result<ComplianceReport, DendriteError> {
    if neuron_id == 0 {
        return Err(DendriteError::InvalidNeuronId(
            "neuron ID must be non-zero".into(),
        ));
    }
    let now = ic_cdk::api::time() / 1_000_000_000;
    let cycles = ic_cdk::api::canister_liquid_cycle_balance();
    mutate_check_guard(|guard| guard.begin(neuron_id, now, cycles)).map_err(|rejection| {
        match rejection {
            Rejection::GlobalRate(retry_after_seconds) => DendriteError::GlobalRateLimit {
                retry_after_seconds,
            },
            Rejection::Concurrency => DendriteError::ConcurrencyLimit,
            Rejection::Duplicate => DendriteError::DuplicateInFlight,
            Rejection::LowCycles => DendriteError::LowCycles,
        }
    })?;
    let result = collect_live(neuron_id).await;
    mutate_check_guard(|guard| guard.finish(neuron_id));
    result
}

fn known_data(data: &KnownNeuronData, id: u64) -> KnownNeuron {
    KnownNeuron {
        id,
        name: data.name.clone(),
        description: data.description.clone(),
        links: data.links.clone().unwrap_or_default(),
    }
}

fn has_duplicate_topic_keys(neuron: &Neuron) -> bool {
    let mut topics = std::collections::BTreeSet::new();
    neuron
        .followees
        .iter()
        .any(|(topic, _)| !topics.insert(*topic))
}

fn neuron_collections_within_bounds(neuron: &Neuron) -> bool {
    neuron.hot_keys.len() <= ic_clients::MAX_HOT_KEYS
        && neuron.followees.len() <= ic_clients::MAX_FOLLOWING_MAP_WIRE_ENTRIES
        && neuron
            .followees
            .iter()
            .all(|(_, followees)| followees.followees.len() <= ic_clients::MAX_FOLLOWEES)
        && neuron.known_neuron_data.as_ref().is_none_or(|data| {
            data.name.len() <= ic_clients::MAX_KNOWN_NEURON_NAME_BYTES
                && data.description.as_ref().is_none_or(|description| {
                    description.len() <= ic_clients::MAX_KNOWN_NEURON_DESCRIPTION_BYTES
                })
                && data.links.as_ref().is_none_or(|links| {
                    links.len() <= ic_clients::MAX_KNOWN_NEURON_LINKS
                        && links
                            .iter()
                            .all(|link| link.len() <= ic_clients::MAX_KNOWN_NEURON_LINK_BYTES)
                })
                && data.committed_topics.as_ref().is_none_or(|topics| {
                    topics.len() <= ic_clients::MAX_COMMITTED_TOPIC_WIRE_ENTRIES
                })
        })
}

fn normalize_neuron(
    neuron: Neuron,
    _interpret_committed_topics: bool,
) -> Result<(NeuronEvidence, usize), &'static str> {
    let id = neuron.id.as_ref().map_or(0, |id| id.id);
    let followees = neuron
        .followees
        .into_iter()
        .map(|(topic, ids)| (topic, ids.followees.into_iter().map(|id| id.id).collect()))
        .collect();
    let (dissolve_delay_seconds, dissolving) = match neuron.dissolve_state {
        Some(DissolveState::DissolveDelaySeconds(delay)) => (Some(delay), Some(false)),
        Some(DissolveState::WhenDissolvedTimestampSeconds(_)) => (None, Some(true)),
        None => (None, None),
    };
    let minted_stake_e8s = neuron
        .cached_neuron_stake_e8s
        .checked_sub(neuron.neuron_fees_e8s)
        .ok_or("neuron stake arithmetic is contradictory")?;
    let effective_stake_e8s = minted_stake_e8s
        .checked_add(neuron.staked_maturity_e8s_equivalent.unwrap_or(0))
        .ok_or("neuron stake arithmetic is contradictory")?;
    Ok((
        NeuronEvidence {
            id,
            controller: neuron.controller,
            known_data: None,
            hot_keys: neuron.hot_keys,
            not_for_profit: Some(neuron.not_for_profit),
            dissolve_delay_seconds,
            dissolving,
            effective_stake_e8s: Some(effective_stake_e8s),
            minted_stake_e8s: Some(minted_stake_e8s),
            voting_power_refreshed_timestamp_seconds: neuron
                .voting_power_refreshed_timestamp_seconds,
            potential_voting_power: neuron.potential_voting_power,
            deciding_voting_power: neuron.deciding_voting_power,
            committed_topics: Vec::new(),
            followees,
        },
        0,
    ))
}

trait EvidenceClient {
    async fn list_neurons(&self, ids: Vec<u64>) -> Result<ListNeuronsResponse, SourceError>;
    async fn get_neuron_info(&self, _id: u64) -> Result<NeuronInfo, SourceError> {
        Err(SourceError {
            destination: ic_clients::NNS_GOVERNANCE,
            method: "get_neuron_info",
            kind: ic_clients::SourceErrorKind::Rejected,
            message: "known-neuron metadata fixture unavailable".into(),
        })
    }
    async fn canister_info(
        &self,
        canister_id: Principal,
    ) -> Result<CanisterInfoResponse, SourceError>;
}

fn source_failure(error: SourceError, affected_neuron_ids: &[u64]) -> SourceFailure {
    let kind = match error.kind {
        ic_clients::SourceErrorKind::Rejected => SourceFailureKind::Rejected,
        ic_clients::SourceErrorKind::DecodeFailed => SourceFailureKind::DecodeFailed,
        ic_clients::SourceErrorKind::InvalidResponse => SourceFailureKind::InvalidResponse,
        ic_clients::SourceErrorKind::ResponseTooLarge => SourceFailureKind::ResponseTooLarge,
    };
    SourceFailure {
        method: error.method.into(),
        kind,
        message: error.message.chars().take(512).collect(),
        affected_neuron_ids: affected_neuron_ids.iter().copied().take(50).collect(),
    }
}

fn invalid_failure(message: &str, affected_neuron_ids: &[u64]) -> SourceFailure {
    SourceFailure {
        method: "list_neurons".into(),
        kind: SourceFailureKind::InvalidResponse,
        message: message.chars().take(512).collect(),
        affected_neuron_ids: affected_neuron_ids.iter().copied().take(50).collect(),
    }
}

struct ValidatedBatch {
    neurons: BTreeMap<u64, NeuronEvidence>,
    unknown_committed_topics: usize,
    neuron_infos: BTreeMap<u64, NeuronInfo>,
}

fn validate_list_neurons_batch(
    requested_ids: &[u64],
    response: ListNeuronsResponse,
    interpret_committed_topics: bool,
) -> Result<ValidatedBatch, SourceFailure> {
    if requested_ids.is_empty() || requested_ids.len() > 50 {
        return Err(invalid_failure(
            "list_neurons request contains outside 1 to 50 IDs",
            requested_ids,
        ));
    }
    if response.total_pages_available != Some(1) {
        return Err(invalid_failure(
            "list_neurons response has an invalid page count",
            requested_ids,
        ));
    }
    let mut neuron_infos = BTreeMap::new();
    for (id, info) in response.neuron_infos {
        if id == 0 || !requested_ids.contains(&id) {
            return Err(invalid_failure(
                "list_neurons returned a zero or unexpected neuron-info ID",
                requested_ids,
            ));
        }
        if neuron_infos.insert(id, info).is_some() {
            return Err(invalid_failure(
                "list_neurons response contains a duplicate neuron-info ID",
                requested_ids,
            ));
        }
    }
    let mut normalized = BTreeMap::new();
    let mut unknown_committed_topics = 0;
    for raw in response.full_neurons {
        let id = raw.id.as_ref().map(|id| id.id).unwrap_or(0);
        if id == 0 || !requested_ids.contains(&id) {
            return Err(invalid_failure(
                "list_neurons returned an absent, zero, or unexpected full-neuron ID",
                requested_ids,
            ));
        }
        if has_duplicate_topic_keys(&raw) {
            return Err(invalid_failure(
                "list_neurons response contains duplicate topic-map keys",
                requested_ids,
            ));
        }
        if !neuron_collections_within_bounds(&raw) {
            return Err(SourceFailure {
                method: "list_neurons".into(),
                kind: SourceFailureKind::ResponseTooLarge,
                message: "list_neurons response exceeds a pinned NNS collection bound".into(),
                affected_neuron_ids: requested_ids.to_vec(),
            });
        }
        let (neuron, unknown) = normalize_neuron(raw, interpret_committed_topics)
            .map_err(|message| invalid_failure(message, requested_ids))?;
        if normalized.insert(id, neuron).is_some() {
            return Err(invalid_failure(
                "list_neurons response contains a duplicate full-neuron ID",
                requested_ids,
            ));
        }
        unknown_committed_topics += unknown;
    }
    Ok(ValidatedBatch {
        neurons: normalized,
        unknown_committed_topics,
        neuron_infos,
    })
}

fn dependency_batches(ids: &[u64]) -> Vec<Vec<u64>> {
    assert!(
        ids.len() <= MAX_DEPENDENCY_NEURONS,
        "validated dependency graph exceeds its derived bound"
    );
    ids.chunks(50).map(<[u64]>::to_vec).collect()
}

fn dependency_ids(target: &NeuronEvidence) -> Vec<u64> {
    let mut requested = Vec::new();
    requested.extend(target.followees.values().flatten().copied());
    requested.sort_unstable();
    requested.dedup();
    requested
}

fn merge_known_metadata(
    neuron: &mut NeuronEvidence,
    info: NeuronInfo,
    list_timestamp: u64,
    _interpret_committed_topics: bool,
) -> Result<usize, &'static str> {
    if info.id.as_ref().map(|id| id.id) != Some(neuron.id)
        || info.retrieved_at_timestamp_seconds == 0
        || list_timestamp == 0
        || info.retrieved_at_timestamp_seconds.abs_diff(list_timestamp)
            > ic_clients::MAX_METADATA_TIMESTAMP_SKEW_SECONDS
    {
        return Err("get_neuron_info ID or retrieval timestamp is inconsistent");
    }
    let Some(data) = info.known_neuron_data else {
        neuron.known_data = None;
        neuron.committed_topics.clear();
        return Ok(0);
    };
    neuron.committed_topics.clear();
    neuron.known_data = Some(known_data(&data, neuron.id));
    Ok(0)
}

struct ProductionEvidenceClient;
impl EvidenceClient for ProductionEvidenceClient {
    async fn list_neurons(&self, ids: Vec<u64>) -> Result<ListNeuronsResponse, SourceError> {
        ic_clients::fetch_public_full_neurons(ids).await
    }
    async fn get_neuron_info(&self, id: u64) -> Result<NeuronInfo, SourceError> {
        ic_clients::fetch_known_neuron_info(id).await
    }

    async fn canister_info(
        &self,
        canister_id: Principal,
    ) -> Result<CanisterInfoResponse, SourceError> {
        ic_clients::inspect_controller_canister(canister_id).await
    }
}

async fn collect_live(neuron_id: u64) -> Result<ComplianceReport, DendriteError> {
    collect_with(&ProductionEvidenceClient, neuron_id, 0).await
}

fn evaluate_checked(
    neuron_id: u64,
    evidence: &EvaluationEvidence,
) -> Result<ComplianceReport, DendriteError> {
    validate_evaluation_inputs(evidence, SOURCE_REVISION)
        .map_err(|message| DendriteError::AnalysisFailed(message.into()))?;
    Ok(evaluate(neuron_id, evidence, SOURCE_REVISION))
}

async fn collect_with(
    client: &impl EvidenceClient,
    neuron_id: u64,
    _local_operational_timestamp_seconds: u64,
) -> Result<ComplianceReport, DendriteError> {
    let mut source_failures = Vec::new();
    let target_request = [neuron_id];
    let target_lookup = match client.list_neurons(target_request.to_vec()).await {
        Ok(response) => match validate_list_neurons_batch(&target_request, response, true) {
            Ok(mut batch) => match batch.neurons.remove(&neuron_id) {
                Some(target) => match batch.neuron_infos.remove(&neuron_id) {
                    Some(info)
                        if info.retrieved_at_timestamp_seconds > 0
                            && target.voting_power_refreshed_timestamp_seconds.is_none_or(
                                |refresh| refresh <= info.retrieved_at_timestamp_seconds,
                            ) =>
                    {
                        (
                            NeuronLookup::Found(Box::new(target)),
                            batch.unknown_committed_topics,
                            info.retrieved_at_timestamp_seconds,
                        )
                    }
                    _ => {
                        source_failures.push(invalid_failure(
                            "returned target lacks valid, non-contradictory neuron-info timestamp",
                            &target_request,
                        ));
                        (NeuronLookup::Unavailable, 0, 0)
                    }
                },
                None => {
                    let timestamp = batch
                        .neuron_infos
                        .remove(&neuron_id)
                        .map_or(0, |info| info.retrieved_at_timestamp_seconds);
                    (
                        NeuronLookup::ConfirmedMissing,
                        batch.unknown_committed_topics,
                        timestamp,
                    )
                }
            },
            Err(failure) => {
                source_failures.push(failure);
                (NeuronLookup::Unavailable, 0, 0)
            }
        },
        Err(error) => {
            source_failures.push(source_failure(error, &target_request));
            (NeuronLookup::Unavailable, 0, 0)
        }
    };
    let (mut target_lookup, mut unknown_committed_topics, evaluation_timestamp_seconds) =
        target_lookup;
    if let NeuronLookup::Found(target) = &mut target_lookup {
        match client.get_neuron_info(neuron_id).await {
            Ok(info) => {
                match merge_known_metadata(target, info, evaluation_timestamp_seconds, true) {
                    Ok(unknown) => unknown_committed_topics = unknown,
                    Err(message) => {
                        source_failures.push(SourceFailure {
                            method: "get_neuron_info".into(),
                            kind: SourceFailureKind::InvalidResponse,
                            message: message.into(),
                            affected_neuron_ids: vec![neuron_id],
                        });
                    }
                }
            }
            Err(error) => source_failures.push(source_failure(error, &[neuron_id])),
        }
    }
    let NeuronLookup::Found(target) = &target_lookup else {
        let evidence = EvaluationEvidence {
            now_seconds: evaluation_timestamp_seconds,
            target: target_lookup,
            dependencies: BTreeMap::new(),
            controller: None,
            source_failures,
            unknown_committed_topics: 0,
        };
        return evaluate_checked(neuron_id, &evidence);
    };
    let requested = dependency_ids(target);
    let mut dependencies = BTreeMap::new();
    for batch in dependency_batches(&requested) {
        match client.list_neurons(batch.clone()).await {
            Ok(response) => match validate_list_neurons_batch(&batch, response, false) {
                Ok(mut validated) => {
                    for id in batch {
                        let lookup = match validated.neurons.remove(&id) {
                            Some(mut neuron) => {
                                let list_timestamp = validated
                                    .neuron_infos
                                    .get(&id)
                                    .map_or(0, |info| info.retrieved_at_timestamp_seconds);
                                let metadata_available = match client.get_neuron_info(id).await {
                                    Ok(info) => {
                                        if let Err(message) = merge_known_metadata(
                                            &mut neuron,
                                            info,
                                            list_timestamp,
                                            false,
                                        ) {
                                            source_failures.push(SourceFailure {
                                                method: "get_neuron_info".into(),
                                                kind: SourceFailureKind::InvalidResponse,
                                                message: message.into(),
                                                affected_neuron_ids: vec![id],
                                            });
                                            false
                                        } else {
                                            true
                                        }
                                    }
                                    Err(error) => {
                                        source_failures.push(source_failure(error, &[id]));
                                        false
                                    }
                                };
                                if metadata_available {
                                    NeuronLookup::Found(Box::new(neuron))
                                } else {
                                    NeuronLookup::Unavailable
                                }
                            }
                            None => NeuronLookup::ConfirmedMissing,
                        };
                        dependencies.insert(id, lookup);
                    }
                }
                Err(failure) => {
                    source_failures.push(failure);
                    for id in batch {
                        dependencies.insert(id, NeuronLookup::Unavailable);
                    }
                }
            },
            Err(error) => {
                source_failures.push(source_failure(error, &batch));
                for id in batch {
                    dependencies.insert(id, NeuronLookup::Unavailable);
                }
            }
        }
    }
    let controller = match target.controller {
        Some(principal) => match client.canister_info(principal).await {
            Ok(info) => Some(ControllerEvidence {
                call_succeeded: true,
                module_hash: info.module_hash,
                controllers: info.controllers,
            }),
            Err(error) => {
                source_failures.push(source_failure(error, &[neuron_id]));
                Some(ControllerEvidence {
                    call_succeeded: false,
                    module_hash: None,
                    controllers: vec![],
                })
            }
        },
        None => None,
    };
    let evidence = EvaluationEvidence {
        now_seconds: evaluation_timestamp_seconds,
        target: target_lookup,
        dependencies,
        controller,
        source_failures,
        unknown_committed_topics,
    };
    evaluate_checked(neuron_id, &evidence)
}

ic_cdk::export_candid!();

#[cfg(test)]
mod tests {
    use super::*;
    use ic_clients::{NeuronId, SourceErrorKind};
    use std::{
        cell::RefCell as TestRefCell,
        collections::VecDeque,
        future::Future,
        pin::pin,
        sync::Arc,
        task::{Context, Poll, Wake, Waker},
    };

    struct NoopWake;
    impl Wake for NoopWake {
        fn wake(self: Arc<Self>) {}
    }
    fn block_on<T>(future: impl Future<Output = T>) -> T {
        let waker = Waker::from(Arc::new(NoopWake));
        let mut context = Context::from_waker(&waker);
        let mut future = pin!(future);
        loop {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(value) => return value,
                Poll::Pending => std::thread::yield_now(),
            }
        }
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    enum RecordedCall {
        List(Vec<u64>),
        CanisterInfo(Principal),
    }
    thread_local! {
        static TEST_METADATA: TestRefCell<BTreeMap<u64, (KnownNeuronData, Option<i32>)>> =
            const { TestRefCell::new(BTreeMap::new()) };
    }
    struct FakeClient {
        neurons: TestRefCell<VecDeque<Result<ListNeuronsResponse, SourceError>>>,
        calls: TestRefCell<Vec<RecordedCall>>,
    }
    impl EvidenceClient for FakeClient {
        async fn list_neurons(&self, ids: Vec<u64>) -> Result<ListNeuronsResponse, SourceError> {
            self.calls.borrow_mut().push(RecordedCall::List(ids));
            let response = self
                .neurons
                .borrow_mut()
                .pop_front()
                .expect("unexpected list_neurons call");
            if let Ok(value) = &response {
                TEST_METADATA.with_borrow_mut(|metadata| {
                    for neuron in &value.full_neurons {
                        if let (Some(id), Some(data)) = (&neuron.id, &neuron.known_neuron_data) {
                            metadata.insert(id.id, (data.clone(), neuron.visibility));
                        }
                    }
                });
            }
            response
        }
        async fn get_neuron_info(&self, id: u64) -> Result<NeuronInfo, SourceError> {
            Ok(TEST_METADATA.with_borrow(|metadata| {
                let value = metadata.get(&id);
                NeuronInfo {
                    id: Some(ic_clients::NeuronId { id }),
                    retrieved_at_timestamp_seconds: 1_000_000,
                    known_neuron_data: value.map(|(data, _)| data.clone()),
                    visibility: value.and_then(|(_, visibility)| *visibility),
                }
            }))
        }
        async fn canister_info(
            &self,
            canister_id: Principal,
        ) -> Result<CanisterInfoResponse, SourceError> {
            self.calls
                .borrow_mut()
                .push(RecordedCall::CanisterInfo(canister_id));
            Ok(CanisterInfoResponse {
                total_num_changes: 0,
                recent_changes: vec![],
                module_hash: None,
                controllers: vec![],
            })
        }
    }
    fn source_error(message: &str) -> SourceError {
        SourceError {
            destination: ic_clients::NNS_GOVERNANCE,
            method: "list_neurons",
            kind: SourceErrorKind::Rejected,
            message: message.into(),
        }
    }
    fn assert_analysis_failed(result: Result<ComplianceReport, DendriteError>) {
        assert!(
            matches!(result, Err(DendriteError::AnalysisFailed(message)) if message.len() <= 256),
            "expected a bounded analysis error"
        );
    }
    fn empty_neurons() -> ListNeuronsResponse {
        ListNeuronsResponse {
            neuron_infos: vec![],
            full_neurons: vec![],
            total_pages_available: Some(1),
        }
    }
    fn missing_neuron(id: u64) -> ListNeuronsResponse {
        ListNeuronsResponse {
            neuron_infos: vec![(
                id,
                NeuronInfo {
                    id: Some(NeuronId { id }),
                    retrieved_at_timestamp_seconds: 1_000_000,
                    known_neuron_data: None,
                    visibility: None,
                },
            )],
            ..empty_neurons()
        }
    }
    fn response(neurons: Vec<Neuron>) -> ListNeuronsResponse {
        ListNeuronsResponse {
            neuron_infos: neurons
                .iter()
                .filter_map(|neuron| {
                    neuron.id.as_ref().map(|id| {
                        (
                            id.id,
                            NeuronInfo {
                                id: Some(ic_clients::NeuronId { id: id.id }),
                                retrieved_at_timestamp_seconds: 1_000_000,
                                known_neuron_data: neuron.known_neuron_data.clone(),
                                visibility: neuron.visibility,
                            },
                        )
                    })
                })
                .collect(),
            full_neurons: neurons,
            total_pages_available: Some(1),
        }
    }
    fn raw_neuron(id: u64, followees: Vec<(i32, Vec<u64>)>) -> Neuron {
        Neuron {
            id: Some(NeuronId { id }),
            staked_maturity_e8s_equivalent: Some(0),
            controller: None,
            not_for_profit: false,
            maturity_e8s_equivalent: 0,
            cached_neuron_stake_e8s: 100_000_000,
            created_timestamp_seconds: 1,
            auto_stake_maturity: Some(false),
            aging_since_timestamp_seconds: 1,
            hot_keys: vec![],
            dissolve_state: Some(DissolveState::DissolveDelaySeconds(
                dendrite_types::MAX_DISSOLVE_DELAY_SECONDS,
            )),
            followees: followees
                .into_iter()
                .map(|(topic, ids)| {
                    (
                        topic,
                        ic_clients::Followees {
                            followees: ids.into_iter().map(|id| NeuronId { id }).collect(),
                        },
                    )
                })
                .collect(),
            neuron_fees_e8s: 0,
            visibility: Some(2),
            known_neuron_data: Some(KnownNeuronData {
                name: format!("known-{id}"),
                description: None,
                links: None,
                committed_topics: Some(vec![]),
            }),
            voting_power_refreshed_timestamp_seconds: Some(999_999),
            deciding_voting_power: Some(10),
            potential_voting_power: Some(10),
        }
    }
    fn opaque_topic_entries(count: usize) -> Vec<Option<ic_clients::Reserved>> {
        vec![Some(ic_clients::Reserved); count]
    }
    fn compliant_client() -> FakeClient {
        let managers = [100, 101, 102, 103, 104];
        let mut target_followees = vec![(1, managers.to_vec()), (4, vec![100, 101, 102])];
        for topic in [0, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18] {
            target_followees.push((topic, vec![ALPHA_VOTE_NEURON_ID]));
        }
        let mut target = raw_neuron(42, target_followees);
        target.controller = Some(Principal::from_slice(&[1]));
        target.known_neuron_data.as_mut().unwrap().committed_topics = Some(opaque_topic_entries(1));
        let dependencies = managers
            .into_iter()
            .map(|id| {
                raw_neuron(
                    id,
                    if id <= 102 {
                        vec![(4, vec![OMEGA_REJECT_NEURON_ID])]
                    } else {
                        vec![]
                    },
                )
            })
            .collect::<Vec<_>>();
        FakeClient {
            neurons: TestRefCell::new(VecDeque::from([
                Ok(response(vec![target])),
                Ok(response(dependencies)),
            ])),
            calls: TestRefCell::new(vec![]),
        }
    }
    #[test]
    fn checked_in_candid_is_structurally_equal_to_rust_export() {
        let path = std::env::temp_dir().join(format!("dendrite-export-{}.did", std::process::id()));
        let exported = __export_service();
        std::fs::write(&path, &exported).expect("write temporary Candid export");
        let checked = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("dendrite.did");
        let status = std::process::Command::new("didc")
            .args(["check", "--strict"])
            .arg(&path)
            .arg(checked)
            .status()
            .expect("run didc");
        let _ = std::fs::remove_file(path);
        assert!(
            status.success(),
            "Rust Candid export drifted from dendrite.did:\n{exported}"
        );
    }
    #[test]
    fn dependency_batches_are_never_larger_than_fifty() {
        for (count, expected) in [
            (50, vec![50]),
            (51, vec![50, 1]),
            (101, vec![50, 50, 1]),
            (257, vec![50, 50, 50, 50, 50, 7]),
            (258, vec![50, 50, 50, 50, 50, 8]),
            (270, vec![50, 50, 50, 50, 50, 20]),
        ] {
            let ids: Vec<_> = (0..count).collect();
            let batches = dependency_batches(&ids);
            assert_eq!(batches.iter().map(Vec::len).collect::<Vec<_>>(), expected);
        }
    }

    #[test]
    #[should_panic(expected = "validated dependency graph exceeds its derived bound")]
    fn impossible_dependency_graph_exceeding_derived_bound_is_rejected() {
        dependency_batches(&(0..=MAX_DEPENDENCY_NEURONS as u64).collect::<Vec<_>>());
    }

    #[test]
    fn recognised_topic_graph_remains_bounded_below_the_wire_derived_limit() {
        let mut target = normalize_neuron(raw_neuron(42, vec![]), true).unwrap().0;
        target.committed_topics = dendrite_types::RECOGNISED_TOPICS.to_vec();
        for (topic_index, topic) in dendrite_types::RECOGNISED_TOPICS.into_iter().enumerate() {
            target.followees.insert(
                topic,
                (0..ic_clients::MAX_FOLLOWEES)
                    .map(|offset| 1_000 + (topic_index * ic_clients::MAX_FOLLOWEES + offset) as u64)
                    .collect(),
            );
        }
        let ids = dependency_ids(&target);
        assert_eq!(
            ids.len(),
            dendrite_types::RECOGNISED_TOPICS.len() * ic_clients::MAX_FOLLOWEES
        );
        assert!(ids.len() <= MAX_DEPENDENCY_NEURONS);
        assert_eq!(dependency_batches(&ids).len(), 6);
        let report = evaluate(
            42,
            &EvaluationEvidence {
                now_seconds: 1,
                target: NeuronLookup::Found(Box::new(target)),
                dependencies: BTreeMap::new(),
                controller: None,
                source_failures: vec![],
                unknown_committed_topics: 0,
            },
            SOURCE_REVISION,
        );
        assert_eq!(
            report.overall_status,
            dendrite_types::ComplianceStatus::NonCompliant
        );
    }
    #[test]
    fn collector_evaluates_the_full_recognised_topic_graph() {
        let mut target_followees = Vec::new();
        for (topic_index, topic) in dendrite_types::RECOGNISED_TOPICS.into_iter().enumerate() {
            target_followees.push((
                topic,
                (0..ic_clients::MAX_FOLLOWEES)
                    .map(|offset| 1_000 + (topic_index * ic_clients::MAX_FOLLOWEES + offset) as u64)
                    .collect(),
            ));
        }
        let mut target = raw_neuron(42, target_followees);
        target.controller = Some(Principal::from_slice(&[1]));
        target.known_neuron_data.as_mut().unwrap().committed_topics =
            Some(opaque_topic_entries(18));
        let mut normalized = normalize_neuron(target.clone(), true).unwrap().0;
        merge_known_metadata(
            &mut normalized,
            NeuronInfo {
                id: target.id.clone(),
                retrieved_at_timestamp_seconds: 1_000_000,
                known_neuron_data: target.known_neuron_data.clone(),
                visibility: target.visibility,
            },
            1_000_000,
            true,
        )
        .unwrap();
        let dependency_ids = dependency_ids(&normalized);
        assert_eq!(
            dependency_ids.len(),
            dendrite_types::RECOGNISED_TOPICS.len() * ic_clients::MAX_FOLLOWEES
        );
        assert!(dependency_ids.len() <= MAX_DEPENDENCY_NEURONS);

        let mut responses = VecDeque::from([Ok(response(vec![target]))]);
        for batch in dependency_batches(&dependency_ids) {
            responses.push_back(Ok(response(
                batch.into_iter().map(|id| raw_neuron(id, vec![])).collect(),
            )));
        }
        let client = FakeClient {
            neurons: TestRefCell::new(responses),
            calls: TestRefCell::new(vec![]),
        };
        let report = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert_eq!(
            report.overall_status,
            dendrite_types::ComplianceStatus::NonCompliant
        );
        assert!(report.source_failures.is_empty());
        let calls = client.calls.borrow();
        assert_eq!(calls.len(), 8);
        assert_eq!(calls[0], RecordedCall::List(vec![42]));
        assert_eq!(
            calls[1..7]
                .iter()
                .map(|call| match call {
                    RecordedCall::List(ids) => ids.len(),
                    RecordedCall::CanisterInfo(_) => 0,
                })
                .collect::<Vec<_>>(),
            vec![50, 50, 50, 50, 50, 20]
        );
        assert_eq!(
            calls[7],
            RecordedCall::CanisterInfo(Principal::from_slice(&[1]))
        );
    }
    #[test]
    fn collector_transport_rejection_fails_report_construction() {
        let client = FakeClient {
            neurons: TestRefCell::new(VecDeque::from([Err(source_error("neurons rejected"))])),
            calls: TestRefCell::new(vec![]),
        };
        assert_analysis_failed(block_on(collect_with(&client, 7, 1_000)));
    }
    #[test]
    fn collector_records_missing_target_from_successful_response() {
        let client = FakeClient {
            neurons: TestRefCell::new(VecDeque::from([Ok(missing_neuron(7))])),
            calls: TestRefCell::new(vec![]),
        };
        let snapshot = block_on(collect_with(&client, 7, 1_000)).unwrap();
        assert_eq!(
            snapshot.overall_status,
            dendrite_types::ComplianceStatus::NonCompliant
        );
        assert!(snapshot.source_failures.is_empty());
        assert_eq!(
            client.calls.borrow().as_slice(),
            &[RecordedCall::List(vec![7])]
        );
    }
    #[test]
    fn collector_compliant_graph_uses_the_production_pipeline() {
        let client = compliant_client();
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert_eq!(
            snapshot.overall_status,
            dendrite_types::ComplianceStatus::Compliant
        );
        assert!(snapshot.source_failures.is_empty());
        assert!(
            snapshot
                .rules
                .iter()
                .all(|rule| rule.status == dendrite_types::RuleStatus::Pass)
        );
        assert_eq!(snapshot.quorum_threshold, Some(3));
        assert_eq!(snapshot.checked_at_timestamp_seconds, 1_000_000);
        assert_eq!(client.calls.borrow()[0], RecordedCall::List(vec![42]));
        assert!(matches!(&client.calls.borrow()[1], RecordedCall::List(ids) if ids.len() == 6));
        assert_eq!(
            client.calls.borrow()[2],
            RecordedCall::CanisterInfo(Principal::from_slice(&[1]))
        );
    }
    #[test]
    fn collector_propagates_manager_controller_and_hotkeys_without_extra_calls() {
        let client = compliant_client();
        let authority = Principal::from_slice(&[8]);
        {
            let mut responses = client.neurons.borrow_mut();
            let manager = &mut responses[1].as_mut().unwrap().full_neurons[0];
            manager.controller = Some(authority);
            manager.hot_keys = vec![authority];
        }
        let report = block_on(collect_with(&client, 42, 1)).unwrap();
        let manager = report
            .managers
            .iter()
            .find(|manager| manager.neuron_id == 100)
            .unwrap();
        assert_eq!(
            manager.evidence_status,
            dendrite_types::ManagerEvidenceStatus::Found
        );
        assert_eq!(manager.controller, Some(authority));
        assert_eq!(manager.hot_keys, vec![authority]);
        assert_eq!(client.calls.borrow().len(), 3);
    }
    #[test]
    fn local_operational_clock_does_not_affect_nns_evaluation_time() {
        for local_time in [1, u64::MAX] {
            let client = compliant_client();
            let report = block_on(collect_with(&client, 42, local_time)).unwrap();
            assert_eq!(report.checked_at_timestamp_seconds, 1_000_000);
            assert_eq!(
                report.overall_status,
                dendrite_types::ComplianceStatus::Compliant
            );
        }
    }
    #[test]
    fn target_neuron_info_is_required_unique_and_requested() {
        let client = compliant_client();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .neuron_infos
            .clear();
        assert_analysis_failed(block_on(collect_with(&client, 42, 1)));

        let client = compliant_client();
        let duplicate = client.neurons.borrow()[0].as_ref().unwrap().neuron_infos[0].clone();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .neuron_infos
            .push(duplicate);
        assert_analysis_failed(block_on(collect_with(&client, 42, 1)));

        let client = compliant_client();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .neuron_infos[0]
            .0 = 99;
        assert_analysis_failed(block_on(collect_with(&client, 42, 1)));
    }
    #[test]
    fn refresh_after_nns_snapshot_invalidates_the_target_batch() {
        let client = compliant_client();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .full_neurons[0]
            .voting_power_refreshed_timestamp_seconds = Some(1_000_001);
        assert_analysis_failed(block_on(collect_with(&client, 42, 1)));
    }
    #[test]
    fn collector_defective_graph_is_non_compliant() {
        let client = compliant_client();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .full_neurons[0]
            .hot_keys
            .push(Principal::anonymous());
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert_eq!(
            snapshot.overall_status,
            dendrite_types::ComplianceStatus::NonCompliant
        );
        assert!(snapshot.rules.iter().any(|rule| {
            rule.rule_id == "DENDRITE-CONTROL-004"
                && rule.status == dendrite_types::RuleStatus::Fail
        }));
    }
    #[test]
    fn collector_dependency_omission_is_factual_non_compliance() {
        let client = compliant_client();
        client.neurons.borrow_mut()[1]
            .as_mut()
            .unwrap()
            .full_neurons
            .retain(|neuron| neuron.id.as_ref().is_none_or(|id| id.id != 100));
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert_eq!(
            snapshot.overall_status,
            dendrite_types::ComplianceStatus::NonCompliant
        );
        assert!(snapshot.source_failures.is_empty());
        assert!(snapshot.rules.iter().any(|rule| {
            rule.rule_id == "DENDRITE-NM-004" && rule.status == dendrite_types::RuleStatus::Fail
        }));
    }
    #[test]
    fn collector_rejected_dependency_batch_is_indeterminate_not_non_compliance() {
        let client = compliant_client();
        client.neurons.borrow_mut()[1] = Err(source_error("dependency batch rejected"));
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert!(snapshot.rules.iter().any(|rule| {
            rule.rule_id == "DENDRITE-NM-004"
                && rule.status == dendrite_types::RuleStatus::Indeterminate
        }));
        assert_eq!(snapshot.source_failures[0].affected_neuron_ids.len(), 6);
    }
    #[test]
    fn dependency_committed_topic_variants_are_ignored() {
        let client = compliant_client();
        client.neurons.borrow_mut()[1]
            .as_mut()
            .unwrap()
            .full_neurons[0]
            .known_neuron_data
            .as_mut()
            .unwrap()
            .committed_topics = Some(vec![None]);
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert_eq!(
            snapshot.overall_status,
            dendrite_types::ComplianceStatus::Compliant
        );
        assert!(snapshot.source_failures.is_empty());
    }
    #[test]
    fn invalid_page_count_and_stake_arithmetic_make_the_batch_unavailable() {
        let client = compliant_client();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .total_pages_available = Some(2);
        assert_analysis_failed(block_on(collect_with(&client, 42, 1_000_000)));

        let client = compliant_client();
        {
            let mut responses = client.neurons.borrow_mut();
            let target = &mut responses[0].as_mut().unwrap().full_neurons[0];
            target.cached_neuron_stake_e8s = 0;
            target.neuron_fees_e8s = 1;
        }
        assert_analysis_failed(block_on(collect_with(&client, 42, 1_000_000)));
    }
    #[test]
    fn collector_unknown_committed_variant_does_not_override_structural_evidence() {
        let client = compliant_client();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .full_neurons[0]
            .known_neuron_data
            .as_mut()
            .unwrap()
            .committed_topics = Some(vec![Some(ic_clients::Reserved), None]);
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert_eq!(
            snapshot.overall_status,
            dendrite_types::ComplianceStatus::Compliant
        );
    }
    #[test]
    fn collector_handles_future_topic_entries_structurally() {
        let client = compliant_client();
        {
            let mut responses = client.neurons.borrow_mut();
            let target = &mut responses[0].as_mut().unwrap().full_neurons[0];
            target.known_neuron_data.as_mut().unwrap().committed_topics = Some(vec![None; 19]);
            target
                .followees
                .iter_mut()
                .find(|(topic, _)| *topic == 4)
                .unwrap()
                .1
                .followees = vec![NeuronId {
                id: ALPHA_VOTE_NEURON_ID,
            }];
        }
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert_eq!(
            snapshot.overall_status,
            dendrite_types::ComplianceStatus::NonCompliant
        );
        assert!(snapshot.source_failures.is_empty());

        // Opaque current and future metadata entries reach semantic evaluation
        // without affecting the numeric following-map interpretation.
        let client = compliant_client();
        let mut topics = opaque_topic_entries(18);
        topics.push(None);
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .full_neurons[0]
            .known_neuron_data
            .as_mut()
            .unwrap()
            .committed_topics = Some(topics);
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert!(snapshot.source_failures.is_empty());
        assert!(snapshot.rules.iter().any(|rule| {
            rule.rule_id == "DENDRITE-KNOWN-003" && rule.status == dendrite_types::RuleStatus::Pass
        }));

        let client = compliant_client();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .full_neurons[0]
            .followees
            .push((
                99,
                ic_clients::Followees {
                    followees: vec![NeuronId { id: 7 }],
                },
            ));
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert!(snapshot.rules.iter().any(|rule| {
            rule.rule_id == "DENDRITE-COMMIT-001"
                && rule.relevant_topic == Some(99)
                && rule.status == dendrite_types::RuleStatus::Fail
        }));
        assert!(snapshot.source_failures.is_empty());
    }

    #[test]
    fn collector_rejects_genuinely_excessive_wire_vectors() {
        let client = compliant_client();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .full_neurons[0]
            .known_neuron_data
            .as_mut()
            .unwrap()
            .committed_topics = Some(vec![None; ic_clients::MAX_COMMITTED_TOPIC_WIRE_ENTRIES + 1]);
        assert_analysis_failed(block_on(collect_with(&client, 42, 1_000_000)));
    }
    #[test]
    fn collector_over_limit_client_error_fails_report_construction() {
        let client = FakeClient {
            neurons: TestRefCell::new(VecDeque::from([Err(source_error(
                "list_neurons response exceeds bound",
            ))])),
            calls: TestRefCell::new(vec![]),
        };
        assert_analysis_failed(block_on(collect_with(&client, 42, 1_000_000)));
    }
    #[test]
    fn collector_uses_dependencies_even_when_target_has_no_known_data() {
        let mut target = raw_neuron(42, vec![]);
        target.known_neuron_data = None;
        let client = FakeClient {
            neurons: TestRefCell::new(VecDeque::from([Ok(response(vec![target]))])),
            calls: TestRefCell::new(vec![]),
        };
        let snapshot = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert_eq!(
            snapshot.overall_status,
            dendrite_types::ComplianceStatus::NonCompliant
        );
        assert!(snapshot.rules.iter().any(|rule| {
            rule.rule_id == "DENDRITE-KNOWN-002" && rule.status == dendrite_types::RuleStatus::Fail
        }));
        assert_eq!(client.calls.borrow().len(), 1);
    }

    #[test]
    fn collector_decode_failure_fails_report_construction() {
        let client = FakeClient {
            neurons: TestRefCell::new(VecDeque::from([Err(SourceError {
                destination: ic_clients::NNS_GOVERNANCE,
                method: "list_neurons",
                kind: SourceErrorKind::DecodeFailed,
                message: "invalid Candid".into(),
            })])),
            calls: TestRefCell::new(vec![]),
        };
        assert_analysis_failed(block_on(collect_with(&client, 7, 1_000)));
    }

    #[test]
    fn collector_rejects_duplicate_topic_keys_and_unexpected_dependencies() {
        let client = compliant_client();
        let duplicate =
            client.neurons.borrow()[0].as_ref().unwrap().full_neurons[0].followees[0].clone();
        client.neurons.borrow_mut()[0]
            .as_mut()
            .unwrap()
            .full_neurons[0]
            .followees
            .push(duplicate);
        assert_analysis_failed(block_on(collect_with(&client, 42, 1_000_000)));

        let client = compliant_client();
        client.neurons.borrow_mut()[1]
            .as_mut()
            .unwrap()
            .full_neurons
            .push(raw_neuron(999, vec![]));
        let report = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert!(
            report
                .source_failures
                .iter()
                .any(|failure| failure.message.contains("unexpected full-neuron ID"))
        );
    }

    #[test]
    fn collector_rejects_an_entire_duplicate_dependency_batch() {
        let client = compliant_client();
        let mut contradictory = raw_neuron(100, vec![]);
        contradictory.known_neuron_data = None;
        client.neurons.borrow_mut()[1]
            .as_mut()
            .unwrap()
            .full_neurons
            .push(contradictory);
        let report = block_on(collect_with(&client, 42, 1_000_000)).unwrap();
        assert!(
            report
                .source_failures
                .iter()
                .any(|failure| failure.message.contains("duplicate full-neuron ID"))
        );
        assert!(report.managers[0].known_neuron.is_none());
        assert!(report.rules.iter().any(|rule| {
            rule.rule_id == "DENDRITE-NM-004"
                && rule.status == dendrite_types::RuleStatus::Indeterminate
        }));
    }
}
