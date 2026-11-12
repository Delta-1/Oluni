import {randomUUID} from 'node:crypto';
import {fail} from './security.js';
// Single Railway replica: notifications carry a revision only, never message text.
// All reads still go through fresh authentication and channel authorization.
const hubs=new WeakMap();
export function inboxUpdates(store){
 if(hubs.has(store))return hubs.get(store);
 const epoch=randomUUID(),states=new Map(),messages=new Map(),loading=new Map();
 const state=(tenant,channel)=>{const key=JSON.stringify([tenant,channel]);if(!states.has(key))states.set(key,{revision:0,waiters:new Set()});return states.get(key);};
 const cursor=s=>epoch+':'+s.revision;
 const touch=(tenant,channel)=>{const s=state(tenant,channel);s.revision++;for(const done of [...s.waiters])done();};
 const put=store.put.bind(store);
 store.put=async(kind,tenant,value,...args)=>{const saved=await put(kind,tenant,value,...args);if(kind==='wa-message'){touch(tenant,'messages:'+saved.owner);const key=JSON.stringify([tenant,saved.owner]),cached=messages.get(key);if(cached){cached.rows=cached.rows.filter(m=>m.id!==saved.id);cached.rows.push(structuredClone(saved));cached.rows.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));cached.rows=cached.rows.slice(-10000);cached.expires=Date.now()+30000;if(JSON.stringify(cached.rows).length>2000000)messages.delete(key);}}if(['wa-thread','wa-message','wa-config','wa-channel'].includes(kind))touch(tenant,saved.channelId||saved.connectionId||(kind==='wa-channel'?saved.id:tenant));return saved;};
 const wait=(tenant,channel,previous,signal,timeout=20000)=>{const s=state(tenant,channel);if(previous!==cursor(s))return Promise.resolve({cursor:cursor(s),changed:true});if(signal?.aborted)return Promise.resolve(null);if(s.waiters.size>=100)throw fail(429,'Muitas telas conectadas a este WhatsApp.');return new Promise(resolve=>{let timer;const finish=()=>{clearTimeout(timer);s.waiters.delete(finish);signal?.removeEventListener('abort',cancel);resolve({cursor:cursor(s),changed:previous!==cursor(s)});};const cancel=()=>{clearTimeout(timer);s.waiters.delete(finish);signal?.removeEventListener('abort',cancel);resolve(null);};s.waiters.add(finish);signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(finish,timeout);});};
 const messageRows=async(tenant,thread)=>{const key=JSON.stringify([tenant,thread]),cached=messages.get(key);if(cached&&cached.expires>Date.now())return structuredClone(cached.rows);if(loading.has(key))return structuredClone(await loading.get(key));const revision=state(tenant,'messages:'+thread).revision;const pending=(async()=>{const rows=await store.list('wa-message',tenant,{owner:thread,limit:10000});if(state(tenant,'messages:'+thread).revision===revision&&JSON.stringify(rows).length<=2000000){messages.delete(key);messages.set(key,{rows,expires:Date.now()+30000});while(messages.size>10)messages.delete(messages.keys().next().value);}return rows;})();loading.set(key,pending);try{return structuredClone(await pending);}finally{loading.delete(key);}};
 const hub={wait,touch,messageRows};hubs.set(store,hub);return hub;
}
