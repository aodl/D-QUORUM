// Reviewed implementation 97343f8, stable format 1. Both exact build variants
// were exercised in genuine protocol/browser qualification. No receipt supplies
// a URL, code bytes or a new trusted digest. Current authority stays live-read.
export const reviewedHistoricalBootstraps=Object.freeze([
 // Qualified PR f9cf96e / deployed creation release; stable format 1.
 Object.freeze({version:1,sha256:'ac7e2907b323f980b108548978837b114cb7bfcce35034ed0f19f8ee9932b107',bytes:1461910}),
 Object.freeze({version:1,sha256:'fef1735bb08b92bad58ec761f199741fa459292b81864c219aff5442e7423265',bytes:1146279}),
 Object.freeze({version:1,sha256:'dba5a21617c739d39e05f12c32454fd7dace2f9bef6b5eb0293e15e0e7de489b',bytes:1146535}),
]);
export function creationArtifact(hash,current){
 if(hash===current?.sha256)return current;
 const reviewed=reviewedHistoricalBootstraps.find(a=>a.sha256===hash);
 if(!reviewed)throw Error('Receipt bootstrap artifact is outside reviewed compatibility policy. Preserve all original bindings; no reinstall is authorised.');
 return {...reviewed,wasm_path:`/generated/bootstrap.${hash.slice(0,16)}.wasm`};
}
