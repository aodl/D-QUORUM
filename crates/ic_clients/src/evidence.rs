//! Coherent bounded replicated observations; the pinned evaluator is unchanged.
use crate::governance as g;
use candid::{CandidType, Principal};
use dendrite_types::*;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};
pub const OBSERVATION_WINDOW: u64 = 300;
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct CachedNeuron {
    pub metadata_from: u64,
    pub metadata_through: u64,
    pub neuron: Option<g::Neuron>,
    pub info: g::NeuronInfo,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct CachedController {
    pub evidence: ControllerEvidence,
    pub at: u64,
    pub through: u64,
}
#[derive(Clone, Debug, Default, CandidType, Deserialize)]
pub struct Cache {
    pub neurons: BTreeMap<u64, CachedNeuron>,
    pub controllers: BTreeMap<Principal, CachedController>,
}
fn clock() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        ic_cdk::api::time() / 1_000_000_000
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        0
    }
}
impl Cache {
    pub fn fresh(&self, id: u64) -> bool {
        self.neurons.get(&id).is_some_and(|n| {
            clock().saturating_sub(n.info.retrieved_at_timestamp_seconds.min(n.metadata_from))
                <= OBSERVATION_WINDOW
        })
    }
    pub async fn fetch(&mut self, ids: Vec<u64>) -> Result<(), String> {
        // Pinned multi_query omits metadata from BOTH NeuronInfo and full Neuron.
        // Two concurrent, bounded reads avoid serial per-dependency timer slots.
        let metadata_from = clock();
        let (r, known) = crate::together(g::full(ids.clone()), g::known()).await;
        let r = r?;
        let metadata: BTreeMap<_, _> = known?
            .into_iter()
            .map(|n| (n.id.unwrap().id, n.known_neuron_data.unwrap()))
            .collect();
        let at = clock();
        if at.saturating_sub(metadata_from) > OBSERVATION_WINDOW {
            return Err("metadata/configuration batch interval exceeded".into());
        }
        for id in ids {
            let mut info = r
                .neuron_infos
                .iter()
                .find(|(i, _)| *i == id)
                .map(|(_, n)| n.clone())
                .ok_or("requested neuron observation unavailable")?;
            if info.retrieved_at_timestamp_seconds > at
                || at.saturating_sub(info.retrieved_at_timestamp_seconds) > OBSERVATION_WINDOW
            {
                return Err("stale full observation".into());
            }
            info.known_neuron_data = metadata.get(&id).cloned();
            let neuron = r
                .full_neurons
                .iter()
                .find(|n| n.id.as_ref().map(|n| n.id) == Some(id))
                .cloned();
            if info.visibility == Some(2) && neuron.is_none() {
                return Err("public configuration unavailable".into());
            }
            self.neurons.insert(
                id,
                CachedNeuron {
                    neuron,
                    info,
                    metadata_from,
                    metadata_through: at,
                },
            );
        }
        if self.neurons.len() > 20_000 {
            return Err("round observation cache bound".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, CandidType, Deserialize, PartialEq, Eq)]
pub enum Phase {
    Target,
    TargetMetadata,
    Dependencies(u32),
    DependencyMetadata(u32),
    Controller,
    Done,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct Collection {
    pub id: u64,
    pub phase: Phase,
    pub evidence: EvaluationEvidence,
    pub dependencies: Vec<u64>,
    pub dependency_timestamps: BTreeMap<u64, u64>,
    pub observed_from: u64,
    pub observed_through: u64,
    pub local: Cache,
}
impl Collection {
    pub fn new(id: u64) -> Self {
        Self {
            id,
            phase: Phase::Target,
            evidence: EvaluationEvidence {
                now_seconds: 0,
                target: NeuronLookup::Unavailable,
                dependencies: BTreeMap::new(),
                controller: None,
                source_failures: vec![],
                unknown_committed_topics: 0,
            },
            dependencies: vec![],
            dependency_timestamps: BTreeMap::new(),
            observed_from: 0,
            observed_through: 0,
            local: Cache::default(),
        }
    }
    fn observe(&mut self, at: u64) -> Result<(), String> {
        self.observed_from = if self.observed_from == 0 {
            at
        } else {
            self.observed_from.min(at)
        };
        self.observed_through = self.observed_through.max(at);
        if self.observed_through - self.observed_from > OBSERVATION_WINDOW {
            return Err("candidate coherent observation window exceeded".into());
        }
        self.evidence.now_seconds = self.observed_through;
        Ok(())
    }
    fn normalized(&mut self, c: &CachedNeuron) -> Result<NeuronLookup, String> {
        self.observe(c.info.retrieved_at_timestamp_seconds)?;
        self.observe(c.metadata_from)?;
        self.observe(c.metadata_through)?;
        if c.info.visibility != Some(2) {
            return Ok(NeuronLookup::ConfirmedMissing);
        }
        let mut n = normalize(c.neuron.clone().ok_or("public configuration unavailable")?)?;
        merge(
            &mut n,
            c.info.clone(),
            c.info.retrieved_at_timestamp_seconds,
        )?;
        Ok(NeuronLookup::Found(Box::new(n)))
    }
    fn controller_observation(&mut self, c: &CachedController) -> Result<(), String> {
        self.observe(c.at)?;
        self.observe(c.through)?;
        self.evidence.controller = Some(c.evidence.clone());
        Ok(())
    }
    fn report(&self, now: u64) -> Result<ComplianceReport, String> {
        if now < self.observed_through
            || now.saturating_sub(self.observed_from) > OBSERVATION_WINDOW
        {
            return Err("candidate observation expired across awaits".into());
        }
        validate_evaluation_inputs(&self.evidence, SOURCE_REVISION).map_err(str::to_string)?;
        Ok(evaluate(self.id, &self.evidence, SOURCE_REVISION))
    }
    pub async fn advance(&mut self) -> Result<Option<ComplianceReport>, String> {
        let mut cache = std::mem::take(&mut self.local);
        let result = self.advance_cached(&mut cache).await;
        self.local = cache;
        result
    }
    pub async fn advance_cached(
        &mut self,
        cache: &mut Cache,
    ) -> Result<Option<ComplianceReport>, String> {
        if self.observed_from != 0
            && clock().saturating_sub(self.observed_from) > OBSERVATION_WINDOW
        {
            *self = Self::new(self.id);
        }
        match self.phase {
            Phase::Target | Phase::TargetMetadata => {
                if !cache.fresh(self.id) {
                    cache.fetch(vec![self.id]).await?;
                }
                self.evidence.target = self.normalized(cache.neurons.get(&self.id).unwrap())?;
                let partial = evaluate(self.id, &self.evidence, SOURCE_REVISION);
                // A visible mandatory failure already establishes NonCompliant under the pinned engine.
                if partial.overall_status == ComplianceStatus::NonCompliant {
                    self.phase = Phase::Done;
                } else {
                    self.dependencies = self
                        .evidence
                        .target
                        .as_ref()
                        .ok_or("target unavailable")?
                        .followees
                        .values()
                        .flatten()
                        .copied()
                        .collect::<BTreeSet<_>>()
                        .into_iter()
                        .collect();
                    if self.dependencies.len() > MAX_DEPENDENCY_NEURONS {
                        return Err("dependency bound".into());
                    }
                    self.phase = Phase::Dependencies(0);
                }
            }
            Phase::Dependencies(_) | Phase::DependencyMetadata(_) => {
                let missing: Vec<_> = self
                    .dependencies
                    .iter()
                    .copied()
                    .filter(|id| !cache.fresh(*id))
                    .take(50)
                    .collect();
                if !missing.is_empty() {
                    cache.fetch(missing).await?;
                }
                if self.dependencies.iter().all(|id| cache.fresh(*id)) {
                    for id in self.dependencies.clone() {
                        let c = cache.neurons.get(&id).unwrap();
                        let n = self.normalized(c)?;
                        self.dependency_timestamps
                            .insert(id, c.info.retrieved_at_timestamp_seconds);
                        self.evidence.dependencies.insert(id, n);
                    }
                    self.phase = Phase::Controller;
                }
            }
            Phase::Controller => {
                if let Some(p) = self
                    .evidence
                    .target
                    .as_ref()
                    .and_then(|n| n.controller)
                    .filter(|p| p.as_slice().last() == Some(&1))
                {
                    if cache
                        .controllers
                        .get(&p)
                        .is_none_or(|c| clock().saturating_sub(c.at) > OBSERVATION_WINDOW)
                    {
                        let at = clock();
                        let i = g::controller(p).await?;
                        if clock().saturating_sub(at) > OBSERVATION_WINDOW {
                            return Err("controller observation expired during call".into());
                        }
                        cache.controllers.insert(
                            p,
                            CachedController {
                                evidence: ControllerEvidence {
                                    call_succeeded: true,
                                    module_hash: i.module_hash,
                                    controllers: i.controllers,
                                },
                                at,
                                through: clock(),
                            },
                        );
                    }
                    let c = cache.controllers.get(&p).unwrap();
                    self.controller_observation(c)?;
                }
                self.phase = Phase::Done;
            }
            Phase::Done => {}
        }
        if self.phase == Phase::Done {
            Ok(Some(self.report(clock())?))
        } else {
            Ok(None)
        }
    }
}
pub fn normalize(n: g::Neuron) -> Result<NeuronEvidence, String> {
    let minted = n
        .cached_neuron_stake_e8s
        .checked_sub(n.neuron_fees_e8s)
        .ok_or("stake underflow")?;
    let (delay, dissolving) = match n.dissolve_state {
        Some(g::DissolveState::DissolveDelaySeconds(d)) => (Some(d), Some(false)),
        Some(g::DissolveState::WhenDissolvedTimestampSeconds(_)) => (None, Some(true)),
        None => (None, None),
    };
    Ok(NeuronEvidence {
        id: n.id.ok_or("absent neuron ID")?.id,
        controller: n.controller,
        known_data: None,
        hot_keys: n.hot_keys,
        not_for_profit: Some(n.not_for_profit),
        dissolve_delay_seconds: delay,
        dissolving,
        effective_stake_e8s: Some(
            minted
                .checked_add(n.staked_maturity_e8s_equivalent.unwrap_or(0))
                .ok_or("stake overflow")?,
        ),
        minted_stake_e8s: Some(minted),
        voting_power_refreshed_timestamp_seconds: n.voting_power_refreshed_timestamp_seconds,
        potential_voting_power: n.potential_voting_power,
        deciding_voting_power: n.deciding_voting_power,
        committed_topics: vec![],
        followees: n
            .followees
            .into_iter()
            .map(|(t, fs)| (t, fs.followees.into_iter().map(|id| id.id).collect()))
            .collect(),
    })
}
fn merge(n: &mut NeuronEvidence, i: g::NeuronInfo, at: u64) -> Result<(), String> {
    if i.id.as_ref().map(|id| id.id) != Some(n.id)
        || i.retrieved_at_timestamp_seconds.abs_diff(at) > 300
        || i.visibility != Some(2)
    {
        return Err("metadata binding, visibility or timestamp".into());
    }
    n.known_data = i.known_neuron_data.map(|m| KnownNeuron {
        id: n.id,
        name: m.name,
        description: m.description,
        links: m.links.unwrap_or_default(),
    });
    Ok(())
}
pub fn expected_controller(n: &g::Neuron, expected: Principal, id: u64) -> Result<(), String> {
    if n.id.as_ref().map(|n| n.id) != Some(id) || n.controller != Some(expected) {
        return Err("target identity or controller mismatch".into());
    }
    Ok(())
}

#[cfg(test)]
mod observation_intervals {
    use super::*;
    #[test]
    fn delayed_controller_reply_and_report_commit_cannot_freshen_old_configuration() {
        let mut c = Collection::new(1);
        c.observe(100).unwrap();
        let late = CachedController {
            at: 200,
            through: 499,
            evidence: ControllerEvidence {
                call_succeeded: true,
                module_hash: None,
                controllers: vec![],
            },
        };
        assert!(c.controller_observation(&late).is_err());
        assert_eq!(c.observed_from, 100);
        assert!(c.evidence.controller.is_none());
        let mut c = Collection::new(1);
        c.observe(100).unwrap();
        assert!(c.report(400).is_ok());
        assert!(c.report(401).is_err());
        assert!(c.report(99).is_err());
    }
}
