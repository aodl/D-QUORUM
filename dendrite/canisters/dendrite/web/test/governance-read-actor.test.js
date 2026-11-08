import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnonymousGovernanceReadActor,governanceReadConfiguration} from '../src/governance-read-actor.js';

test('public Governance reads use an anonymous verified actor and preserve exact scalar metadata requests',async()=>{
 const calls=[],agent={};let seen;
 const actor=await createAnonymousGovernanceReadActor({host:'http://127.0.0.1:4944',fetchRootKey:true,createAgent:async config=>{seen=config;return agent;},createActor:(_factory,config)=>{assert.equal(config.agent,agent);assert.equal(config.canisterId.toText(),'rrkah-fqaaa-aaaaa-aaaaq-cai');return {list_neurons:async request=>{calls.push(request);return {full_neurons:[]};},get_neuron_info:async id=>{calls.push(id);return {Err:{error_message:'Missing'}};}};}});
 assert.equal(seen.identity.getPrincipal().isAnonymous(),true);assert.equal(seen.verifyQuerySignatures,true);assert.equal(seen.shouldFetchRootKey,true);
 const request={neuron_ids:[9007199254740993n]};await actor.list_neurons(request);await actor.get_neuron_info(9007199254740993n);assert.equal(calls[0],request);assert.equal(calls[1],9007199254740993n);
 assert.throws(()=>governanceReadConfiguration({host:1,fetchRootKey:false}),/host/);assert.throws(()=>governanceReadConfiguration({host:'http://127.0.0.1:4944',fetchRootKey:'true'}),/Root-key policy/);
 assert.equal(governanceReadConfiguration({host:'https://icp-api.io',fetchRootKey:false}).shouldFetchRootKey,false);
});
