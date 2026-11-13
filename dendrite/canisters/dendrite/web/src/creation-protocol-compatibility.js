import localPins from "../../../../src/declarations/bootstrap/protocol-pins.json" with {type:"json"};
import mainnet from "../../../../src/declarations/bootstrap/protocol-mainnet.json" with {type:"json"};
import {bytesHex} from "./creation-accounts.js";

export const REVIEWED_MAINNET_PROTOCOL=Object.freeze(mainnet);
const networkName=network=>typeof network==="string"?network:Object.keys(network??{})[0];

export function supportedProtocolModules(canister,network,{historical=false}={}){
  const local=localPins.modules[canister],reviewed=mainnet.modules[canister];
  if(!local||!reviewed)return [];
  if(networkName(network)==="Local")return [local];
  if(networkName(network)!=="Ic")return [];
  // Both published encodings identify the same reviewed executable. Historical
  // evidence retains the previously accepted exact local-source binding; it
  // cannot authorise a new mainnet dispatch using that version.
  return [reviewed.installed_gzip_sha256,reviewed.wasm_sha256,...(historical?[local]:[])];
}

export function supportsProtocolModule(canister,hash,network,options){
  return typeof hash==="string"&&/^[a-f0-9]{64}$/.test(hash)&&supportedProtocolModules(canister,network,options).includes(hash);
}

export async function inspectCreationProtocols(readSystem,network){
  const rows=await Promise.all(Object.entries(mainnet.modules).map(async([canister,entry])=>{
    const row={canister,name:entry.name,supported:supportedProtocolModules(canister,network),status:"Blocked",moduleHash:null};
    try{
      const state=await readSystem(canister);
      if(!(state?.moduleHash instanceof Uint8Array)||state.moduleHash.length!==32)throw Error("Missing or malformed certified module hash.");
      row.moduleHash=bytesHex(state.moduleHash);
      if(!supportsProtocolModule(canister,row.moduleHash,network))throw Error("Unreviewed deployed protocol module; creation is blocked before spending.");
      row.status="Supported";row.reason="Certified module matches a reviewed executable.";
    }catch(error){row.reason=String(error?.message??error);}
    return Object.freeze(row);
  }));
  return Object.freeze({ok:rows.every(row=>row.status==="Supported"),rows:Object.freeze(rows)});
}
