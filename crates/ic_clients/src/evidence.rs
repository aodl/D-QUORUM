//! Resumable adaptation; the vendored rule engine remains byte-for-byte upstream.
use candid::{CandidType,Principal};
use serde::{Serialize,Deserialize};
use std::collections::{BTreeMap,BTreeSet};
use dendrite_types::*;
use crate::governance as g;
#[derive(Clone,Debug,CandidType,Serialize,Deserialize,PartialEq,Eq)]
pub enum Phase {Target,TargetMetadata,Dependencies(u32),DependencyMetadata(u32),Controller,Done}
#[derive(Clone,Debug,CandidType,Serialize,Deserialize)]
pub struct Collection {pub id:u64,pub phase:Phase,pub evidence:EvaluationEvidence,pub dependencies:Vec<u64>}
impl Collection {
 pub fn new(id:u64)->Self{Self{id,phase:Phase::Target,evidence:EvaluationEvidence{now_seconds:0,target:NeuronLookup::Unavailable,dependencies:BTreeMap::new(),controller:None,source_failures:vec![],unknown_committed_topics:0},dependencies:vec![]}}
 pub async fn advance(&mut self)->Result<Option<ComplianceReport>,String>{
  match self.phase {
   Phase::Target=>{
    let r=g::full(vec![self.id]).await?;
    self.evidence.now_seconds=r.neuron_infos.iter().find(|(id,_)|*id==self.id).map_or(0,|(_,n)|n.retrieved_at_timestamp_seconds);
    if self.evidence.now_seconds==0 {return Err("candidate existence unavailable".into());}
    self.evidence.target=match r.full_neurons.into_iter().find(|n|n.id.as_ref().map(|i|i.id)==Some(self.id) && n.visibility==Some(2)) {Some(n)=>NeuronLookup::Found(Box::new(normalize(n)?)),None=>NeuronLookup::ConfirmedMissing};
    self.phase=if matches!(self.evidence.target,NeuronLookup::Found(_)){Phase::TargetMetadata}else{Phase::Done};
   }
   Phase::TargetMetadata=>{
    let info=g::info(self.id).await?;merge(self.evidence.target.as_mut().ok_or("target missing")?,info,self.evidence.now_seconds)?;
    self.dependencies=self.evidence.target.as_ref().unwrap().followees.values().flatten().copied().collect::<BTreeSet<_>>().into_iter().collect();
    if self.dependencies.len()>MAX_DEPENDENCY_NEURONS {return Err("dependency bound".into());}self.phase=Phase::Dependencies(0);
   }
   Phase::Dependencies(offset)=>{
    let offset=offset as usize;
    if offset>=self.dependencies.len(){self.phase=Phase::DependencyMetadata(0);} else {
     let ids=self.dependencies[offset..self.dependencies.len().min(offset+50)].to_vec();let r=g::full(ids.clone()).await?;
     let mut found=BTreeMap::new();for n in r.full_neurons {let id=n.id.as_ref().ok_or("absent ID")?.id;if n.visibility==Some(2){found.insert(id,normalize(n)?);}}
     for id in &ids {self.evidence.dependencies.insert(*id,found.remove(id).map_or(NeuronLookup::ConfirmedMissing,|n|NeuronLookup::Found(Box::new(n))));}
     self.phase=Phase::Dependencies((offset+ids.len()) as u32);
    }
   }
   Phase::DependencyMetadata(offset)=>{
    if let Some(id)=self.dependencies.get(offset as usize).copied(){
     if let Some(n)=self.evidence.dependencies.get_mut(&id).and_then(NeuronLookup::as_mut){let info=g::info(id).await?;let at=info.retrieved_at_timestamp_seconds;merge(n,info,at)?;}
     self.phase=Phase::DependencyMetadata(offset+1);
    }else{self.phase=Phase::Controller;}
   }
   Phase::Controller=>{
    if let Some(p)=self.evidence.target.as_ref().and_then(|n|n.controller){let i=g::controller(p).await?;self.evidence.controller=Some(ControllerEvidence{call_succeeded:true,module_hash:i.module_hash,controllers:i.controllers});}self.phase=Phase::Done;
   }
   Phase::Done=>{}
  }
  if self.phase==Phase::Done {validate_evaluation_inputs(&self.evidence,SOURCE_REVISION).map_err(str::to_string)?;Ok(Some(evaluate(self.id,&self.evidence,SOURCE_REVISION)))}else{Ok(None)}
 }
}
pub fn normalize(n:g::Neuron)->Result<NeuronEvidence,String>{
 let minted=n.cached_neuron_stake_e8s.checked_sub(n.neuron_fees_e8s).ok_or("stake underflow")?;
 let (delay,dissolving)=match n.dissolve_state{Some(g::DissolveState::DissolveDelaySeconds(d))=>(Some(d),Some(false)),Some(g::DissolveState::WhenDissolvedTimestampSeconds(_))=>(None,Some(true)),None=>(None,None)};
 Ok(NeuronEvidence{id:n.id.ok_or("absent neuron ID")?.id,controller:n.controller,known_data:None,hot_keys:n.hot_keys,not_for_profit:Some(n.not_for_profit),dissolve_delay_seconds:delay,dissolving,effective_stake_e8s:Some(minted.checked_add(n.staked_maturity_e8s_equivalent.unwrap_or(0)).ok_or("stake overflow")?),minted_stake_e8s:Some(minted),voting_power_refreshed_timestamp_seconds:n.voting_power_refreshed_timestamp_seconds,potential_voting_power:n.potential_voting_power,deciding_voting_power:n.deciding_voting_power,committed_topics:vec![],followees:n.followees.into_iter().map(|(t,fs)|(t,fs.followees.into_iter().map(|id|id.id).collect())).collect()})
}
fn merge(n:&mut NeuronEvidence,i:g::NeuronInfo,at:u64)->Result<(),String>{
 if i.id.as_ref().map(|id|id.id)!=Some(n.id) || i.retrieved_at_timestamp_seconds.abs_diff(at)>300 || i.visibility!=Some(2) {return Err("metadata binding, visibility or timestamp".into());}
 n.known_data=i.known_neuron_data.map(|m|KnownNeuron{id:n.id,name:m.name,description:m.description,links:m.links.unwrap_or_default()});Ok(())
}
pub fn expected_controller(n:&g::Neuron,expected:Principal,id:u64)->Result<(),String>{
 if n.id.as_ref().map(|n|n.id)!=Some(id) || n.controller!=Some(expected){return Err("target identity or controller mismatch".into());}Ok(())
}
