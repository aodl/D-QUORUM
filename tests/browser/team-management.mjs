import {installCreationClockBeforeResume} from './creation-virtual-clock.mjs';
import {containBrowserNetwork} from "./local-network-guard.mjs";
// Actual compiled application + II. Only public principals and bounded UI evidence leave Chrome.
import puppeteer from '../../dendrite/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import {writeFile,readFile,rename} from 'node:fs/promises';
import {creationJourney} from './creation-journey.mjs';
const directory=process.env.SYSTEM_BROWSER_COORDINATION;
const origin=process.env.SYSTEM_BROWSER_ORIGIN;
if(!directory||!new URL(origin).hostname.endsWith('.localhost'))throw Error('local browser coordination required');
const launchOptions={executablePath:'/home/pptruser/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',headless:true,env:{...process.env,XDG_CONFIG_HOME:'/tmp/dendrite-browser-config',XDG_CACHE_HOME:'/tmp/dendrite-browser-cache'},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP *.localhost 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']};
const browser=await puppeteer.launch(launchOptions);
const deadline=setTimeout(()=>{console.error('signed browser test exceeded 20 minutes');process.exit(1);},1200000);
const denied=[];const events=[];const applicationPages=[];const authenticationRetries=[];const preflightHolds=new WeakMap();
await containBrowserNetwork(browser,denied,{beforeResume:installCreationClockBeforeResume});
const scenario=process.env.SYSTEM_BROWSER_SCENARIO;
if(!['scoped-signing','team-management','cancellation','wrong-provider','creation-recoverable','creation-production'].includes(scenario))throw Error('explicit local browser scenario required');
const scopeProbeMode=scenario==='scoped-signing';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function writeEvidence(path,bytes){await writeFile(path+'.tmp',bytes);await rename(path+'.tmp',path);}
async function click(page,label){await page.bringToFront();const buttons=await page.$$('button');for(const b of buttons){if((await b.evaluate(el=>el.textContent)).trim()===label){await b.click();return true;}}return false;}
async function waitSignal(name){for(let n=0;n<1200;n++){try{return JSON.parse(await readFile(`${directory}/${name}.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}await pause(500);}throw Error(`coordinator timeout: ${name}`);}
async function guard(page){page.on('dialog',async d=>{console.error('local UI dialog: '+d.type());await d.dismiss();});await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(!['localhost','127.0.0.1'].includes(u.hostname)&&!u.hostname.endsWith('.localhost')&&!['data:','blob:'].includes(u.protocol)){denied.push(u.origin);r.abort();}else {if(u.pathname.includes('/canister/rrkah-fqaaa-aaaaa-aaaaq-cai/'))events.push({method:r.method(),path:u.pathname});const hold=preflightHolds.get(page);if(hold&&u.pathname.includes(`/canister/${new URL(origin).hostname.split('.')[0]}/call`)){preflightHolds.delete(page);hold(r);}else r.continue();}});}
async function routeToTarget(page){await page.evaluate(()=>{location.hash='';});await page.evaluate(()=>{location.hash='#/neuron/100';});await page.waitForSelector('.control-panel',{timeout:90000});}
async function reviewManagers(page,manager){
 await page.select('.control-panel select',String(manager));await page.select('select[name=topic]','1');
 await page.$eval('input[name=followees]',el=>{el.value='';});await page.type('input[name=followees]','11,12,13,21,22');
 if(!await click(page,'Review following replacement'))throw Error('manager review missing');
}
async function invalidatePendingPreparation(page,manager,action){
 let request;let release;
 const reached=new Promise(resolve=>{release=resolve;});
 preflightHolds.set(page,r=>{request=r;release();});
 await reviewManagers(page,manager);
 let timer;try{await Promise.race([reached,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('preflight await boundary not reached')),90000);})]);}finally{clearTimeout(timer);}
 await action();
 await request.continue();
 await page.waitForNetworkIdle({idleTime:500,timeout:90000});
 if(await page.$('.transaction-review'))throw Error('cancelled preflight published a stale review');
}
async function adversarialAndUpgrade(users){
 await waitSignal('management-verified');
 const initial=await users[0].page.evaluate(async()=>await(await fetch('/asset-manifest.json')).json());
 const third=users[2].page;await routeToTarget(third);
 await invalidatePendingPreparation(third,13,async()=>{await third.evaluate(()=>{location.hash='';});await third.waitForFunction(()=>!document.querySelector('.control-panel'));});
 await writeEvidence(`${directory}/route-preparation.json`,JSON.stringify({blocked:true,boundary:'actual replicated check_neuron request held; route changed before response'}));
 await routeToTarget(third);await reviewManagers(third,13);await third.waitForSelector('.transaction-review',{timeout:90000});
 await writeEvidence(`${directory}/authority-review.json`,JSON.stringify({manager:13,role:'real Governance hotkey',reviewReady:true}));
 await waitSignal('authority-removed');
 await third.click('input[name=confirmation]');
 await third.$eval('.transaction-review button',button=>{button.click();button.click();});
 await third.waitForFunction(()=>document.body.innerText.includes('Final preflight failed'),{timeout:90000});
 await writeEvidence(`${directory}/authority-blocked.json`,JSON.stringify({blocked:true,duplicateActivation:true,boundary:'actual controller removed hotkey after review; fresh replicated report before dispatch'}));
 await waitSignal('authority-restored');
 await routeToTarget(third);await reviewManagers(third,13);await third.waitForSelector('.transaction-review',{timeout:90000});
 await third.evaluate(()=>fixtureMutationFault.arm('hold'));
 await third.click('input[name=confirmation]');await click(third,'Submit exact reviewed request');
 await third.waitForFunction(()=>fixtureMutationFault.state().held,{timeout:90000});
 await writeEvidence(`${directory}/genuine-dispatch-held.json`,JSON.stringify({boundary:'signed manage_neuron after final preflight, before local Governance dispatch'}));
 await waitSignal('genuine-authority-removed');await third.evaluate(()=>fixtureMutationFault.release());
 await third.waitForFunction(()=>document.body.innerText.includes('Governance returned a known rejection'),{timeout:90000});
 await writeEvidence(`${directory}/genuine-rejection.json`,JSON.stringify({knownGovernanceRejection:true,fault:'controller revoked hotkey after final preflight; actual signed Governance response'}));
 await waitSignal('genuine-authority-restored');
 const fourth=users[3].page;await routeToTarget(fourth);await reviewManagers(fourth,21);await fourth.waitForSelector('.transaction-review',{timeout:90000});
 await fourth.evaluate(()=>fixtureMutationFault.arm('lose'));
 await fourth.click('input[name=confirmation]');await click(fourth,'Submit exact reviewed request');
 await fourth.waitForFunction(()=>document.body.innerText.includes('Unresolved NNS transaction outcome'),{timeout:90000});
 const fault=await fourth.evaluate(()=>{fixtureMutationFault.arm('none');return fixtureMutationFault.state();});
 if(fault.faultRequestIds.length!==1)throw Error('transport retry changed the signed ingress identity');
 if(await fourth.$('.control-panel'))throw Error('uncertain mutation still exposes controls');
 await writeEvidence(`${directory}/lost-outcome.json`,JSON.stringify({unknown:true,manager:21,scriptedLostReply:true,...fault}));
 await waitSignal('lost-verified');
 await fourth.reload({waitUntil:'domcontentloaded'});await fourth.waitForFunction(()=>document.body.innerText.includes('Sign in with Internet Identity')&&!document.body.innerText.includes('Dendrite principal:'));
 await writeEvidence(`${directory}/lost-reload.json`,JSON.stringify({noAutomaticResubmission:true,reloadRequiresAuthentication:true,heapOnlyUncertaintyWarningWasDisplayed:true}));
 await routeToTarget(third);
 await invalidatePendingPreparation(third,13,async()=>{if(!await click(third,'Sign out'))throw Error('sign-out control missing');await third.waitForFunction(()=>!document.body.innerText.includes('Dendrite principal:'));});
 await third.reload({waitUntil:'domcontentloaded'});await third.waitForFunction(()=>document.body.innerText.includes('Sign in with Internet Identity')&&!document.body.innerText.includes('Dendrite principal:'));
 await writeEvidence(`${directory}/signout-preparation.json`,JSON.stringify({blocked:true,reloadRestoredNoCredential:true,boundary:'real II session signed out while replicated preflight response was held'}));
 await waitSignal('incompatible-verifier');
 const page=users[0].page;await reviewManagers(page,11);
 await page.waitForSelector('.control-panel .error',{timeout:90000});
 if(await page.$('.transaction-review'))throw Error('incompatible verifier authorised a review');
 await writeEvidence(`${directory}/incompatible-blocked.json`,JSON.stringify({blocked:true,fault:'scripted incompatible verifier module has no check_neuron; no Governance proposal 2'}));
 const compatible=await waitSignal('compatible-upgrade');
 const updated=await page.evaluate(async()=>await(await fetch('/asset-manifest.json')).json());
 await writeEvidence(`${directory}/upgrade-assets.json`,JSON.stringify({changed:JSON.stringify(initial)!==JSON.stringify(updated),before:initial,after:updated,module:compatible.module_sha256,sessionPrincipalUnchanged:await page.$eval('body',el=>el.innerText.includes('Dendrite principal:'))}));
}
async function cancellation(){
 const context=await browser.createBrowserContext(),page=await context.newPage();await guard(page);
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 const popupPromise=new Promise(resolve=>page.once('popup',resolve));
 if(!await click(page,'Sign in with Internet Identity'))throw Error('cancellation sign-in missing');
 const popup=await popupPromise;await popup.close();
 await page.waitForFunction(()=>document.body.innerText.includes('Try again')&&!document.body.innerText.includes('Dendrite principal:'),{timeout:150000}); // Pinned SDK establishment timeout is 120 seconds.
 const cleared=await page.evaluate(()=>localStorage.getItem('ic-delegation_expiration')===null);
 if(!cleared)throw Error('cancelled bootstrap left its SDK expiry record');
 await writeEvidence(`${directory}/cancellation.json`,JSON.stringify({actualPopupClosed:true,noSessionPublished:true,temporaryExpiryCleared:cleared,governanceRequests:events.length}));
 await context.close();
}
async function wrongProvider(){
 const context=await browser.createBrowserContext(),page=await context.newPage();await guard(page);
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 const popupPromise=new Promise(resolve=>page.once('popup',resolve));
 if(!await click(page,'Sign in with Internet Identity'))throw Error('wrong-provider sign-in control missing');
 const popup=await popupPromise;
 await page.waitForFunction(()=>document.body.innerText.includes('Try again')&&!document.body.innerText.includes('Dendrite principal:'),{timeout:150000});
 if(!popup.isClosed())await popup.close();
 if(denied.length||events.length)throw Error('wrong provider reached Governance/nonlocal destination');
 await writeEvidence(`${directory}/wrong-provider.json`,JSON.stringify({failedClosed:true,configurationFault:'actual local non-II provider origin; no fabricated signer or session',governanceRequests:events.length}));
 await context.close();
}
// Only setup-channel failures can restart once before manager authority exists.
// Creation retains its native hardware window while the real SDK rejects and
// replaces a closed channel; a failed signer or identity is never substituted.
// All identities are provisioned before manager authority or mutations exist.
async function authenticate(index){
 let retained;
 for(let attempt=0;attempt<2;attempt++){
  const pageIndex=applicationPages.length;
  try{return await authenticateAttempt(index,retained);}
  catch(error){
   if(!error.iiChannelFailure||attempt===1)throw error;
   if(scenario.startsWith('creation-')&&error.retainedNative&&!error.retainedNative.popup.isClosed())retained=error.retainedNative;else{await applicationPages[pageIndex].browserContext().close();retained=undefined;}
   const retry={index,failedAttempt:attempt+1,heading:error.iiChannelFailure,freshContext:!retained,nativeWindowRetained:!!retained};
   authenticationRetries.push(retry);
   console.error(JSON.stringify({phase:'II setup retry',...retry}));
   await writeEvidence(`${directory}/authentication-retries.json`,JSON.stringify(authenticationRetries));
  }
 }
}
async function authenticateAttempt(index,retained){
 const actions=[];console.error(JSON.stringify({phase:'II participant setup',index,retainedNative:!!retained}));
 const context=retained?.context??await browser.createBrowserContext();const page=retained?.page??await context.newPage();if(!retained){applicationPages.push(page);await guard(page);}
 if(!retained)await page.goto(scopeProbeMode?`${origin}/404.html`:origin,{waitUntil:'domcontentloaded'});
 if(scenario==='team-management')await page.evaluate(async()=>{globalThis.fixtureMutationFault=await import('/generated/mutation-fault-probe.js');});await page.waitForSelector('button');
 let popup,cdp,authenticatorId;
 if(retained){({popup,cdp,authenticatorId}=retained);if(popup.isClosed())throw Error('Retained native device window unexpectedly closed');if(!await click(page,'Sign in with Internet Identity')&&!await click(page,'Try again'))throw Error('actual application sign-in retry missing');}
 else {
  const opened=new Promise(resolve=>page.once('popup',resolve));
  console.error(JSON.stringify({phase:'II actual application sign-in',index}));
  if(!await click(page,'Sign in with Internet Identity'))throw Error('actual application sign-in missing');
  popup=await opened;await guard(popup);
  if(scenario.startsWith('creation-'))await popup.waitForFunction(()=>location.hostname==='id.ai.localhost',{timeout:45000});
  cdp=await popup.createCDPSession();await cdp.send('WebAuthn.enable');({authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}}));
  if(scenario.startsWith('creation-')){popup.on('requestfailed',r=>console.error(JSON.stringify({phase:'II failed request',index,path:new URL(r.url()).pathname,error:r.failure()?.errorText})));popup.on('pageerror',e=>console.error(JSON.stringify({phase:'II frontend exception',index,type:e.name})));}
 }

 await popup.bringToFront();
 if(scenario.startsWith('creation-')){page.on('console',m=>{if(m.text()==='creation-native-channel-close')console.error(JSON.stringify({phase:'native window closed by SDK',index,frames:m.stackTrace()}));});popup.on('close',()=>console.error(JSON.stringify({phase:'native authenticator window closed',index})));}
 for(let i=0;i<120;i++){
  if(popup.isClosed())break;
  if(scenario.startsWith('creation-')&&await page.$eval('body',el=>el.innerText.includes('Dendrite principal:')))break;
  try {
  // One guarded snapshot: the popup may close as authentication completes.
  let labels,headings;try{({labels,headings}=await popup.evaluate(()=>({labels:Array.from(document.querySelectorAll('button'),b=>b.textContent.trim()),headings:Array.from(document.querySelectorAll('h1,h2'),el=>el.textContent.trim().slice(0,160))})));}catch(error){if(popup.isClosed())break;if(String(error.message).includes('Execution context was destroyed')){await pause(500);continue;}throw error;}
  // These are public control labels, never credential, delegation or recovery material.
  if(i%10===0)console.error(JSON.stringify({phase:'II',index,labels,headings,buttons:await popup.$$eval('button',buttons=>buttons.map(b=>({label:b.textContent.trim(),disabled:b.disabled,expanded:b.getAttribute('aria-expanded')})))}));
  const failureHeading=headings.find(heading=>['Unable to connect','Connection closed','Invalid request','Unverified origin','Unsupported browser','Authentication failed','Attribute sharing failed'].includes(heading));
  if(failureHeading&&(!retained||i>=3)){
   await popup.screenshot({path:`${directory}/ii-failure-${index}.png`});
   const failure={phase:'II authentication',index,heading:failureHeading,uiActions:actions};
   await writeEvidence(`${directory}/ii-failure.json`,JSON.stringify(failure));
   const error=Error(`Internet Identity authentication failed: ${failureHeading}`);
   if(['Unable to connect','Connection closed'].includes(failureHeading)){error.iiChannelFailure=failureHeading;error.retainedNative={context,page,popup,cdp,authenticatorId};}
   throw error;
  }
  if(labels.includes('Authenticating...')){await popup.bringToFront();await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});await cdp.send('WebAuthn.setAutomaticPresenceSimulation',{authenticatorId,enabled:true});}
  if(labels.includes('Create identity')){actions.push('Create identity');const field=await popup.$('input:not([type=hidden])');if(field)await field.type(`Synthetic manager ${index}`);await click(popup,'Create identity');}
  else if(labels.includes('Create with passkey')){actions.push('Create with passkey');await click(popup,'Create with passkey');}
  else if(labels.includes('Create')){actions.push('Create');await click(popup,'Create');}
  else if(labels.includes('Continue'))await click(popup,'Continue');
  else if(labels.includes('Authorize'))await click(popup,'Authorize');
  else if(labels.includes('Sign in with passkey'))await click(popup,'Sign in with passkey');
  await pause(500);
  }catch(error){if(/Target closed|Execution context was destroyed/.test(String(error.message))){await pause(200);if(popup.isClosed())break;continue;}throw error;}
 }
 if(scopeProbeMode){
  await page.waitForFunction(()=>globalThis.scopeProvisioningPhase||document.body.innerText.includes('Scope probe failed:'),{timeout:90000});
  const provisioning=await page.evaluate(()=>globalThis.scopeProvisioningPhase);
  if(!provisioning)throw Error('scope probe failed before provisioning');
  await writeEvidence(`${directory}/scope-provisioning-principal.json`,JSON.stringify(provisioning));
  await waitSignal('scope-funding-ready');await page.evaluate(()=>globalThis.scopeProvisioningFunded=true);
  for(const label of ['Approve local funding capability probe','Approve local management capability probe']){
   await page.waitForFunction(label=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent===label),{timeout:90000},label);await click(page,label);
  }
  await page.waitForFunction(()=>globalThis.scopeProbeResult||document.body.innerText.includes('Scope probe failed:'),{timeout:90000});
  const proof=await page.evaluate(()=>globalThis.scopeProbeResult);
  if(!proof)throw Error(await page.$eval('body',el=>el.innerText));
  if(denied.length)throw Error('nonlocal browser request attempted');
  await writeEvidence(`${directory}/scope-probe.json`,JSON.stringify({...proof,uiActions:actions,authenticationRetries,deniedOrigins:denied,browser:await browser.version()}));
  return {scoped:true};
 }
 try { await page.waitForFunction(()=>document.body.innerText.includes('Dendrite principal:')||document.body.innerText.includes('Channel was closed before a response was received'),{timeout:45000}); }
 catch(error){throw error;}
 if(await page.$eval('body',el=>el.innerText.includes('Channel was closed before a response was received'))){const error=Error('II setup channel closed before authentication');error.iiChannelFailure='Connection closed';error.retainedNative={context,page,popup,cdp,authenticatorId};throw error;}
 const principal=await page.$eval('body',el=>/Dendrite principal: ([a-z0-9-]+)/.exec(el.innerText)?.[1]);
 if(!principal)throw Error('real application principal absent');
 // Presence metadata only; never read stored credentials or database contents.
 const storage=await page.evaluate(async()=>({expiryMarkerAbsent:!Object.hasOwn(localStorage,'ic-delegation_expiration'),legacyCredentialEntriesAbsent:!Object.hasOwn(localStorage,'ic-identity')&&!Object.hasOwn(localStorage,'ic-delegation'),authDatabaseAbsent:!(await indexedDB.databases()).some(db=>db.name==='auth-client-db')}));
 if(Object.values(storage).some(value=>!value))throw Error('fresh browser session retained SDK authentication storage');
 await writeEvidence(`${directory}/session-storage-${index}.json`,JSON.stringify(storage));
 return {context,page,principal,nativeDevice:{popup,cdp,authenticatorId}};
}
try{
 if(scenario==='cancellation'){await cancellation();if(denied.length||events.length)throw Error('cancelled login reached Governance or nonlocal network');console.log('Actual II popup closure terminates without a transaction signer');}
 else if(scenario==='wrong-provider'){await wrongProvider();console.log('Actual wrong-provider configuration failed without a transaction session');}
 else if(scopeProbeMode){await waitSignal('provisioned');await authenticate(0);console.log('Actual II signed child accepted for Governance and denied for a working non-Governance destination');}
 else if(scenario.startsWith('creation-')){await creationJourney({scenario,browser,authenticate,click,pause,writeEvidence,waitSignal,directory,origin,denied});}
 else {
 const users=[];for(let i=0;i<4;i++)users.push(await authenticate(i));
 await writeEvidence(`${directory}/principals.json`,JSON.stringify(users.map(u=>u.principal)));
 await waitSignal('provisioned');
 const outsider=users[3].page;await routeToTarget(outsider);
 await outsider.waitForFunction(()=>document.body.innerText.includes('This principal has no authority over a Found target manager'),{timeout:90000});
 if(await outsider.$('input[name=followees]'))throw Error('unlisted manager identity exposed mutation controls');
 const outsiderCalls=await outsider.evaluate(()=>fixtureMutationFault.state().mutationRequests);if(outsiderCalls!==0)throw Error('unlisted manager sent a mutation');
 await writeEvidence(`${directory}/wrong-manager.json`,JSON.stringify({realIIPrincipal:users[3].principal,initialManager:21,notInInitialElectorate:true,noMutationControl:true,mutationRequests:outsiderCalls}));
 const page=users[0].page;
 const publicEvidence=await page.evaluate(async()=>await (await import('/generated/evidence-probe.js')).inspect());
 await writeEvidence(`${directory}/public-evidence.json`,JSON.stringify(publicEvidence));
 console.error(JSON.stringify({phase:'anonymous public evidence',...publicEvidence}));await page.evaluate(()=>{location.hash='#/neuron/100';});
 await page.waitForSelector('.control-panel',{timeout:90000});
 await page.select('.control-panel select','11');await page.select('select[name=topic]','1');
 await page.type('input[name=followees]','11,12,13,21,22');
 if(!await click(page,'Review following replacement'))throw Error('management review control missing');
 await page.waitForFunction(()=>document.querySelector('.transaction-review')||Array.from(document.querySelectorAll('.error')).some(e=>e.textContent.includes('known')),{timeout:90000});
 const failure=await page.$$eval('.error',els=>els.map(e=>e.textContent.slice(0,300)));
 const review=await page.$('.transaction-review');
 await writeEvidence(`${directory}/review.json`,JSON.stringify({review:Boolean(review),failure,principals:users.map(u=>u.principal),deniedOrigins:denied,governanceRequests:events}));
 if(!review)throw Error('real known-manager review failed: '+JSON.stringify(failure));
 await page.click('input[name=confirmation]');await click(page,'Submit exact reviewed request');
 await page.waitForFunction(()=>/Proposal \d+ submitted\.|Proposal ID: \d+/.test(document.body.innerText),{timeout:90000});
 const id=await page.$eval('body',el=>/(?:Proposal |Proposal ID: )(\d+)/.exec(el.innerText)?.[1]);
 await writeEvidence(`${directory}/submitted.json`,JSON.stringify({id}));
 for(let index=1;index<3;index++){
 const voter=users[index].page;await voter.evaluate(()=>{location.hash='#/neuron/100';});await voter.waitForSelector('.control-panel',{timeout:90000});
 await voter.select('.control-panel select',String(11+index));
 await voter.type('input[name=management-proposal]',id);await click(voter,'Review manager vote');await voter.waitForSelector('.transaction-review',{timeout:90000});await voter.click('input[name=confirmation]');await click(voter,'Submit exact reviewed request');
 await voter.waitForFunction(proposal=>document.body.innerText.includes(`Operation: Manager vote Yes on proposal ${proposal}.`)&&!document.querySelector('.transaction-review'),{timeout:90000},id);
 }
 await writeEvidence(`${directory}/voted.json`,JSON.stringify({id,deniedOrigins:denied,governanceRequests:events}));
 await adversarialAndUpgrade(users);
 await waitSignal('verified');
 await page.evaluate(()=>{location.hash='';});await page.evaluate(()=>{location.hash='#/neuron/100';});await page.waitForSelector('.control-panel',{timeout:90000});
 await page.screenshot({path:`${directory}/executed.png`});
 const maturity=await waitSignal('maturity-ready');
 for(let index=0;index<2;index++){
  const voter=users[index].page;await voter.evaluate(target=>{location.hash=`#/neuron/${target}`;},maturity.target);await voter.waitForSelector('.control-panel',{timeout:90000});
  await voter.select('.control-panel select',String(11+index));
  await voter.type('input[name=management-proposal]',maturity.id);await click(voter,'Review manager vote');await voter.waitForSelector('.transaction-review',{timeout:90000});await voter.click('input[name=confirmation]');await click(voter,'Submit exact reviewed request');
  await voter.waitForFunction(proposal=>document.body.innerText.includes(`Operation: Manager vote Yes on proposal ${proposal}.`)&&!document.querySelector('.transaction-review'),{timeout:90000},maturity.id);
 }
 await writeEvidence(`${directory}/maturity-voted.json`,JSON.stringify({id:maturity.id,browserSignedManagers:[11,12],principals:users.slice(0,2).map(u=>u.principal)}));
 await waitSignal('browser-complete');
 if(denied.length)throw Error('nonlocal browser request attempted');
 console.log(JSON.stringify({classification:'actual II, compiled local application, signed real Governance management',principals:users.map(u=>u.principal),proposalId:id,deniedOrigins:denied,browser:await browser.version()}));
 }
 }catch(error){
 for(let index=0;index<applicationPages.length;index++){
  const page=applicationPages[index];
  try {if(!page.isClosed()&&page.url().startsWith(origin)){
   console.error(JSON.stringify({phase:'application failure',index,body:(await page.$eval('body',el=>el.innerText)).slice(0,4000)}));
   await page.screenshot({path:`${directory}/failure-${index}.png`});
  }}catch{console.error(JSON.stringify({phase:'failure diagnostics unavailable',index}));}
 }
 throw error;
}finally{clearTimeout(deadline);await browser.close();}
