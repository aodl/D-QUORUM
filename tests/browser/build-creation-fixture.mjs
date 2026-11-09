// Isolated browser-fixture policy: keep II's window (and Chrome's native
// synthetic passkey device) alive between genuine SDK authentication requests.
// The SDK Signer already supports this option. AuthClient does not forward it.
// No signature, scope, expiry, certificate or application workflow is replaced.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=resolve(process.argv[2]),{buildFrontend}=await import(pathToFileURL(`${source}/canisters/dendrite/web/build-frontend.mjs`));
let transformed=0;
await buildFrontend({plugins:[{name:'creation-native-authenticator-window',setup(build){
build.onLoad({filter:/@icp-sdk\/signer\/lib\/esm\/web\/postMessageChannel\.js$/},async({path})=>{
 const original=await readFile(path,'utf8');return {contents:original.replace('this.#options.signerWindow.close();','console.trace("creation-native-channel-close"); this.#options.signerWindow.close();'),loader:'js'};
});
build.onLoad({filter:/@icp-sdk\/auth\/dist\/esm\/client\/auth-client\.js$/},async({path})=>{
 const original=await readFile(path,'utf8'),needle='new Signer({';
 if(original.split(needle).length!==2)throw Error('Pinned AuthClient constructor changed; review native-device retention before testing');
 if(original.split('new PostMessageTransport({').length!==2)throw Error('Pinned AuthClient transport constructor changed');
 const windowProvider=`window: { open(url, name, features) {
   const resident = globalThis.creationNativeSignerWindow;
   const existing = resident && !resident.closed ? resident : globalThis.window.open('', name, features);
   if (!existing) return existing;
   globalThis.creationNativeSignerWindow = existing;
   try { if (existing.location.href === 'about:blank') existing.location.href = url; }
   catch { /* Existing cross-origin II document: preserve its native device. */ }
   return existing;
 }, addEventListener: globalThis.window.addEventListener.bind(globalThis.window),
 removeEventListener: globalThis.window.removeEventListener.bind(globalThis.window),
 focus: globalThis.window.focus.bind(globalThis.window) },`;
 // Several independent heartbeat clients sharing one retained window amplify
 // each other's status messages in this pinned SDK. Share only its transport
 // signer; AuthClient still requests a new genuine II delegation to each fresh
 // nonextractable key. No identity/delegation or capability is shared here.
 const contents=original.replace(needle,'globalThis.creationNativeSigner ??= new Signer({ autoCloseTransportChannel: false,').replace('new PostMessageTransport({',`new PostMessageTransport({ ${windowProvider}`);
 await writeFile(`${source}/../sdk-window-policy.json`,JSON.stringify({classification:'local test native-device lifetime only; genuine II, same reviewed production heartbeat policy, unchanged expiry and replica verification',sdk:'@icp-sdk/auth@7.1.0',signer_option:{autoCloseTransportChannel:false,transport_lifetime:'one real SDK Signer channel per application document; independent fresh AuthClient keys and II requests'},transport_option:{window:'real named II window without repeat navigation; native device stays resident'},original_sha256:createHash('sha256').update(original).digest('hex'),fixture_sha256:createHash('sha256').update(contents).digest('hex')},null,2));
 transformed++;return {contents:`globalThis.creationNativeAuthenticatorWindow = true;\n${contents}`,loader:'js'};
 });}}]});
if(transformed!==1)throw Error('Native-authenticator fixture option was not applied exactly once');
