import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyExecutedCreationRehearsal} from '../src/creation-rehearsal.js';
const context={proposalId:7n,neuronId:99n,startedAt:100n,managers:[11n,12n,13n,14n,15n]};
function proposal(){return {id:[{id:7n}],topic:1,status:4,executed_timestamp_seconds:120n,failed_timestamp_seconds:0n,proposal_timestamp_seconds:110n,proposal:[{action:[{ManageNeuron:{neuron_id_or_subaccount:[{NeuronId:{id:99n}}],command:[{RefreshVotingPower:null}]}}]}],latest_tally:[{yes:3n,no:0n,total:5n}],ballots:[[11n,{vote:1,voting_power:1n}]]};}
test('executed aggregate majority permits a creator with one caller-visible ballot',()=>{
 const p=proposal();assert.equal(verifyExecutedCreationRehearsal(p,context),p);
 // Reviewed browser's complete-ballot predicate rejects this legitimate observation.
 assert.notEqual(p.ballots.length,context.managers.length);
});
test('execution proof never requires disclosure of other managers individual ballots',()=>{
 const p=proposal();p.ballots=[];assert.equal(verifyExecutedCreationRehearsal(p,context),p);
});
test('missing history, insufficient or inconsistent tally, wrong identity/action and changed manager count fail closed',()=>{
 for(const mutate of [()=>undefined,p=>({...p,id:[{id:8n}]}),p=>({...p,status:2}),p=>({...p,status:3}),p=>({...p,executed_timestamp_seconds:0n}),p=>({...p,failed_timestamp_seconds:121n}),p=>({...p,proposal_timestamp_seconds:99n}),p=>({...p,latest_tally:[]}),p=>({...p,latest_tally:[{yes:2n,no:0n,total:5n}]}),p=>({...p,latest_tally:[{yes:3n,no:3n,total:5n}]}),p=>({...p,latest_tally:[{yes:3n,no:0n,total:4n}]}),p=>({...p,proposal:[{action:[{ManageNeuron:{neuron_id_or_subaccount:[{NeuronId:{id:98n}}],command:[{RefreshVotingPower:null}]}}]}]}),p=>({...p,proposal:[{action:[{ManageNeuron:{neuron_id_or_subaccount:[{NeuronId:{id:99n}}],command:[{StartDissolving:null}]}}]}]})])assert.throws(()=>verifyExecutedCreationRehearsal(mutate(proposal()),context));
});
