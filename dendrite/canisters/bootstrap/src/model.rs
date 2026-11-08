use candid::{CandidType, Principal};
use dendrite_types::{
    ALPHA_VOTE_NEURON_ID, MAX_DISSOLVE_DELAY_SECONDS, OMEGA_REJECT_NEURON_ID, OMEGA_VOTE_NEURON_ID,
    ONE_DAY_SECONDS, RECOGNISED_TOPICS, SOURCE_REVISION,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const VERSION: u16 = 1;
pub const MAX_STATE_BYTES: usize = 65_536;
pub const INITIAL_CLAIM_LOCK_SECONDS: u64 = 7 * ONE_DAY_SECONDS;
pub const MIN_RESERVE: u64 = 100_000_000_000;

#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub enum Profile {
    ProductionCandidate,
    RecoverableTest,
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub enum Network {
    Ic,
    Local,
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub struct Following {
    pub topic: i32,
    pub followees: Vec<u64>,
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub struct Metadata {
    pub name: String,
    pub description: String,
    pub links: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub struct Plan {
    pub version: u16,
    pub profile: Profile,
    pub owner: Principal,
    pub network: Network,
    pub dendrite_service: Principal,
    pub origin: String,
    pub api_host: String,
    pub funding_budget_e8s: u64,
    pub icp_fee_e8s: u64,
    pub provision_cycles: u64,
    pub policy_version: String,
    pub creation_id: Vec<u8>,
    pub nonce: u64,
    pub revision: u64,
    pub policy_revision: String,
    pub bootstrap_sha256: Vec<u8>,
    pub managers: Vec<u64>,
    pub committed_topics: Vec<i32>,
    pub following: Vec<Following>,
    pub stake_e8s: u64,
    pub lock_seconds: u64,
    pub cycle_reserve: u64,
    pub return_account: Vec<u8>,
    pub metadata: Option<Metadata>,
}
pub fn unique_nonzero(ids: &[u64], minimum: usize) -> bool {
    ids.len() >= minimum
        && ids.len() <= 15
        && ids.iter().all(|id| *id != 0)
        && ids.iter().collect::<BTreeSet<_>>().len() == ids.len()
}
impl Plan {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != VERSION
            || self.owner == Principal::anonymous()
            || self.owner == Principal::management_canister()
            || self.owner.as_slice().last() != Some(&2)
            || self.creation_id.len() != 32
            || self.bootstrap_sha256.len() != 32
            || self.revision == 0
            || self.policy_revision != SOURCE_REVISION
            || self.policy_version != dendrite_types::STANDARD_VERSION
            || self.funding_budget_e8s == 0
            || self.icp_fee_e8s == 0
            || !(1_000_000_000_000..=10_000_000_000_000).contains(&self.provision_cycles)
            || !valid_legacy_account(&self.return_account)
            || self.stake_e8s == 0
            || !(MIN_RESERVE..=1_000_000_000_000).contains(&self.cycle_reserve)
        {
            return Err(
                "Invalid creation identity, version, policy, budget or return account".into(),
            );
        }
        let bound_origin = match self.network {
            Network::Ic => {
                self.dendrite_service.to_text() == "hp4av-oiaaa-aaaar-qcaha-cai"
                    && self.origin == "https://hp4av-oiaaa-aaaar-qcaha-cai.icp0.io"
                    && self.api_host == "https://icp-api.io"
            }
            Network::Local => [4943, 4944].iter().any(|port| {
                self.origin == format!("http://{}.localhost:{port}", self.dendrite_service)
                    && [
                        format!("http://127.0.0.1:{port}"),
                        format!("http://localhost:{port}"),
                    ]
                    .contains(&self.api_host)
            }),
        };
        if !bound_origin {
            return Err("Creation network, origin and service binding mismatch".into());
        }
        let production = self.profile == Profile::ProductionCandidate;
        if !unique_nonzero(&self.managers, if production { 5 } else { 1 })
            || (!production && self.managers.len() != 1)
            || (production && self.lock_seconds != MAX_DISSOLVE_DELAY_SECONDS)
            || (!production && self.lock_seconds != INITIAL_CLAIM_LOCK_SECONDS)
        {
            return Err("Profile manager or lock requirements are not satisfied".into());
        }
        if self.following.is_empty()
            || self.following.len() > 64
            || self
                .following
                .iter()
                .any(|f| !RECOGNISED_TOPICS.contains(&f.topic) || !unique_nonzero(&f.followees, 0))
        {
            return Err("Unsupported, oversized or duplicate following".into());
        }
        let by_topic: BTreeMap<_, _> = self
            .following
            .iter()
            .map(|f| (f.topic, f.followees.as_slice()))
            .collect();
        if by_topic.len() != self.following.len()
            || by_topic.get(&1).copied() != Some(self.managers.as_slice())
        {
            return Err("Management following must exactly match the reviewed managers".into());
        }
        let committed: BTreeSet<_> = self.committed_topics.iter().copied().collect();
        if committed.len() != self.committed_topics.len()
            || committed.contains(&0)
            || committed.contains(&1)
            || committed.iter().any(|t| !RECOGNISED_TOPICS.contains(t))
        {
            return Err("Invalid committed topics".into());
        }
        if production {
            if committed.is_empty() || by_topic.len() != RECOGNISED_TOPICS.len() {
                return Err("Production plans require commitments and complete following".into());
            }
            for topic in RECOGNISED_TOPICS {
                let ids = by_topic.get(&topic).ok_or("Missing following topic")?;
                if topic == 1 {
                    continue;
                }
                if committed.contains(&topic) {
                    if ids.len() < 3 || ids.iter().any(|id| !self.managers.contains(id)) {
                        return Err(
                            "Committed delegates must contain at least three distinct managers"
                                .into(),
                        );
                    }
                } else if ids.len() != 1
                    || ![
                        ALPHA_VOTE_NEURON_ID,
                        OMEGA_VOTE_NEURON_ID,
                        OMEGA_REJECT_NEURON_ID,
                    ]
                    .contains(&ids[0])
                {
                    return Err("Uncommitted following must use one approved default".into());
                }
            }
        } else if self.following.len() != 1 || !committed.is_empty() {
            return Err("Recoverable test plans support only reviewed topic-1 following".into());
        }
        if let Some(m) = &self.metadata
            && (m.name.is_empty()
                || m.name.len() > 200
                || m.description.len() > 3_000
                || m.links.len() > 10
                || m.links.iter().any(|s| {
                    s.len() > 100 || !s.starts_with("https://") || s.contains(['\n', '\r'])
                }))
        {
            return Err("Invalid known-neuron metadata".into());
        }
        Ok(())
    }
    pub fn digest(&self) -> Vec<u8> {
        // Candid permits different equivalent type-table encodings. Hash a
        // domain-separated, explicitly ordered format shared with the browser.
        let mut bytes = b"dendrite-creation-plan-v1".to_vec();
        fn blob(out: &mut Vec<u8>, value: &[u8]) {
            out.extend_from_slice(
                &u32::try_from(value.len())
                    .expect("bounded plan field")
                    .to_le_bytes(),
            );
            out.extend_from_slice(value);
        }
        fn ids(out: &mut Vec<u8>, value: &[u64]) {
            out.extend_from_slice(
                &u32::try_from(value.len())
                    .expect("bounded plan vector")
                    .to_le_bytes(),
            );
            for id in value {
                out.extend_from_slice(&id.to_le_bytes());
            }
        }
        bytes.extend_from_slice(&self.version.to_le_bytes());
        bytes.push(u8::from(self.profile == Profile::ProductionCandidate));
        blob(&mut bytes, self.owner.as_slice());
        bytes.push(u8::from(self.network == Network::Ic));
        blob(&mut bytes, self.dendrite_service.as_slice());
        for value in [&self.origin, &self.api_host] {
            blob(&mut bytes, value.as_bytes());
        }
        for value in [
            self.funding_budget_e8s,
            self.icp_fee_e8s,
            self.provision_cycles,
        ] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        blob(&mut bytes, self.policy_version.as_bytes());
        blob(&mut bytes, &self.creation_id);
        for value in [self.nonce, self.revision] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        blob(&mut bytes, self.policy_revision.as_bytes());
        blob(&mut bytes, &self.bootstrap_sha256);
        ids(&mut bytes, &self.managers);
        bytes.extend_from_slice(&(self.committed_topics.len() as u32).to_le_bytes());
        for topic in &self.committed_topics {
            bytes.extend_from_slice(&topic.to_le_bytes());
        }
        bytes.extend_from_slice(&(self.following.len() as u32).to_le_bytes());
        for row in &self.following {
            bytes.extend_from_slice(&row.topic.to_le_bytes());
            ids(&mut bytes, &row.followees);
        }
        for value in [self.stake_e8s, self.lock_seconds, self.cycle_reserve] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        blob(&mut bytes, &self.return_account);
        bytes.push(u8::from(self.metadata.is_some()));
        if let Some(metadata) = &self.metadata {
            for value in [&metadata.name, &metadata.description] {
                blob(&mut bytes, value.as_bytes());
            }
            bytes.extend_from_slice(&(metadata.links.len() as u32).to_le_bytes());
            for link in &metadata.links {
                blob(&mut bytes, link.as_bytes());
            }
        }
        Sha256::digest(bytes).to_vec()
    }
    pub fn permits_replacement(&self, next: &Self) -> Result<(), String> {
        next.validate()?;
        if self.owner != next.owner
            || self.network != next.network
            || self.dendrite_service != next.dendrite_service
            || self.origin != next.origin
            || self.api_host != next.api_host
            || self.funding_budget_e8s != next.funding_budget_e8s
            || self.icp_fee_e8s != next.icp_fee_e8s
            || self.provision_cycles != next.provision_cycles
            || self.creation_id != next.creation_id
            || self.nonce != next.nonce
            || self.profile != next.profile
            || self.return_account != next.return_account
            || self.bootstrap_sha256 != next.bootstrap_sha256
            || next.revision != self.revision.checked_add(1).ok_or("Revision exhausted")?
        {
            return Err("Replacement changes an immutable creation binding or revision".into());
        }
        Ok(())
    }
}
pub fn staking_subaccount(controller: Principal, nonce: u64) -> Vec<u8> {
    let mut h = Sha256::new();
    h.update(b"\x0cneuron-stake");
    h.update(controller.as_slice());
    h.update(nonce.to_be_bytes());
    h.finalize().to_vec()
}
pub fn legacy_account(owner: Principal, subaccount: &[u8]) -> Vec<u8> {
    use sha2::Sha224;
    let mut h = Sha224::new();
    h.update(b"\x0Aaccount-id");
    h.update(owner.as_slice());
    h.update(subaccount);
    let hash = h.finalize();
    let mut crc = 0xffff_ffffu32;
    for byte in hash {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb8_8320u32 & (0u32.wrapping_sub(crc & 1)));
        }
    }
    let mut out = (!crc).to_be_bytes().to_vec();
    out.extend_from_slice(&hash);
    out
}

fn valid_legacy_account(bytes: &[u8]) -> bool {
    if bytes.len() != 32 {
        return false;
    }
    let mut crc = 0xffff_ffffu32;
    for byte in &bytes[4..] {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb8_8320u32 & (0u32.wrapping_sub(crc & 1)));
        }
    }
    bytes[..4] == (!crc).to_be_bytes()
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub enum Phase {
    AwaitingStake,
    Configuring,
    AwaitingLock,
    AwaitingRegistration,
    RecoverableTestReady,
    Rehearsing,
    Sealed,
    Recovering,
    Recovered,
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub enum Step {
    Claim,
    Configure,
    CommitLock,
    Refresh,
    BeginRehearsal,
    Seal(u64),
    Unseal,
    StartDissolving,
    Disburse {
        expected_amount_e8s: u64,
        expected_fee_e8s: u64,
    },
    ReconcileDisbursement(u64),
    ReserveProposal(ExternalProposal),
    ResolveProposal(u64),
    MarkProposalDispatched(Vec<u8>),
    CancelReservedProposal(Vec<u8>),
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub enum ProposalKind {
    Registration,
    Rehearsal,
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub struct ExternalProposal {
    pub kind: ProposalKind,
    pub intent_id: Vec<u8>,
    pub request_digest: Vec<u8>,
    pub proposer: u64,
    pub revision: u64,
    pub created_at: u64,
    pub proposal_id: Option<u64>,
    pub dispatched: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub enum Effect {
    Claim,
    Visibility,
    Following(Following),
    Lock(u64),
    Refresh,
    Dissolve,
    Disburse,
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub struct Pending {
    pub sequence: u64,
    pub revision: u64,
    pub step: Step,
    pub dispatched_at: u64,
    pub effect: Option<Effect>,
    pub expected_return_e8s: Option<u64>,
    pub expected_return_fee_e8s: Option<u64>,
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Deserialize, Serialize)]
pub struct State {
    pub version: u16,
    pub plan: Plan,
    pub plan_digest: Vec<u8>,
    pub controller: Principal,
    pub neuron_id: Option<u64>,
    pub staking_subaccount: Vec<u8>,
    pub phase: Phase,
    pub pending: Option<Pending>,
    pub sequence: u64,
    pub rehearsal_started_at: Option<u64>,
    pub rehearsal_proposal: Option<u64>,
    pub disbursement_block: Option<u64>,
    pub last_error: Option<String>,
    pub external_proposal: Option<ExternalProposal>,
    pub public_visibility_confirmed: bool,
    pub sealed_controller_changes: Option<u64>,
}
impl State {
    pub fn readiness_marker(&self) -> Vec<u8> {
        let mut bytes = b"dendrite-bootstrap-readiness-v1".to_vec();
        bytes.push(self.controller.as_slice().len() as u8);
        bytes.extend_from_slice(self.controller.as_slice());
        bytes.extend_from_slice(&self.plan_digest);
        bytes.extend_from_slice(&self.sequence.to_le_bytes());
        bytes.push(match self.phase {
            Phase::AwaitingStake => 0,
            Phase::Configuring => 1,
            Phase::AwaitingLock => 2,
            Phase::AwaitingRegistration => 3,
            Phase::RecoverableTestReady => 4,
            Phase::Rehearsing => 5,
            Phase::Sealed => 6,
            Phase::Recovering => 7,
            Phase::Recovered => 8,
        });
        bytes.push(u8::from(self.pending.is_some()));
        bytes.push(u8::from(self.neuron_id.is_some()));
        if let Some(id) = self.neuron_id {
            bytes.extend_from_slice(&id.to_le_bytes());
        }
        bytes.push(u8::from(
            self.external_proposal
                .as_ref()
                .is_some_and(|p| p.proposal_id.is_none()),
        ));
        Sha256::digest(bytes).to_vec()
    }
    pub fn validate_restored(&self, controller: Principal) -> Result<(), String> {
        self.plan.validate()?;
        if self.version != VERSION
            || self.controller != controller
            || self.plan_digest != self.plan.digest()
            || self.staking_subaccount != staking_subaccount(controller, self.plan.nonce)
            || self
                .neuron_id
                .is_some_and(|id| id == 0 || self.plan.managers.contains(&id))
            || self
                .pending
                .as_ref()
                .is_some_and(|p| p.revision != self.plan.revision || p.sequence != self.sequence)
            || self.external_proposal.as_ref().is_some_and(|p| {
                p.revision != self.plan.revision
                    || p.proposer == 0
                    || p.intent_id.len() != 32
                    || p.request_digest.len() != 32
            })
            || (self.phase == Phase::Sealed && self.sealed_controller_changes.is_none())
            || candid::encode_one(self)
                .map_err(|_| "Invalid state encoding")?
                .len()
                > MAX_STATE_BYTES
        {
            return Err("Unsupported or corrupt creation checkpoint".into());
        }
        Ok(())
    }
    pub fn new(plan: Plan, controller: Principal) -> Result<Self, String> {
        plan.validate()?;
        Ok(Self {
            version: VERSION,
            staking_subaccount: staking_subaccount(controller, plan.nonce),
            plan_digest: plan.digest(),
            plan,
            controller,
            neuron_id: None,
            phase: Phase::AwaitingStake,
            pending: None,
            sequence: 0,
            rehearsal_started_at: None,
            rehearsal_proposal: None,
            disbursement_block: None,
            last_error: None,
            external_proposal: None,
            public_visibility_confirmed: false,
            sealed_controller_changes: None,
        })
    }
    pub fn authorize(&self, caller: Principal, revision: u64) -> Result<(), String> {
        if caller != self.plan.owner {
            return Err("Only the creation's actual owner may call".into());
        }
        if revision != self.plan.revision {
            return Err("Stale plan revision".into());
        }
        Ok(())
    }
    pub fn replace(&mut self, next: Plan) -> Result<(), String> {
        if self.pending.is_some()
            || self
                .external_proposal
                .as_ref()
                .is_some_and(|p| p.proposal_id.is_none())
            || self.phase == Phase::Sealed
            || self.phase == Phase::Recovered
        {
            return Err("Reconcile outstanding work or safely unseal before editing".into());
        }
        self.plan.permits_replacement(&next)?;
        if self.neuron_id.is_some_and(|id| next.managers.contains(&id)) {
            return Err("Neuron cannot manage itself".into());
        }
        self.plan_digest = next.digest();
        self.plan = next;
        self.rehearsal_started_at = None;
        self.rehearsal_proposal = None;
        self.sealed_controller_changes = None;
        self.external_proposal = None;
        self.phase = if self.neuron_id.is_some() {
            Phase::Configuring
        } else {
            Phase::AwaitingStake
        };
        Ok(())
    }
    pub fn begin(&mut self, step: Step, now: u64) -> Result<u64, String> {
        if self.phase == Phase::Recovered {
            return Err("Recovery has completed".into());
        }
        if self.phase == Phase::Sealed && step != Step::Unseal {
            return Err("Bootstrap is sealed".into());
        }
        if self.plan.profile == Profile::RecoverableTest
            && matches!(step, Step::Seal(_) | Step::Unseal)
        {
            return Err("Test creations cannot enter finalisation".into());
        }
        if let Some(p) = &self.pending {
            if p.revision != self.plan.revision {
                return Err("Pending operation belongs to another revision".into());
            }
            if p.step == step
                || (matches!(p.step, Step::Disburse { .. })
                    && matches!(step, Step::ReconcileDisbursement(_)))
            {
                return Ok(p.sequence);
            }
            return Err("Reconcile the original operation before dispatching new work".into());
        }
        self.sequence = self
            .sequence
            .checked_add(1)
            .ok_or("Operation sequence exhausted")?;
        self.pending = Some(Pending {
            sequence: self.sequence,
            revision: self.plan.revision,
            step,
            dispatched_at: now,
            effect: None,
            expected_return_e8s: None,
            expected_return_fee_e8s: None,
        });
        Ok(self.sequence)
    }
    pub fn finish(&mut self, sequence: u64) -> Result<(), String> {
        if !self
            .pending
            .as_ref()
            .is_some_and(|p| p.sequence == sequence && p.revision == self.plan.revision)
        {
            return Err("Stale asynchronous completion".into());
        }
        self.pending = None;
        self.last_error = None;
        Ok(())
    }
}
