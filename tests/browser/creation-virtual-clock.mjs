// Local acceptance only: advance the browser and replica clocks together.
// No certificate, delegation, deduplication or production lock check is replaced.
let clockOffsetMs=0;
export const creationClockOffsetMs=()=>clockOffsetMs;
function setClock(offset){
 const native=globalThis.__creationFixtureNativeDate??Date;
 Object.defineProperty(globalThis,'__creationFixtureNativeDate',{value:native,configurable:true});
 globalThis.Date=new Proxy(native,{
  apply:()=>new native(native.now()+offset).toString(),
  construct:(target,args,newTarget)=>Reflect.construct(target,args.length?args:[native.now()+offset],newTarget),
  get:(target,property,receiver)=>property==='now'?()=>target.now()+offset:Reflect.get(target,property,receiver),
 });
}
export async function installCreationClockBeforeResume(cdp,info){
 if(info.type==='page'&&clockOffsetMs!==0)await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${setClock})(${clockOffsetMs})`});
}
export async function installCreationPageClock(page){
 await page.evaluateOnNewDocument(setClock,clockOffsetMs);
 await page.evaluate(setClock,clockOffsetMs);
}
export async function advanceCreationBrowserClocks(participants,replicaNowMs){
 const next=Number(replicaNowMs)-Date.now();
 if(!Number.isSafeInteger(next)||next<0||next>120*86400000)throw Error('Invalid coordinated local clock advance');
 clockOffsetMs=next;
 for(const participant of participants)for(const page of await participant.context.pages()){
  await installCreationPageClock(page);
 }
 return {replica_now_ms:Number(replicaNowMs),offset_ms:clockOffsetMs,credentials_renewed:false};
}
