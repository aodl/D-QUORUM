#![allow(dead_code)]
use candid::{CandidType, Deserialize, Empty, Principal, decode_one, encode_one};
use pocket_ic::common::rest::{IcpFeatures, IcpFeaturesConfig};
use pocket_ic::{PocketIc, PocketIcBuilder};
use quorum_ic_clients::{GOVERNANCE, LEDGER, governance as g, ledger as l};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::PathBuf, time::Duration};
pub fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
pub fn wasm(name: &str) -> Vec<u8> {
    if name == "d_quorum"
        && let Ok(path) = std::env::var("D_QUORUM_TEST_WASM")
    {
        return fs::read(path).expect("explicit production candidate Wasm required");
    }
    fs::read(root().join(format!("target/wasm32-unknown-unknown/release/{name}.wasm")))
        .expect("prepare Wasm with xtask before starting PocketIC")
}
pub fn dendrite_wasm() -> Vec<u8> {
    let path = std::env::var("DENDRITE_TEST_WASM")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            root().join("dendrite/target/wasm32-unknown-unknown/release/dendrite.wasm")
        });
    fs::read(path).expect("prepare the independent Dendrite artifact before creating a fixture")
}
pub fn artifact(name: &str) -> Vec<u8> {
    if std::env::var("DENDRITE_PROTOCOL_PROFILE").as_deref() == Ok("reviewed-mainnet") {
        let reviewed: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(
                root().join("dendrite/src/declarations/bootstrap/protocol-mainnet.json"),
            )
            .unwrap(),
        )
        .unwrap();
        if let Some(entry) = reviewed["modules"]
            .as_object()
            .unwrap()
            .values()
            .find(|entry| entry["artifact"] == name)
        {
            let bytes = fs::read(root().join(format!(".cache/protocol-mainnet/{name}.wasm.gz")))
                .expect("download and verify the reviewed mainnet executable first");
            assert_eq!(
                hex::encode(Sha256::digest(&bytes)),
                entry["installed_gzip_sha256"].as_str().unwrap()
            );
            let mut raw = vec![];
            flate2::read::GzDecoder::new(bytes.as_slice())
                .read_to_end(&mut raw)
                .unwrap();
            assert_eq!(
                hex::encode(Sha256::digest(&raw)),
                entry["wasm_sha256"].as_str().unwrap()
            );
            return bytes;
        }
    } else {
        assert!(
            std::env::var("DENDRITE_PROTOCOL_PROFILE").is_err(),
            "unknown protocol profile"
        );
    }
    let pins: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(root().join("protocol-pins.json")).unwrap())
            .unwrap();
    let entry = pins["artifacts"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == format!("{name}.wasm.gz"))
        .unwrap();
    let bytes = fs::read(root().join(format!(".cache/protocol/{name}.wasm.gz")))
        .expect("pinned protocol artifact required");
    assert_eq!(
        hex::encode(Sha256::digest(&bytes)),
        entry["sha256"].as_str().unwrap()
    );
    let mut raw = vec![];
    flate2::read::GzDecoder::new(bytes.as_slice())
        .read_to_end(&mut raw)
        .unwrap();
    assert_eq!(
        hex::encode(Sha256::digest(&raw)),
        entry["wasm_sha256"].as_str().unwrap()
    );
    raw
}
pub fn builder() -> PocketIcBuilder {
    let bin = root().join(".cache/tools/pocket-ic");
    let bytes = fs::read(&bin).unwrap();
    assert_eq!(
        hex::encode(Sha256::digest(&bytes)),
        "29472ea4433b30a280676c4e22e369d79d5ba6ee1b4d48bab32ebe7d0ad2b4bb"
    );
    let builder = PocketIcBuilder::new().with_server_binary(bin);
    let builder = if let Ok(url) = std::env::var("D_QUORUM_POCKET_IC_URL") {
        assert!(
            url.starts_with("http://127.0.0.1:"),
            "only a local fixture server is permitted"
        );
        builder.with_server_url(url.parse().unwrap())
    } else {
        builder
    };
    builder
        .with_nns_subnet()
        .with_application_subnet()
        .with_initial_time(pocket_ic::Time::from_nanos_since_unix_epoch(
            1_800_000_000_000_000_000,
        ))
}
pub fn update<A: CandidType, R: CandidType + for<'de> Deserialize<'de>>(
    pic: &PocketIc,
    id: Principal,
    caller: Principal,
    method: &str,
    arg: A,
) -> R {
    let b = pic
        .update_call(id, caller, method, encode_one(arg).unwrap())
        .unwrap_or_else(|e| panic!("{method}: {e:?}"));
    decode_one(&b).unwrap_or_else(|e| panic!("{method}: {e}"))
}
pub fn query<A: CandidType, R: CandidType + for<'de> Deserialize<'de>>(
    pic: &PocketIc,
    id: Principal,
    method: &str,
    arg: A,
) -> R {
    let b = pic
        .query_call(id, Principal::anonymous(), method, encode_one(arg).unwrap())
        .unwrap_or_else(|e| panic!("{method}: {e:?}"));
    decode_one(&b).unwrap()
}
pub fn query_empty<R: CandidType + for<'de> Deserialize<'de>>(
    pic: &PocketIc,
    id: Principal,
    method: &str,
) -> R {
    let b = pic
        .query_call(
            id,
            Principal::anonymous(),
            method,
            candid::encode_args(()).unwrap(),
        )
        .unwrap_or_else(|e| panic!("{method}: {e:?}"));
    decode_one(&b).unwrap()
}
pub fn install_probe(pic: &PocketIc, bytes: Vec<u8>) -> Principal {
    let p = pic.create_canister();
    pic.add_cycles(p, 100_000_000_000_000);
    pic.install_canister(
        p,
        bytes,
        encode_one(None::<quorum_mocks::Fixture>).unwrap(),
        None,
    );
    p
}
pub fn drive(pic: &PocketIc, seconds: u64) {
    pic.advance_time(Duration::from_secs(seconds));
    for _ in 0..8 {
        pic.tick();
    }
}
pub fn user(x: u8) -> Principal {
    Principal::self_authenticating([x; 32])
}
pub fn now(pic: &PocketIc) -> u64 {
    pic.get_time().as_nanos_since_unix_epoch() / 1_000_000_000
}
#[derive(CandidType)]
pub struct SeedNeuron {
    pub id: Option<g::NeuronId>,
    pub controller: Option<Principal>,
    pub recent_ballots: Vec<Empty>,
    pub kyc_verified: bool,
    pub not_for_profit: bool,
    pub maturity_e8s_equivalent: u64,
    pub cached_neuron_stake_e8s: u64,
    pub created_timestamp_seconds: u64,
    pub aging_since_timestamp_seconds: u64,
    pub hot_keys: Vec<Principal>,
    pub account: Vec<u8>,
    pub dissolve_state: Option<g::DissolveState>,
    pub followees: Vec<(i32, g::Followees)>,
    pub neuron_fees_e8s: u64,
    pub visibility: Option<i32>,
    pub known_neuron_data: Option<g::KnownNeuronData>,
    pub voting_power_refreshed_timestamp_seconds: Option<u64>,
}
pub fn seed(id: u64, controller: Principal, at: u64) -> SeedNeuron {
    SeedNeuron {
        id: Some(g::NeuronId { id }),
        controller: Some(controller),
        recent_ballots: vec![],
        kyc_verified: true,
        not_for_profit: false,
        maturity_e8s_equivalent: 0,
        cached_neuron_stake_e8s: 10_000_000_000,
        created_timestamp_seconds: at - 1000,
        aging_since_timestamp_seconds: at - 1000,
        hot_keys: vec![],
        account: Sha256::digest(id.to_be_bytes()).to_vec(),
        dissolve_state: Some(g::DissolveState::DissolveDelaySeconds(
            dendrite_types::MAX_DISSOLVE_DELAY_SECONDS,
        )),
        followees: vec![],
        neuron_fees_e8s: 0,
        visibility: Some(2),
        known_neuron_data: None,
        voting_power_refreshed_timestamp_seconds: Some(at),
    }
}
pub fn fs(topic: i32, ids: &[u64]) -> (i32, g::Followees) {
    (
        topic,
        g::Followees {
            followees: ids.iter().map(|id| g::NeuronId { id: *id }).collect(),
        },
    )
}
pub fn known(id: u64) -> g::KnownNeuronData {
    g::KnownNeuronData {
        name: format!("Test {id}"),
        description: None,
        links: Some(vec![]),
        committed_topics: None,
    }
}
#[derive(CandidType)]
struct Economics {
    voting_power_economics: Option<g::VotingPowerEconomics>,
    neuron_minimum_stake_e8s: u64,
    max_proposals_to_keep_per_topic: u32,
    neuron_management_fee_per_proposal_e8s: u64,
    reject_cost_e8s: u64,
    transaction_fee_e8s: u64,
    neuron_spawn_dissolve_delay_seconds: u64,
    minimum_icp_xdr_rate: u64,
    maximum_node_provider_rewards_e8s: u64,
}
#[derive(CandidType)]
struct GovernanceInit {
    default_followees: Vec<(i32, g::Followees)>,
    wait_for_quiet_threshold_seconds: u64,
    neuron_management_voting_period_seconds: Option<u64>,
    node_providers: Vec<Empty>,
    economics: Option<Economics>,
    to_claim_transfers: Vec<Empty>,
    short_voting_period_seconds: u64,
    proposals: Vec<(u64, Empty)>,
    in_flight_commands: Vec<(u64, Empty)>,
    neurons: Vec<(u64, SeedNeuron)>,
    genesis_timestamp_seconds: u64,
    cached_daily_maturity_modulation_basis_points: Option<i32>,
    maturity_modulation_last_updated_at_timestamp_seconds: Option<u64>,
}
#[derive(CandidType)]
struct LedgerInit {
    minting_account: String,
    icrc1_minting_account: Option<l::Account>,
    initial_values: Vec<(String, l::Tokens)>,
    send_whitelist: Vec<Principal>,
    transfer_fee: Option<l::Tokens>,
    archive_options: Option<ArchiveOptions>,
}
#[derive(CandidType)]
struct ArchiveOptions {
    trigger_threshold: u64,
    num_blocks_to_archive: u64,
    controller_id: Principal,
    cycles_for_archive_creation: Option<u64>,
    max_transactions_per_response: Option<u64>,
}
pub fn real_pic() -> PocketIc {
    let pic = builder()
        .with_icp_features(IcpFeatures {
            registry: Some(IcpFeaturesConfig::DefaultConfig),
            cycles_minting: Some(IcpFeaturesConfig::DefaultConfig),
            ..Default::default()
        })
        .build();
    let mut features = serde_json::Map::new();
    for (name, text) in [
        ("registry", "rwlgt-iiaaa-aaaaa-aaaaa-cai"),
        ("cmc", "rkp4c-7iaaa-aaaaa-aaaca-cai"),
    ] {
        let id = Principal::from_text(text).unwrap();
        let caller = pic.get_controllers(id).first().copied();
        let status = pic.canister_status(id, caller).unwrap();
        features.insert(name.into(),serde_json::json!({"canister":text,"module_sha256":status.module_hash.map(hex::encode),"artifact_source":"checksum-pinned PocketIC 15.0.0 built-in feature; not asserted mainnet deployment"}));
    }
    std::fs::create_dir_all(root().join("dist/evidence")).unwrap();
    std::fs::write(
        root().join("dist/evidence/real-environment.json"),
        serde_json::to_string_pretty(&features).unwrap(),
    )
    .unwrap();
    pic
}

