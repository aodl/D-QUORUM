import {advanceCreationBrowserClocks,installCreationPageClock} from './creation-virtual-clock.mjs';
// Real compiled UI only. Public receipts/IDs cross the coordinator boundary;
// Only synthetic native passkeys live in private fixture memory; application
// signing keys, delegations and authentication responses remain in Chrome.
import {mkdir,readdir,readFile,stat} from 'node:fs/promises';
import {IDL} from '../../dendrite/node_modules/@icp-sdk/core/lib/esm/candid/index.js';
import {creationArgumentTypes} from '../../dendrite/canisters/dendrite/web/src/creation-protocol.js';
import {hexBytes} from '../../dendrite/canisters/dendrite/web/src/creation-accounts.js';
import {exportCreationReceipt} from '../../dendrite/canisters/dendrite/web/src/creation-receipt.js';

export async function creationJourney({scenario,browser,authenticate,click,pause,writeEvidence,waitSignal,directory,origin,denied,reauthenticatePage}){
 const production=scenario==='creation-production',user=await authenticate(0),participants=[user];
 if(production)for(let index=1;index<5;index++)participants.push(await authenticate(index));
 let page=user.page;
 page.on('response',response=>{if(response.status()>=400)console.error(JSON.stringify({phase:'creation HTTP failure',url:response.url(),status:response.status()}));});
 await writeEvidence(`${directory}/creation-principal.json`,JSON.stringify({principal:user.principal,participants:participants.map(p=>p.principal)}));
 const fixture=await waitSignal('creation-provisioned');
 const receipts=`${directory}/receipts`;await mkdir(receipts,{recursive:true});await user.context.setDownloadBehavior({policy:'allow',downloadPath:receipts});
 async function press(label){console.error(JSON.stringify({phase:'creation action',label}));await page.bringToFront();const all=await page.$$('button');for(const b of all)if((await b.evaluate(el=>el.textContent)).trim()===label){await b.evaluate(el=>{for(let d=el.parentElement;d;d=d.parentElement)if(d.tagName==='DETAILS'&&!d.open)d.querySelector('summary')?.click();});await b.click();return;}throw Error(`Missing creation action: ${label}`);}
 async function idle(){await page.bringToFront();try{await page.waitForFunction(()=>document.querySelector('.creation-workflow')?.getAttribute('aria-busy')==='false',{timeout:90000});}catch(error){console.error(JSON.stringify({phase:'creation idle timeout',workflows:await page.$$eval('.creation-workflow',roots=>roots.map(root=>({busy:root.getAttribute('aria-busy'),tag:root.tagName,classes:root.className,buttons:Array.from(root.querySelectorAll('button'),b=>({label:b.textContent,disabled:b.disabled}))})))}));throw error;}const error=await page.$eval('.creation-workflow',root=>root.querySelector('[role=alert]')?.textContent??root.querySelector('.transaction-review .error')?.textContent);if(error){try{const checkpoint=await save();await writeEvidence(`${directory}/creation-failure-receipt.json`,checkpoint.json);}catch(saveError){console.error(JSON.stringify({phase:"failure receipt unavailable",error:String(saveError)}));}throw Error(`Creation UI blocked: ${error}`);}}
 async function fill(name,value){console.error(JSON.stringify({phase:'creation field',name}));await page.bringToFront();await page.$eval(`[name="${name}"]`,el=>{el.value='';});await page.type(`[name="${name}"]`,value);}
 async function save(){const previous=new Map(await Promise.all((await readdir(receipts)).filter(n=>n.endsWith('.json')).map(async n=>[n,(await stat(`${receipts}/${n}`)).mtimeMs])));await press('Save creation receipt');
  for(let i=0;i<200;i++){for(const n of(await readdir(receipts)).filter(n=>n.endsWith('.json'))){const file=`${receipts}/${n}`;if((await stat(file)).mtimeMs!==previous.get(n)){try{const json=await readFile(file,'utf8'),value=JSON.parse(json);return {file,json,value};}catch{}}}await pause(50);}throw Error('Actual receipt download did not complete');}
 async function signPrepared({holdController=false,holdProposal=false,holdRegistration=false,loseProposal=false,losePayment=false}={}){const saved=await save();await page.click('[name=creation-intent-saved]');if(holdController||holdProposal||holdRegistration||loseProposal||losePayment)await page.evaluate(async mode=>{globalThis.fixtureMutationFault=await import('/generated/mutation-fault-probe.js');fixtureMutationFault.arm(mode);},losePayment?'losePayment':holdController?'holdController':loseProposal?'lose':'hold');if(await page.$('[name=creation-request-confirmed]')){await page.click('[name=creation-request-confirmed]');await press('Sign exact creation request');}else{await page.click('[name=confirmation]');await press('Submit exact reviewed request');}if(holdRegistration){await page.waitForFunction(()=>fixtureMutationFault.state().held,{timeout:90000});await writeEvidence(`${directory}/creation-registration-reserved.json`,JSON.stringify({canister:saved.value.canister_id,neuron:saved.value.neuron_id}));await waitSignal('creation-registration-name-conflicted');await page.evaluate(()=>fixtureMutationFault.release());}if(holdProposal){await page.waitForFunction(()=>fixtureMutationFault.state().held,{timeout:90000});await writeEvidence(`${directory}/creation-rehearsal-fee-held.json`,JSON.stringify({canister:saved.value.canister_id,neuron:saved.value.neuron_id}));await waitSignal('creation-rehearsal-fee-raised');await page.evaluate(()=>fixtureMutationFault.release());}if(holdController){await page.waitForFunction(()=>fixtureMutationFault.state().held,{timeout:90000});await writeEvidence(`${directory}/creation-controller-removal-held.json`,JSON.stringify({canister:saved.value.canister_id,neuron:saved.value.neuron_id}));await waitSignal('creation-final-dust-injected');await page.evaluate(()=>fixtureMutationFault.release());}await idle();return saved;}
 async function reauthenticate(label,participant=user){
  const profile={'Consent to funding capability':'FundProvisioning','Consent to controller management capability':'ManageBootstrap','Consent to exact bootstrap capability':'CallBootstrap'}[label];
  await reauthenticatePage(page,participant,label,{profile});
 }
 async function renewParticipants(clock,saved,{all=false}={}){
  const observation=await advanceCreationBrowserClocks(participants,clock.now_ms);
  const renewed=all?participants:[user];
  for(const participant of renewed){page=participant.page;await page.reload({waitUntil:'domcontentloaded'});
   await reauthenticate('Sign in with Internet Identity',participant);}
  page=user.page;await page.evaluate(()=>location.hash='#/resume');await page.waitForSelector('[name=creation-receipt]');await(await page.$('[name=creation-receipt]')).uploadFile(saved.file);await idle();await capabilities();await refresh();
  return {...observation,credentials_renewed:true,renewed_principals:renewed.map(p=>p.principal),principals:participants.map(p=>p.principal)};
 }
 async function capabilities(){
  // HttpAgent captures fetch when constructed. Install the local-only fault
  // transport before consent creates capability agents, including after reload.
  await page.evaluate(async()=>{globalThis.fixtureMutationFault=await import('/generated/mutation-fault-probe.js');});
  for(const [profile,label]of[['FundProvisioning','Consent to funding capability'],['ManageBootstrap','Consent to controller management capability'],['CallBootstrap','Consent to exact bootstrap capability']]){
   if(profile!=='FundProvisioning'&&!await page.$eval('.creation-workflow',el=>!el.innerText.includes('Controller C: not provisioned')))continue;
   const exists=await page.$$eval('button',(els,label)=>els.some(el=>el.textContent.trim()===label),label);if(exists)await reauthenticate(label);
  }}
 async function refresh(){await press('Refresh independent chain evidence');await idle();}
 await page.bringToFront();console.error(JSON.stringify({phase:'creation route and profile'}));await page.evaluate(()=>location.hash='#/create');await page.waitForSelector('[name=creation-profile]');await page.select('[name=creation-profile]',production?'ProductionCandidate':'RecoverableTest');
 await fill('managers',fixture.managers.join(','));if(production){await fill('delegates',`4=${fixture.managers.slice(0,3).join(',')}`);await fill('name','Local creation candidate');await fill('description','Provisional per-neuron controller; creator retains recoverable authority until separate finalisation.');}
 await press('Review creation plan');await idle();let saved=await save();await writeEvidence(`${directory}/creation-plan.json`,JSON.stringify(saved.value));const fundingClock=await waitSignal('creation-funding-ready');
 if(production)await renewParticipants(fundingClock,saved);await capabilities();await refresh();
 for(let i=0;i<3;i++){await press('Review next provisioning request');await idle();await signPrepared();if(production&&i===1){saved=await save();await writeEvidence(`${directory}/creation-converted-before-first-create.json`,JSON.stringify(saved.value));const clock=await waitSignal('creation-first-create-clock');await renewParticipants(clock,saved);}}
 await reauthenticate('Consent to controller management capability');await refresh();await press('Install the pinned bootstrap (install only)');await idle();
 await reauthenticate('Consent to exact bootstrap capability');await refresh();saved=await save();
 await writeEvidence(`${directory}/creation-controller-installed.json`,JSON.stringify(saved.value));const stakeClock=await waitSignal(production?'creation-stake-funded':'creation-stake-ready');await renewParticipants(stakeClock,saved);
 // Actual application heap and credentials are discarded. Only the downloaded
 // non-secret receipt is restored; this does not pretend to restart hardware.
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('button');await reauthenticate('Sign in with Internet Identity');
 await page.evaluate(()=>location.hash='#/resume');await page.waitForSelector('[name=creation-receipt]');await(await page.$('[name=creation-receipt]')).uploadFile(saved.file);await idle();await capabilities();await refresh();
 if(!production){
  const before=saved.value;
  await page.$eval('[name=creation-upgrade-review]',el=>{for(let d=el.parentElement;d;d=d.parentElement)if(d.tagName==='DETAILS'&&!d.open)d.querySelector('summary')?.click();});
  await page.click('[name=creation-upgrade-review]');await press('Prepare approved bootstrap migration');await idle();await save();await page.click('[name=creation-upgrade-consent]');await press('Apply or reconcile approved bootstrap migration');await idle();
  const after=(await save()).value;
  if(after.canister_id!==before.canister_id||after.plan.nonce!==before.plan.nonce||after.plan.creation_id!==before.plan.creation_id||after.plan.bootstrap_sha256!==before.plan.bootstrap_sha256||after.bootstrap_upgrade?.state!=='Confirmed')throw Error('Historical frontend rollover replaced an original creation binding');
  await writeEvidence(`${directory}/creation-historical-frontend-migrated.json`,JSON.stringify(after));
 }
 if(!production){
  await press("Review optional payment from P's workflow balance");await idle();let interrupted=false;
  try{await signPrepared({losePayment:true});}catch(error){interrupted=/Creation UI blocked:/.test(error.message);if(!interrupted)throw error;}
  saved=await save();const original=saved.value.intents.at(-1),fault=await page.evaluate(()=>fixtureMutationFault.state());
  if(!interrupted||original.kind!=='PayStake'||original.state!=='Unknown'||fault.lostReplies!==1)throw Error('Accepted payment loss did not retain its original uncertain identity');
  await writeEvidence(`${directory}/creation-stake-payment-unknown.json`,JSON.stringify(saved.value));
  const clock=await waitSignal('creation-financial-90-day-clock');await renewParticipants(clock,saved);
  // A second genuine session can import the receipt, but cannot prepare new
  // spending while the original payment remains uncertain.
  const ownerPage=page,nextPage=new Promise(resolve=>ownerPage.once('popup',resolve));
  await ownerPage.evaluate(()=>window.open('about:blank','dendrite-creation-second-recovery'));page=await nextPage;await installCreationPageClock(page);await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('button');await reauthenticate('Sign in with Internet Identity');
  await page.evaluate(()=>location.hash='#/resume');await page.waitForSelector('[name=creation-receipt]');await(await page.$('[name=creation-receipt]')).uploadFile(saved.file);await idle();await capabilities();await refresh();
  if(await page.$$eval('button',els=>els.some(el=>/Review optional payment|Review next provisioning request|Sign exact creation request/.test(el.textContent))))throw Error('A second tab gained replacement payment authority');
  const second=(await save()).value.intents.at(-1);if(second.id!==original.id||second.request_binding.request_id!==original.request_binding.request_id||second.state!=='Unknown')throw Error('Second tab replaced the original payment identity');
  const secondaryPage=page;page=ownerPage;
  await secondaryPage.close();await page.bringToFront();
  await press('Search next bounded page for the original payment');await idle();saved=await save();const confirmed=saved.value.intents.at(-1);
  if(confirmed.id!==original.id||confirmed.created_at_time!==original.created_at_time||confirmed.request_binding.request_id!==original.request_binding.request_id||confirmed.state!=='Confirmed')throw Error('Permanent-block recovery replaced or repeated the original payment');
  await writeEvidence(`${directory}/creation-stake-payment-recovered.json`,JSON.stringify(saved.value));
 }
 await press('Verify funding and claim the one bound neuron');await idle();for(let i=0;i<20;i++){const present=await page.$$eval('button',els=>els.some(el=>el.textContent==='Advance one reviewed configuration step'));if(!present)break;await press('Advance one reviewed configuration step');await idle();}
 if(production){await page.click('[name=creation-lock-confirmed]');await press('Commit the reviewed lock');await idle();}
 saved=await save();await writeEvidence(`${directory}/creation-configured.json`,JSON.stringify(saved.value));
 if(production){const clock=await waitSignal('creation-31-day-clock');const evidence=await renewParticipants(clock,saved,{all:true});await writeEvidence(`${directory}/creation-31-day-resumed.json`,JSON.stringify(evidence));}
 // Exercise the compiled wizard at narrow width and 200% page scale while
 // signing remains real. These are visual/accessibility actions, not mocks or
 // substitutes for the independent on-chain configuration oracle.
 await page.setViewport({width:390,height:844});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.evaluate(()=>document.documentElement.style.zoom='200%');
 const accessibility=await page.evaluate(()=>{const root=document.querySelector('.creation-workflow'),rect=root.getBoundingClientRect();return {viewport:innerWidth,css_zoom:getComputedStyle(document.documentElement).zoom,reduced_motion:matchMedia('(prefers-reduced-motion: reduce)').matches,root_right:rect.right,root_left:rect.left,scroll_right:rect.left+root.scrollWidth*(parseFloat(getComputedStyle(document.documentElement).zoom)||1)};});
 if(accessibility.root_right>accessibility.viewport+1||accessibility.scroll_right>accessibility.viewport+1||accessibility.root_left< -1)throw Error('Creation wizard overflows its narrow scaled viewport');
 await page.$$eval('button',buttons=>buttons.find(b=>b.textContent.trim()==='Save creation receipt').focus());await page.keyboard.press('Tab');
 accessibility.keyboard_focus=await page.evaluate(()=>({tag:document.activeElement.tagName,visible:document.activeElement.matches(':focus-visible'),outline:getComputedStyle(document.activeElement).outlineStyle}));
 if(!accessibility.keyboard_focus.visible||accessibility.keyboard_focus.outline==='none')throw Error('Keyboard focus is not visibly retained in the creation wizard');
 await page.screenshot({path:`${directory}/creation-mobile.png`});await page.evaluate(()=>document.documentElement.style.zoom='');
 const scaleSession=await page.createCDPSession();await scaleSession.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
 accessibility.actual_page_scale=await page.evaluate(()=>visualViewport.scale);if(accessibility.actual_page_scale!==2)throw Error('Actual 200% browser page scale was not established');
 await writeEvidence(`${directory}/creation-accessibility.json`,JSON.stringify(accessibility));await scaleSession.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await scaleSession.detach();
 await page.setViewport({width:1280,height:900});await page.emulateMediaFeatures([]);
 const propose=async(kind,manager)=>{await fill('creation-proposer',String(manager));await press(kind==='registration'?'Review global known-neuron registration proposal':'Review benign manager refresh proposal');await idle();await signPrepared();return (await save()).value.intents.at(-1).references.proposal_id;};
 const vote=async(manager,id)=>{if(production&&manager!==fixture.managers[0]){const exported=await save(),participant=participants[fixture.managers.indexOf(manager)],ownerPage=page;page=participant.page;try{await page.bringToFront();await page.evaluate(()=>location.hash='#/resume');await page.waitForSelector('[name=creation-team-receipt]');await(await page.$('[name=creation-team-receipt]')).uploadFile(exported.file);await idle();await fill('creation-team-manager',String(manager));await press('Review exact creation Yes vote');await idle();await page.click('[name=creation-team-consent]');await press('Sign exact manager creation vote');await idle();}finally{page=ownerPage;}return;}await fill('creation-proposer',String(manager));await fill('creation-proposal',id);await press('Review manager Yes vote');await idle();await signPrepared();};
 const membershipProbe=async(stage,action,proposal)=>{
  const before=(await save()).value,original=before.intents.at(-1)?.id;
  await writeEvidence(`${directory}/creation-membership-${stage}-requested.json`,JSON.stringify({original_intent:original,proposal}));
  await waitSignal(`creation-membership-${stage}-changed`);
  let reason;try{await action();}catch(error){if(!/Creation UI blocked:.*following/i.test(error.message))throw error;reason=error.message;}
  if(!reason)throw Error(`Changed membership at ${stage} did not block its exact readiness check`);
  const after=(await save()).value;if(after.intents.at(-1)?.id!==original||after.sealed_witness)throw Error('Membership negative control replaced its intent or sealed the creation');
  await writeEvidence(`${directory}/creation-membership-${stage}-blocked.json`,JSON.stringify({blocked:true,original_intent:original,reason}));
  await waitSignal(`creation-membership-${stage}-restored`);await refresh();
 };
 let registration;if(production){
  // A real pinned validation refusal must clear only its original certified
  // reservation. A different real NNS proposal creates the name collision only
  // after this exact review and dispatch reservation.
  await fill('creation-proposer',String(fixture.managers[0]));await press('Review global known-neuron registration proposal');await idle();
  let refusal=false;try{await signPrepared({holdRegistration:true});}catch(error){refusal=/Creation UI blocked:/.test(error.message);if(!refusal)throw error;}
  saved=await save();const rejected=saved.value.intents.at(-1);
  if(!refusal||rejected.kind!=='Registration'||rejected.state!=='Rejected'||!rejected.reply_witness||!rejected.request_binding)throw Error('Real registration refusal was not authoritatively reconciled');
  const refusalWitness=rejected.reply_witness;
  await writeEvidence(`${directory}/creation-registration-refusal-step.bin`,IDL.encode([creationArgumentTypes.bootstrapAdvance],[{revision:BigInt(saved.value.plan.revision),step:{ResolveProposalRefusal:{intent_id:hexBytes(rejected.id),argument:hexBytes(refusalWitness.request.arg),certificate:hexBytes(refusalWitness.certificate),ingress_expiry:BigInt(refusalWitness.request.ingress_expiry),nonce:refusalWitness.request.nonce===null?[]:[hexBytes(refusalWitness.request.nonce)]}}}]));
  await writeEvidence(`${directory}/creation-registration-refused.json`,JSON.stringify(saved.value));await waitSignal('creation-refusal-upgrade-verified');
  await page.reload({waitUntil:'domcontentloaded'});await reauthenticate('Sign in with Internet Identity');await page.evaluate(()=>location.hash='#/resume');await page.waitForSelector('[name=creation-receipt]');await(await page.$('[name=creation-receipt]')).uploadFile(saved.file);await idle();await capabilities();await refresh();
  registration=await propose('registration',fixture.managers[0]);for(const manager of fixture.managers.slice(1,4))await vote(manager,registration);await press('Begin registered manager rehearsal');await idle();}
 if(production){
  await fill('creation-proposer',String(fixture.managers[0]));await press('Review benign manager refresh proposal');await idle();
  let refused=false;try{await signPrepared({holdProposal:true});}catch(error){refused=/Creation UI blocked:/.test(error.message);if(!refused)throw error;}
  saved=await save();const intent=saved.value.intents.at(-1);
  if(!refused||intent.kind!=='Rehearsal'||intent.state!=='Rejected'||!intent.reply_witness)throw Error('Real insufficient-funds refusal did not settle the exact rehearsal reservation');
  await writeEvidence(`${directory}/creation-rehearsal-refused.json`,JSON.stringify(saved.value));await waitSignal('creation-rehearsal-fee-restored');await refresh();
 }
 if(production)await membershipProbe('before',async()=>{await press('Review benign manager refresh proposal');await idle();});
 let rehearsal;
 if(production){
  await fill('creation-proposer',String(fixture.managers[0]));await press('Review benign manager refresh proposal');await idle();
  let interrupted=false;try{await signPrepared({loseProposal:true});}catch(error){interrupted=/Creation UI blocked:/.test(error.message);if(!interrupted)throw error;}
  saved=await save();const original=saved.value.intents.at(-1);
  if(!interrupted||original.state!=='Unknown')throw Error('Lost accepted proposal reply acquired replacement authority');
  await writeEvidence(`${directory}/creation-rehearsal-unknown.json`,JSON.stringify(saved.value));await waitSignal('creation-rehearsal-unknown-verified');
  await page.reload({waitUntil:'domcontentloaded'});await reauthenticate('Sign in with Internet Identity');await page.evaluate(()=>location.hash='#/resume');await page.waitForSelector('[name=creation-receipt]');await(await page.$('[name=creation-receipt]')).uploadFile(saved.file);await idle();await capabilities();await refresh();
  await press('Read the original certified proposal reply');await idle();saved=await save();const settled=saved.value.intents.at(-1);
  if(settled.id!==original.id||settled.request_binding.request_id!==original.request_binding.request_id||settled.state!=='Confirmed')throw Error('Lost reply reconciliation replaced its original request');
  rehearsal=settled.references.proposal_id;
 }else rehearsal=await propose('rehearsal',fixture.managers[0]);
 if(production)await membershipProbe('during',()=>vote(fixture.managers[1],rehearsal),rehearsal);
 if(production)for(const manager of fixture.managers.slice(1,3))await vote(manager,rehearsal);
 await writeEvidence(`${directory}/creation-rehearsal.json`,JSON.stringify({proposal:rehearsal,registration,receipt:(await save()).value}));const rehearsalClock=await waitSignal('creation-rehearsal-verified');
 if(!production){saved=await save();const renewed=await renewParticipants(rehearsalClock,saved);await writeEvidence(`${directory}/creation-recoverable-90-day-resumed.json`,JSON.stringify(renewed));}
 if(!production){if(await page.$$eval('button',els=>els.some(el=>/removal of every controller|Verify executed quorum and seal/.test(el.textContent))))throw Error('Test profile exposed irreversible finalisation');
  // Discard historical creation evidence deliberately. The recovery-only path
  // must prove current approved C/P/plan/T bindings through real signed calls,
  // without weakening certificate freshness or allowing finalisation.
  const recoveryValue=(await save()).value;recoveryValue.creation_witness=null;recoveryValue.sealed_witness=null;
  const recoveryFile=`${receipts}/recovery-without-history.json`;await writeEvidence(recoveryFile,exportCreationReceipt(recoveryValue));
  await page.reload({waitUntil:'domcontentloaded'});await reauthenticate('Sign in with Internet Identity');await page.evaluate(()=>location.hash='#/resume');await page.waitForSelector('[name=creation-receipt]');await page.click('[name=creation-recovery-only]');await(await page.$('[name=creation-receipt]')).uploadFile(recoveryFile);
  await page.waitForFunction(canister=>{const root=document.querySelector('.creation-workflow');return root?.getAttribute('aria-busy')==='false'&&(root.querySelector('[role=alert]')||root.innerText.includes('Recovery only — P still controls C')&&root.innerText.includes(`Controller C: ${canister}`));},{timeout:90000},recoveryValue.canister_id);
  await idle();await capabilities();await refresh();
  if(!await page.$eval('.creation-workflow',el=>el.innerText.includes('Recovery only — P still controls C')))throw Error('Explicit current-binding recovery mode was not established');
  await page.click('[name=creation-dissolution-consent]');await press('Start reviewed recovery dissolution');await idle();await writeEvidence(`${directory}/creation-dissolving.json`,JSON.stringify((await save()).value));
  await press('Review return of leftover workflow ICP');await idle();await signPrepared();saved=await save();
  const returned=saved.value.intents.findLast(i=>i.kind==='ReturnIcp');if(returned?.state!=='Confirmed')throw Error('Unused workflow ICP return was not confirmed');
  await writeEvidence(`${directory}/creation-recovered.json`,JSON.stringify({return_block:returned.references.block_id,receipt:saved.value,scope:'Unused user-controlled ICP returned; seven-day locked stake remains in its neuron. Separate real-protocol test proves later disbursement.'}));
  await page.screenshot({path:`${directory}/creation-recoverable.png`});
 }else{
  await press('Review unused controller-account funds');await idle();await page.click('[name=creation-default-icp-consent]');await press('Acknowledge unused controller-account funds');await idle();
  await fill('creation-proposal',rehearsal);await membershipProbe('after',async()=>{await press('Verify executed quorum and seal finalisation');await idle();},rehearsal);
  await fill('creation-proposal',rehearsal);await press('Verify executed quorum and seal finalisation');await idle();saved=await save();await writeEvidence(`${directory}/creation-sealed.json`,JSON.stringify(saved.value));await waitSignal('creation-sealed-dust-injected');await press('Stop and verify quiescence');await idle();
  saved=await save();const c=saved.value.canister_id,t=saved.value.neuron_id;await fill('confirm-controller',c);await fill('confirm-neuron',t);await page.click('[name=creation-risk-confirmed]');await press('Review removal of bootstrap code');await idle();await signPrepared();
  await refresh();saved=await save();await writeEvidence(`${directory}/creation-code-removed.json`,JSON.stringify(saved.value));const clock=await waitSignal('creation-code-removal-verified');
  await renewParticipants(clock,saved,{all:true});await writeEvidence(`${directory}/creation-90-day-resumed.json`,JSON.stringify({now_ms:clock.now_ms,principals:participants.map(p=>p.principal)}));
  await fill('confirm-controller',c);await fill('confirm-neuron',t);await page.click('[name=creation-risk-confirmed]');await press('Review removal of every controller');await idle();await signPrepared({holdController:true});await refresh();
  if(!await page.$eval('.creation-workflow',el=>el.innerText.includes('Finalised — Compliant')))throw Error('Fresh final report was not Compliant');
  if(await page.$eval('.creation-workflow',el=>/\b(?:FundProvisioning|ManageBootstrap|CallBootstrap): active/.test(el.textContent)))throw Error('Finalisation retained a local provisioning capability');
  const deniedCreator=await page.evaluate(async()=>{
   const controller=await globalThis.creationRetainedControllerProbe(),bootstrap=await globalThis.creationRetainedBootstrapProbe();
   delete globalThis.creationRetainedControllerProbe;delete globalThis.creationRetainedBootstrapProbe;
   return {controller,bootstrap,classification:'Test-only retained genuine scoped actors in this browser realm; no keys, delegations or envelopes exported. Product credentials were independently cleared.'};
  });
  if(!deniedCreator.controller.controller_denied||!deniedCreator.bootstrap.code_unavailable)throw Error('Old real delegated creator authority was not denied after finalisation');
  await writeEvidence(`${directory}/creation-signed-creator-denied.json`,JSON.stringify(deniedCreator));
  await writeEvidence(`${directory}/creation-finalised.json`,JSON.stringify((await save()).value));await waitSignal('creation-finalisation-verified');
  await page.evaluate(t=>location.hash=`#/neuron/${t}`,t);await page.waitForSelector('.control-panel',{timeout:90000});await press('Review voting-power refresh');await page.waitForSelector('.transaction-review');await page.click('[name=confirmation]');await press('Submit exact reviewed request');
  await page.waitForFunction(()=>/Proposal ID: \d+/.test(document.body.innerText),{timeout:90000});const post=await page.$eval('body',el=>/Proposal ID: (\d+)/.exec(el.innerText)[1]);
  for(const manager of fixture.managers.slice(1,3)){page=participants[fixture.managers.indexOf(manager)].page;await page.bringToFront();await page.evaluate(t=>location.hash=`#/neuron/${t}`,t);await page.waitForSelector('.control-panel select',{timeout:90000});await page.select('.control-panel select',String(manager));await fill('management-proposal',post);await press('Review manager vote');await page.waitForSelector('.transaction-review');await page.click('[name=confirmation]');await press('Submit exact reviewed request');await page.waitForFunction(()=>!document.querySelector('.transaction-review'),{timeout:90000});}
  page=user.page;await writeEvidence(`${directory}/creation-post-final-management.json`,JSON.stringify({proposal:post,target:t,controller:c}));
 }
 await waitSignal('creation-browser-verified');if(denied.length)throw Error('Creation browser attempted non-local traffic');
}
