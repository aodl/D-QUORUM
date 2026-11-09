//! Connected creation oracle. Only system balances and independent support
//! neurons are seeded; C and T come from the real creation journey in the parent.
use crate::{SetupOperation, setup_request, support::*};
use candid::{Principal, encode_one};
use quorum_ic_clients::{GOVERNANCE, governance as g, ledger as l};

pub struct Fixture {
    pub app: Principal,
}
impl Fixture {
    pub fn new(pic: &pocket_ic::PocketIc, neurons: &mut Vec<SeedNeuron>) -> Self {
        let app = pic.create_canister();
        println!("creation automation fixture app={app}");
        pic.add_cycles(app, 200_000_000_000_000);
        let blackhole = pic.create_canister();
        pic.set_controllers(blackhole, None, vec![]).unwrap();
        let at = now(pic);
        let mut other = seed(100, blackhole, at);
        other.known_neuron_data = Some(known(100));
        other.followees = dendrite_types::RECOGNISED_TOPICS
            .into_iter()
            .map(|topic| match topic {
                1 => fs(topic, &[21, 22, 23, 24, 25]),
                4 => fs(topic, &[21, 22, 23]),
                _ => fs(topic, &[dendrite_types::ALPHA_VOTE_NEURON_ID]),
            })
            .collect();
        neurons.push(other);
        for id in 21..=25 {
            let mut n = seed(id, user(41), at);
            n.known_neuron_data = Some(known(id));
            n.followees = vec![fs(4, &[dendrite_types::OMEGA_REJECT_NEURON_ID])];
            n.dissolve_state = Some(g::DissolveState::DissolveDelaySeconds(1));
            neurons.push(n);
        }
        let mut target = seed(quorum_policy::TARGET, user(9), at);
        target.hot_keys = vec![app];
        target.followees = vec![fs(1, &[300, 301, 302])];
        target.dissolve_state = Some(g::DissolveState::DissolveDelaySeconds(1));
        neurons.push(target);
        let mut proposer = seed(300, app, at);
        proposer.account = l::staking_subaccount(app, d_quorum::state::BOOTSTRAP_NONCE);
        proposer.dissolve_state = Some(g::DissolveState::DissolveDelaySeconds(1));
        neurons.push(proposer);
        for id in [301, 302, 50, 52, 53, 54] {
            let mut n = seed(id, user(41), at);
            n.dissolve_state = Some(g::DissolveState::DissolveDelaySeconds(1));
            if id == 53 {
                n.visibility = Some(1);
            }
            neurons.push(n);
        }
        Self { app }
    }

    pub fn provisional(&self, pic: &pocket_ic::PocketIc, owner: Principal, t: u64) {
        // One direct public eligible voter splits support between T and the
        // independent candidate. Large transitive/private/unlocked controls
        // must contribute nothing to T's score.
        for id in [50, 52, 53] {
            let r: g::ManageResponse = update(
                pic,
                GOVERNANCE,
                owner,
                "manage_neuron",
                setup_request(
                    id,
                    SetupOperation::IncreaseDissolveDelay {
                        additional_dissolve_delay_seconds:
                            dendrite_types::MAX_DISSOLVE_DELAY_SECONDS as u32,
                    },
                ),
            );
            assert!(
                matches!(r.command, Some(g::ResponseCommand::Configure(_))),
                "{r:?}"
            );
        }
        for (id, followees) in [
            (50, vec![t, 100]),
            (52, vec![50]),
            (53, vec![t]),
            (54, vec![t]),
        ] {
            let r: g::ManageResponse = update(
                pic,
                GOVERNANCE,
                owner,
                "manage_neuron",
                g::request(
                    id,
                    g::Command::SetFollowing(g::SetFollowing {
                        topic_following: Some(vec![g::Following {
                            topic: Some(4),
                            followees: Some(
                                followees.into_iter().map(|id| g::NeuronId { id }).collect(),
                            ),
                        }]),
                    }),
                ),
            );
            assert!(
                matches!(r.command, Some(g::ResponseCommand::SetFollowing(_))),
                "{r:?}"
            );
        }
        pic.install_canister(
            self.app,
            wasm("d_quorum"),
            encode_one(Some(d_quorum::state::Init {
                mode: d_quorum::state::Mode::Live,
                expected_target_controller: Some(user(9)),
            }))
            .unwrap(),
            None,
        );
        for index in 0..800 {
            drive(pic, 1);
            if index % 100 == 99 {
                println!(
                    "creation provisional scan: {:?}; {:?}",
                    query_empty::<d_quorum::ScanProgress>(pic, self.app, "scan_progress"),
                    query_empty::<d_quorum::Health>(pic, self.app, "health")
                );
            }
            if query_empty::<d_quorum::ScanProgress>(pic, self.app, "scan_progress").phase
                == "complete"
            {
                break;
            }
        }
        let candidates: Vec<d_quorum::state::CandidateResult> =
            query2(pic, self.app, "candidate_page", (None::<u64>, 100u16));
        let provisional = candidates
            .iter()
            .find(|n| n.id == t)
            .expect("new registered T was discovered");
        assert_eq!(
            provisional.status,
            dendrite_types::ComplianceStatus::NonCompliant
        );
        assert!(provisional.admitted.is_none());
        let rosters: Vec<d_quorum::RosterView> =
            query2(pic, self.app, "roster_page", (0u16, 100u16));
        assert!(
            rosters
                .iter()
                .all(|r| !r.applied.contains(&t) && !r.planned.contains(&t))
        );
    }

