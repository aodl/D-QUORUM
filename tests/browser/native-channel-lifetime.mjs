import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
export const retainedChannelPolicy=Object.freeze({
 source_sha256:'d29d90b489016328b9be9ada53f8ab65cfde0a10de5d0b9ed8985d0f88258515',
 classification:'local fixture only: detach the closed channel heartbeat listeners while retaining the native II window; original events, WindowProxy, RPCs and all timeout values unchanged',
});

// Ordinary SDK closure destroys the popup. This fixture retains that popup's
// virtual passkey hardware, so it must also end the closed channel's heartbeat
// subscription. Never remove another channel's or the application's listeners.
export function retainedWindowTransportSource(original){
 if(hash(original)!==retainedChannelPolicy.source_sha256)throw Error('Pinned signer transport changed; review retained-window cleanup');
 const constructor='            let channel;\n            new HeartbeatClient({\n                ...this.#options,';
 const established='                    resolve(channel);';
 if(original.split(constructor).length!==2||original.split(established).length!==2)throw Error('Retained heartbeat cleanup must bind exactly one channel');
 return original.replace(constructor,`            let channel;
            const heartbeatListeners = new Set();
            const heartbeatWindow = {
                addEventListener: (type, listener) => {
                    if (channel?.closed) return;
                    if (type !== 'message') throw new Error('Unexpected heartbeat event type');
                    heartbeatListeners.add(listener);
                    this.#options.window.addEventListener(type, listener);
                },
                removeEventListener: (type, listener) => {
                    heartbeatListeners.delete(listener);
                    this.#options.window.removeEventListener(type, listener);
                },
            };
            new HeartbeatClient({
                ...this.#options,
                window: heartbeatWindow,`).replace(established,`                    channel.addEventListener('close', () => {
                        for (const listener of heartbeatListeners) {
                            this.#options.window.removeEventListener('message', listener);
                        }
                        heartbeatListeners.clear();
                    });
                    resolve(channel);`);
}
