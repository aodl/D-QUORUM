import {mkdir,readdir,readFile} from 'node:fs/promises';
import {advanceCreationBrowserClocks,installCreationPageClock} from './creation-virtual-clock.mjs';

// This is a capability/authentication diagnostic, not an economic creation.
export async function authCapabilityJourney({browser,authenticate,reauthenticatePage,click,pause,waitSignal,writeEvidence,directory,origin,denied,trackPage}){
 const users=[];for(let index=0;index<5;index++)users.push(await authenticate(index));
 if(new Set(users.map(u=>u.principal)).size!==5)throw Error('Five independent II principals required');
 await writeEvidence(`${directory}/auth-participants.json`,JSON.stringify(users.map(u=>u.principal)));
 const fixture=await waitSignal('auth-fixtures'),owner=users[0],observations=[];
 const probe=await owner.context.newPage();trackPage(probe);await installCreationPageClock(probe);
 await probe.goto(`${origin}/404.html?auth-capability&canister=${fixture.canister}`,{waitUntil:'domcontentloaded'});
 async function capabilities(stage){
  console.error(JSON.stringify({phase:'authentication diagnostic',stage}));
  for(const profile of ['Governance','FundProvisioning','ManageBootstrap','CallBootstrap']){
   await reauthenticatePage(probe,owner,profile,{profile,probe:true});
   const result=await probe.evaluate(()=>globalThis.authLifecycleResult);
   if(result.principal!==owner.principal||!result.proof.allowed||!result.proof.denied)throw Error('Capability diagnostic did not establish exact replica authority');
   observations.push({stage,...result});await writeEvidence(`${directory}/auth-capability-observations.json`,JSON.stringify(observations));
  }
 }
 await capabilities('aligned-clock');
 // Product UI sign-out, fresh login, actual downloaded draft receipt and import.
 await click(owner.page,'Sign out');
 await owner.page.waitForFunction(()=>!document.body.innerText.includes('Dendrite principal:'));
 await reauthenticatePage(owner.page,owner,'Sign in with Internet Identity');
 await owner.page.evaluate(()=>location.hash='#/create');await owner.page.waitForSelector('[name=creation-profile]');
 await owner.page.select('[name=creation-profile]','RecoverableTest');await owner.page.type('[name=managers]',fixture.managers.join(','));
 if(!await click(owner.page,'Review creation plan'))throw Error('Diagnostic plan review unavailable');await owner.page.waitForFunction(()=>document.querySelector('.creation-workflow')?.getAttribute('aria-busy')==='false');
 const planError=await owner.page.$eval('.creation-workflow',el=>el.querySelector('[role=alert]')?.textContent);if(planError)throw Error('Diagnostic draft plan blocked: '+planError);
 console.error(JSON.stringify({phase:'authentication diagnostic',stage:'draft receipt export and reload'}));
 const receipts=`${directory}/auth-receipts`;await mkdir(receipts,{recursive:true});await owner.context.setDownloadBehavior({policy:'allow',downloadPath:receipts});
 if(!await click(owner.page,'Save creation receipt'))throw Error('Diagnostic draft receipt export unavailable');let receipt;
 for(let n=0;n<100&&!receipt;n++){receipt=(await readdir(receipts)).find(f=>f.endsWith('.json'));if(!receipt)await pause(100);}
 if(!receipt)throw Error('Actual draft receipt download missing');
 const downloaded=JSON.parse(await readFile(`${receipts}/${receipt}`,'utf8'));
 if(downloaded.canister_id)throw Error('Diagnostic unexpectedly provisioned a canister');
 await owner.page.reload({waitUntil:'domcontentloaded'});await reauthenticatePage(owner.page,owner,'Sign in with Internet Identity');
 await owner.page.evaluate(()=>location.hash='#/resume');await owner.page.waitForSelector('[name=creation-receipt]');
 await(await owner.page.$('[name=creation-receipt]')).uploadFile(`${receipts}/${receipt}`);
 await owner.page.waitForFunction(()=>document.querySelector('.creation-workflow')?.getAttribute('aria-busy')==='false'&&document.body.innerText.includes('RecoverableTest'));
 console.error(JSON.stringify({phase:'authentication diagnostic',stage:'second tab and wrong participant'}));
 const second=await owner.context.newPage();await second.goto(origin,{waitUntil:'domcontentloaded'});
 await reauthenticatePage(second,owner,'Sign in with Internet Identity');await second.close();
 // A different person's native hardware must establish B, never expected A.
 const wrong=await users[1].context.newPage();trackPage(wrong);await wrong.goto(`${origin}/404.html?auth-capability&canister=${fixture.canister}`,{waitUntil:'domcontentloaded'});
 let mismatch=false;try{await reauthenticatePage(wrong,users[1],'Governance',{profile:'Governance',probe:true,expectedPrincipal:owner.principal});}catch(e){mismatch=e.message==='Synthetic participant application principal changed';}
 const wrongResult=await wrong.evaluate(()=>globalThis.authLifecycleResult);
 if(!mismatch||wrongResult.principal!==users[1].principal||wrongResult.principal===owner.principal)throw Error('Wrong participant was accepted as the owner');
 let controllerDenied=false;try{await reauthenticatePage(wrong,users[1],'ManageBootstrap',{profile:'ManageBootstrap',probe:true});}catch(e){controllerDenied=/Application authentication rejected:/.test(e.message)&&/controller/i.test(e.message);}
 const rejected=await wrong.evaluate(()=>globalThis.authLifecycleResult);if(!controllerDenied||rejected.hasSession)throw Error('Other participant acquired owner controller authority');
 await wrong.close();
 // Cancellation must clear an in-progress production factory generation. The
 // existing SDK establishment timeout is exercised without widening it.
 console.error(JSON.stringify({phase:'authentication diagnostic',stage:'production factory cancellation'}));
 const opened=new Promise(resolve=>probe.once('popup',resolve));await click(probe,'Governance');const popup=await opened;
 await popup.close();await click(probe,'Sign out');
 await probe.waitForFunction(()=>globalThis.authLifecycleCancellationResult,{timeout:150000});
 const cancelled=await probe.evaluate(()=>globalThis.authLifecycleCancellationResult);if(!cancelled.factoryRejected||!cancelled.noSession)throw Error('Cancelled factory published stale authority');
 for(const day of [31,90]){
  if(day===31)await capabilities('before-expiry');
  await writeEvidence(`${directory}/auth-clock-${day}-ready.json`,JSON.stringify({ready:true}));
  const clock=await waitSignal(`auth-clock-${day}`);await advanceCreationBrowserClocks(users,clock.now_ms);
  await click(probe,'Check expired session');
  const expired=await probe.evaluate(()=>globalThis.authLifecycleResult);if(!expired.expiredRejected||expired.hasSession)throw Error('Expired authentication retained authority');
  await probe.reload({waitUntil:'domcontentloaded'});await capabilities(`day-${day}`);
 }
 await probe.close();
 if(denied.length)throw Error('Diagnostic attempted nonlocal browser traffic');
 await writeEvidence(`${directory}/auth-capability-result.json`,JSON.stringify({classification:'real II and compiled production authentication factories; minimal synthetic local fixtures, no economic creation',principals:users.map(u=>u.principal),observations,normalPopupClosure:true,signoutReauthentication:true,reloadDraftReceiptImport:true,secondTabSamePrincipal:true,wrongParticipantRejected:true,cancelledGenerationCleared:true,expiryRejected:true,deniedOrigins:denied}));
 await waitSignal('browser-complete');
}
