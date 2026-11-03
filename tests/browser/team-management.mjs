// Actual compiled application + II. Only public principals and bounded UI evidence leave Chrome.
import puppeteer from '../../dendrite/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import {writeFile,readFile} from 'node:fs/promises';
const directory=process.env.SYSTEM_BROWSER_COORDINATION;
const origin=process.env.SYSTEM_BROWSER_ORIGIN;
if(!directory||!new URL(origin).hostname.endsWith('.localhost'))throw Error('local browser coordination required');
const browser=await puppeteer.launch({executablePath:'/home/pptruser/.cache/puppeteer/chrome/linux-144.0.7559.96/chrome-linux64/chrome',headless:true,env:{...process.env,XDG_CONFIG_HOME:'/tmp/dendrite-browser-config',XDG_CACHE_HOME:'/tmp/dendrite-browser-cache'},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP *.localhost 127.0.0.1']});
const deadline=setTimeout(()=>{console.error('signed browser test exceeded 10 minutes');process.exit(1);},600000);
const denied=[];const events=[];
const expectScopeRejection=process.env.SYSTEM_BROWSER_EXPECT_SCOPE_REJECTION==='true';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function click(page,label){const buttons=await page.$$('button');for(const b of buttons){if((await b.evaluate(el=>el.textContent)).trim()===label){await b.click();return true;}}return false;}
async function waitSignal(name){for(let n=0;n<240;n++){try{return JSON.parse(await readFile(`${directory}/${name}.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}await pause(500);}throw Error(`coordinator timeout: ${name}`);}
async function guard(page){page.on('dialog',async d=>{console.error('local UI dialog: '+d.type());await d.dismiss();});await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(!['localhost','127.0.0.1'].includes(u.hostname)&&!u.hostname.endsWith('.localhost')&&!['data:','blob:'].includes(u.protocol)){denied.push(u.origin);r.abort();}else {if(u.pathname.includes('/canister/rrkah-fqaaa-aaaaa-aaaaq-cai/'))events.push({method:r.method(),path:u.pathname});r.continue();}});}
async function authenticate(index){
 const actions=[];
 const context=await browser.createBrowserContext();const page=await context.newPage();await guard(page);
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('button');
 const popupPromise=new Promise(resolve=>page.once('popup',resolve));
 if(!await click(page,'Sign in with Internet Identity'))throw Error('actual application sign-in missing');
 const popup=await popupPromise;await guard(popup);
 const cdp=await popup.createCDPSession();await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 for(let i=0;i<120;i++){
  if(popup.isClosed())break;
  try {
  let labels;try{labels=await popup.$$eval('button',els=>els.map(b=>b.textContent.trim()));}catch(error){if(popup.isClosed())break;if(String(error.message).includes('Execution context was destroyed')){await pause(500);continue;}throw error;}
  // These are public control labels, never credential, delegation or recovery material.
  if(i%10===0)console.error(JSON.stringify({phase:'II',index,labels}));
  if(labels.includes('Create identity')){actions.push('Create identity');const field=await popup.$('input:not([type=hidden])');if(field)await field.type(`Synthetic manager ${index}`);await click(popup,'Create identity');}
  else if(labels.includes('Create with passkey')){actions.push('Create with passkey');await click(popup,'Create with passkey');}
  else if(labels.includes('Create')){actions.push('Create');await click(popup,'Create');}
  else if(labels.includes('Continue'))await click(popup,'Continue');
  else if(labels.includes('Authorize'))await click(popup,'Authorize');
  await pause(500);
  }catch(error){if(/Target closed|Execution context was destroyed/.test(String(error.message))){await pause(200);if(popup.isClosed())break;continue;}throw error;}
 }
 await page.waitForFunction(()=>document.body.innerText.includes('Dendrite principal:')||document.body.innerText.includes('Unrestricted Internet Identity sessions cannot authorize NNS transactions.'),{timeout:45000});
 const rejected=await page.$eval('body',el=>el.innerText.includes('Unrestricted Internet Identity sessions cannot authorize NNS transactions.'));
 if(rejected){
  const evidence={classification:'real II/WebAuthn and compiled local frontend; scope rejection before Governance, not a signed Governance success',scopeRejection:true,uiActions:actions,deniedOrigins:denied,governanceRequests:events,browser:await browser.version()};
  await writeFile(`${directory}/scope-rejection.json`,JSON.stringify(evidence));
  if(!expectScopeRejection)throw Error('Pinned real II returned an unrestricted delegation; production validation correctly refuses it');
  if(!actions.includes('Create with passkey')||!actions.includes('Create identity')||denied.length||events.length)throw Error('Scope rejection lacks real WebAuthn UI evidence or reached an unintended network');
  return {rejected:true};
 }
 const principal=await page.$eval('body',el=>/Dendrite principal: ([a-z0-9-]+)/.exec(el.innerText)?.[1]);
 if(!principal)throw Error('real application principal absent');
 return {context,page,principal};
}
try{
 if(expectScopeRejection){const outcome=await authenticate(0);if(!outcome.rejected)throw Error('expected actual II scope rejection missing');console.log('Actual II scope refusal verified; no Governance requests');}
 else {
 const users=[];for(let i=0;i<2;i++)users.push(await authenticate(i));
 await writeFile(`${directory}/principals.json`,JSON.stringify(users.map(u=>u.principal)));
 await waitSignal('provisioned');
 const page=users[0].page;await page.goto(`${origin}/#/neuron/100`,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('.control-panel',{timeout:90000});
 await page.type('input[name=followees]','21,22,23,24,25');
 if(!await click(page,'Review following replacement'))throw Error('management review control missing');
 await page.waitForFunction(()=>document.querySelector('.transaction-review')||Array.from(document.querySelectorAll('.error')).some(e=>e.textContent.includes('known')),{timeout:90000});
 const failure=await page.$$eval('.error',els=>els.map(e=>e.textContent.slice(0,300)));
 const review=await page.$('.transaction-review');
 await writeFile(`${directory}/review.json`,JSON.stringify({review:Boolean(review),failure,principals:users.map(u=>u.principal),deniedOrigins:denied,governanceRequests:events}));
 if(!review)throw Error('real known-manager review failed: '+JSON.stringify(failure));
 await page.click('input[name=confirmation]');await click(page,'Submit exact reviewed request');
 await page.waitForFunction(()=>/Proposal \d+ submitted\.|Proposal ID: \d+/.test(document.body.innerText),{timeout:90000});
 const id=await page.$eval('body',el=>/(?:Proposal |Proposal ID: )(\d+)/.exec(el.innerText)?.[1]);
 await writeFile(`${directory}/submitted.json`,JSON.stringify({id}));
 const voter=users[1].page;await voter.goto(`${origin}/#/neuron/100`,{waitUntil:'domcontentloaded'});await voter.waitForSelector('.control-panel',{timeout:90000});
 await voter.type('input[name=management-proposal]',id);await click(voter,'Review manager vote');await voter.waitForSelector('.transaction-review',{timeout:90000});await voter.click('input[name=confirmation]');await click(voter,'Submit exact reviewed request');
 await voter.waitForFunction(()=>document.body.innerText.includes('succeeded'),{timeout:90000});
 await writeFile(`${directory}/voted.json`,JSON.stringify({id,deniedOrigins:denied,governanceRequests:events}));
 await waitSignal('verified');
 if(denied.length)throw Error('nonlocal browser request attempted');
 console.log(JSON.stringify({classification:'actual II, compiled local application, signed real Governance management',principals:users.map(u=>u.principal),proposalId:id,deniedOrigins:denied,browser:await browser.version()}));
 }
}finally{clearTimeout(deadline);await browser.close();}
