import test from "node:test";
import assert from "node:assert/strict";
import {Principal} from "@icp-sdk/core/principal";
import {createCreationView} from "../src/creation-view.js";
import {createCreationPlan} from "../src/creation-plan.js";
import {newCreationReceipt} from "../src/creation-receipt.js";

// DOM recording only. These tests prove visible guardrails and review wiring;
// signed-browser/replica lanes independently prove authority and external effects.
class Node {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.attributes={};this.value="";this.checked=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  set textContent(value){this.text=String(value);}
  get textContent(){return (this.text??"")+this.children.map(n=>n.textContent??"").join(" ");}
  set innerHTML(_){throw Error("HTML parsing is forbidden");}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  async emit(name){for(const fn of this.events[name]??[])await fn({preventDefault(){}});}
  click(){return this.emit("click");}
}
const walk=root=>[root,...root.children.flatMap(walk)];
const find=(root,name)=>walk(root).find(n=>n.name===name);
const button=(root,label)=>walk(root).find(n=>n.tagName==="BUTTON"&&n.textContent===label);
const labels=root=>walk(root).filter(n=>n.tagName==="BUTTON").map(n=>n.textContent);
const owner=Principal.selfAuthenticating(Uint8Array.of(1,2,3)),cId="pi33i-pt777-77776-aaaaa-cai";
function mount({production=false,phase="RecoverableTestReady",planless=false,authenticated=true,...changes}={}){
  const previous=globalThis.document;globalThis.document={createElement:tag=>new Node(tag),createTextNode:text=>Object.assign(new Node("text"),{textContent:text})};
  const p=createCreationPlan({profile:production?"ProductionCandidate":"RecoverableTest",managers:production?["11","12","13","14","15"]:["11"],stakeIcp:"2",provisionIcp:"1",provisionCycles:"2000000000000",ledgerFeeE8s:"10000",committedTopics:[4],delegates:{4:["11","12","13"]},defaultNeuronId:"18422777432977120264",metadata:production?{name:"<img onerror=bad>",description:"Still provisional",links:[]}:null},owner,{origin:`http://${cId}.localhost:4943`,host:"http://127.0.0.1:4943",canisterId:cId,local:true},{sha256:"ab".repeat(32)});
  const receipt=newCreationReceipt(p);receipt.canister_id=cId;receipt.neuron_id="600";const calls=[];
  const state={phase:{[phase]:null},pending:[],external_proposal:[],disbursement_block:[7n]};
  const c={plan:planless?undefined:p,receipt,busy:false,observed:{state,system:{moduleHash:Uint8Array.of(1),controllers:[owner]},running:true},hasCapability:()=>false,export:()=>JSON.stringify(receipt),...changes};
  for(const name of ["searchOriginalProposal","newPlan","recoverUpgrade","connect","refresh","review","import","dispatch","discardPrepared","advance","prepareNnsProposal","prepareCreationVote","inspectProposal","seal","stop","readiness","prepareUninstall","prepareControllerRemoval","prepareReturnIcp","startInstalled","commitRevision","reconcileRevision","cancelRevision","reviewRevision","reconcileLedger","reconcileDisbursement","searchOriginalPayment","reconcileConversion","reconcileCreation","reconcileTeardown","reconcileNnsProposal","cancelUnsentProposalReservation","unseal","prepareStakeDisbursement","install","prepareProvisioning","prepareStakePayment"]){if(!c[name])c[name]=async(...args)=>{calls.push({name,args});};}
  c.fundingAccount=()=>({owner:owner.toText(),subaccount:"01",legacy:"02"});c.stakingAccount=()=>undefined;
  const root=new Node("main"),view=createCreationView({controller:c,signedIn:()=>authenticated,copyText:async value=>calls.push({name:"copy",value})});view.render(root);
  return {c,root,view,calls,close:()=>{globalThis.document=previous;}};
}
test("creation browsing and test states never start consent or offer irreversible finalisation",()=>{
 for(const phase of ["AwaitingStake","Configuring","AwaitingLock","RecoverableTestReady","Sealed","Recovering","Recovered"]){const f=mount({phase});try{
  assert.equal(f.calls.length,0);assert.ok(!labels(f.root).some(s=>/seal finalisation|removal of|Stop and verify/.test(s)));assert.match(f.root.textContent,/RecoverableTest/);
 }finally{f.close();}}
});
test("old receipt and absent code cannot expose a reinstall action",()=>{
 const f=mount();try{f.c.observed={system:{controllers:[owner]},management:{version:3n}};f.view.render(f.root);assert.match(f.root.textContent,/provenance required/);assert.ok(!labels(f.root).some(s=>/Install/.test(s)));
  f.c.receipt.neuron_id=null;f.c.observed.management.version=0n;f.view.render(f.root);assert.ok(button(f.root,"Install the pinned bootstrap (install only)"));
 }finally{f.close();}
});
test("recovery-only import requires its explicit checkbox and limits visible actions even for production receipts",async()=>{
 const f=mount({planless:true});try{
  const file=find(f.root,'creation-receipt');file.files=[{size:2,text:async()=>'{}'}];await file.emit('change');assert.deepEqual(f.calls.at(-1),{name:'import',args:['{}']});
  find(f.root,'creation-recovery-only').checked=true;const next=find(f.root,'creation-receipt');next.files=[{size:2,text:async()=>'{}'}];await next.emit('change');assert.deepEqual(f.calls.at(-1),{name:'import',args:['{}',{recoveryOnly:true,confirmed:true}]});
 }finally{f.close();}
 const production=mount({production:true,phase:'Sealed',recoveryOnly:true});try{
  assert.match(production.root.textContent,/Consent to controller management and the exact bootstrap capability/);
  assert.ok(!button(production.root,'Start reviewed recovery dissolution'));
  production.c.observed.recoveryBound=true;production.view.render(production.root);
  assert.match(production.root.textContent,/Recovery only — P still controls C/);
  assert.ok(!labels(production.root).some(s=>/removal of|seal finalisation|registration proposal|provisioning request|Commit the reviewed lock|Advance one reviewed/.test(s)));
  find(production.root,'creation-unseal-consent').checked=true;await button(production.root,'Restore the recoverable configuration path').click();assert.deepEqual(production.calls.at(-1),{name:'unseal',args:[{confirmed:true}]});
  production.c.observed.state.phase={Recovering:null};production.view.render(production.root);find(production.root,'creation-dissolution-consent').checked=true;await button(production.root,'Start reviewed recovery dissolution').click();assert.deepEqual(production.calls.at(-1),{name:'advance',args:[{StartDissolving:null},{confirmed:true}]});
  production.c.receipt.intents=[{kind:'DisburseStake',state:'Unknown',id:'original'}];production.view.render(production.root);assert.match(production.root.textContent,/original is unresolved/);assert.ok(!button(production.root,'Review dissolved stake disbursement'));
 }finally{production.close();}
});
test("code removal and controller removal require separate fresh exact-ID confirmations",async()=>{
 const f=mount({production:true,phase:"Sealed"});try{f.c.receipt.sealed_witness={};f.view.render(f.root);
  for(const [name,value]of[["confirm-controller",cId],["confirm-neuron","600"]]){find(f.root,name).value=value;await find(f.root,name).emit("input");}
  find(f.root,"creation-risk-confirmed").checked=true;await find(f.root,"creation-risk-confirmed").emit("change");await button(f.root,"Review removal of bootstrap code").click();
  assert.deepEqual(f.calls.at(-1),{name:"prepareUninstall",args:[{typedCanister:cId,typedNeuron:"600",confirmed:true}]});assert.ok(!button(f.root,"Review removal of every controller"));
  f.c.observed.system.moduleHash=undefined;f.view.render(f.root);assert.equal(find(f.root,"creation-risk-confirmed").checked,false);assert.equal(find(f.root,"confirm-controller").value,"");assert.ok(!button(f.root,"Review removal of bootstrap code"));
  await button(f.root,"Review removal of every controller").click();assert.deepEqual(f.calls.at(-1).args,[{typedCanister:"",typedNeuron:"",confirmed:false}]);
 }finally{f.close();}
});
test("exact financial review forwards both saved-intent and request confirmations",async()=>{
 const f=mount();try{f.c.prepared={details:"Exact payment plus fee",args:{amount:2n},intent:{id:"a",destination:cId,argument_digest:"b"}};f.view.render(f.root);
  await button(f.root,"Sign exact creation request").click();assert.deepEqual(f.calls.at(-1).args,[{saved:false,confirmed:false}]);
  find(f.root,"creation-intent-saved").checked=true;find(f.root,"creation-request-confirmed").checked=true;await button(f.root,"Sign exact creation request").click();assert.deepEqual(f.calls.at(-1).args,[{saved:true,confirmed:true}]);
  await button(f.root,"Cancel this unsent review").click();assert.equal(f.calls.at(-1).name,"discardPrepared");
 }finally{f.close();}
});
test("interrupted states distinguish unknown operations stopped controllers and actual final reports",async()=>{
 const f=mount({production:true});try{f.c.receipt.intents=[{id:"original",kind:"CreateCanister",state:"Unknown"}];f.view.render(f.root);assert.match(f.root.textContent,/Interrupted\/unknown CreateCanister/);assert.ok(!button(f.root,"Review next provisioning request"));
  f.c.receipt.intents=[];f.c.observed.stopped=true;f.view.render(f.root);await button(f.root,"Start the verified installed bootstrap").click();assert.equal(f.calls.at(-1).name,"startInstalled");
  f.c.observed={system:{controllers:[]},report:{overall_status:{NonCompliant:null}}};f.view.render(f.root);assert.match(f.root.textContent,/Finalised — NonCompliant/);assert.ok(!labels(f.root).some(s=>/Consent to (controller|exact bootstrap)/.test(s)));
  f.c.observed.report.overall_status={Compliant:null};f.view.render(f.root);assert.match(f.root.textContent,/Finalised — Compliant/);assert.ok(walk(f.root).some(n=>n.href==="#/neuron/600"));
 }finally{f.close();}
});
test("registration and recovery reviews remain explicit and metadata is text safe",async()=>{
 const f=mount({production:true,phase:"AwaitingRegistration"});try{
  assert.ok(!walk(f.root).some(n=>n.tagName==="IMG"));assert.match(f.root.textContent,/<img onerror=bad>/);
  find(f.root,"creation-proposer").value="11";await button(f.root,"Review global known-neuron registration proposal").click();assert.deepEqual(f.calls.at(-1),{name:"prepareNnsProposal",args:["Registration",11n]});
  find(f.root,"creation-dissolution-consent").checked=true;await button(f.root,"Start reviewed recovery dissolution").click();assert.deepEqual(f.calls.at(-1),{name:"advance",args:[{StartDissolving:null},{confirmed:true}]});
  f.c.observed.stakeBalance=200000001n;f.view.render(f.root);assert.match(f.root.textContent,/Overpayment: 1 e8s extra/);
  f.c.observed.stakeBalance=1n;f.view.render(f.root);assert.match(f.root.textContent,/Underpayment: 199999999/);
 }finally{f.close();}
});
test("plan revisions require an explicit saved review and untrusted files stay bounded",async()=>{
 const f=mount();try{f.c.receipt.proposed_plan={revision:"2"};f.view.render(f.root);assert.ok(!button(f.root,"Advance one reviewed configuration step"));find(f.root,"creation-revision-confirmed").checked=true;await button(f.root,"Apply reviewed plan revision").click();assert.deepEqual(f.calls.at(-1),{name:"commitRevision",args:[{confirmed:true}]});
  f.c.plan=undefined;f.view.render(f.root);const file=find(f.root,"creation-receipt");file.files=[{size:524289,text:async()=>{throw Error("must not read oversized input");}}];await file.emit("change");assert.match(f.root.textContent,/exceeds its size bound/);assert.ok(!f.calls.some(c=>c.name==="import"));
 }finally{f.close();}
});