pub fn install_real(
    pic: &PocketIc,
    neurons: Vec<SeedNeuron>,
    extra: Vec<(l::Account, u64)>,
    governance_wasm: Vec<u8>,
    ledger_wasm: Vec<u8>,
) {
    install_real_with_voting(pic, neurons, extra, governance_wasm, ledger_wasm, None);
}
pub fn install_real_with_voting(
    pic: &PocketIc,
    neurons: Vec<SeedNeuron>,
    extra: Vec<(l::Account, u64)>,
    governance_wasm: Vec<u8>,
    ledger_wasm: Vec<u8>,
    voting: Option<g::VotingPowerEconomics>,
) {
    let at = now(pic);
    let gov_init = GovernanceInit {
        default_followees: vec![],
        wait_for_quiet_threshold_seconds: 86400,
        neuron_management_voting_period_seconds: Some(86400),
        node_providers: vec![],
        economics: Some(Economics {
            voting_power_economics: voting,
            neuron_minimum_stake_e8s: 100_000_000,
            max_proposals_to_keep_per_topic: 100,
            neuron_management_fee_per_proposal_e8s: 10_000,
            reject_cost_e8s: 100_000_000,
            transaction_fee_e8s: 10_000,
            neuron_spawn_dissolve_delay_seconds: 86400,
            minimum_icp_xdr_rate: 100,
            maximum_node_provider_rewards_e8s: 100_000_000,
        }),
        to_claim_transfers: vec![],
        short_voting_period_seconds: 86400,
        proposals: vec![],
        in_flight_commands: vec![],
        genesis_timestamp_seconds: at - 86400,
        cached_daily_maturity_modulation_basis_points: Some(0),
        maturity_modulation_last_updated_at_timestamp_seconds: Some(at),
        neurons: neurons
            .into_iter()
            .map(|n| (n.id.as_ref().unwrap().id, n))
            .collect(),
    };
    let mut balances: Vec<_> = gov_init
        .neurons
        .iter()
        .map(|(_, n)| {
            (
                hex::encode(l::account_id(GOVERNANCE, Some(&n.account))),
                l::Tokens {
                    e8s: n.cached_neuron_stake_e8s,
                },
            )
        })
        .collect();
    balances.extend(extra.into_iter().map(|(a, b)| {
        (
            hex::encode(l::account_id(a.owner, a.subaccount.as_deref())),
            l::Tokens { e8s: b },
        )
    }));
    let li = LedgerInit {
        minting_account: hex::encode(l::account_id(GOVERNANCE, None)),
        icrc1_minting_account: Some(l::Account {
            owner: GOVERNANCE,
            subaccount: None,
        }),
        initial_values: balances,
        send_whitelist: vec![],
        transfer_fee: Some(l::Tokens { e8s: 10_000 }),
        archive_options: Some(ArchiveOptions {
            trigger_threshold: 20,
            num_blocks_to_archive: 10,
            controller_id: Principal::anonymous(),
            cycles_for_archive_creation: Some(10_000_000_000_000),
            max_transactions_per_response: Some(100),
        }),
    };
    pic.create_canister_with_id(None, None, GOVERNANCE).unwrap();
    pic.add_cycles(GOVERNANCE, 100_000_000_000_000);
    pic.create_canister_with_id(None, None, LEDGER).unwrap();
    pic.add_cycles(LEDGER, 100_000_000_000_000);
    pic.install_canister(LEDGER, ledger_wasm, encode_one(li).unwrap(), None);
    pic.install_canister(
        GOVERNANCE,
        governance_wasm,
        encode_one(gov_init).unwrap(),
        None,
    );
    pic.set_controllers(
        GOVERNANCE,
        None,
        vec![Principal::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap()],
    )
    .unwrap();
}
#[derive(CandidType)]
pub struct Vote {
    pub vote: i32,
    pub proposal: Option<g::NeuronId>,
}
#[derive(CandidType)]
pub enum VoteCommand {
    RegisterVote(Vote),
}
#[derive(CandidType)]
pub struct VoteRequest {
    pub neuron_id_or_subaccount: Option<g::Id>,
    pub command: Option<VoteCommand>,
}
#[derive(CandidType)]
pub struct RefreshRequest {
    pub neuron_id_or_subaccount: Option<g::Id>,
    pub command: Option<RefreshCommand>,
}
#[derive(CandidType)]
pub enum RefreshCommand {
    ClaimOrRefresh(g::Claim),
}
#[derive(CandidType, Deserialize, Debug)]
pub struct RawResponse {
    pub command: Option<candid::Reserved>,
}

