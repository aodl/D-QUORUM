import puppeteer from '../../dendrite/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import {createServer} from 'node:http';
import {containBrowserNetwork} from './local-network-guard.mjs';
import {SyntheticPasskeys} from './synthetic-passkeys.mjs';

// Native CDP capability check only. No II authentication, application session,
// or economic creation is claimed by this small hardware prerequisite.
const server=createServer((_,res)=>res.end('<!doctype html><title>Isolated synthetic authenticator</title>'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://authenticator.localhost:${server.address().port}`;
const hardware=new SyntheticPasskeys({providerOrigin:origin}),denied=[];
const browser=await puppeteer.launch({executablePath:'/home/pptruser/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',headless:true,env:{...process.env,XDG_CONFIG_HOME:'/tmp/synthetic-passkey-config',XDG_CACHE_HOME:'/tmp/synthetic-passkey-cache'},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP *.localhost 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
const deadline=setTimeout(()=>{console.error('Synthetic authenticator runtime prerequisite timed out');process.exit(1);},120000);
const observations=[];let version;
try{
 const root=await containBrowserNetwork(browser,denied,{beforeResume:(cdp,info)=>hardware.beforeResume(cdp,info)});
 version=await root.send('Browser.getVersion');
 for(const [label,register]of[['participant0',true],['participant0',false],['participant1',true],['participant0',false]]){
  const context=await browser.createBrowserContext(),page=await context.newPage();await page.goto(origin);
  const ticket=await hardware.begin(page,label,register?'native-registration':'native-assertion');
  const opened=new Promise(resolve=>page.once('popup',resolve));await page.evaluate(url=>window.open(url,'synthetic-device'),origin);const popup=await opened;
  const result=await popup.evaluate(async register=>{
   const challenge=()=>crypto.getRandomValues(new Uint8Array(32));
   if(register)await navigator.credentials.create({publicKey:{challenge:challenge(),rp:{id:location.hostname,name:'Isolated synthetic hardware'},user:{id:challenge(),name:'Local synthetic participant',displayName:'Local synthetic participant'},pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{residentKey:'required',userVerification:'required'},timeout:10000}});
   await navigator.credentials.get({publicKey:{challenge:challenge(),rpId:location.hostname,userVerification:'required',timeout:10000}});
   return true;
  },register);
  if(result!==true)throw Error('Native WebAuthn operation failed');
  await hardware.checkpoint(ticket);await popup.close();await hardware.finish(ticket,{requireAssertion:true});await context.close();observations.push(hardware.evidence().participants);
 }
 const evidence=hardware.evidence();
 const a=observations[0][0].signature_counter,b=observations[2][1].signature_counter;
 if(!Number.isSafeInteger(a)||a<=0||!Number.isSafeInteger(b)||b<=0||observations[1][0].signature_counter!==a+1||observations[2][0].signature_counter!==a+1||evidence.participants[0].signature_counter!==a+2||evidence.participants[1].signature_counter!==b||denied.length)throw Error('Native credential continuity or participant isolation failed');
 const report={...evidence,observations,browser:version,denied_origins:denied,classification:'Pinned Chrome native create/get, CDP capture/add and popup replacement; no II/app authentication claim',passed:true};
 const json=JSON.stringify(report);hardware.assertEvidence(json);console.log(json);
}catch(error){
 const report={...hardware.evidence(),observations,browser:version,denied_origins:denied,passed:false,failure:{name:error.name,message:String(error.message).slice(0,300),stack:String(error.stack).split('\n').slice(0,8)}};
 const json=JSON.stringify(report);hardware.assertEvidence(json);console.log(json);throw Error('Native runtime prerequisite failed; bounded redacted diagnostic emitted');
}finally{clearTimeout(deadline);await hardware.dispose();await browser.close();await new Promise(resolve=>server.close(resolve));}