test("only the production profile exposes a separately reviewed irreversible long lock",async()=>{
 const f=mount({production:true,phase:'AwaitingLock'});try{
  await button(f.root,'Commit the reviewed lock').click();assert.deepEqual(f.calls.at(-1),{name:'advance',args:[{CommitLock:null},{confirmed:false}]});
  find(f.root,'creation-lock-confirmed').checked=true;await button(f.root,'Commit the reviewed lock').click();assert.equal(f.calls.at(-1).args[1].confirmed,true);
  f.c.plan.profile={RecoverableTest:null};f.view.render(f.root);assert.ok(!button(f.root,'Commit the reviewed lock'));
 }finally{f.close();}
});
test("recovery controls preserve the original reference and never turn inspection into a retry",async()=>{
 const f=mount();try{find(f.root,"creation-recovery-reference").value="7";await find(f.root,"creation-recovery-reference").emit("input");
  const actions=[["Verify original ICP transfer block","reconcileLedger",[7n]],["Search next bounded page for the original payment","searchOriginalPayment",[]],["Reconcile original CMC notification","reconcileConversion",[]],["Verify original cycles burn and recover its canister ID","reconcileCreation",[7n]],["Verify original teardown from certified state","reconcileTeardown",[]],["Inspect Governance proposal","inspectProposal",[7n]],["Reconcile the original reserved proposal ID","reconcileNnsProposal",[7n]],["Reconcile the original dissolved-stake return","reconcileDisbursement",[7n]]];
  assert.equal(f.calls.length,0);for(const [label,name,args]of actions){await button(f.root,label).click();assert.deepEqual(f.calls.at(-1),{name,args});}
  assert.ok(!f.calls.some(c=>["dispatch","advance","prepareNnsProposal"].includes(c.name)));
  await button(f.root,"Save creation receipt").click();assert.equal(f.calls.length,actions.length);
  for(const [label,profile]of [["Consent to funding capability","FundProvisioning"],["Consent to controller management capability","ManageBootstrap"],["Consent to exact bootstrap capability","CallBootstrap"]]){await button(f.root,label).click();assert.deepEqual(f.calls.at(-1),{name:"connect",args:[profile]});}
 }finally{f.close();}
});
test("plan form preserves wide neuron IDs and rejects ambiguous delegate rows before review",async()=>{
 const f=mount({planless:true});try{
  const profile=find(f.root,"creation-profile");profile.value="ProductionCandidate";await profile.emit("change");
  const values={managers:"9007199254740993,12,13,14,15",delegates:"4=9007199254740993,12,13",name:"Provisional",description:"Creator still controls C",links:"https://example.com",committedTopics:"4"};
  for(const [name,value]of Object.entries(values)){find(f.root,name).value=value;await find(f.root,name).emit("input");}
  await walk(f.root).find(n=>n.tagName==="FORM").emit("submit");
  // The view's form event follows browser async event semantics.
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.at(-1).name,"review");assert.equal(f.calls.at(-1).args[0].managers[0],"9007199254740993");assert.deepEqual(f.calls.at(-1).args[0].delegates[4],["9007199254740993","12","13"]);
  const before=f.calls.length;find(f.root,"delegates").value="4=11,12,13\n4=12,13,14";await find(f.root,"delegates").emit("input");await walk(f.root).find(n=>n.tagName==="FORM").emit("submit");await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,before);assert.match(f.root.textContent,/distinct delegate row/);
 }finally{f.close();}
});

