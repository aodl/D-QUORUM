//! Test-only recording Governance and canister-origin protocol probe. Never a production dependency.
use candid::{CandidType, Deserialize, Principal};
use quorum_ic_clients::{GOVERNANCE, governance as g, ledger as l};
use std::{cell::RefCell, collections::VecDeque};
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct Fixture {
    pub neurons: Vec<g::Neuron>,
    pub known: Vec<g::KnownNeuron>,
    pub infos: Vec<g::NeuronInfo>,
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct Script {
    pub method: String,
    pub reply: Option<Vec<u8>>,
    pub reject: Option<String>,
}
thread_local! {static FIXTURE:RefCell<Fixture>=const{RefCell::new(Fixture{neurons:vec![],known:vec![],infos:vec![]})};static SCRIPTS:RefCell<VecDeque<Script>>=const{RefCell::new(VecDeque::new())};static CALLS:RefCell<Vec<String>>=const{RefCell::new(vec![])};}
#[cfg(target_arch = "wasm32")]
#[ic_cdk::init]
fn init(f: Option<Fixture>) {
    if let Some(f) = f {
        FIXTURE.with(|x| *x.borrow_mut() = f);
    }
}
#[ic_cdk::update]
fn enqueue(s: Script) {
    SCRIPTS.with(|x| x.borrow_mut().push_back(s));
}
#[ic_cdk::update]
fn replace(f: Fixture) {
    CALLS.with(|x| x.borrow_mut().push("fixture_replaced".into()));
    FIXTURE.with(|x| *x.borrow_mut() = f);
}
#[ic_cdk::query]
fn recordings() -> Vec<String> {
    CALLS.with(|x| x.borrow().clone())
}
fn reply<T: CandidType>(method: &str, value: T) {
    CALLS.with(|x| x.borrow_mut().push(method.into()));
    let script = SCRIPTS.with(|x| {
        let mut x = x.borrow_mut();
        if x.front().is_some_and(|s| s.method == method) {
            x.pop_front()
        } else {
            None
        }
    });
    if let Some(s) = script {
        if let Some(e) = s.reject {
            ic_cdk::api::msg_reject(e);
            return;
        }
        if let Some(b) = s.reply {
            ic_cdk::api::msg_reply(b);
            return;
        }
    }
    ic_cdk::api::msg_reply(candid::encode_one(value).unwrap());
}
#[ic_cdk::update(manual_reply = true)]
async fn list_known_neurons() {
    let v = FIXTURE.with(|x| g::KnownResponse {
        known_neurons: x.borrow().known.clone(),
    });
    let delay = DELAY_KNOWN.with(|c| c.replace(0));
    if delay > 0 {
        CALLS.with(|x| x.borrow_mut().push("known_delay_started".into()));
        let _ = ic_cdk::call::Call::unbounded_wait(ic_cdk::api::canister_self(), "delay_wait")
            .with_arg(delay)
            .await;
    }
    reply("list_known_neurons", v);
}
#[ic_cdk::update(manual_reply = true)]
fn get_neuron_index(r: g::IndexRequest) {
    if let Some(v) = scale_index(&r) {
        reply("get_neuron_index", Result::<_, g::GovernanceError>::Ok(v));
        return;
    }
    let v = FIXTURE.with(|x| g::IndexPage {
        neurons: x
            .borrow()
            .infos
            .iter()
            .filter(|n| {
                n.id.as_ref().unwrap().id > r.exclusive_start_neuron_id.as_ref().map_or(0, |i| i.id)
            })
            .take(r.page_size.unwrap_or(100) as usize)
            .cloned()
            .collect(),
    });
    reply("get_neuron_index", Result::<_, g::GovernanceError>::Ok(v));
}
fn omit_multi_query_metadata(r: &mut g::ListNeuronsResponse) {
    for n in &mut r.full_neurons {
        n.known_neuron_data = None;
    }
    for (_, n) in &mut r.neuron_infos {
        n.known_neuron_data = None;
    }
}
#[ic_cdk::update(manual_reply = true)]
async fn list_neurons(r: g::ListNeurons) {
    let delay = PAUSE_FULL.with(|c| {
        let mut p = c.borrow_mut();
        if p.as_ref().is_some_and(|(id, _)| r.neuron_ids.contains(id)) {
            p.take().map(|(_, d)| d).unwrap()
        } else {
            0
        }
    });
    if delay > 0 {
        CALLS.with(|c| c.borrow_mut().push("full_read_paused".into()));
        let _ = ic_cdk::call::Call::unbounded_wait(ic_cdk::api::canister_self(), "delay_wait")
            .with_arg(delay)
            .await;
    }

    if let Some(mut v) = scale_full(&r) {
        if r.neuron_ids == vec![quorum_policy_target()] {
            let delay = DELAY_TARGET.with(|c| c.replace(0));
            if delay > 0 {
                CALLS.with(|c| c.borrow_mut().push("target_read_paused".into()));
                let _ =
                    ic_cdk::call::Call::unbounded_wait(ic_cdk::api::canister_self(), "delay_wait")
                        .with_arg(delay)
                        .await;
            }
        }
        omit_multi_query_metadata(&mut v);
        reply("list_neurons", v);
        return;
    }
    let mut v = FIXTURE.with(|x| {
        let f = x.borrow();
        g::ListNeuronsResponse {
            full_neurons: f
                .neurons
                .iter()
                .filter(|n| r.neuron_ids.contains(&n.id.as_ref().unwrap().id))
                .cloned()
                .collect(),
            neuron_infos: f
                .infos
                .iter()
                .filter(|n| r.neuron_ids.contains(&n.id.as_ref().unwrap().id))
                .map(|n| {
                    let mut n = n.clone();
                    n.retrieved_at_timestamp_seconds = ic_cdk::api::time() / 1_000_000_000;
                    (n.id.as_ref().unwrap().id, n)
                })
                .collect(),
            total_pages_available: Some(1),
        }
    });
    if r.neuron_ids == vec![quorum_policy_target()] {
        let delay = DELAY_TARGET.with(|c| c.replace(0));
        if delay > 0 {
            CALLS.with(|c| c.borrow_mut().push("target_read_paused".into()));
            let _ = ic_cdk::call::Call::unbounded_wait(ic_cdk::api::canister_self(), "delay_wait")
                .with_arg(delay)
                .await;
        }
    }
    omit_multi_query_metadata(&mut v);
    reply("list_neurons", v);
}
#[ic_cdk::update(manual_reply = true)]
fn get_neuron_info(id: u64) {
    let v = FIXTURE.with(|x| {
        x.borrow()
            .infos
            .iter()
            .find(|n| n.id.as_ref().unwrap().id == id)
            .cloned()
            .ok_or(g::GovernanceError {
                error_type: 3,
                error_message: "missing".into(),
            })
    });
    reply("get_neuron_info", v);
}

#[derive(CandidType, Deserialize)]
struct MockManage {
    id: Option<g::NeuronId>,
    neuron_id_or_subaccount: Option<g::Id>,
    command: Option<MockCommand>,
}
#[derive(CandidType, Deserialize)]
enum MockCommand {
    SetFollowing(g::SetFollowing),
    ClaimOrRefresh(g::Claim),
    RefreshVotingPower(g::Empty),
    MakeProposal(g::MaturityProposal),
}
thread_local! {static PROPOSALS:RefCell<Vec<g::ProposalInfo>>=const{RefCell::new(vec![])};}
#[ic_cdk::update(manual_reply = true)]
async fn manage_neuron(r: MockManage) {
    let caller = ic_cdk::api::msg_caller();
    let proposal_call = matches!(&r.command, Some(MockCommand::MakeProposal(_)));
    let mut command = Some(g::ResponseCommand::Error(g::GovernanceError {
        error_type: 1,
        error_message: "unsupported or unavailable fixture command".into(),
    }));
    match r.command {
        Some(MockCommand::SetFollowing(f)) => {
            CALLS.with(|c| c.borrow_mut().push("set_following".into()));
            let delay = PAUSE_FOLLOW.with(|c| c.replace(0));
            if delay > 0 {
                CALLS.with(|c| c.borrow_mut().push("following_write_paused".into()));
                let _ =
                    ic_cdk::call::Call::unbounded_wait(ic_cdk::api::canister_self(), "delay_wait")
                        .with_arg(delay)
                        .await;
            }
            if SKIP_FOLLOW.with(|c| c.replace(false)) {
                ic_cdk::api::msg_reply([0, 1, 2]);
                return;
            }

            FIXTURE.with(|x| {
                let mut x = x.borrow_mut();
                if let Some(n) = x.neurons.iter_mut().find(|n| {
                    Some(g::Id::NeuronId(n.id.clone().unwrap())) == r.neuron_id_or_subaccount
                }) {
                    for item in f.topic_following.unwrap_or_default() {
                        let topic = item.topic.unwrap();
                        n.followees.retain(|(t, _)| *t != topic);
                        n.followees.push((
                            topic,
                            g::Followees {
                                followees: item.followees.unwrap_or_default(),
                            },
                        ));
                    }
                    command = Some(g::ResponseCommand::SetFollowing(g::Empty {}));
                }
            });
        }
        Some(MockCommand::RefreshVotingPower(_)) => {
            command = Some(g::ResponseCommand::RefreshVotingPower(g::Empty {}));
        }
        Some(MockCommand::ClaimOrRefresh(g::Claim {
            by: Some(g::By::MemoAndController(c)),
        })) => {
            let n = FIXTURE.with(|x| {
                x.borrow()
                    .neurons
                    .iter()
                    .find(|n| {
                        n.controller == Some(caller)
                            && c.controller == Some(caller)
                            && n.account == l::staking_subaccount(caller, c.memo)
                    })
                    .cloned()
            });
            if let Some(n) = n {
                let balance = l::balance(GOVERNANCE, Some(n.account.clone()))
                    .await
                    .unwrap();
                FIXTURE.with(|f| {
                    f.borrow_mut()
                        .neurons
                        .iter_mut()
                        .find(|x| x.id == n.id)
                        .unwrap()
                        .cached_neuron_stake_e8s = balance
                });

                command = Some(g::ResponseCommand::ClaimOrRefresh(g::ClaimResponse {
                    refreshed_neuron_id: n.id,
                }));
            }
        }
        Some(MockCommand::ClaimOrRefresh(g::Claim {
            by: Some(g::By::NeuronIdOrSubaccount(_)),
        })) => {
            let id = match &r.neuron_id_or_subaccount {
                Some(g::Id::NeuronId(id)) => id.id,
                _ => 0,
            };
            let n = FIXTURE.with(|f| {
                f.borrow()
                    .neurons
                    .iter()
                    .find(|n| n.id.as_ref().unwrap().id == id)
                    .cloned()
            });
            if let Some(n) = n {
                CALLS.with(|c| c.borrow_mut().push(format!("refresh:{}", id)));
                if let Some(script) = REJECT_REFRESH.with(|s| s.borrow().get(&id).cloned()) {
                    SCRIPTS.with(|s| s.borrow_mut().push_front(script));
                    reply(
                        "manage_neuron",
                        g::ManageResponse {
                            command: Some(g::ResponseCommand::Error(g::GovernanceError {
                                error_type: 1,
                                error_message: "persistent test refresh rejection".into(),
                            })),
                        },
                    );
                    return;
                }
                if n.controller != Some(caller) && FAIL_REFRESH.with(|c| c.replace(false)) {
                    reply(
                        "manage_neuron",
                        g::ManageResponse {
                            command: Some(g::ResponseCommand::Error(g::GovernanceError {
                                error_type: 2,
                                error_message: "scripted refresh unavailability".into(),
                            })),
                        },
                    );
                    return;
                }

                let balance = l::balance(GOVERNANCE, Some(n.account)).await.unwrap();
                FIXTURE.with(|f| {
                    f.borrow_mut()
                        .neurons
                        .iter_mut()
                        .find(|n| n.id.as_ref().unwrap().id == id)
                        .unwrap()
                        .cached_neuron_stake_e8s = balance
                });
                command = Some(g::ResponseCommand::ClaimOrRefresh(g::ClaimResponse {
                    refreshed_neuron_id: Some(g::NeuronId { id }),
                }));
            }
        }
        Some(MockCommand::MakeProposal(p)) => {
            if let Some(code) = PROPOSAL_REJECTION.with(|c| c.borrow_mut().pop_front()) {
                CALLS.with(|c| {
                    c.borrow_mut()
                        .push("proposal_rejected_before_creation".into())
                });
                reply(
                    "manage_neuron",
                    g::ManageResponse {
                        command: Some(g::ResponseCommand::Error(g::GovernanceError {
                            error_type: code,
                            error_message: "scripted pre-creation refusal".into(),
                        })),
                    },
                );
                return;
            }

            let proposer = match r.neuron_id_or_subaccount {
                Some(g::Id::NeuronId(id)) => Some(id),
                _ => r.id,
            };
            if let Some(g::MaturityAction::ManageNeuron(m)) = p.action {
                let action = g::StoredAction::ManageNeuron(g::StoredManaged {
                    id: m.id,
                    neuron_id_or_subaccount: m.neuron_id_or_subaccount,
                    command: m.command.map(|c| match c {
                        g::MaturityCommand::DisburseMaturity(d) => {
                            g::StoredCommand::DisburseMaturity(d)
                        }
                    }),
                });
                let id = PROPOSALS.with(|ps| {
                    let mut ps = ps.borrow_mut();
                    let id = ps.len() as u64 + 1;
                    ps.push(g::ProposalInfo {
                        id: Some(g::NeuronId { id }),
                        status: 1,
                        proposer,
                        proposal: Some(g::StoredProposal {
                            url: p.url,
                            title: Some(format!(
                                "Manage neuron proposal for neuron: {}",
                                quorum_policy_target()
                            )),
                            summary: p.summary,
                            action: Some(action),
                        }),
                        proposal_timestamp_seconds: ic_cdk::api::time() / 1_000_000_000,
                        executed_timestamp_seconds: 0,
                    });
                    id
                });
                CALLS.with(|x| x.borrow_mut().push("make_proposal".into()));
                command = Some(g::ResponseCommand::MakeProposal(g::ProposalResponse {
                    proposal_id: Some(g::NeuronId { id }),
                }));
            }
        }
        _ => {}
    }
    reply(
        if proposal_call {
            "make_proposal_reply"
        } else {
            "manage_neuron"
        },
        g::ManageResponse { command },
    );
}
#[ic_cdk::update]
fn get_network_economics_parameters() -> g::Economics {
    CALLS.with(|c| {
        c.borrow_mut()
            .push("get_network_economics_parameters".into())
    });
    g::Economics {
        voting_power_economics: Some(g::VotingPowerEconomics {
            start_reducing_voting_power_after_seconds: Some(15_778_800),
            clear_following_after_seconds: Some(2_629_800),
            neuron_minimum_dissolve_delay_to_vote_seconds: VOTING_MIN.with(|c| c.get()),
        }),
        neuron_minimum_stake_e8s: 100_000_000,
        neuron_management_fee_per_proposal_e8s: 10_000,
    }
}
#[ic_cdk::update]
fn list_proposals(r: g::ListProposals) -> g::Proposals {
    CALLS.with(|c| c.borrow_mut().push("list_proposals".into()));
    PROPOSALS.with(|ps| g::Proposals {
        proposal_info: ps
            .borrow()
            .iter()
            .rev()
            .filter(|p| {
                r.before_proposal
                    .as_ref()
                    .is_none_or(|before| p.id.as_ref().unwrap().id < before.id)
            })
            .take(r.limit as usize)
            .cloned()
            .collect(),
    })
}
#[ic_cdk::update]
fn get_proposal_info(id: u64) -> Option<g::ProposalInfo> {
    CALLS.with(|c| c.borrow_mut().push("get_proposal_info".into()));
    PROPOSALS.with(|ps| {
        ps.borrow()
            .iter()
            .find(|p| p.id.as_ref().unwrap().id == id)
            .cloned()
    })
}
#[derive(CandidType, Deserialize, Debug)]
pub struct ReadProbe {
    pub known_count: u64,
    pub index_ids: Vec<u64>,
    pub full_count: u64,
    pub metadata_name: Option<String>,
}
#[ic_cdk::update]
async fn read_probe(ids: Vec<u64>) -> Result<ReadProbe, String> {
    let known = g::known().await?;
    let index = g::index(None).await?;
    let full = g::full(ids.clone()).await?;
    let metadata = if let Some(id) = ids.first() {
        g::info(*id).await?.known_neuron_data.map(|m| m.name)
    } else {
        None
    };
    Ok(ReadProbe {
        known_count: known.len() as u64,
        index_ids: index.iter().map(|n| n.id.as_ref().unwrap().id).collect(),
        full_count: full.full_neurons.len() as u64,
        metadata_name: metadata,
    })
}
#[ic_cdk::update]
async fn full_probe(ids: Vec<u64>) -> Result<u64, String> {
    Ok(g::full(ids).await?.full_neurons.len() as u64)
}
#[ic_cdk::update]
async fn maturity_barrier_probe(id: u64) -> Result<(), String> {
    g::maturity_finalization_barrier(id).await
}
#[ic_cdk::update]
async fn refresh_probe(id: u64) -> Result<g::ResponseCommand, String> {
    g::manage(g::request(
        id,
        g::Command::ClaimOrRefresh(g::Claim {
            by: Some(g::By::NeuronIdOrSubaccount(g::Empty {})),
        }),
    ))
    .await
}
#[ic_cdk::update]
async fn follow_probe(args: (u64, i32, Vec<u64>)) -> Result<(), String> {
    let (id, topic, ids) = args;
    let r = g::manage(g::request(
        id,
        g::Command::SetFollowing(g::SetFollowing {
            topic_following: Some(vec![g::Following {
                topic: Some(topic),
                followees: Some(ids.into_iter().map(|id| g::NeuronId { id }).collect()),
            }]),
        }),
    ))
    .await?;
    match r {
        g::ResponseCommand::SetFollowing(_) => Ok(()),
        _ => Err("unexpected response".into()),
    }
}
#[derive(CandidType)]
struct Direct {
    id: Option<g::NeuronId>,
    neuron_id_or_subaccount: Option<g::Id>,
    command: Option<DirectCommand>,
}
#[derive(CandidType)]
enum DirectCommand {
    DisburseMaturity(g::DisburseMaturity),
}
#[ic_cdk::update]
async fn direct_maturity_probe(id: u64) -> Result<String, String> {
    let r = ic_cdk::call::Call::bounded_wait(GOVERNANCE, "manage_neuron")
        .with_arg(Direct {
            id: None,
            neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id })),
            command: Some(DirectCommand::DisburseMaturity(g::DisburseMaturity {
                percentage_to_disburse: 100,
                to_account: Some(g::Account {
                    owner: Some(ic_cdk::api::canister_self()),
                    subaccount: None,
                }),
                to_account_identifier: None,
            })),
        })
        .await
        .map_err(|e| e.to_string())?;
    let result = r.candid::<g::ManageResponse>().map_err(|e| e.to_string())?;
    Ok(format!("{:?}", result.command))
}
#[ic_cdk::update]
async fn proposal_result_probe(
    args: (u64, g::MaturityProposal),
) -> Result<g::ResponseCommand, String> {
    g::propose(args.0, args.1).await
}
#[ic_cdk::update]
async fn proposal_probe(args: (u64, g::MaturityProposal)) -> Result<u64, String> {
    match g::propose(args.0, args.1).await? {
        g::ResponseCommand::MakeProposal(p) => Ok(p.proposal_id.ok_or("missing proposal ID")?.id),
        g::ResponseCommand::Error(e) => Err(e.error_message),
        _ => Err("unexpected proposal response".into()),
    }
}
#[ic_cdk::update]
async fn ledger_probe(t: l::TransferArg) -> Result<Result<u64, String>, String> {
    Ok(l::transfer(t).await?.map_err(|e| format!("{e:?}")))
}
#[ic_cdk::update]
async fn history_probe(args: (u64, u64)) -> Result<u64, String> {
    let h = l::history(args.0, args.1).await?;
    if let Some(a) = h.archived_blocks.first() {
        return Ok(l::archive(a, a.start, a.length.min(100)).await?.len() as u64);
    }
    Ok(h.blocks.len() as u64)
}
#[ic_cdk::update]
async fn evaluate_probe(id: u64) -> Result<dendrite_types::ComplianceReport, String> {
    let mut c = quorum_ic_clients::evidence::Collection::new(id);
    for _ in 0..2000 {
        if let Some(r) = c.advance().await? {
            return Ok(r);
        }
    }
    Err("collector step bound".into())
}

