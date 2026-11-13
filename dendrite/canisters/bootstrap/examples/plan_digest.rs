use candid::Principal;
use dendrite_bootstrap::model::*;
fn plan(production: bool) -> Plan {
    let owner = Principal::self_authenticating([7; 32]);
    let managers = if production {
        vec![11, 12, 13, 14, 15]
    } else {
        vec![11]
    };
    let following = if production {
        dendrite_types::RECOGNISED_TOPICS
            .into_iter()
            .map(|topic| Following {
                topic,
                followees: match topic {
                    1 => managers.clone(),
                    4 => vec![11, 12, 13],
                    _ => vec![dendrite_types::ALPHA_VOTE_NEURON_ID],
                },
            })
            .collect()
    } else {
        vec![Following {
            topic: 1,
            followees: managers.clone(),
        }]
    };
    Plan {
        version: VERSION,
        profile: if production {
            Profile::ProductionCandidate
        } else {
            Profile::RecoverableTest
        },
        owner,
        network: Network::Local,
        dendrite_service: candid::Principal::from_text("pi33i-pt777-77776-aaaaa-cai").unwrap(),
        origin: "http://pi33i-pt777-77776-aaaaa-cai.localhost:4943".into(),
        api_host: "http://127.0.0.1:4943".into(),
        funding_budget_e8s: 200_010_000,
        icp_fee_e8s: 10_000,
        provision_cycles: 2_000_000_000_000,
        policy_version: dendrite_types::STANDARD_VERSION.into(),
        creation_id: vec![3; 32],
        nonce: 42,
        revision: 1,
        policy_revision: dendrite_types::SOURCE_REVISION.into(),
        bootstrap_sha256: vec![8; 32],
        managers,
        committed_topics: if production { vec![4] } else { vec![] },
        following,
        stake_e8s: 200_000_000,
        lock_seconds: if production {
            dendrite_types::MAX_DISSOLVE_DELAY_SECONDS
        } else {
            INITIAL_CLAIM_LOCK_SECONDS
        },
        cycle_reserve: MIN_RESERVE,
        return_account: legacy_account(owner, &[0; 32]),
        metadata: Some(Metadata {
            name: "Provisional creation".into(),
            description: "Creator retains recoverable control".into(),
            links: vec![],
        }),
    }
}
fn main() {
    for production in [false, true] {
        let plan = plan(production);
        plan.validate().unwrap();
        let state = State::new(plan.clone(), plan.dendrite_service).unwrap();
        let hex = |b: Vec<u8>| b.iter().map(|n| format!("{n:02x}")).collect::<String>();
        println!(
            "{{\"candid_hex\":\"{}\",\"sha256\":\"{}\",\"controller\":\"{}\",\"readiness_marker\":\"{}\"}}",
            hex(candid::encode_one(&plan).unwrap()),
            hex(plan.digest()),
            state.controller,
            hex(state.readiness_marker())
        );
    }
}
