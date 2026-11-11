import {lookup} from './security.js';

// Explicit one-time whole-app reset. The store enforces the carrier and kind
// prefix, leaving every other application and the database schema untouched.
export async function resetProjectDataOnce(store,secret,requestId) {
  if(!requestId)return null;
  const marker=lookup(secret,'maintenance','reset-project-data',requestId);
  if(await store.get('maintenance',marker))return null;
  if(!store.resetProjectData)throw Error('Limpeza completa indisponível neste armazenamento.');
  const result=await store.resetProjectData();
  await store.put('maintenance','system',{operation:'reset-project-data',requestId,result,at:new Date().toISOString()},marker,true);
  return result;
}

// Only invoked by an explicit, one-time deployment flag. Retain the encrypted
// namespace and historical content; remove accounts and their access paths.
export async function resetAccountsOnce(store,secret,requestId) {
  if(!requestId)return null;
  const marker=lookup(secret,'maintenance','reset-accounts',requestId);
  if(await store.get('maintenance',marker))return null;
  const kinds=['session','wa-link','otp','employee-code','code','wa-auth','wa-config','bot-state','user','company'];
  const counts=store.resetAccountKinds?await store.resetAccountKinds(kinds):{};
  if(!store.resetAccountKinds)for(const kind of kinds){const rows=await store.list(kind);counts[kind]=rows.length;for(const row of rows)await store.remove(kind,row.id);}
  await store.put('maintenance','system',{operation:'reset-accounts',requestId,counts,at:new Date().toISOString()},marker,true);
  return counts;
}