pub fn query2<A: candid::utils::ArgumentEncoder, R: CandidType + for<'de> Deserialize<'de>>(
    pic: &PocketIc,
    id: Principal,
    method: &str,
    args: A,
) -> R {
    let bytes = pic
        .query_call(
            id,
            Principal::anonymous(),
            method,
            candid::encode_args(args).unwrap(),
        )
        .unwrap();
    decode_one(&bytes).unwrap()
}

pub fn raw(id: u64, controller: Principal, at: u64) -> g::Neuron {
    g::Neuron {
        id: Some(g::NeuronId { id }),
        account: vec![(id % 251) as u8; 32],
        controller: Some(controller),
        not_for_profit: false,
        maturity_e8s_equivalent: 0,
        cached_neuron_stake_e8s: 1_000_000_000,
        created_timestamp_seconds: at - 100,
        auto_stake_maturity: Some(false),
        aging_since_timestamp_seconds: at - 100,
        hot_keys: vec![],
        dissolve_state: Some(g::DissolveState::DissolveDelaySeconds(
            dendrite_types::MAX_DISSOLVE_DELAY_SECONDS,
        )),
        followees: vec![],
        neuron_fees_e8s: 0,
        visibility: Some(2),
        known_neuron_data: None,
        voting_power_refreshed_timestamp_seconds: Some(at),
        deciding_voting_power: Some(12000),
        potential_voting_power: Some(12000),
        staked_maturity_e8s_equivalent: None,
        maturity_disbursements_in_progress: Some(vec![]),
    }
}
pub fn fixture(at: u64, empty: Principal, app: Principal) -> quorum_mocks::Fixture {
    let mut candidate = raw(100, empty, at);
    candidate.known_neuron_data = Some(known(100));
    candidate.followees = dendrite_types::RECOGNISED_TOPICS
        .into_iter()
        .map(|t| {
            if t == 1 {
                fs(t, &[101, 102, 103, 104, 105])
            } else if t == 4 {
                fs(t, &[101, 102, 103])
            } else {
                fs(t, &[dendrite_types::ALPHA_VOTE_NEURON_ID])
            }
        })
        .collect();
    let mut neurons = vec![candidate];
    for id in 101..=105 {
        let mut n = raw(id, user(id as u8), at);
        n.known_neuron_data = Some(known(id));
        n.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
        neurons.push(n);
    }
    for id in [
        dendrite_types::ALPHA_VOTE_NEURON_ID,
        dendrite_types::OMEGA_REJECT_NEURON_ID,
    ] {
        neurons.push(raw(id, user(1), at));
    }
    let mut follower = raw(200, user(2), at);
    follower.followees = vec![fs(4, &[100])];
    neurons.push(follower);
    let mut private = raw(201, app, at);
    private.visibility = Some(1);
    private.followees = vec![fs(4, &[100])];
    private.deciding_voting_power = Some(u64::MAX);
    private.potential_voting_power = Some(u64::MAX);
    neurons.push(private);
    let mut target = raw(quorum_policy::TARGET, user(9), at);
    target.hot_keys = vec![app];
    target.followees = vec![
        fs(1, &[101, 102, 103]),
        fs(4, &[dendrite_types::ALPHA_VOTE_NEURON_ID]),
    ];
    neurons.push(target);
    neurons.sort_by_key(|n| n.id.as_ref().unwrap().id);
    let infos = neurons
        .iter()
        .map(|n| g::NeuronInfo {
            id: n.id.clone(),
            retrieved_at_timestamp_seconds: at,
            known_neuron_data: n.known_neuron_data.clone(),
            visibility: n.visibility,
        })
        .collect();
    let known = neurons
        .iter()
        .filter_map(|n| {
            n.known_neuron_data.as_ref().map(|m| g::KnownNeuron {
                id: n.id.clone(),
                known_neuron_data: Some(m.clone()),
            })
        })
        .collect();
    quorum_mocks::Fixture {
        neurons,
        known,
        infos,
    }
}