test("each visible phase action preserves its reviewed step and never runs during rendering",async()=>{
 const cases=[['AwaitingStake','Verify funding and claim the one bound neuron','advance',[{Claim:null}]],['Configuring','Advance one reviewed configuration step','advance',[{Configure:null}]],['AwaitingRegistration','Begin registered manager rehearsal','advance',[{BeginRehearsal:null}]],['Sealed','Verify readiness','readiness',[]],['Sealed','Stop and verify quiescence','stop',[]]];
 for(const [phase,label,name,args]of cases){const f=mount({production:true,phase});try{assert.equal(f.calls.length,0);await button(f.root,label).click();assert.deepEqual(f.calls.at(-1),{name,args});}finally{f.close();}}
 const f=mount({production:true,phase:'Rehearsing'});try{
  find(f.root,'creation-proposal').value='901';await find(f.root,'creation-proposal').emit('input');await button(f.root,'Review manager Yes vote').click();assert.deepEqual(f.calls.at(-1),{name:'prepareCreationVote',args:[11n,901n]});
  await button(f.root,'Inspect this proposal').click();assert.deepEqual(f.calls.at(-1),{name:'inspectProposal',args:[901n]});
  await button(f.root,'Verify executed quorum and seal finalisation').click();assert.deepEqual(f.calls.at(-1),{name:'seal',args:[901n]});
  await button(f.root,'Review benign manager refresh proposal').click();assert.deepEqual(f.calls.at(-1),{name:'prepareNnsProposal',args:['Rehearsal',11n]});
  await button(f.root,'Review dissolved stake disbursement').click();assert.equal(f.calls.at(-1).name,'prepareStakeDisbursement');
  f.c.receipt.sealed_witness={};f.view.render(f.root);await button(f.root,'Restore the recoverable configuration path').click();assert.deepEqual(f.calls.at(-1),{name:'unseal',args:[{confirmed:false}]});
 }finally{f.close();}
});
test("revisions and undispatched proposal reservations have separate cancellation controls",async()=>{
 const f=mount({production:true});try{
  f.c.observed.state.external_proposal=[{kind:{Registration:null},intent_id:Uint8Array.of(1),proposal_id:[],dispatched:false}];f.view.render(f.root);find(f.root,'cancel-proposal-reservation').checked=true;await button(f.root,'Cancel undispatched proposal reservation').click();assert.deepEqual(f.calls.at(-1),{name:'cancelUnsentProposalReservation',args:[{confirmed:true}]});
  f.c.observed.state.external_proposal[0].dispatched=true;f.view.render(f.root);assert.ok(!button(f.root,'Cancel undispatched proposal reservation'));
  await button(f.root,'Review plan changes').click();assert.equal(find(f.root,'creation-profile').disabled,true);assert.equal(find(f.root,'returnAccount').disabled,true);assert.equal(find(f.root,'managers').value,'11,12,13,14,15');
  await button(f.root,'Cancel editing').click();assert.ok(button(f.root,'Review plan changes'));
  await button(f.root,'Review plan changes').click();await walk(f.root).find(n=>n.tagName==='FORM').emit('submit');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.at(-1).name,'reviewRevision');
  f.c.receipt.proposed_plan={revision:'2'};f.view.render(f.root);await button(f.root,'Reconcile plan revision after interruption').click();assert.equal(f.calls.at(-1).name,'reconcileRevision');await button(f.root,'Cancel revision only if original plan is still confirmed').click();assert.equal(f.calls.at(-1).name,'cancelRevision');
 }finally{f.close();}
});
test("verified staking destinations and empty controller installation remain distinct",async()=>{
 const f=mount({phase:'AwaitingStake'});try{
  f.c.receipt.neuron_id=null;f.c.stakingAccount=()=>({owner:'Governance',subaccount:'01',legacy:'02'});f.view.render(f.root);assert.match(f.root.textContent,/Governance-owned/);await button(f.root,'Review optional payment from P\'s workflow balance').click();assert.equal(f.calls.at(-1).name,'prepareStakePayment');
  await button(f.root,'Copy Account owner').click();assert.deepEqual(f.calls.at(-1),{name:'copy',value:'Governance'});assert.match(f.root.textContent,/Copied Account owner/);
  f.c.observed={system:{controllers:[owner]},management:{version:0n}};f.view.render(f.root);await button(f.root,'Install the pinned bootstrap (install only)').click();assert.equal(f.calls.at(-1).name,'install');
  f.c.receipt.canister_id=null;f.view.render(f.root);await button(f.root,'Review next provisioning request').click();assert.equal(f.calls.at(-1).name,'prepareProvisioning');
  await button(f.root,'Refresh independent chain evidence').click();assert.equal(f.calls.at(-1).name,'refresh');
  f.c.plan=undefined;f.view.render(f.root);const file=find(f.root,'creation-receipt');file.files=[];await file.emit('change');file.files=[{size:2,text:async()=>'{}'}];await file.emit('change');assert.deepEqual(f.calls.at(-1),{name:'import',args:['{}']});
 }finally{f.close();}
});
test("signed-out planning and unavailable authority or funding evidence never imply readiness",()=>{
 const signedOut=mount({planless:true,authenticated:false});try{assert.match(signedOut.root.textContent,/Sign in above/);assert.equal(walk(signedOut.root).find(n=>n.tagName==='BUTTON'&&n.textContent==='Review creation plan').disabled,true);assert.equal(signedOut.calls.length,0);}finally{signedOut.close();}
 const f=mount({production:true});try{f.c.observed.preflight={managers:[{id:11n,role:'No authority'}]};f.c.observed.quoteError='stale rate';f.c.observed.fundingBalance=0n;f.c.observed.cyclesBalance=0n;f.c.observed.awaitingPublicVisibility=true;f.c.observed.controllerIcpBalance=1n;f.c.observed.management={cycles:100000000000n};f.view.render(f.root);assert.match(f.root.textContent,/Other managers use their own II sessions/);assert.doesNotMatch(f.root.textContent,/long-lock commitment are blocked/);assert.match(f.root.textContent,/No conversion payment can be sent/);assert.match(f.root.textContent,/No public compliance report is asserted/);assert.match(f.root.textContent,/No additional ICP conversion/);assert.equal(f.calls.length,0);
  f.c.observed.quote={fee:10000n,cyclesFee:100000000n,rate:{xdr_permyriad_per_icp:50000n,timestamp_seconds:1n},estimatedGrossCycles:5000000000000n,estimatedDepositCredit:4999900000000n,estimatedRemainingCycles:2999800000000n};f.c.observed.stakeBalance=f.c.plan.stake_e8s;f.view.render(f.root);assert.match(f.root.textContent,/deposit fee/);assert.match(f.root.textContent,/exact reviewed amount is present/);
 }finally{f.close();}
});

