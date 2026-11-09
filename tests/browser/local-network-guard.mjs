// Pause every new page target before execution, including the first II popup
// navigation. Page-level guards alone attach too late for that first request.
export async function containBrowserNetwork(browser, denied, {beforeResume}={}) {
 const root=await browser.target().createCDPSession();
 const attach=async parent=>{
  parent.on('Target.attachedToTarget',async event=>{
   const session=parent.connection().session(event.sessionId);
   try {
    await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
    session.on('Fetch.requestPaused',async request=>{
     const url=new URL(request.request.url);
     const allowed=['localhost','127.0.0.1'].includes(url.hostname)||url.hostname.endsWith('.localhost')||['data:','blob:','about:'].includes(url.protocol);
     try { if(allowed)await session.send('Fetch.continueRequest',{requestId:request.requestId});else{denied.push(url.origin);await session.send('Fetch.failRequest',{requestId:request.requestId,errorReason:'BlockedByClient'});} } catch(error){if(!/closed|detached/i.test(error.message))throw error;}
    });
    await attach(session);
    if(beforeResume)await beforeResume(session,event.targetInfo);
    await session.send('Runtime.runIfWaitingForDebugger');
   } catch(error){if(!/closed|detached/i.test(error.message))throw error;}
  });
  await parent.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
 };
 await attach(root);
 return root;
}
