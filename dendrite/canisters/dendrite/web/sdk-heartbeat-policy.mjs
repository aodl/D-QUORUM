import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const heartbeatPolicy=Object.freeze({version:1,package:'@icp-sdk/signer',package_version:'5.4.0',source_sha256:'c3175343e72a2a5a40f147af8a69463a67ead2cb22f6358e9a75706c3666bf23',patched_sha256:'a07e9c5eca1bed7446f5eeb02ee64c764b306e274b7725844a50bf980f2c4425',changes:['retain heartbeat requests inside the existing disconnect window','require source, JSON-RPC and status validation for both ready and pending','schedule the next poll only for a matched response from the established origin'],unchanged:['disconnect timeout','pending timeout','establishment timeout','certificate validation','delegation expiry']});
export function reviewedHeartbeatSource(original){
 if(hash(original)!==heartbeatPolicy.source_sha256)throw Error('Pinned signer heartbeat source changed; review the scoped patch before building.');
 const recent='pending = pending.filter(entry => time - this.#options.disconnectTimeout > entry.time);';
 const predicate="if ((event.source === this.#options.signerWindow &&\n                isJsonRpcResponse(event.data) &&\n                'result' in event.data &&\n                event.data.result === 'pending') ||\n                event.data.result === 'ready')";
 const strict="if (event.source === this.#options.signerWindow &&\n                isJsonRpcResponse(event.data) &&\n                'result' in event.data &&\n                (event.data.result === 'pending' || event.data.result === 'ready'))";
 if(original.split(recent).length!==2||original.split(predicate).length!==2)throw Error('Pinned heartbeat patch does not apply exactly once.');
 const scheduling='                }\n            }\n            setTimeout(() => this.#sendStatusRequest(create()), this.#options.statusPollingRate);\n        });';
 if(original.split(scheduling).length!==2)throw Error('Pinned heartbeat scheduler patch does not apply exactly once.');
 const result=original.replace(recent,recent.replace(' > ',' < ')).replace(predicate,strict).replace(scheduling,'                }\n                setTimeout(() => this.#sendStatusRequest(create()), this.#options.statusPollingRate);\n            }\n        });');
 if(hash(result)!==heartbeatPolicy.patched_sha256)throw Error('Reviewed heartbeat output digest changed.');return result;
}
export function signerHeartbeatPolicy(){return {name:'reviewed-signer-heartbeat-policy',setup(build){build.onLoad({filter:/@icp-sdk\/signer\/lib\/esm\/web\/heartbeat\/client\.js$/},async({path})=>({contents:reviewedHeartbeatSource(await readFile(path,'utf8')),loader:'js'}));}};}
export function annotateHeartbeatSbom(input){
 const sbom=structuredClone(input),components=sbom.components?.filter(c=>c.group==='@icp-sdk'&&c.name==='signer');
 if(components?.length!==1||components[0].version!==heartbeatPolicy.package_version)throw Error('SBOM must identify exactly the reviewed signer version.');
 const component=components[0],name='dendrite:signer-heartbeat-build-policy';
 component.properties=(component.properties??[]).filter(p=>p.name!==name);
 component.properties.push({name,value:JSON.stringify(heartbeatPolicy)});return sbom;
}
