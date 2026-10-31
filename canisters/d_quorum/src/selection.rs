use crate::state::{self, ScanPhase::*, *};
use quorum_ic_clients::{
    GOVERNANCE,
    evidence::{Collection, expected_controller},
    governance as g,
};
use quorum_policy::{self as policy, Observation, TARGET, TOPICS};
use std::collections::{BTreeMap, BTreeSet};

pub fn following(n: &g::Neuron) -> BTreeMap<i32, Vec<u64>> {
    n.followees
        .iter()
        .map(|(t, fs)| (*t, fs.followees.iter().map(|n| n.id).collect()))
        .collect()
}
pub async fn target() -> Result<g::Neuron, String> {
    Ok(target_observation().await?.0)
}
async fn target_observation() -> Result<(g::Neuron, u64), String> {
    let expected = state::read(|s| s.config.expected_target_controller)
        .ok_or("waiting for reviewed target controller")?;
    let mut r = g::full(vec![TARGET]).await?;
    let at = r
        .neuron_infos
        .iter()
        .find(|(id, _)| *id == TARGET)
        .ok_or("target observation time unavailable")?
        .1
        .retrieved_at_timestamp_seconds;
    let n = r.full_neurons.pop().ok_or("D-QUORUM target unavailable")?;
    expected_controller(&n, expected, TARGET)?;
    if !n.hot_keys.contains(&ic_cdk::api::canister_self()) {
        return Err("waiting for D-QUORUM hotkey authority".into());
    }
    let governance = g::controller(GOVERNANCE).await?;
    let root = candid::Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap();
    if governance.controllers != vec![root] {
        return Err("Governance controller does not match NNS Root".into());
    }
    if following(&n).get(&0).is_some_and(|xs| !xs.is_empty()) {
        return Err(
            "waiting: remove D-QUORUM CatchAll separately; excluded defaults must not reappear"
                .into(),
        );
    }
    Ok((n, at))
}
fn material_equal(a: &policy::Candidate, b: &policy::Candidate) -> bool {
    a.id == b.id
        && a.managers == b.managers
        && a.topics == b.topics
        && a.evaluator_commit == b.evaluator_commit
}
pub async fn step(token: Token, now: u64) -> Result<(), String> {
    let (mut r, config, proposer) =
        state::read(|s| (s.round.clone(), s.config.clone(), s.proposer));
    if r.is_none() {
        let id = state::guarded(token, |s| {
            s.round_nonce = s.round_nonce.checked_add(1).expect("round overflow");
            s.round_nonce
        })
        .ok_or("stale worker")?;
        r = Some(Round::new(id, config.revision, now));
        state::guarded(token, |s| s.round = r.clone()).ok_or("stale worker")?;
    }
    let mut r = r.unwrap();
    if r.revision != config.revision && !matches!(r.phase, Applying { sent: true }) {
        state::guarded(token, |s| s.round = None);
        return Ok(());
    }
    if now.saturating_sub(r.started_at) > MAX_ROUND_AGE
        && !matches!(r.phase, Applying { sent: true } | Complete | Failed(_))
    {
        r.phase = Failed("maximum scan/round age exceeded".into());
    }
    match r.phase.clone() {
        Discover => {
            if r.economics.is_none() {
                r.economics = Some(g::voting_context().await?);
            }
            r.known = g::known()
                .await?
                .into_iter()
                .map(|n| n.id.unwrap().id)
                .collect();
            r.known.sort_unstable();
            r.phase = Candidates {
                offset: 0,
                work: None,
            };
        }
        Candidates { offset, work } => {
            if let Some(id) = r.known.get(offset as usize).copied() {
                if !r.cache.fresh(id) {
                    r.cache
                        .fetch(
                            r.known[offset as usize..]
                                .iter()
                                .copied()
                                .take(50)
                                .collect(),
                        )
                        .await?;
                }
                let mut work = work.unwrap_or_else(|| Collection::new(id));
                if let Some(report) = work.advance_cached(&mut r.cache).await? {
                    let admitted = policy::admit(&report).ok().map(|mut c| {
                        c.checked_at = work.observed_from;
                        c
                    });
                    if let Some(c) = admitted.clone() {
                        r.candidates.insert(id, c);
                    }
                    if matches!(
                        report.overall_status,
                        dendrite_types::ComplianceStatus::Indeterminate
                            | dendrite_types::ComplianceStatus::StandardUpdateRequired
                    ) {
                        return Err(
                            "candidate evaluation incomplete or policy update required".into()
                        );
                    }
                    r.outcomes.insert(
                        id,
                        CandidateResult {
                            id,
                            status: report.overall_status,
                            checked_at: report.checked_at_timestamp_seconds,
                            admitted,
                        },
                    );
                    r.phase = Candidates {
                        offset: offset + 1,
                        work: None,
                    };
                } else {
                    r.phase = Candidates {
                        offset,
                        work: Some(work),
                    };
                }
            } else {
                r.phase = Index {
                    cursor: None,
                    pending: vec![],
                    end_cursor: None,
                };
            }
        }
        Index {
            cursor,
            mut pending,
            end_cursor,
        } => {
            if pending.is_empty() {
                let ns = g::index(cursor).await?;
                r.pages += 1;
                if ns.is_empty() {
                    r.scan_ended_at = Some(clock());
                    r.phase = Select;
                } else {
                    let last = ns.last().and_then(|n| n.id.as_ref()).map(|id| id.id);
                    pending = ns
                        .into_iter()
                        .filter(|n| n.visibility == Some(2))
                        .map(|n| n.id.unwrap().id)
                        .collect();
                    r.phase = Index {
                        cursor: if pending.is_empty() { last } else { cursor },
                        pending,
                        end_cursor: last,
                    };
                }
            } else {
                let batch: Vec<_> = pending.drain(..pending.len().min(50)).collect();
                if Some(g::voting_context().await?) != r.economics {
                    return Err("voting economics changed before support batch".into());
                }
                let observed = g::full(batch.clone()).await?;
                if Some(g::voting_context().await?) != r.economics {
                    return Err("voting economics changed across support batch".into());
                }
                if observed.neuron_infos.iter().any(|(_, n)| {
                    n.retrieved_at_timestamp_seconds > clock()
                        || clock().saturating_sub(n.retrieved_at_timestamp_seconds) > 300
                }) {
                    return Err("support observation expired across awaits".into());
                }
                for id in &batch {
                    if observed
                        .neuron_infos
                        .iter()
                        .find(|(n, _)| n == id)
                        .is_some_and(|(_, n)| n.visibility == Some(2))
                        && !observed
                            .full_neurons
                            .iter()
                            .any(|n| n.id.as_ref().map(|x| x.id) == Some(*id))
                    {
                        return Err(
                            "public full-neuron configuration missing from successful batch".into(),
                        );
                    }
                }
                let owner = ic_cdk::api::canister_self();
                let own_account =
                    quorum_ic_clients::ledger::staking_subaccount(owner, BOOTSTRAP_NONCE);
                for n in observed.full_neurons {
                    if n.visibility != Some(2) {
                        continue;
                    }
                    let id = n.id.as_ref().unwrap().id;
                    let at = observed
                        .neuron_infos
                        .iter()
                        .find(|(n, _)| *n == id)
                        .unwrap()
                        .1
                        .retrieved_at_timestamp_seconds;
                    let o = Observation {
                        id,
                        public: true,
                        deciding_vp: if r
                            .economics
                            .as_ref()
                            .ok_or("voting context unavailable")?
                            .eligible(&n, at)?
                        {
                            n.deciding_voting_power.ok_or("deciding VP unavailable")?
                        } else {
                            0
                        },
                        followees: following(&n),
                        observed_at: at,
                    };
                    // The deterministic owned account identifies the proposer even before bootstrap records its ID.
                    let excluded = if n.controller == Some(owner) && n.account == own_account {
                        Some(id)
                    } else {
                        proposer
                    };
                    policy::contribute(&mut r.scores, &o, &r.candidates, excluded)
                        .map_err(str::to_string)?;
                    r.public_observations += 1;
                }
                r.full_batches += 1;
                r.phase = Index {
                    cursor: if pending.is_empty() {
                        end_cursor
                    } else {
                        cursor
                    },
                    pending,
                    end_cursor,
                };
            }
        }
        Select => {
            if Some(g::voting_context().await?) != r.economics {
                return Err("voting economics changed; complete new round required".into());
            }
            r.cache = Default::default();
            r.validated_at = Some(now); // Bound the age of the oldest selected-candidate recheck.
            r.rosters = TOPICS
                .into_iter()
                .map(|t| policy::select(t, config.delegates_per_topic, &r.candidates, &r.scores))
                .collect::<Result<Vec<_>, _>>()
                .map_err(str::to_string)?;
            r.phase = Revalidate {
                ids: policy::recipients(&r.rosters).into_iter().collect(),
                offset: 0,
                work: None,
            };
        }
        Revalidate { ids, offset, work } => {
            if let Some(id) = ids.get(offset as usize).copied() {
                if !r.cache.fresh(id) {
                    r.cache
                        .fetch(ids[offset as usize..].iter().copied().take(50).collect())
                        .await?;
                }
                let mut work = work.unwrap_or_else(|| Collection::new(id));
                if let Some(report) = work.advance_cached(&mut r.cache).await? {
                    let mut c = policy::admit(&report).map_err(str::to_string)?;
                    c.checked_at = work.observed_from;
                    r.validated_at = Some(r.validated_at.unwrap_or(c.checked_at).min(c.checked_at));
                    if !r.candidates.get(&id).is_some_and(|a| material_equal(a, &c)) {
                        r.phase = Failed(
                            "selected candidate changed; complete new round required".into(),
                        );
                    } else {
                        r.candidates.insert(id, c.clone());
                        if let Some(outcome) = r.outcomes.get_mut(&id) {
                            outcome.checked_at = c.checked_at;
                            outcome.admitted = Some(c);
                        }
                        r.phase = Revalidate {
                            ids,
                            offset: offset + 1,
                            work: None,
                        };
                    }
                } else {
                    r.phase = Revalidate {
                        ids,
                        offset,
                        work: Some(work),
                    };
                }
            } else {
                r.phase = Cycles {
                    topic: 0,
                    todo: r.rosters[0].selected.clone(),
                    visited: BTreeSet::new(),
                };
            }
        }
        Cycles {
            topic,
            mut todo,
            mut visited,
        } => {
            if topic as usize >= r.rosters.len() {
                if Some(g::voting_context().await?) != r.economics {
                    return Err("voting economics changed before ranking publication".into());
                }
                if r.validated_at
                    .is_none_or(|t| clock().saturating_sub(t) > 1800)
                {
                    return Err("validation expired before publication".into());
                }
                r.phase = Ready;
            } else if todo.is_empty() {
                let next = topic + 1;
                r.phase = Cycles {
                    topic: next,
                    todo: r
                        .rosters
                        .get(next as usize)
                        .map_or(vec![], |r| r.selected.clone()),
                    visited: BTreeSet::new(),
                };
            } else {
                if visited.len() > 4096 {
                    return Err("cycle graph exceeds conservative per-topic bound".into());
                }
                let batch: Vec<_> = todo.drain(..todo.len().min(50)).collect();
                if batch.contains(&TARGET) {
                    r.phase = Failed("selected voting dependency reaches D-QUORUM".into());
                } else {
                    let missing: Vec<_> = batch
                        .iter()
                        .copied()
                        .filter(|id| !r.cache.fresh(*id))
                        .collect();
                    if !missing.is_empty() {
                        r.cache.fetch(missing).await?;
                    }
                    let ns = g::ListNeuronsResponse {
                        full_neurons: batch
                            .iter()
                            .filter_map(|id| r.cache.neurons.get(id).and_then(|n| n.neuron.clone()))
                            .collect(),
                        neuron_infos: vec![],
                        total_pages_available: Some(1),
                    };
                    if batch.iter().any(|id| {
                        !ns.full_neurons.iter().any(|n| {
                            n.id.as_ref().map(|i| i.id) == Some(*id) && n.visibility == Some(2)
                        })
                    }) {
                        return Err("cycle proof needs unavailable or private dependency".into());
                    }
                    for n in ns.full_neurons {
                        let id = n.id.as_ref().unwrap().id;
                        visited.insert(id);
                        let fs = policy::effective_followees(
                            &Observation {
                                id,
                                public: true,
                                deciding_vp: 0,
                                followees: following(&n),
                                observed_at: now,
                            },
                            r.rosters[topic as usize].topic,
                        )
                        .map_err(str::to_string)?;
                        for f in fs {
                            if f == TARGET {
                                r.phase = Failed("voting dependency cycle to D-QUORUM".into());
                                break;
                            }
                            if !visited.contains(&f) && !todo.contains(&f) {
                                todo.push(f);
                            }
                        }
                        if matches!(r.phase, Failed(_)) {
                            break;
                        }
                    }
                    if !matches!(r.phase, Failed(_)) {
                        r.phase = Cycles {
                            topic,
                            todo,
                            visited,
                        };
                    }
                }
            }
        }
        Ready => {
            if config.mode != Mode::Live {
                state::guarded(token, |s| s.jobs[0].next_at = now + 7 * DAY);
            } else {
                if r.validated_at.is_none_or(|t| now.saturating_sub(t) > 1800) {
                    return Err("pre-application validation expired".into());
                }
                let (n, observed) = target_observation().await?;
                if Some(g::voting_context().await?) != r.economics {
                    return Err("voting economics changed before application".into());
                }
                if !dispatch_allowed(token, &r) || clock().saturating_sub(observed) > 300 {
                    return Err("application authorization or observation expired".into());
                }
                if !state::current(token) {
                    return Ok(());
                }
                r.original_managers = following(&n).get(&1).cloned().unwrap_or_default();
                r.intended = r
                    .rosters
                    .iter()
                    .map(|r| (r.topic, r.selected.clone()))
                    .collect();
                r.phase = Applying { sent: false };
            }
        }
        Applying { sent } => {
            let (n, observed) = target_observation().await?;
            r.last_readback_at = Some(observed);
            if !state::current(token) {
                return Ok(());
            }
            let actual = following(&n);
            if actual.get(&1).cloned().unwrap_or_default() != r.original_managers {
                return Err(
                    "management membership changed while applying; operator review required".into(),
                );
            }
            let current_economics = g::voting_context().await.ok();
            if !state::current(token) {
                return Ok(());
            }
            let reconciled = r
                .intended
                .iter()
                .all(|(topic, ids)| actual.get(topic).cloned().unwrap_or_default() == *ids);
            if reconciled {
                let applied = Applied {
                    candidate_validated_at: r.validated_at,
                    intended_at: r.intent_at,
                    reward_valid_until: Some(
                        if current_economics != r.economics || r.economics.is_none() {
                            0
                        } else {
                            r.started_at
                                .saturating_add(ROSTER_MAX_AGE)
                                .min(r.validated_at.unwrap_or(0).saturating_add(ROSTER_MAX_AGE))
                        },
                    ),
                    economics: r.economics.clone(),
                    readback_observed_at: Some(observed),
                    round: r.id,
                    revision: r.revision,
                    reconciled_at: clock(),
                    scan_start: r.started_at,
                    scan_end: r.scan_ended_at.ok_or("incomplete scan")?,
                    rosters: r.rosters.clone(),
                };
                state::guarded(token, |s| {
                    s.publish_applied(applied, clock());
                });
                r.phase = Complete;
            } else if r.revision != state::read(|s| s.config.revision) {
                r.phase = Failed("configuration changed; old write read back without retry".into());
            } else if state::read(|s| s.config.mode) != Mode::Live {
                return Err(
                    "following intent retained for readback; write mode is inactive".into(),
                );
            } else if sent && r.apply_attempts >= 3 {
                return Err("following write remains unreconciled after bounded retries".into());
            } else {
                if Some(g::voting_context().await?) != r.economics {
                    return Err("voting economics changed before dispatch".into());
                }
                if !dispatch_allowed(token, &r) || clock().saturating_sub(observed) > 300 {
                    r.phase =
                        Failed("current revision or freshness prevents obsolete dispatch".into());
                    state::guarded(token, |s| {
                        s.round = Some(r);
                        s.jobs[0].next_at = clock() + 1;
                    });
                    return Ok(());
                }
                let write_now = clock();
                if r.validated_at
                    .is_none_or(|t| write_now.saturating_sub(t) > 1800)
                    || write_now.saturating_sub(r.started_at) > MAX_ROUND_AGE
                {
                    return Err("candidate validation expired before following retry".into());
                }
                let changed: Vec<_> = r
                    .intended
                    .iter()
                    .filter(|(t, ids)| actual.get(t).cloned().unwrap_or_default() != **ids)
                    .map(|(t, ids)| g::Following {
                        topic: Some(*t),
                        followees: Some(ids.iter().map(|id| g::NeuronId { id: *id }).collect()),
                    })
                    .collect();
                r.apply_attempts += 1;
                r.intent_at.get_or_insert(write_now);
                r.phase = Applying { sent: true };
                state::guarded_if(
                    token,
                    |s| {
                        s.config.revision == r.revision
                            && s.config.mode == Mode::Live
                            && s.round.as_ref().is_some_and(|x| {
                                x.id == r.id && x.apply_attempts + 1 == r.apply_attempts
                            })
                    },
                    |s| s.round = Some(r.clone()),
                )
                .ok_or("stale configuration or intent")?; // commit intent before await
                let response = g::manage(g::request(
                    TARGET,
                    g::Command::SetFollowing(g::SetFollowing {
                        topic_following: Some(changed),
                    }),
                ))
                .await;
                // Neither success nor rejection is an applied-roster publication: next step always reads back.
                response?;
            }
        }
        Complete | Failed(_) => {
            state::guarded(token, |s| {
                s.jobs[0].next_at = now
                    + if matches!(r.phase, Complete) {
                        7 * DAY
                    } else {
                        3600
                    };
            });
        }
    }
    state::guarded(token, |s| {
        // Reserve the cadence when entering a terminal phase, before the next timer can retire it.
        // Otherwise the next ten-second tick could accidentally start another weekly round.
        if matches!(r.phase, Complete)
            && (!s
                .applied
                .as_ref()
                .is_some_and(|a| a.reward_eligible(s.config.revision, clock()))
                || r.revision != s.config.revision)
        {
            s.jobs[0].next_at = clock() + 1;
        } else if r.revision != s.config.revision && matches!(r.phase, Complete | Failed(_)) {
            // Finish readback of the old intent, then promptly compute the new revision.
            s.jobs[0].next_at = now + 10;
        } else if matches!(r.phase, Complete)
            || (matches!(r.phase, Ready) && s.config.mode != Mode::Live)
        {
            s.jobs[0].next_at = now + 7 * DAY;
        } else if matches!(r.phase, Failed(_)) {
            s.jobs[0].next_at = now + 3600;
        }
        if let Some(end) = r.scan_ended_at {
            s.last_complete_scan = Some((r.started_at, end));
        }
        s.round = Some(r);
    });
    Ok(())
}

fn clock() -> u64 {
    ic_cdk::api::time() / 1_000_000_000
}
fn dispatch_allowed(t: Token, r: &Round) -> bool {
    state::current(t)
        && ic_cdk::api::canister_cycle_balance() >= 2_000_000_000_000
        && state::read(|s| {
            s.config.revision == r.revision
                && s.config.mode == Mode::Live
                && s.round.as_ref().is_some_and(|x| x.id == r.id)
        })
        && clock().saturating_sub(r.started_at) <= MAX_ROUND_AGE
        && r.validated_at
            .is_some_and(|v| clock().saturating_sub(v) <= 1800)
}
