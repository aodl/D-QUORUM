import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePrimaryFollow, prepareStandardSetFollowing } from '../src/transaction.js';
const ids = [11n,12n,13n,14n,15n];
const report = { managers: [], committed_topics: [] };
// Shape observed from pinned real Governance: batch metadata is deliberately absent.
const fixture = () => {
  const calls = [];
  const actor = {
    list_neurons: async ({ neuron_ids }) => ({ full_neurons: neuron_ids.map(id => ({ id: [{id}], visibility: [2], known_neuron_data: [] })), neuron_infos: neuron_ids.map(id => [id, { retrieved_at_timestamp_seconds: 100n }]), total_pages_available: [1n] }),
    get_neuron_info: async id => { calls.push(id); return { Ok: { id: [{id}], visibility: [2], retrieved_at_timestamp_seconds: 101n, known_neuron_data: [{name:`Manager ${id}`,description:[],links:[],committed_topics:[]}] } }; },
  };
  return { actor, calls };
};
test('replicated manager preparation uses scalar registration despite omitted list metadata; old helper negative control', async () => {
  const { actor, calls } = fixture();
  const batch = await actor.list_neurons({neuron_ids:ids});
  assert.equal(batch.full_neurons.every(n => !n.known_neuron_data.length), true);
  // Isolated historical helper: this is the exact old evidence error, not a policy mutation.
  assert.equal(batch.full_neurons.filter(n => n.known_neuron_data?.length).length, 0);
  const result = await preparePrimaryFollow(1, ids)({ report, nnsActor:actor });
  assert.deepEqual(result.command.Follow.followees.map(n => n.id), ids);
  assert.deepEqual(calls, ids);
  const again = await prepareStandardSetFollowing([{topic:1,followeeIds:ids}])({report,nnsActor:actor});
  assert.deepEqual(again.command.SetFollowing.topic_following[0][0].followees[0].map(n=>n.id), ids);
  assert.equal(calls.length, 10, 'fresh preparation does not reuse anonymous or earlier metadata');
});
test('manager metadata missing unavailable private wrong-ID malformed and skew remain distinct failures', async () => {
  for (const [label, change, expected] of [
    ['absent', r => {r.Ok.known_neuron_data=[];}, /known/],
    ['private', r => {r.Ok.visibility=[1];}, /public/],
    ['wrong ID', r => {r.Ok.id=[{id:99n}];}, /mismatched/],
    ['skew', r => {r.Ok.retrieved_at_timestamp_seconds=401n;}, /300-second/],
    ['malformed name', r => {r.Ok.known_neuron_data[0].name=9;}, /name/],
  ]) {
    const {actor}=fixture(), original=actor.get_neuron_info;
    actor.get_neuron_info=async id=>{const r=await original(id);change(r);return r;};
    await assert.rejects(preparePrimaryFollow(1,ids)({report,nnsActor:actor}),expected,label);
  }
  for (const value of [{Err:{error_type:3,error_message:'denied'}}, {}, {Ok:null}]) {
    const {actor}=fixture();actor.get_neuron_info=async()=>value;
    await assert.rejects(preparePrimaryFollow(1,ids)({report,nnsActor:actor}));
  }
  const {actor}=fixture();actor.get_neuron_info=async()=>{throw Error('transport unavailable');};
  await assert.rejects(preparePrimaryFollow(1,ids)({report,nnsActor:actor}), /transport unavailable/);
});
test('manager batch rejects duplicates unexpected IDs missing configurations and private records', async () => {
  for (const change of [r=>r.full_neurons.push(r.full_neurons[0]),r=>r.full_neurons[0].id=[{id:99n}],r=>r.full_neurons.pop(),r=>r.full_neurons[0].visibility=[1],r=>r.neuron_infos.push(r.neuron_infos[0]),r=>r.total_pages_available=[2n]]) {
    const {actor}=fixture(), original=actor.list_neurons;
    actor.list_neurons=async q=>{const r=await original(q);change(r);return r;};
    await assert.rejects(preparePrimaryFollow(1,ids)({report,nnsActor:actor}));
  }
});