test("NNS dispatch errors survive clearing and rerendering the exact review",async()=>{
 const f=mount({production:true});try{
  f.c.prepared={details:"Exact registration",args:{},intent:{id:"original",destination:cId,argument_digest:"ab"},nnsReview:{kind:"DirectCreationRegistration",details:[],request:{},operation:"Registration"}};
  f.c.dispatch=async()=>{f.c.prepared=undefined;f.c.receipt.intents=[{id:"original",kind:"Registration",state:"Unknown"}];f.view.render(f.root);throw Error("Certified refusal audit unavailable; preserve original identity");};
  f.view.render(f.root);await button(f.root,"Submit exact reviewed request").click();
  assert.match(f.root.textContent,/Certified refusal audit unavailable; preserve original identity/);
  assert.ok(walk(f.root).some(n=>n.attributes.role==="alert"&&n.textContent.includes("Certified refusal audit unavailable")));
  assert.match(f.root.textContent,/Interrupted\/unknown Registration/);assert.ok(!button(f.root,"Submit exact reviewed request"));
 }finally{f.close();}
});

test('dispatch reservation disclosure uses the exact marker instead of assuming a management spender',()=>{
 const f=mount();try{f.c.prepared={details:'Cycles creation',args:{},intent:{id:'original',destination:cId,argument_digest:'ab'},reservationArgs:{spender:{owner:cId,subaccount:[]},amount:1n}};f.view.render(f.root);
 assert.match(f.root.textContent,/exact fixed marker owner, subaccount and below-fee allowance/);assert.ok(!f.root.textContent.includes('Its spender is the management principal'));assert.match(f.root.textContent,/Exact atomic dispatch reservation/);assert.match(f.root.textContent,new RegExp(cId));
 }finally{f.close();}
});
