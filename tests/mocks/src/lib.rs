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
        let _ = ic_cdk::call::Call::unbounded_wait(ic_cdk::api::canister_self(), "delay_hops")
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
#[ic_cdk::update(manual_reply = true)]
fn list_neurons(r: g::ListNeurons) {
    if let Some(v) = scale_full(&r) {
        reply("list_neurons", v);
        return;
    }
    let v = FIXTURE.with(|x| {
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
                .map(|n| (n.id.as_ref().unwrap().id, n.clone()))
                .collect(),
            total_pages_available: Some(1),
        }
    });
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
fn manage_neuron(r: MockManage) {
    let caller = ic_cdk::api::msg_caller();
    let mut command = Some(g::ResponseCommand::Error(g::GovernanceError {
        error_type: 1,
        error_message: "unsupported or unavailable fixture command".into(),
    }));
    match r.command {
        Some(MockCommand::SetFollowing(f)) => {
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
                command = Some(g::ResponseCommand::ClaimOrRefresh(g::ClaimResponse {
                    refreshed_neuron_id: n.id,
                }));
            }
        }
        Some(MockCommand::MakeProposal(p)) => {
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
                            title: p.title,
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
    reply("manage_neuron", g::ManageResponse { command });
}
#[ic_cdk::update]
fn get_network_economics_parameters() -> g::Economics {
    g::Economics {
        neuron_minimum_stake_e8s: 100_000_000,
        neuron_management_fee_per_proposal_e8s: 10_000,
    }
}
#[ic_cdk::update]
fn list_proposals(r: g::ListProposals) -> g::Proposals {
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
                followees: vec![g::NeuronId { id: 2_000_000 }],
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
        let start = r.exclusive_start_neuron_id.as_ref().map_or(1, |n| n.id + 1);
        Some(g::IndexPage {
            neurons: (start..=count)
                .take(r.page_size.unwrap_or(100) as usize)
                .map(scale_info)
                .collect(),
        })
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
            .filter(|id| *id <= count)
            .collect();
        Some(g::ListNeuronsResponse {
            neuron_infos: ids.iter().map(|id| (*id, scale_info(*id))).collect(),
            full_neurons: ids.into_iter().map(scale_neuron).collect(),
            total_pages_available: Some(1),
        })
    })
}
#[derive(Clone, Debug, CandidType, Deserialize)]
pub enum LedgerFault {
    LoseReplyAfterCommit,
    BadFee(u64),
    Unavailable,
    InsufficientFunds,
    LagHistory,
}
#[derive(Default)]
struct LedgerModel {
    staking_funding: u64,
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
    pub balance: u64,
    pub fee: u64,
    pub blocks: u64,
}
#[ic_cdk::query]
fn ledger_stats() -> LedgerStats {
    LEDGER_MODEL.with(|m| {
        let m = m.borrow();
        LedgerStats {
            balance: m.balance,
            fee: m.fee,
            blocks: m.blocks.len() as u64,
        }
    })
}
#[ic_cdk::update]
fn icrc1_balance_of(a: l::Account) -> candid::Nat {
    LEDGER_MODEL.with(|m| {
        if a.subaccount.is_none() {
            m.borrow().balance.into()
        } else {
            m.borrow().staking_funding.into()
        }
    })
}
#[ic_cdk::update]
fn icrc1_fee() -> candid::Nat {
    LEDGER_MODEL.with(|m| m.borrow().fee.into())
}
#[ic_cdk::update(manual_reply = true)]
fn icrc1_transfer(arg: l::TransferArg) {
    let caller = ic_cdk::api::msg_caller();
    let at = ic_cdk::api::time();
    let (result, lost) = LEDGER_MODEL.with(|m| {
        let mut m = m.borrow_mut();
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
fn delay_known_once(hops: u32) {
    assert!(hops <= 32);
    DELAY_KNOWN.with(|c| c.set(hops));
}
#[ic_cdk::update]
async fn delay_hops(hops: u32) {
    if hops > 0 {
        let _ = ic_cdk::call::Call::unbounded_wait(ic_cdk::api::canister_self(), "delay_hops")
            .with_arg(hops - 1)
            .await;
    }
}
#[ic_cdk::update]
fn proposal_status(args: (u64, i32)) {
    assert!((1..=5).contains(&args.1));
    PROPOSALS.with(|ps| {
        let mut ps = ps.borrow_mut();
        ps.iter_mut()
            .find(|p| p.id.as_ref().unwrap().id == args.0)
            .unwrap()
            .status = args.1;
    });
}
