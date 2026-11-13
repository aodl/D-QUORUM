// Deliberately invalid BLS signature: transport-recording fixtures only. Real
// certificate tests use the genuine archived replica witness, never this helper.
import {Cbor} from '@icp-sdk/core/agent';
export function recordingCertificate(time=BigInt(Date.now())*1000000n,tag=1){
 const bytes=[];do{const b=Number(time&127n);time>>=7n;bytes.push(b|(time?128:0));}while(time);
 return Cbor.encode({tree:[2,new TextEncoder().encode('time'),[3,Uint8Array.from(bytes)]],signature:Uint8Array.of(tag)});
}