// PocketIC 15's default II enables dummy auth. Real-browser tests explicitly
// disable it using the very same checksum-pinned production II modules.
pub fn ii_frontend_id() -> Principal {
    // ic_nns_constants::INTERNET_IDENTITY_FRONTEND_CANISTER_INDEX = 0x02100006.
    Principal::from_slice(&[0, 0, 0, 0, 2, 16, 0, 6, 1, 1])
}
#[derive(CandidType, Deserialize, Debug)]
struct IiDummyAuth {
    prompt_for_index: bool,
}
#[derive(CandidType, Deserialize, Debug)]
struct IiBackendConfig {
    dummy_auth: Option<Option<IiDummyAuth>>,
    related_origins: Option<Vec<String>>,
    new_flow_origins: Option<Vec<String>>,
}
#[derive(CandidType)]
struct IiFrontendConfig {
    backend_canister_id: Principal,
    backend_origin: String,
    related_origins: Option<Vec<String>>,
    fetch_root_key: Option<bool>,
    dummy_auth: Option<Option<IiDummyAuth>>,
    dev_csp: Option<bool>,
}
// Both browser fixtures must use the same bounded loopback port selection.
pub fn browser_port() -> u16 {
    let port = std::env::var("DENDRITE_TEST_HTTP_PORT")
        .unwrap_or_else(|_| "4943".into())
        .parse()
        .expect("local browser port");
    assert!(
        [4943, 4944].contains(&port),
        "unsupported local browser port"
    );
    port
}
pub fn configure_real_ii(pic: &PocketIc) {
    configure_real_ii_at_port(pic, browser_port());
}
pub fn configure_real_ii_at_port(pic: &PocketIc, port: u16) {
    assert!([4943, 4944].contains(&port));
    let backend = Principal::from_text("rdmx6-jaaaa-aaaaa-aaadq-cai").unwrap();
    let frontend = ii_frontend_id();
    let origins = vec![
        format!("http://id.ai.localhost:{port}"),
        format!("http://{frontend}.localhost:{port}"),
    ];
    let mut modules = serde_json::Map::new();
    for (id, artifact_name) in [
        (backend, "internet_identity_backend"),
        (frontend, "internet_identity_frontend"),
    ] {
        let uncompressed = artifact(artifact_name);
        let bytes =
            fs::read(root().join(format!(".cache/protocol/{artifact_name}.wasm.gz"))).unwrap();
        let controller = pic.get_controllers(id)[0];
        let status = pic.canister_status(id, Some(controller)).unwrap();
        assert_eq!(
            status.module_hash.as_ref().unwrap(),
            &Sha256::digest(&bytes).to_vec(),
            "II must match the reviewed PocketIC production module pin"
        );
        modules.insert(artifact_name.into(),serde_json::json!({"canister":id.to_text(),"installed_module_sha256":hex::encode(Sha256::digest(&bytes)),"wasm_sha256":hex::encode(Sha256::digest(&uncompressed))}));
        if id == backend {
            pic.upgrade_canister(
                id,
                bytes,
                encode_one(Some(IiBackendConfig {
                    dummy_auth: Some(None),
                    related_origins: Some(origins.clone()),
                    new_flow_origins: Some(origins.clone()),
                }))
                .unwrap(),
                Some(controller),
            )
            .unwrap();
        } else {
            // Fresh isolated frontend has no user identities or financial state.
            pic.reinstall_canister(
                id,
                bytes,
                encode_one(IiFrontendConfig {
                    backend_canister_id: backend,
                    backend_origin: format!("http://{backend}.localhost:{port}"),
                    related_origins: Some(origins.clone()),
                    fetch_root_key: Some(true),
                    dummy_auth: Some(None),
                    dev_csp: Some(true),
                })
                .unwrap(),
                Some(controller),
            )
            .unwrap();
        }
    }
    let config: IiBackendConfig = query_empty(pic, backend, "config");
    assert!(
        matches!(config.dummy_auth, Some(None)),
        "dummy authentication must be disabled, not counted as real II"
    );
    modules.insert("configuration".into(),serde_json::json!({"dummy_auth":false,"captcha":"preinstalled fixture disabled; WebAuthn proof remains required","origins":origins,"source":"PocketIC server 8258578e6212d445aeeafb71c1160fa4ea356d60; II release-2026-06-20 initialize explicitly applies Some(None)"}));
    fs::write(
        root().join("dist/evidence/real-ii-modules.json"),
        serde_json::to_vec_pretty(&modules).unwrap(),
    )
    .unwrap();
}

