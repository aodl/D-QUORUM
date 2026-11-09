// Real compiled UI only. Public receipts/IDs cross the coordinator boundary;
// II credentials, passkeys and delegation material never leave Chrome.
import {mkdir,readdir,readFile,stat} from 'node:fs/promises';

export async function creationJourney({scenario,browser,authenticate,click,pause,writeEvidence,waitSignal,directory,origin,denied}){
 const production=scenario==='creation-production',user=await authenticate(0);let page=user.page;
 page.on('response',response=>{if(response.status()>=400)console.error(JSON.stringify({phase:'creation HTTP failure',url:response.url(),status:response.status()}));});
 await writeEvidence(`${directory}/creation-principal.json`,JSON.stringify({principal:user.principal}));
 const fixture=await waitSignal('creation-provisioned');
 const receipts=`${directory}/receipts`;await mkdir(receipts,{recursive:true});await user.context.setDownloadBehavior({policy:'allow',downloadPath:receipts});
 async function press(label){console.error(JSON.stringify({phase:'creation action',label}));await page.bringToFront();const all=await page.$$('button');for(const b of all)if((await b.evaluate(el=>el.textContent)).trim()===label){await b.evaluate(el=>{for(let d=el.parentElement;d;d=d.parentElement)if(d.tagName==='DETAILS'&&!d.open)d.querySelector('summary')?.click();});await b.click();return;}throw Error(`Missing creation action: ${label}`);}
 async function idle(){await page.bringToFront();try{await page.waitForFunction(()=>document.querySelector('.creation-workflow')?.getAttribute('aria-busy')==='false',{timeout:90000});}catch(error){console.error(JSON.stringify({phase:'creation idle timeout',workflows:await page.$$eval('.creation-workflow',roots=>roots.map(root=>({busy:root.getAttribute('aria-busy'),tag:root.tagName,classes:root.className,buttons:Array.from(root.querySelectorAll('button'),b=>({label:b.textContent,disabled:b.disabled}))})))}));throw error;}const error=await page.$eval('.creation-workflow',root=>root.querySelector('[role=alert]')?.textContent??root.querySelector('.transaction-review .error')?.textContent);if(error)throw Error(`Creation UI blocked: ${error}`);}
 async function fill(name,value){console.error(JSON.stringify({phase:'creation field',name}));await page.bringToFront();await page.$eval(`[name="${name}"]`,el=>{el.value='';});await page.type(`[name="${name}"]`,value);}
 async function save(){const previous=new Map(await Promise.all((await readdir(receipts)).filter(n=>n.endsWith('.json')).map(async n=>[n,(await stat(`${receipts}/${n}`)).mtimeMs])));await press('Save creation receipt');
  for(let i=0;i<200;i++){for(const n of(await readdir(receipts)).filter(n=>n.endsWith('.json'))){const file=`${receipts}/${n}`;if((await stat(file)).mtimeMs!==previous.get(n)){try{const json=await readFile(file,'utf8'),value=JSON.parse(json);return {file,json,value};}catch{}}}await pause(50);}throw Error('Actual receipt download did not complete');}
 async function signPrepared(){const saved=await save();await page.click('[name=creation-intent-saved]');if(await page.$('[name=creation-request-confirmed]')){await page.click('[name=creation-request-confirmed]');await press('Sign exact creation request');}else{await page.click('[name=confirmation]');await press('Submit exact reviewed request');}await idle();return saved;}
 async function reauthenticate(label){let popup=(await user.context.pages()).find(p=>p!==page&&new URL(p.url()).hostname==='id.ai.localhost');
  if(user.nativeDevice.popup.isClosed())throw Error('Native passkey window was closed; the hardware surrogate is unavailable.');
  await user.nativeDevice.cdp.send('WebAuthn.setUserVerified',{authenticatorId:user.nativeDevice.authenticatorId,isUserVerified:true});
  await user.nativeDevice.cdp.send('WebAuthn.setAutomaticPresenceSimulation',{authenticatorId:user.nativeDevice.authenticatorId,enabled:true});
  const opened=p=>popup=p;page.once('popup',opened);await press(label);
  // The actual II frontend may reuse its own fresh session. Never export a
  // virtual authenticator credential/private key to manufacture the same P.
  for(let i=0;i<180;i++){const state=await page.$eval('body',el=>({text:el.textContent,busy:el.querySelector('.creation-workflow')?.getAttribute('aria-busy'),error:el.querySelector('.creation-workflow [role=alert]')?.textContent}));
   if(state.error)throw Error(`Creation authentication failed: ${state.error}`);
   const profile={'Consent to funding capability':'FundProvisioning','Consent to controller management capability':'ManageBootstrap','Consent to exact bootstrap capability':'CallBootstrap'}[label];
   if(profile?state.text.includes(`${profile}: active`)&&state.busy==='false':state.text.includes(`Dendrite principal: ${user.principal}`)){page.off('popup',opened);await page.bringToFront();return;}
   // AuthClient may reuse the still-open II window. Its native virtual
   // authenticator stays in that window; no credential is extracted or copied.
   popup=popup&&!popup.isClosed()?popup:(await user.context.pages()).find(p=>p!==page&&new URL(p.url()).hostname==='id.ai.localhost');
   if(!popup){await pause(100);continue;}
   try{const labels=await popup.$$eval('button',els=>els.map(el=>el.textContent.trim()));
    if(i%10===0)console.error(JSON.stringify({phase:'creation II reauthentication',label,labels,headings:await popup.$$eval('h1,h2,[role=alert]',els=>els.map(el=>el.textContent.trim().slice(0,300)))}));
    if(labels.includes('Authenticating...')){await popup.bringToFront();}
    else if(labels.includes('Continue'))await click(popup,'Continue');else if(labels.includes('Authorize'))await click(popup,'Authorize');
    else {const remembered=labels.find(v=>v.includes('Synthetic manager 0'));if(remembered)await click(popup,remembered);}
   }catch(e){if(!popup.isClosed()&&!/Execution context/.test(e.message))throw e;}await pause(500);}
  page.off('popup',opened);throw Error('Real II reauthentication prerequisite unavailable: the original P was not re-established; no key export or substituted identity was used.');}
 async function capabilities(){for(const [profile,label]of[['FundProvisioning','Consent to funding capability'],['ManageBootstrap','Consent to controller management capability'],['CallBootstrap','Consent to exact bootstrap capability']]){
   if(profile!=='FundProvisioning'&&!await page.$eval('.creation-workflow',el=>!el.innerText.includes('Controller C: not provisioned')))continue;
   const exists=await page.$$eval('button',(els,label)=>els.some(el=>el.textContent.trim()===label),label);if(exists)await reauthenticate(label);
  }}
 async function refresh(){await press('Refresh independent chain evidence');await idle();}
 await page.bringToFront();console.error(JSON.stringify({phase:'creation route and profile'}));await page.evaluate(()=>location.hash='#/create');await page.waitForSelector('[name=creation-profile]');await page.select('[name=creation-profile]',production?'ProductionCandidate':'RecoverableTest');
 await fill('managers',fixture.managers.join(','));if(production){await fill('delegates',`4=${fixture.managers.slice(0,3).join(',')}`);await fill('name','Local creation candidate');await fill('description','Provisional per-neuron controller; creator retains recoverable authority until separate finalisation.');}
 await press('Review creation plan');await idle();let saved=await save();await writeEvidence(`${directory}/creation-plan.json`,JSON.stringify(saved.value));await waitSignal('creation-funding-ready');
 await reauthenticate('Consent to funding capability');await refresh();
 for(let i=0;i<3;i++){await press('Review next provisioning request');await idle();await signPrepared();}
 await reauthenticate('Consent to controller management capability');await refresh();await press('Install the pinned bootstrap (install only)');await idle();
 await reauthenticate('Consent to exact bootstrap capability');await refresh();saved=await save();
 await writeEvidence(`${directory}/creation-controller-installed.json`,JSON.stringify(saved.value));await waitSignal('creation-stake-funded');
 // Actual application heap and credentials are discarded. Only the downloaded
 // non-secret receipt is restored; this does not pretend to restart hardware.
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('button');await reauthenticate('Sign in with Internet Identity');
 await page.evaluate(()=>location.hash='#/resume');await page.waitForSelector('[name=creation-receipt]');await(await page.$('[name=creation-receipt]')).uploadFile(saved.file);await idle();await capabilities();await refresh();
 await press('Verify funding and claim the one bound neuron');await idle();for(let i=0;i<20;i++){const present=await page.$$eval('button',els=>els.some(el=>el.textContent==='Advance one reviewed configuration step'));if(!present)break;await press('Advance one reviewed configuration step');await idle();}
 if(production){await page.click('[name=creation-lock-confirmed]');await press('Commit the reviewed lock');await idle();}
 saved=await save();await writeEvidence(`${directory}/creation-configured.json`,JSON.stringify(saved.value));
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
 const vote=async(manager,id)=>{await fill('creation-proposer',String(manager));await fill('creation-proposal',id);await press('Review manager Yes vote');await idle();await signPrepared();};
 let registration;if(production){registration=await propose('registration',fixture.managers[0]);for(const manager of fixture.managers.slice(1,4))await vote(manager,registration);await press('Begin registered manager rehearsal');await idle();}
 const rehearsal=await propose('rehearsal',fixture.managers[0]);if(production)for(const manager of fixture.managers.slice(1,3))await vote(manager,rehearsal);
 await writeEvidence(`${directory}/creation-rehearsal.json`,JSON.stringify({proposal:rehearsal,registration,receipt:(await save()).value}));await waitSignal('creation-rehearsal-verified');
 if(!production){if(await page.$$eval('button',els=>els.some(el=>/removal of every controller|Verify executed quorum and seal/.test(el.textContent))))throw Error('Test profile exposed irreversible finalisation');
  await page.$eval('[name=creation-dissolution-consent]',el=>el.closest('details').querySelector('summary').click());
  await page.click('[name=creation-dissolution-consent]');await press('Start reviewed recovery dissolution');await idle();await writeEvidence(`${directory}/creation-dissolving.json`,JSON.stringify((await save()).value));
  await press('Review return of leftover workflow ICP');await idle();await signPrepared();saved=await save();
  const returned=saved.value.intents.findLast(i=>i.kind==='ReturnIcp');if(returned?.state!=='Confirmed')throw Error('Unused workflow ICP return was not confirmed');
  await writeEvidence(`${directory}/creation-recovered.json`,JSON.stringify({return_block:returned.references.block_id,receipt:saved.value,scope:'Unused user-controlled ICP returned; seven-day locked stake remains in its neuron. Separate real-protocol test proves later disbursement.'}));
  await page.screenshot({path:`${directory}/creation-recoverable.png`});
 }else{
  await fill('creation-proposal',rehearsal);await press('Verify executed quorum and seal finalisation');await idle();await save();await press('Stop and verify quiescence');await idle();
  saved=await save();const c=saved.value.canister_id,t=saved.value.neuron_id;await fill('confirm-controller',c);await fill('confirm-neuron',t);await page.click('[name=creation-risk-confirmed]');await press('Review removal of bootstrap code');await idle();await signPrepared();
  await refresh();saved=await save();await writeEvidence(`${directory}/creation-code-removed.json`,JSON.stringify(saved.value));await waitSignal('creation-code-removal-verified');
  await page.reload({waitUntil:'domcontentloaded'});await reauthenticate('Sign in with Internet Identity');await page.evaluate(()=>location.hash='#/resume');await page.waitForSelector('[name=creation-receipt]');await(await page.$('[name=creation-receipt]')).uploadFile(saved.file);await idle();await reauthenticate('Consent to controller management capability');await refresh();
  await fill('confirm-controller',c);await fill('confirm-neuron',t);await page.click('[name=creation-risk-confirmed]');await press('Review removal of every controller');await idle();await signPrepared();await refresh();
  if(!await page.$eval('.creation-workflow',el=>el.innerText.includes('Finalised — Compliant')))throw Error('Fresh final report was not Compliant');
  if(await page.$eval('.creation-workflow',el=>/\b(?:FundProvisioning|ManageBootstrap|CallBootstrap): active/.test(el.textContent)))throw Error('Finalisation retained a local provisioning capability');
  await writeEvidence(`${directory}/creation-finalised.json`,JSON.stringify((await save()).value));await waitSignal('creation-finalisation-verified');
  await page.evaluate(t=>location.hash=`#/neuron/${t}`,t);await page.waitForSelector('.control-panel',{timeout:90000});await press('Review voting-power refresh');await page.waitForSelector('.transaction-review');await page.click('[name=confirmation]');await press('Submit exact reviewed request');
  await page.waitForFunction(()=>/Proposal ID: \d+/.test(document.body.innerText),{timeout:90000});const post=await page.$eval('body',el=>/Proposal ID: (\d+)/.exec(el.innerText)[1]);
  for(const manager of fixture.managers.slice(1,3)){await page.waitForSelector('.control-panel select',{timeout:90000});await page.select('.control-panel select',String(manager));await fill('management-proposal',post);await press('Review manager vote');await page.waitForSelector('.transaction-review');await page.click('[name=confirmation]');await press('Submit exact reviewed request');await page.waitForFunction(()=>!document.querySelector('.transaction-review'),{timeout:90000});}
  await writeEvidence(`${directory}/creation-post-final-management.json`,JSON.stringify({proposal:post,target:t,controller:c}));
 }
 await waitSignal('creation-browser-verified');if(denied.length)throw Error('Creation browser attempted non-local traffic');
}