    pub fn finalised(&self, pic: &pocket_ic::PocketIc, t: u64, c: Principal, nonce: u64) {
        let lower = u128::from(public_neuron(pic, 50).deciding_voting_power.unwrap())
            * quorum_policy::SCALE
            / 2;
        let before_stake = public_neuron(pic, t).cached_neuron_stake_e8s;
        let next_scan = query_empty::<d_quorum::Health>(pic, self.app, "health").jobs[0].next_at;
        let wait = next_scan.saturating_sub(now(pic)).saturating_add(1);
        assert!(
            wait <= 14 * d_quorum::state::DAY,
            "unexpected scan schedule"
        );
        println!("advance to unchanged scheduled discovery: {wait} virtual seconds");
        drive(pic, wait);
        let mut selected = false;
        for index in 0..1000 {
            drive(pic, 1);
            if index % 100 == 99 {
                println!(
                    "creation final scan: {:?}; {:?}",
                    query_empty::<d_quorum::ScanProgress>(pic, self.app, "scan_progress"),
                    query_empty::<d_quorum::Health>(pic, self.app, "health")
                );
            }
            let rosters: Vec<d_quorum::RosterView> =
                query2(pic, self.app, "roster_page", (0u16, 100u16));
            if rosters.iter().any(|r| {
                r.topic == 4
                    && r.reward_eligible
                    && r.applied.len() == 2
                    && r.applied.contains(&t)
                    && r.applied.contains(&100)
            }) {
                assert!(
                    rosters
                        .iter()
                        .filter(|r| r.topic != 4)
                        .all(|r| !r.applied.contains(&t))
                );
                selected = true;
                break;
            }
        }
        assert!(
            selected,
            "newly finalised T did not enter eligible topic 4: {:?}",
            query_empty::<d_quorum::Health>(pic, self.app, "health")
        );
        let upper = u128::from(public_neuron(pic, 50).deciding_voting_power.unwrap())
            * quorum_policy::SCALE
            / 2;
        let scores: Vec<d_quorum::Score> =
            query2(pic, self.app, "score_page", (None::<(i32, u64)>, 100u16));
        let score = scores
            .iter()
            .find(|s| s.topic == 4 && s.neuron_id == t)
            .unwrap();
        assert!(score.complete && score.scaled_score > 0);
        assert!(
            (lower..=upper).contains(&score.scaled_score),
            "transitive/private/unlocked support contaminated direct score: {score:?}, bounds {lower}..={upper}"
        );
        assert_eq!(
            score.scaled_score,
            scores
                .iter()
                .find(|s| s.topic == 4 && s.neuron_id == 100)
                .unwrap()
                .scaled_score
        );
        let candidates: Vec<d_quorum::state::CandidateResult> =
            query2(pic, self.app, "candidate_page", (None::<u64>, 100u16));
        let actual = candidates
            .iter()
            .find(|n| n.id == t)
            .unwrap()
            .admitted
            .as_ref()
            .unwrap();
        assert_eq!(actual.managers, [11, 12, 13, 14, 15].into_iter().collect());
        assert_eq!(actual.topics, [4].into_iter().collect());
        let other = candidates
            .iter()
            .find(|n| n.id == 100)
            .unwrap()
            .admitted
            .as_ref()
            .unwrap();
        assert!(actual.managers.is_disjoint(&other.managers));
        // A synthetic pool is funded after admission so the first provisional
        // roster cannot consume it. Settlement itself is the real ICP Ledger.
        let funded: Result<candid::Nat, l::TransferError> = update(
            pic,
            quorum_ic_clients::LEDGER,
            user(41),
            "icrc1_transfer",
            l::TransferArg {
                from_subaccount: None,
                to: l::Account {
                    owner: self.app,
                    subaccount: None,
                },
                amount: 2_000_000u64.into(),
                fee: Some(10_000u64.into()),
                memo: None,
                created_at_time: None,
            },
        );
        funded.unwrap();
        let next_payout = query_empty::<d_quorum::Health>(pic, self.app, "health").jobs[2].next_at;
        let wait = next_payout.saturating_sub(now(pic)).saturating_add(1);
        assert!(
            wait <= 2 * d_quorum::state::DAY,
            "unexpected payout schedule"
        );
        println!("advance to unchanged scheduled reward: {wait} virtual seconds");
        drive(pic, wait);
        let mut paid = None;
        for _ in 0..1000 {
            drive(pic, 1);
            for plan in real_plans(pic, self.app) {
                let transfers = real_transfers(pic, self.app, plan.id);
                if transfers.len() == 2
                    && transfers.iter().any(|x| x.destination.neuron_id == t)
                    && transfers.iter().all(|x| {
                        matches!(
                            x.status,
                            quorum_accounting::TransferStatus::Confirmed { .. }
                        ) && x.refresh == Some(quorum_accounting::RefreshState::Complete)
                    })
                {
                    paid = Some((plan, transfers));
                    break;
                }
            }
            if paid.is_some() {
                break;
            }
        }
        let (plan, transfers) =
            paid.expect("actual new T must receive a confirmed real reward and stake refresh");
        real_confirmed_evidence(pic, self.app, &transfers);
        assert_eq!(transfers[0].amount, transfers[1].amount);
        let reward = transfers
            .iter()
            .find(|x| x.destination.neuron_id == t)
            .unwrap();
        assert_eq!(
            reward.destination.subaccount,
            l::staking_subaccount(c, nonce)
        );
        assert_eq!(
            public_neuron(pic, t).cached_neuron_stake_e8s,
            before_stake + reward.amount
        );
        assert_eq!(
            plan.confirmed_cost,
            u128::from(transfers.iter().map(|x| x.amount + plan.fee).sum::<u64>())
        );
        println!(
            "new creation T={t}: provisional exclusion, final topic-4 admission, manager-disjoint selection, direct-only proportional score and equal real staking rewards verified; seeded reward pool, not a new maturity accrual test"
        );
    }
}