// Shared authoritative settlement oracles, also used by the signed browser world.
pub fn public_neuron(pic: &pocket_ic::PocketIc, id: u64) -> g::Neuron {
    let mut r: g::ListNeuronsResponse = update(
        pic,
        GOVERNANCE,
        Principal::anonymous(),
        "list_neurons",
        g::ListNeurons {
            neuron_ids: vec![id],
            include_neurons_readable_by_caller: false,
            include_empty_neurons_readable_by_caller: Some(false),
            include_public_neurons_in_full_neurons: Some(true),
            page_number: Some(0),
            page_size: Some(50),
            neuron_subaccounts: None,
        },
    );
    g::validate_batch(&[id], &r).unwrap();
    let n = r.full_neurons.pop().expect("public neuron unavailable");
    assert_eq!(n.visibility, Some(2));
    n
}

pub fn real_plans(pic: &pocket_ic::PocketIc, app: Principal) -> Vec<d_quorum::PayoutSummary> {
    query2(pic, app, "payout_page", (None::<u64>, 100u16))
}
pub fn real_transfers(
    pic: &pocket_ic::PocketIc,
    app: Principal,
    id: u64,
) -> Vec<quorum_accounting::Transfer> {
    query2(pic, app, "transfer_page", (id, 0u32, 100u16))
}

