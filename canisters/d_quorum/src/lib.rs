#![deny(unsafe_code)]
mod legacy;
mod legacy_v2;
mod payout;
pub mod proposal;
mod selection;
pub mod state;
use candid::{CandidType, Principal};
use serde::{Deserialize, Serialize};
use state::{Init, Mode, Token};
use std::time::Duration;

#[ic_cdk::init]
fn init(args: Option<Init>) {
    let args = args.unwrap_or(Init {
        mode: Mode::ObserveOnly,
        expected_target_controller: None,
    });
    let s = state::State::new(args, now()).unwrap_or_else(|e| ic_cdk::trap(e));
    state::install(s);
    arm();
}
#[ic_cdk::post_upgrade]
fn post_upgrade(mode: Option<Mode>) {
    state::restore();
    if let Some(mode) = mode {
        state::change(|s| {
            assert!(
                mode == Mode::ObserveOnly || s.config.expected_target_controller.is_some(),
                "write modes require reviewed target controller"
            );
            s.config.mode = mode;
            for j in &mut s.jobs {
                j.next_at = 0;
            }
        });
    }
    arm();
}
fn now() -> u64 {
    ic_cdk::api::time() / 1_000_000_000
}
fn arm() {
    // Timers are heap-only; upgrades remove old timers and install one of each.
    for job in 0..5 {
        ic_cdk_timers::set_timer_interval(Duration::from_secs(10), move || async move {
            tick(job).await;
        });
    }
}
async fn tick(job: usize) {
    let n = now();
    if !state::read(|s| s.jobs[job].next_at <= n && s.jobs[job].busy_until <= n) {
        return;
    }
    if ic_cdk::api::canister_cycle_balance() < 2_000_000_000_000 {
        return;
    }
    let token = state::change(|s| {
        let j = &mut s.jobs[job];
        if j.next_at > n || j.busy_until > n {
            return None;
        }
        if job == 0
            && s.round.as_ref().is_some_and(|r| {
                matches!(
                    r.phase,
                    state::ScanPhase::Complete | state::ScanPhase::Failed(_)
                ) || (matches!(r.phase, state::ScanPhase::Ready) && s.config.mode != Mode::Live)
            })
        {
            s.round = None;
        }
        j.generation = j.generation.checked_add(1).expect("generation overflow");
        j.busy_until = n + 600;
        j.next_at = n + 10;
        Some(Token {
            job,
            generation: j.generation,
        })
    });
    let Some(t) = token else {
        return;
    };
    let calls = quorum_ic_clients::calls();
    let start = ic_cdk::api::call_context_instruction_counter();
    let initial_cycles = ic_cdk::api::canister_cycle_balance();
    for _ in 0..16 {
        if !state::current(t) {
            return;
        }
        let was_index = state::read(|s| {
            s.round
                .as_ref()
                .is_some_and(|r| matches!(r.phase, state::ScanPhase::Index { .. }))
        });
        let segment_start = ic_cdk::api::call_context_instruction_counter();
        let result = match job {
            0 => selection::step(t, now()).await,
            1 => proposal::step(t, now()).await,
            2 => payout::step(t, now()).await,
            3 => proposal::bootstrap(t, now()).await,
            4 => payout::maintenance(t).await,
            _ => unreachable!(),
        };
        if !state::current(t) {
            return;
        }
        let failed = result.is_err();
        let measured =
            ic_cdk::api::call_context_instruction_counter().saturating_sub(segment_start);
        state::guarded(t, |s| {
            let j = &mut s.jobs[job];
            j.steps += 1;
            j.measured_instructions = j.measured_instructions.saturating_add(measured);
            j.maximum_step_instructions = j.maximum_step_instructions.max(measured);
            match result {
                Ok(()) => {
                    j.failures = 0;
                    j.last_error = None;
                }
                Err(e) => {
                    j.failures = j.failures.saturating_add(1);
                    j.last_error = Some(quorum_ic_clients::bounded(e));
                    j.next_at = now() + 60u64.saturating_mul(1 << j.failures.min(10)).min(3600);
                    if job == 0
                        && let Some(r) = &mut s.round
                    {
                        r.failures += 1;
                        r.last_failure = j.last_error.clone();
                        if j.failures >= 5
                            && !matches!(r.phase, state::ScanPhase::Applying { sent: true })
                        {
                            r.phase = state::ScanPhase::Failed(
                                "bounded retries exhausted; applied roster retained".into(),
                            );
                        }
                    }
                }
            }
        });
        if failed
            || was_index
            || !continuable(job)
            || ic_cdk::api::call_context_instruction_counter().saturating_sub(start) >= 250_000_000
            || quorum_ic_clients::calls() - calls >= 48
            || initial_cycles.saturating_sub(ic_cdk::api::canister_cycle_balance())
                >= 10_000_000_000
            || ic_cdk::api::canister_cycle_balance() < 2_000_000_000_000
        {
            break;
        }
    }
    let again = continuable(job) && state::read(|s| s.jobs[job].failures == 0);
    let released = state::guarded(t, |s| {
        s.jobs[job].busy_until = 0;
        if again {
            s.jobs[job].next_at = now() + 1;
        }
    })
    .is_some();
    if again && released {
        continuation(job);
    }
}
fn continuable(job: usize) -> bool {
    state::read(|s| match job {
        0 => s.round.as_ref().is_some_and(|r| {
            matches!(
                r.phase,
                state::ScanPhase::Discover
                    | state::ScanPhase::Candidates { .. }
                    | state::ScanPhase::Select
                    | state::ScanPhase::Revalidate { .. }
                    | state::ScanPhase::Cycles { .. }
            )
        }),
        2 => s.payout.is_none() && s.draft.is_some(),
        _ => false,
    })
}
fn continuation(job: usize) {
    ic_cdk_timers::set_timer(
        Duration::from_secs(1),
        Box::pin(async move {
            tick(job).await;
        }),
    );
}

