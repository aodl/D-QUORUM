import {containBrowserNetwork} from './local-network-guard.mjs';
// Capability probe only: real II page, no injected session and no authentication claim.
import puppeteer from '../../dendrite/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
const browser=await puppeteer.launch({executablePath:'/home/pptruser/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',headless:true,env:{...process.env,XDG_CONFIG_HOME:'/tmp/ii-browser-config',XDG_CACHE_HOME:'/tmp/ii-browser-cache'},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP *.localhost 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
const deadline=setTimeout(()=>{console.error('II capability exceeded 180 seconds');process.exit(1);},180000);
const denied=[];await containBrowserNetwork(browser,denied);
try {
 const page=await browser.newPage();page.on('dialog',async d=>{console.error('II JavaScript dialog: '+d.type());if(d.type()==='confirm')await d.accept();else await d.dismiss();});
 const provider=process.env.II_CAPABILITY_URL??'http://id.ai.localhost:4943/';
 if(!new URL(provider).hostname.endsWith('.localhost'))throw Error('loopback identity provider required');
 await page.setRequestInterception(true);
 page.on('request',r=>{const u=new URL(r.url());if(!['localhost','127.0.0.1'].includes(u.hostname)&&!u.hostname.endsWith('.localhost')&&!['data:','blob:'].includes(u.protocol)){denied.push(u.origin);r.abort();}else r.continue();});
 const cdp=await page.createCDPSession();await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 let response; const attempts=[];
 for(let i=0;i<10;i++){ response=await page.goto(provider,{waitUntil:'domcontentloaded',timeout:45000});attempts.push(response.status());if(response.status()===200)break;await new Promise(r=>setTimeout(r,1000)); }
 if(response.status()===200)await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>/sign|create|continue|passkey/i.test(b.textContent)),{timeout:30000});
 const evidence={provider,classification:'real II HTTP/browser capability only; no login, delegation or transaction proof',attempts,status:response.status(),errorBody:response.status()===200?null:(await page.$eval('body',el=>el.innerText)).slice(0,2000),browser:await browser.version(),buttons:await page.locator('body').map(el=>Array.from(el.querySelectorAll('button')).map(b=>b.textContent?.slice(0,100))).wait(),deniedOrigins:denied};
 console.log(JSON.stringify(evidence));
 if(response.status()!==200||denied.length)throw Error('II capability failed: '+JSON.stringify(evidence));
} finally {clearTimeout(deadline);await browser.close();}
