import test from 'node:test';
import assert from 'node:assert/strict';
import {Principal} from '@icp-sdk/core/principal';
import {provesHistoricalGovernanceRefusal} from '../src/creation-protocol-compatibility.js';
import {creationPreflight,createCreationPlan,creationVotingMinimum} from '../src/creation-plan.js';

test('one-manager Review uses public APIs without requiring any external module evidence',async()=>{
 const owner=Principal.selfAuthenticating(Uint8Array.of(1)),id='hp4av-oiaaa-aaaar-qcaha-cai',now=1794000000n;
 const plan=createCreationPlan({profile:'RecoverableTest',managers:['11'],stakeIcp:'2',provisionIcp:'1',provisionCycles:'2000000000000',ledgerFeeE8s:'10000'},owner,{local:false,canisterId:id,origin:`https://${id}.icp0.io`,host:'https://icp-api.io'},{sha256:'ab'.repeat(32)});
 const economics={neuron_minimum_stake_e8s:100000000n,reject_cost_e8s:100000000n,transaction_fee_e8s:10000n,neuron_management_fee_per_proposal_e8s:10000n,voting_power_economics:[]};
 const actor={get_network_economics_parameters:async()=>economics,list_neurons:async()=>({total_pages_available:[1n],full_neurons:[{id:[{id:11n}],controller:[owner],hot_keys:[],visibility:[2],followees:[]}]}),get_neuron_info:async()=>({Ok:{id:[{id:11n}],retrieved_at_timestamp_seconds:now,visibility:[2],known_neuron_data:[{name:'Known manager'}]}})};

 let reads=0;
 // An upgrade, missing module path or module-read outage is immaterial to the
 // planner. It must never request a four-canister executable report.
 const evidence=await creationPreflight(plan,{actor,now,readSystem:async()=>{reads++;throw Error('external module changed');}});
 assert.equal(reads,0);assert.equal(evidence.managers[0].role,'Controller');assert.equal(plan.profile.RecoverableTest,null);assert.equal(plan.managers.length,1);assert.equal(plan.lock_seconds,604800n);
 assert.equal(creationVotingMinimum(economics),15778800n);
 actor.get_network_economics_parameters=async()=>({...economics,transaction_fee_e8s:'10000'});
 await assert.rejects(()=>creationPreflight(plan,{actor,now}),/economics/);
 actor.get_network_economics_parameters=async()=>{throw Error('Governance API unavailable');};
 await assert.rejects(()=>creationPreflight(plan,{actor,now}),/API unavailable/);
});
test('only historical Governance refusal non-execution proofs retain exact executable bindings',()=>{
 for(const hash of ['dbcf97ae8729a956521a0a928f1b1bcb93f6e9c0dafd0e42aa985588713b88c0','7f85124ee08c3f59c0050009268807c7aea2b80ee296c23338b05458888f19df','5ddc11d2c59d0199c48e50dcc29c5ac6d10011daa6a7594eee954bfc140e3944'])assert.equal(provesHistoricalGovernanceRefusal(hash),true);
 for(const hash of [null,undefined,'','ef'.repeat(32),'aa'.repeat(31)])assert.equal(provesHistoricalGovernanceRefusal(hash),false);
});