#[ic_cdk::update]
fn set_delegates_per_topic(new_count: u8) -> Result<u64, String> {
    let caller = ic_cdk::api::msg_caller();
    if caller != quorum_ic_clients::GOVERNANCE {
        return Err("only NNS Governance may set roster size".into());
    }
    if !(1..=15).contains(&new_count) {
        return Err("count must be 1..=15".into());
    }
    state::change(|s| s.set_count(caller, new_count))
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct Configuration {
    pub policy_revision: String,
    pub config: state::Config,
    pub target: u64,
    pub governance: Principal,
    pub ledger: Principal,
    pub evaluator_commit: String,
    pub evaluator_nns_source: String,
    pub protocol_commit: String,
    pub reward_policy: String,
    pub score_scale: u128,
    pub bootstrap_staking_account: quorum_ic_clients::ledger::Account,
    pub bootstrap_nonce: u64,
}
#[ic_cdk::query]
fn configuration() -> Configuration {
    state::read(|s| {
        Configuration{policy_revision:s.policy_pin.clone(),config:s.config.clone(),target:quorum_policy::TARGET,governance:quorum_ic_clients::GOVERNANCE,ledger:quorum_ic_clients::LEDGER,evaluator_commit:quorum_policy::EVALUATOR_COMMIT.into(),evaluator_nns_source:dendrite_types::SOURCE_REVISION.into(),protocol_commit:quorum_policy::PROTOCOL_COMMIT.into(),reward_policy:"provisional: distinct latest fully-applied fresh roster neurons; one equal share; no manager bonus or redirection".into(),score_scale:quorum_policy::SCALE,bootstrap_staking_account:quorum_ic_clients::ledger::Account{owner:quorum_ic_clients::GOVERNANCE,subaccount:Some(quorum_ic_clients::ledger::staking_subaccount(ic_cdk::api::canister_self(),state::BOOTSTRAP_NONCE))},bootstrap_nonce:state::BOOTSTRAP_NONCE}
    })
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct ScanProgress {
    pub voting_context: Option<quorum_ic_clients::governance::VotingContext>,
    pub candidate_validated_at: Option<u64>,
    pub intent_at: Option<u64>,
    pub readback_observed_at: Option<u64>,
    pub round: Option<u64>,
    pub revision: Option<u64>,
    pub started_at: Option<u64>,
    pub scan_ended_at: Option<u64>,
    pub phase: String,
    pub cursor: Option<u64>,
    pub pages: u64,
    pub full_batches: u64,
    pub public_observations: u64,
    pub failures: u64,
    pub last_failure: Option<String>,
    pub discovered_candidates: u64,
    pub evaluated_candidates: u64,
    pub last_applied_scan: Option<(u64, u64)>,
    pub last_complete_scan: Option<(u64, u64)>,
}
#[ic_cdk::query]
fn scan_progress() -> ScanProgress {
    state::read(|s| {
        let r = s.round.as_ref();
        ScanProgress {
            voting_context: r.and_then(|r| r.economics.clone()),
            candidate_validated_at: r.and_then(|r| r.validated_at),
            intent_at: r.and_then(|r| r.intent_at),
            readback_observed_at: r.and_then(|r| r.last_readback_at),
            round: r.map(|r| r.id),
            revision: r.map(|r| r.revision),
            started_at: r.map(|r| r.started_at),
            scan_ended_at: r.and_then(|r| r.scan_ended_at),
            phase: r.map_or("waiting".into(), |r| {
                match r.phase {
                    state::ScanPhase::Discover => "discover",
                    state::ScanPhase::Candidates { .. } => "candidates",
                    state::ScanPhase::Index { .. } => "index",
                    state::ScanPhase::Select => "selection",
                    state::ScanPhase::Revalidate { .. } => "revalidation",
                    state::ScanPhase::Cycles { .. } => "cycles",
                    state::ScanPhase::Ready => "ready",
                    state::ScanPhase::Applying { .. } => "applying",
                    state::ScanPhase::Complete => "complete",
                    state::ScanPhase::Failed(_) => "failed",
                }
                .into()
            }),
            cursor: r.and_then(|r| {
                if let state::ScanPhase::Index { cursor, .. } = r.phase {
                    cursor
                } else {
                    None
                }
            }),
            pages: r.map_or(0, |r| r.pages),
            full_batches: r.map_or(0, |r| r.full_batches),
            public_observations: r.map_or(0, |r| r.public_observations),
            failures: r.map_or(0, |r| r.failures),
            last_failure: r.and_then(|r| {
                r.last_failure.clone().or_else(|| {
                    if let state::ScanPhase::Failed(reason) = &r.phase {
                        Some(reason.clone())
                    } else {
                        None
                    }
                })
            }),
            discovered_candidates: r.map_or(0, |r| r.known.len() as u64),
            evaluated_candidates: r.map_or(0, |r| r.outcomes.len() as u64),
            last_applied_scan: s.applied.as_ref().map(|a| (a.scan_start, a.scan_end)),
            last_complete_scan: s.last_complete_scan,
        }
    })
}
fn limit(n: u16) -> usize {
    usize::from(n.clamp(1, 100))
}
#[ic_cdk::query]
fn candidate_page(after: Option<u64>, count: u16) -> Vec<state::CandidateResult> {
    state::read(|s| {
        s.round.as_ref().map_or(vec![], |r| {
            r.outcomes
                .values()
                .filter(|c| after.is_none_or(|id| c.id > id))
                .take(limit(count))
                .cloned()
                .collect()
        })
    })
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct Score {
    pub topic: i32,
    pub neuron_id: u64,
    pub scaled_score: u128,
    pub complete: bool,
}
#[ic_cdk::query]
fn score_page(after: Option<(i32, u64)>, count: u16) -> Vec<Score> {
    state::read(|s| {
        s.round
            .as_ref()
            .filter(|r| {
                r.economics.is_some()
                    && matches!(
                        r.phase,
                        state::ScanPhase::Ready
                            | state::ScanPhase::Applying { .. }
                            | state::ScanPhase::Complete
                    )
            })
            .map_or(vec![], |r| {
                r.scores
                    .iter()
                    .filter(|(key, _)| after.is_none_or(|a| **key > a))
                    .take(limit(count))
                    .map(|((t, id), score)| Score {
                        topic: *t,
                        neuron_id: *id,
                        scaled_score: *score,
                        complete: r.scan_ended_at.is_some()
                            && !matches!(r.phase, state::ScanPhase::Failed(_)),
                    })
                    .collect()
            })
    })
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct RosterView {
    pub support_started_at: Option<u64>,
    pub support_ended_at: Option<u64>,
    pub candidate_validated_at: Option<u64>,
    pub intended_at: Option<u64>,
    pub readback_observed_at: Option<u64>,
    pub reward_valid_until: Option<u64>,
    pub reward_eligible: bool,
    pub topic: i32,
    pub planned: Vec<u64>,
    pub applied: Vec<u64>,
    pub planned_round: Option<u64>,
    pub applied_round: Option<u64>,
    pub reconciled_at: Option<u64>,
}
#[ic_cdk::query]
fn roster_page(offset: u16, count: u16) -> Vec<RosterView> {
    state::read(|s| {
        quorum_policy::TOPICS
            .into_iter()
            .skip(usize::from(offset))
            .take(limit(count))
            .map(|topic| RosterView {
                support_started_at: s.applied.as_ref().map(|a| a.scan_start),
                support_ended_at: s.applied.as_ref().map(|a| a.scan_end),
                candidate_validated_at: s.applied.as_ref().and_then(|a| a.candidate_validated_at),
                intended_at: s.applied.as_ref().and_then(|a| a.intended_at),
                readback_observed_at: s.applied.as_ref().and_then(|a| a.readback_observed_at),
                reward_valid_until: s.applied.as_ref().and_then(|a| a.reward_valid_until),
                reward_eligible: s
                    .applied
                    .as_ref()
                    .is_some_and(|a| a.reward_eligible(s.config.revision, now())),
                topic,
                planned: s
                    .round
                    .as_ref()
                    .and_then(|r| r.rosters.iter().find(|r| r.topic == topic))
                    .map_or(vec![], |r| r.selected.clone()),
                applied: s
                    .applied
                    .as_ref()
                    .and_then(|a| a.rosters.iter().find(|r| r.topic == topic))
                    .map_or(vec![], |r| r.selected.clone()),
                planned_round: s.round.as_ref().map(|r| r.id),
                applied_round: s.applied.as_ref().map(|r| r.round),
                reconciled_at: s.applied.as_ref().map(|a| a.reconciled_at),
            })
            .collect()
    })
}
#[ic_cdk::query]
fn exclusion_page(topic: i32, offset: u32, count: u16) -> Vec<quorum_policy::Exclusion> {
    state::read(|s| {
        s.round
            .as_ref()
            .and_then(|r| r.rosters.iter().find(|r| r.topic == topic))
            .map_or(vec![], |r| {
                r.exclusions
                    .iter()
                    .skip(offset as usize)
                    .take(limit(count))
                    .cloned()
                    .collect()
            })
    })
}
#[ic_cdk::query]
fn proposal_progress() -> Option<state::ProposalJob> {
    state::read(|s| s.proposal.clone())
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct PayoutSummary {
    pub additional_fee_funding: u64,
    pub confirmed_cost: u128,
    pub maintenance_complete: bool,
    pub id: u64,
    pub roster_round: u64,
    pub observed_balance: u64,
    pub fee: u64,
    pub dust: u64,
    pub reserved: u64,
    pub recipient_count: u32,
    pub confirmed_count: u32,
    pub complete: bool,
}
fn summary(p: &quorum_accounting::Plan) -> PayoutSummary {
    PayoutSummary {
        additional_fee_funding: p.additional_fee_funding,
        confirmed_cost: p.confirmed_cost(),
        maintenance_complete: p.maintenance_complete(),
        id: p.id,
        roster_round: p.roster_round,
        observed_balance: p.balance,
        fee: p.fee,
        dust: p.dust,
        reserved: p.reserved().expect("accounting invariant"),
        recipient_count: p.transfers.len() as u32,
        confirmed_count: p
            .transfers
            .iter()
            .filter(|t| {
                matches!(
                    t.status,
                    quorum_accounting::TransferStatus::Confirmed { .. }
                )
            })
            .count() as u32,
        complete: p.complete(),
    }
}
#[ic_cdk::query]
fn payout_page(after: Option<u64>, count: u16) -> Vec<PayoutSummary> {
    state::read(|s| {
        s.completed_payouts
            .iter()
            .chain(s.payout.iter())
            .filter(|p| after.is_none_or(|id| p.id > id))
            .take(limit(count))
            .map(summary)
            .collect()
    })
}
#[ic_cdk::query]
fn transfer_page(payout_id: u64, offset: u32, count: u16) -> Vec<quorum_accounting::Transfer> {
    state::read(|s| {
        s.payout
            .iter()
            .chain(s.completed_payouts.iter())
            .find(|p| p.id == payout_id)
            .map_or(vec![], |p| {
                p.transfers
                    .iter()
                    .skip(offset as usize)
                    .take(limit(count))
                    .cloned()
                    .collect()
            })
    })
}
#[derive(Clone, Debug, CandidType, Serialize, Deserialize)]
pub struct Health {
    pub pending_refreshes: u64,
    pub abandoned_refreshes: u64,
    pub pruned_unfinished_refreshes: u64,
    pub checkpoints: state::Checkpoints,
    pub cycles: u128,
    pub stable_snapshot_bytes: u64,
    pub stable_memory_pages: u64,
    pub jobs: Vec<state::Job>,
    pub bootstrap: state::Bootstrap,
    pub proposer: Option<u64>,
    pub staged_balance: Option<u64>,
    pub balance_observed_at: Option<u64>,
}
#[ic_cdk::query]
fn health() -> Health {
    state::read(|s| Health {
        pending_refreshes: s
            .completed_payouts
            .iter()
            .chain(s.payout.iter())
            .map(|p| p.pending_refreshes() as u64)
            .sum(),
        abandoned_refreshes: s
            .completed_payouts
            .iter()
            .chain(s.payout.iter())
            .map(|p| p.abandoned_refreshes() as u64)
            .sum(),
        pruned_unfinished_refreshes: s.pruned_unfinished_refreshes,
        checkpoints: s.metrics.clone(),
        cycles: ic_cdk::api::canister_cycle_balance(),
        stable_snapshot_bytes: state::snapshot_size(),
        stable_memory_pages: ic_cdk::stable::stable_size(),
        jobs: s.jobs.clone(),
        bootstrap: s.bootstrap.clone(),
        proposer: s.proposer,
        staged_balance: s.observed_balance,
        balance_observed_at: s.balance_observed_at,
    })
}
ic_cdk::export_candid!();
pub fn candid_interface() -> String {
    __export_service()
}

#[cfg(target_arch = "wasm32")]
#[used]
// Metadata placement only; no executable unsafe Rust.
#[allow(unsafe_code)]
#[unsafe(link_section = "icp:public candid:service")]
static CANDID_SERVICE: [u8; include_bytes!("../../../candid/d_quorum.did").len()] =
    *include_bytes!("../../../candid/d_quorum.did");