thread_local! {static SCALE_COUNT:std::cell::Cell<u64>=const{std::cell::Cell::new(0)};}
#[ic_cdk::update]
fn scale_init(count: u64) {
    assert!(count <= 1_000_000);
    SCALE_COUNT.with(|c| c.set(count));
}
fn scale_neuron(id: u64) -> g::Neuron {
    let at = ic_cdk::api::time() / 1_000_000_000;
    g::Neuron {
        id: Some(g::NeuronId { id }),
        account: vec![1; 32],
        controller: Some(Principal::anonymous()),
        not_for_profit: false,
        maturity_e8s_equivalent: 0,
        cached_neuron_stake_e8s: 1_000_000_000,
        created_timestamp_seconds: at - 100,
        auto_stake_maturity: None,
        aging_since_timestamp_seconds: at - 100,
        hot_keys: vec![],
        dissolve_state: Some(g::DissolveState::DissolveDelaySeconds(63_115_200)),
        followees: vec![(
            4,
            g::Followees {
                followees: vec![g::NeuronId {
                    id: FIXTURE.with(|f| {
                        if f.borrow().known.is_empty() {
                            2_000_000
                        } else {
                            100
                        }
                    }),
                }],
            },
        )],
        neuron_fees_e8s: 0,
        visibility: Some(2),
        known_neuron_data: None,
        voting_power_refreshed_timestamp_seconds: Some(at),
        deciding_voting_power: Some(u64::MAX),
        potential_voting_power: Some(u64::MAX),
        staked_maturity_e8s_equivalent: None,
        maturity_disbursements_in_progress: None,
    }
}
fn scale_info(id: u64) -> g::NeuronInfo {
    g::NeuronInfo {
        id: Some(g::NeuronId { id }),
        retrieved_at_timestamp_seconds: ic_cdk::api::time() / 1_000_000_000,
        known_neuron_data: None,
        visibility: Some(2),
    }
}
fn scale_index(r: &g::IndexRequest) -> Option<g::IndexPage> {
    SCALE_COUNT.with(|c| {
        let count = c.get();
        if count == 0 {
            return None;
        }
        let after = r.exclusive_start_neuron_id.as_ref().map_or(0, |n| n.id);
        let start = 1_000_000.max(after + 1);
        let mut neurons: Vec<_> = (start..1_000_000 + count)
            .take(r.page_size.unwrap_or(100) as usize)
            .map(scale_info)
            .collect();
        FIXTURE.with(|f| {
            neurons.extend(
                f.borrow()
                    .infos
                    .iter()
                    .filter(|n| n.id.as_ref().unwrap().id > after)
                    .cloned(),
            )
        });
        neurons.sort_by_key(|n| n.id.as_ref().unwrap().id);
        neurons.truncate(r.page_size.unwrap_or(100) as usize);
        Some(g::IndexPage { neurons })
    })
}
fn scale_full(r: &g::ListNeurons) -> Option<g::ListNeuronsResponse> {
    SCALE_COUNT.with(|c| {
        let count = c.get();
        if count == 0 {
            return None;
        }
        let ids: Vec<_> = r
            .neuron_ids
            .iter()
            .copied()
            .filter(|id| (1_000_000..1_000_000 + count).contains(id))
            .collect();
        let mut neuron_infos: Vec<_> = ids.iter().map(|id| (*id, scale_info(*id))).collect();
        let mut full_neurons: Vec<_> = ids.into_iter().map(scale_neuron).collect();
        FIXTURE.with(|f| {
            let f = f.borrow();
            full_neurons.extend(
                f.neurons
                    .iter()
                    .filter(|n| r.neuron_ids.contains(&n.id.as_ref().unwrap().id))
                    .cloned(),
            );
            neuron_infos.extend(
                f.infos
                    .iter()
                    .filter(|n| r.neuron_ids.contains(&n.id.as_ref().unwrap().id))
                    .map(|n| {
                        let mut n = n.clone();
                        n.retrieved_at_timestamp_seconds = ic_cdk::api::time() / 1_000_000_000;
                        (n.id.as_ref().unwrap().id, n)
                    }),
            );
        });
        Some(g::ListNeuronsResponse {
            neuron_infos,
            full_neurons,
            total_pages_available: Some(1),
        })
    })
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub enum LedgerFault {
    LoseReplyWithoutCommit,
    LoseReplyAfterCommit,
    BadFee(u64),
    Unavailable,
    InsufficientFunds,
    LagHistory,
}
#[derive(Default)]
struct LedgerModel {
    balance_calls: u64,
    fee_calls: u64,
    history_calls: u64,
    transfer_calls: u64,
    staking_funding: u64,
    recipients: std::collections::BTreeMap<Vec<u8>, u64>,
    balance: u64,
    fee: u64,
    blocks: Vec<l::Block>,
    faults: VecDeque<LedgerFault>,
}
thread_local! {static LEDGER_MODEL:RefCell<LedgerModel>=RefCell::new(LedgerModel::default());}
#[ic_cdk::update]
fn ledger_init(balance: u64) {
    LEDGER_MODEL.with(|m| {
        let mut m = m.borrow_mut();
        m.balance = balance;
        m.fee = 10_000;
    });
}
#[ic_cdk::update]
fn ledger_staking_fund(amount: u64) {
    LEDGER_MODEL.with(|m| m.borrow_mut().staking_funding = amount);
}
#[ic_cdk::update]
fn ledger_deposit(amount: u64) {
    LEDGER_MODEL.with(|m| m.borrow_mut().balance += amount);
}
#[ic_cdk::update]
fn ledger_fault(f: LedgerFault) {
    LEDGER_MODEL.with(|m| m.borrow_mut().faults.push_back(f));
}
#[derive(CandidType, Deserialize, Debug)]
pub struct LedgerStats {
    pub balance_calls: u64,
    pub fee_calls: u64,
    pub history_calls: u64,
    pub transfer_calls: u64,
    pub balance: u64,
    pub fee: u64,
    pub blocks: u64,
}
#[ic_cdk::query]
fn ledger_stats() -> LedgerStats {
    LEDGER_MODEL.with(|m| {
        let m = m.borrow();
        LedgerStats {
            balance_calls: m.balance_calls,
            fee_calls: m.fee_calls,
            history_calls: m.history_calls,
            transfer_calls: m.transfer_calls,
            balance: m.balance,
            fee: m.fee,
            blocks: m.blocks.len() as u64,
        }
    })
}
#[ic_cdk::update]
fn icrc1_balance_of(a: l::Account) -> candid::Nat {
    LEDGER_MODEL.with(|m| {
        let mut m = m.borrow_mut();
        m.balance_calls += 1;
        match a.subaccount {
            Some(subaccount) => m
                .recipients
                .get(&subaccount)
                .copied()
                .unwrap_or(m.staking_funding)
                .into(),
            None => m.balance.into(),
        }
    })
}
#[ic_cdk::update]
fn icrc1_fee() -> candid::Nat {
    LEDGER_MODEL.with(|m| {
        let mut m = m.borrow_mut();
        m.fee_calls += 1;
        m.fee.into()
    })
}
#[ic_cdk::update(manual_reply = true)]
fn icrc1_transfer(arg: l::TransferArg) {
    let caller = ic_cdk::api::msg_caller();
    let at = ic_cdk::api::time();
    let (result, lost) = LEDGER_MODEL.with(|m| {
        let mut m = m.borrow_mut();
        m.transfer_calls += 1;
        let timestamp = arg.created_at_time.unwrap_or(at);
        let fee = l::nat(arg.fee.clone().unwrap_or_else(|| m.fee.into())).unwrap();
        let amount = l::nat(arg.amount.clone()).unwrap();
        if let Some((i, _)) = m.blocks.iter().enumerate().find(|(_, b)| {
            arg.to.owner == GOVERNANCE
                && arg.to.subaccount.as_ref().is_some_and(|sub| {
                    l::matches(
                        b,
                        caller,
                        sub,
                        amount,
                        fee,
                        arg.memo.as_deref().unwrap_or(&[]),
                        timestamp,
                    )
                })
        }) {
            return (
                Err(l::TransferError::Duplicate {
                    duplicate_of: (i as u64).into(),
                }),
                false,
            );
        }
        if at.saturating_sub(timestamp) > 24 * 60 * 60 * 1_000_000_000 {
            return (Err(l::TransferError::TooOld), false);
        }
        let fault = m.faults.pop_front();
        match fault {
            Some(LedgerFault::LoseReplyWithoutCommit) => {
                return (Err(l::TransferError::TemporarilyUnavailable), true);
            }
            Some(LedgerFault::BadFee(expected)) => {
                m.fee = expected;
                return (
                    Err(l::TransferError::BadFee {
                        expected_fee: expected.into(),
                    }),
                    false,
                );
            }
            Some(LedgerFault::Unavailable) => {
                return (Err(l::TransferError::TemporarilyUnavailable), false);
            }
            Some(LedgerFault::InsufficientFunds) => {
                return (
                    Err(l::TransferError::InsufficientFunds {
                        balance: m.balance.into(),
                    }),
                    false,
                );
            }
            _ => {}
        }
        if fee != m.fee {
            return (
                Err(l::TransferError::BadFee {
                    expected_fee: m.fee.into(),
                }),
                false,
            );
        }
        if amount.checked_add(fee).is_none_or(|cost| cost > m.balance) {
            return (
                Err(l::TransferError::InsufficientFunds {
                    balance: m.balance.into(),
                }),
                false,
            );
        }
        m.balance -= amount + fee;
        if let Some(sub) = &arg.to.subaccount {
            let balance = m.recipients.entry(sub.clone()).or_insert(1_000_000_000);
            *balance += amount;
        }

        let block = m.blocks.len() as u64;
        m.blocks.push(l::Block {
            transaction: l::Transaction {
                memo: 0,
                icrc1_memo: arg.memo,
                created_at_time: l::Timestamp {
                    timestamp_nanos: timestamp,
                },
                operation: Some(l::Operation::Transfer {
                    from: l::account_id(caller, None),
                    to: l::account_id(arg.to.owner, arg.to.subaccount.as_deref()),
                    amount: l::Tokens { e8s: amount },
                    fee: l::Tokens { e8s: fee },
                    spender: None,
                }),
            },
            timestamp: l::Timestamp {
                timestamp_nanos: at,
            },
        });
        (
            Ok(block),
            matches!(fault, Some(LedgerFault::LoseReplyAfterCommit)),
        )
    });
    if lost {
        ic_cdk::api::msg_reply([0, 1, 2]);
    } else {
        reply("icrc1_transfer", result.map(candid::Nat::from));
    }
}
#[ic_cdk::update]
fn query_blocks(arg: l::BlocksArgs) -> l::History {
    LEDGER_MODEL.with(|m| {
        let mut m = m.borrow_mut();
        m.history_calls += 1;
        if matches!(m.faults.front(), Some(LedgerFault::LagHistory)) {
            m.faults.pop_front();
            return l::History {
                chain_length: 0,
                first_block_index: 0,
                blocks: vec![],
                archived_blocks: vec![],
            };
        }
        l::History {
            chain_length: m.blocks.len() as u64,
            first_block_index: arg.start,
            blocks: m
                .blocks
                .iter()
                .skip(arg.start as usize)
                .take(arg.length as usize)
                .cloned()
                .collect(),
            archived_blocks: vec![],
        }
    })
}

thread_local! {static DELAY_KNOWN:std::cell::Cell<u32>=const{std::cell::Cell::new(0)};}
#[ic_cdk::update]
fn delay_known_once(seconds: u32) {
    assert!(seconds <= 3600);
    DELAY_KNOWN.with(|c| c.set(seconds));
}
#[ic_cdk::update]
async fn delay_wait(seconds: u32) {
    let until = ic_cdk::api::time() + u64::from(seconds) * 1_000_000_000;
    // raw_rand crosses a round boundary; a self-call chain can finish in one round.
    // This is a fault fixture, never a production scheduling mechanism.
    while ic_cdk::api::time() < until {
        let _ = ic_cdk::call::Call::unbounded_wait(Principal::management_canister(), "raw_rand")
            .with_args(&())
            .await;
    }
}
#[ic_cdk::update]
fn proposal_status(args: (u64, i32)) {
    assert!((1..=5).contains(&args.1));
    PROPOSALS.with(|ps| {
        let mut ps = ps.borrow_mut();
        let p = ps
            .iter_mut()
            .find(|p| p.id.as_ref().unwrap().id == args.0)
            .unwrap();
        p.status = args.1;
        if args.1 == 4 {
            p.executed_timestamp_seconds = ic_cdk::api::time() / 1_000_000_000;
        }
    });
}

fn quorum_policy_target() -> u64 {
    4_713_806_069_430_754_115
}
thread_local! {
 static DELAY_TARGET:std::cell::Cell<u32>=const{std::cell::Cell::new(0)};
 static SKIP_FOLLOW:std::cell::Cell<bool>=const{std::cell::Cell::new(false)};
 static VOTING_MIN:std::cell::Cell<Option<u64>>=const{std::cell::Cell::new(Some(1_209_600))};
 static PROPOSAL_REJECTION:RefCell<VecDeque<i32>>=const{RefCell::new(VecDeque::new())};
}
#[ic_cdk::update]
fn pause_target_once(seconds: u32) {
    DELAY_TARGET.with(|c| c.set(seconds));
}
#[ic_cdk::update]
fn skip_follow_once() {
    SKIP_FOLLOW.with(|c| c.set(true));
}
#[ic_cdk::update]
fn voting_minimum(value: Option<u64>) {
    VOTING_MIN.with(|c| c.set(value));
}
#[ic_cdk::update]
fn reject_proposal_once(code: i32) {
    PROPOSAL_REJECTION.with(|c| c.borrow_mut().push_back(code));
}

thread_local! {static PAUSE_FULL:RefCell<Option<(u64,u32)>>=const{RefCell::new(None)};}
#[ic_cdk::update]
fn pause_full_once(arg: (u64, u32)) {
    PAUSE_FULL.with(|c| *c.borrow_mut() = Some(arg));
}
#[ic_cdk::update]
fn ledger_fee(value: u64) {
    LEDGER_MODEL.with(|m| m.borrow_mut().fee = value);
}

thread_local! {static FAIL_REFRESH:std::cell::Cell<bool>=const{std::cell::Cell::new(false)};}
#[ic_cdk::update]
fn fail_recipient_refresh_once() {
    FAIL_REFRESH.with(|c| c.set(true));
}

#[derive(Clone, Debug, CandidType, Deserialize)]
pub struct EligibilityRead {
    pub context: g::VotingContext,
    pub observations: Vec<(u64, u64, bool)>,
}
#[ic_cdk::update]
async fn eligibility_probe(ids: Vec<u64>) -> Result<EligibilityRead, String> {
    let context = g::voting_context().await?;
    let ns = g::full(ids).await?;
    let mut observations = vec![];
    for n in ns.full_neurons {
        let id = n.id.as_ref().unwrap().id;
        let at = ns
            .neuron_infos
            .iter()
            .find(|(i, _)| *i == id)
            .unwrap()
            .1
            .retrieved_at_timestamp_seconds;
        observations.push((
            id,
            n.deciding_voting_power.unwrap(),
            context.eligible(&n, at)?,
        ));
    }
    Ok(EligibilityRead {
        context,
        observations,
    })
}
#[derive(CandidType)]
struct MotionRequest {
    id: Option<g::NeuronId>,
    neuron_id_or_subaccount: Option<g::Id>,
    command: Option<MotionCommand>,
}
#[derive(CandidType)]
enum MotionCommand {
    MakeProposal(MotionProposal),
}
#[derive(CandidType)]
struct MotionProposal {
    url: String,
    title: Option<String>,
    summary: String,
    action: Option<MotionAction>,
}
#[derive(CandidType)]
enum MotionAction {
    Motion(Motion),
}
#[derive(CandidType)]
struct Motion {
    motion_text: String,
}
#[ic_cdk::update]
async fn motion_probe(id: u64) -> Result<u64, String> {
    let r: g::ManageResponse = ic_cdk::call::Call::bounded_wait(GOVERNANCE, "manage_neuron")
        .with_arg(MotionRequest {
            id: None,
            neuron_id_or_subaccount: Some(g::Id::NeuronId(g::NeuronId { id })),
            command: Some(MotionCommand::MakeProposal(MotionProposal {
                url: "https://forum.dfinity.org".into(),
                title: Some("Local voting eligibility proof".into()),
                summary: "Local protocol fixture".into(),
                action: Some(MotionAction::Motion(Motion {
                    motion_text: "Local protocol test".into(),
                })),
            })),
        })
        .await
        .map_err(|e| e.to_string())?
        .candid()
        .map_err(|e| e.to_string())?;
    match r.command {
        Some(g::ResponseCommand::MakeProposal(p)) => p
            .proposal_id
            .map(|n| n.id)
            .ok_or("missing proposal ID".into()),
        x => Err(format!("{x:?}")),
    }
}
#[derive(CandidType, Deserialize)]
struct Ballot {
    vote: i32,
    voting_power: u64,
}
#[derive(CandidType, Deserialize)]
struct BallotInfo {
    ballots: Vec<(u64, Ballot)>,
}
#[ic_cdk::update]
async fn ballot_probe(id: u64) -> Result<Vec<u64>, String> {
    let r: Option<BallotInfo> = ic_cdk::call::Call::bounded_wait(GOVERNANCE, "get_proposal_info")
        .with_arg(id)
        .await
        .map_err(|e| e.to_string())?
        .candid()
        .map_err(|e| e.to_string())?;
    Ok(r.ok_or("proposal missing")?
        .ballots
        .into_iter()
        .map(|(id, _)| id)
        .collect())
}

thread_local! {static PAUSE_FOLLOW:std::cell::Cell<u32>=const{std::cell::Cell::new(0)};}
#[ic_cdk::update]
fn pause_follow_once(seconds: u32) {
    PAUSE_FOLLOW.with(|c| c.set(seconds));
}

thread_local! {static REJECT_REFRESH: RefCell<std::collections::BTreeMap<u64, Script>> = const { RefCell::new(std::collections::BTreeMap::new()) };}
#[ic_cdk::update]
fn reject_refresh_for(id: Option<u64>) {
    REJECT_REFRESH.with(|s| {
        if let Some(id) = id {
            s.borrow_mut().insert(
                id,
                Script {
                    method: "manage_neuron".into(),
                    reply: Some(
                        candid::encode_one(g::ManageResponse {
                            command: Some(g::ResponseCommand::Error(g::GovernanceError {
                                error_type: 1,
                                error_message: "persistent test refresh rejection".into(),
                            })),
                        })
                        .unwrap(),
                    ),
                    reject: None,
                },
            );
        } else {
            s.borrow_mut().clear();
        }
    });
}
#[ic_cdk::update]
fn refresh_reply_for(arg: (u64, Script)) {
    assert_eq!(arg.1.method, "manage_neuron");
    REJECT_REFRESH.with(|s| s.borrow_mut().insert(arg.0, arg.1));
}
#[ic_cdk::update]
fn hide_neuron(arg: (u64, bool)) {
    FIXTURE.with(|f| {
        let mut f = f.borrow_mut();
        if arg.1 {
            f.neurons.retain(|n| n.id.as_ref().unwrap().id != arg.0);
            f.infos.retain(|n| n.id.as_ref().unwrap().id != arg.0);
            f.known.retain(|n| n.id.as_ref().unwrap().id != arg.0);
        } else {
            if let Some(n) = f
                .neurons
                .iter_mut()
                .find(|n| n.id.as_ref().unwrap().id == arg.0)
            {
                n.visibility = Some(1);
            }
            if let Some(n) = f
                .infos
                .iter_mut()
                .find(|n| n.id.as_ref().unwrap().id == arg.0)
            {
                n.visibility = Some(1);
            }
        }
    });
}
#[ic_cdk::update]
fn ledger_mint(arg: (Principal, u64)) {
    LEDGER_MODEL.with(|m| {
        let mut m = m.borrow_mut();
        m.balance += arg.1;
        let at = ic_cdk::api::time();
        m.blocks.push(l::Block {
            timestamp: l::Timestamp {
                timestamp_nanos: at,
            },
            transaction: l::Transaction {
                memo: 123,
                icrc1_memo: None,
                created_at_time: l::Timestamp {
                    timestamp_nanos: at,
                },
                operation: Some(l::Operation::Mint {
                    to: l::account_id(arg.0, None),
                    amount: l::Tokens { e8s: arg.1 },
                }),
            },
        });
    });
}

#[ic_cdk::update]
fn maturity_progress(progress: Option<Vec<g::MaturityDisbursement>>) {
    FIXTURE.with(|f| {
        f.borrow_mut()
            .neurons
            .iter_mut()
            .find(|n| n.id.as_ref().unwrap().id == quorum_policy_target())
            .unwrap()
            .maturity_disbursements_in_progress = progress;
    });
}
#[ic_cdk::update]
fn prune_proposals() {
    PROPOSALS.with(|ps| ps.borrow_mut().clear());
}

#[ic_cdk::update]
fn ledger_restore_history(blocks: Vec<l::Block>) {
    // Only the isolated recording fixture exposes restore; no production endpoint.
    LEDGER_MODEL.with(|m| {
        assert!(m.borrow().blocks.is_empty());
        m.borrow_mut().blocks = blocks;
    });
}