pub fn real_set_support(pic: &pocket_ic::PocketIc, ids: &[u64]) {
    let r: g::ManageResponse = update(
        pic,
        GOVERNANCE,
        user(2),
        "manage_neuron",
        g::request(
            200,
            g::Command::SetFollowing(g::SetFollowing {
                topic_following: Some(vec![g::Following {
                    topic: Some(4),
                    followees: Some(ids.iter().map(|id| g::NeuronId { id: *id }).collect()),
                }]),
            }),
        ),
    );
    assert!(matches!(
        r.command,
        Some(g::ResponseCommand::SetFollowing(_))
    ));
}

pub fn real_confirmed_evidence(
    pic: &pocket_ic::PocketIc,
    app: Principal,
    ts: &[quorum_accounting::Transfer],
) {
    for t in ts {
        let quorum_accounting::TransferStatus::Confirmed { block } = t.status else {
            panic!("unconfirmed {t:?}")
        };
        let h: l::History = query(
            pic,
            LEDGER,
            "query_blocks",
            l::BlocksArgs {
                start: block,
                length: 1,
            },
        );
        // Small lifecycle fixtures retain their settlement blocks in the main Ledger.
        assert_eq!(h.first_block_index, block);
        let a = t.attempt.as_ref().unwrap();
        assert!(l::matches(
            &h.blocks[0],
            app,
            &t.destination.subaccount,
            t.amount,
            a.fee,
            &a.memo,
            a.created_at_time
        ));
    }
}
