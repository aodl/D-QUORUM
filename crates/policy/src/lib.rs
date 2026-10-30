#![forbid(unsafe_code)]
use candid::CandidType;
use dendrite_types::{ComplianceReport, ComplianceStatus};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const EVALUATOR_COMMIT: &str = "b9bacd5e97eded6b5bcb0ad37d0a30b8a4ecb291";
pub const PROTOCOL_COMMIT: &str = "83f29e0803496ba6aaea3d6b43f6c6bebea12dd9";
pub const SCALE: u128 = 360_360;
pub const TARGET: u64 = 4_713_806_069_430_754_115;
pub const TOPICS: [i32; 16] = [2,3,4,5,6,7,8,9,10,12,13,14,15,16,17,18];
pub const MAX_FOLLOWEES: usize = 15;

#[derive(Clone, Debug, PartialEq, Eq, CandidType, Serialize, Deserialize)]
pub struct Candidate {
    pub id: u64,
    pub managers: BTreeSet<u64>,
    pub topics: BTreeSet<i32>,
    pub checked_at: u64,
    pub evaluator_commit: String,
}
pub fn admit(report: &ComplianceReport) -> Result<Candidate, &'static str> {
    if report.overall_status != ComplianceStatus::Compliant {
        return Err("candidate is not conclusively Compliant");
    }
    if report.source_revision != dendrite_types::SOURCE_REVISION || report.neuron_id == 0 {
        return Err("evaluator provenance or identity mismatch");
    }
    Ok(Candidate {
        id: report.neuron_id,
        managers: report.managers.iter().map(|x| x.neuron_id).collect(),
        topics: report.committed_topics.iter().map(|x| x.topic).filter(|t| TOPICS.contains(t)).collect(),
        checked_at: report.checked_at_timestamp_seconds,
        evaluator_commit: EVALUATOR_COMMIT.into(),
    })
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Serialize, Deserialize)]
pub struct Observation {
    pub id: u64,
    pub public: bool,
    pub deciding_vp: u64,
    pub followees: BTreeMap<i32, Vec<u64>>,
    pub observed_at: u64,
}
pub type Scores = BTreeMap<(i32,u64), u128>;
// Governance (4) and SNS/community fund (14) do not use CatchAll.
// An explicit empty vector remains empty; normal NNS setters remove empty keys.
pub fn effective_followees(o: &Observation, topic: i32) -> Result<BTreeSet<u64>, &'static str> {
    if !TOPICS.contains(&topic) { return Err("unsupported ordinary topic"); }
    let raw = o.followees.get(&topic).or_else(|| {
        if [4,14].contains(&topic) { None } else { o.followees.get(&0) }
    });
    if raw.is_some_and(|xs| xs.len() > MAX_FOLLOWEES || xs.contains(&0)) {
        return Err("invalid followees");
    }
    Ok(raw.into_iter().flatten().copied().collect())
}
pub fn contribute(scores: &mut Scores, o: &Observation, candidates: &BTreeMap<u64,Candidate>, proposer: Option<u64>) -> Result<(), &'static str> {
    if !o.public || o.id == TARGET || Some(o.id) == proposer { return Ok(()); }
    // Atomic page callers apply to a temporary map; errors never leave a partial page.
    for topic in TOPICS {
        let fs = effective_followees(o, topic)?;
        if fs.is_empty() { continue; }
        let amount = u128::from(o.deciding_vp).checked_mul(SCALE / fs.len() as u128).ok_or("score overflow")?;
        for id in fs {
            if id != o.id && candidates.get(&id).is_some_and(|c| c.topics.contains(&topic)) {
                let entry = scores.entry((topic,id)).or_default();
                *entry = entry.checked_add(amount).ok_or("score overflow")?;
            }
        }
    }
    Ok(())
}
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Serialize, Deserialize)]
pub struct Exclusion { pub candidate: u64, pub selected_conflict: u64, pub shared_managers: Vec<u64> }
#[derive(Clone, Debug, PartialEq, Eq, CandidType, Serialize, Deserialize)]
pub struct Roster { pub topic: i32, pub selected: Vec<u64>, pub exclusions: Vec<Exclusion> }
pub fn select(topic: i32, count: u8, candidates: &BTreeMap<u64,Candidate>, scores: &Scores) -> Result<Roster, &'static str> {
    if !(1..=15).contains(&count) || !TOPICS.contains(&topic) { return Err("selection parameters"); }
    let mut ranked: Vec<_> = candidates.values().filter_map(|c| {
        let s = scores.get(&(topic,c.id)).copied().unwrap_or(0);
        (s>0 && c.topics.contains(&topic)).then_some((c,s))
    }).collect();
    ranked.sort_by(|(a,sa),(b,sb)| sb.cmp(sa).then(a.id.cmp(&b.id)));
    let mut accepted: Vec<&Candidate> = Vec::new();
    let mut exclusions = Vec::new();
    for (c,_) in ranked {
        if let Some((a,shared)) = accepted.iter().find_map(|a| {
            let shared: Vec<_> = c.managers.intersection(&a.managers).copied().collect();
            (!shared.is_empty()).then_some((*a,shared))
        }) {
            exclusions.push(Exclusion{candidate:c.id, selected_conflict:a.id, shared_managers:shared});
        } else if accepted.len() < usize::from(count) { accepted.push(c); }
    }
    Ok(Roster{topic,selected:accepted.iter().map(|c| c.id).collect(),exclusions})
}
pub fn recipients(rosters: &[Roster]) -> BTreeSet<u64> { rosters.iter().flat_map(|r| r.selected.iter().copied()).collect() }

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    fn c(id:u64,ms:&[u64])->Candidate { Candidate{id,managers:ms.iter().copied().collect(),topics:TOPICS.into_iter().collect(),checked_at:1,evaluator_commit:EVALUATOR_COMMIT.into()} }
    fn obs(id:u64,vp:u64,fs:Vec<u64>)->Observation {Observation{id,public:true,deciding_vp:vp,followees:BTreeMap::from([(4,fs)]),observed_at:1}}
    #[test] fn exact_19000_and_ineligible_denominator() {
        let cs=BTreeMap::from([(1,c(1,&[100])),(2,c(2,&[200]))]); let mut s=Scores::new();
        for (vp,fs) in [(12000,vec![1]),(9000,vec![1,2,3]),(8000,vec![1,2])] {contribute(&mut s,&obs(99,vp,fs),&cs,None).unwrap();}
        assert_eq!(s[&(4,1)],19000*SCALE); assert_eq!(s[&(4,2)],7000*SCALE);
    }
    #[test] fn overlap_chain_and_sabotage() {
        let cs=BTreeMap::from([(1,c(1,&[10])),(2,c(2,&[10,20])),(3,c(3,&[20])),(4,c(4,&[10]))]);
        let s=Scores::from([((4,1),40),((4,2),30),((4,3),20),((4,4),10)]);
        let r=select(4,5,&cs,&s).unwrap();assert_eq!(r.selected,vec![1,3]);assert_eq!(r.exclusions[0].selected_conflict,1);
    }
    #[test] fn catchall_empty_and_exceptions() {
        let mut o=obs(99,100,vec![]);o.followees.insert(0,vec![1]);
        assert!(effective_followees(&o,4).unwrap().is_empty());assert!(effective_followees(&o,14).unwrap().is_empty());
        assert_eq!(effective_followees(&o,3).unwrap(),BTreeSet::from([1]));o.followees.insert(3,vec![]);assert!(effective_followees(&o,3).unwrap().is_empty());
    }
    #[test] fn duplicates_self_private_feedback_and_maximum() {
        let cs=BTreeMap::from([(1,c(1,&[10]))]);let mut s=Scores::new();
        contribute(&mut s,&obs(99,u64::MAX,vec![1,1]),&cs,None).unwrap();assert_eq!(s[&(4,1)],u128::from(u64::MAX)*SCALE);
        for id in [1,TARGET,99] { let mut o=obs(id,100,vec![1]);o.public=id!=99;contribute(&mut s,&o,&cs,Some(99)).unwrap(); }
        assert_eq!(s[&(4,1)],u128::from(u64::MAX)*SCALE);
    }
    #[test] fn ties_empty_and_cross_topic_recipients() {
        let cs=BTreeMap::from([(2,c(2,&[20])),(1,c(1,&[10]))]);let s=Scores::from([((4,1),1),((4,2),1)]);
        let r=select(4,5,&cs,&s).unwrap();assert_eq!(r.selected,vec![1,2]);assert_eq!(recipients(&[r.clone(),r]).len(),2);
        assert!(select(4,5,&cs,&Scores::new()).unwrap().selected.is_empty());
    }
    proptest! {
        #[test] fn permutation_and_vp_conservation(vps in prop::collection::vec(any::<u64>(),1..100), count in 1usize..=15) {
            let cs:BTreeMap<_,_>=(1..=count as u64).map(|id|(id,c(id,&[id+100]))).collect();
            let mut a=Scores::new();let mut b=Scores::new();
            for v in &vps {contribute(&mut a,&obs(99,*v,(1..=count as u64).collect()),&cs,None).unwrap();}
            for v in vps.iter().rev() {contribute(&mut b,&obs(99,*v,(1..=count as u64).rev().collect()),&cs,None).unwrap();}
            prop_assert_eq!(&a,&b);prop_assert_eq!(a.values().sum::<u128>(),vps.iter().map(|v|u128::from(*v)*SCALE).sum::<u128>());
            prop_assert_eq!(select(4,15,&cs,&a).unwrap(),select(4,15,&cs,&b).unwrap());
        }
    }
}
