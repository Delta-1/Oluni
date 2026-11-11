import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore,SupabaseStore} from '../server/store.js';
import {resetProjectDataOnce} from '../server/reset-accounts.js';

const secret='isolated-project-reset-test-at-least-32-characters';

test('whole-project reset requires an explicit token and never repeats after new accounts exist',async()=>{
 const store=new MemoryStore();let calls=0;
 store.resetProjectData=async()=>{calls++;const deleted=store.rows.size;store.rows.clear();return {deleted,after:{records:0,accounts:0,companies:0,sessions:0}};};
 await store.put('user','company-a',{name:'Old account'},'old-user');
 await store.put('wa-auth','company-a',{session:'old'},'old-auth');
 await store.put('document-chunk','company-a',{data:'old'},'old-document');
 assert.equal(await resetProjectDataOnce(store,secret,''),null);
 assert.equal((await store.list('user')).length,1);
 const result=await resetProjectDataOnce(store,secret,'authorized-reset-1');
 assert.equal(result.deleted,3);assert.equal(calls,1);
 for(const kind of ['user','wa-auth','document-chunk'])assert.equal((await store.list(kind)).length,0);
 await store.put('user','new-company',{name:'New account'},'new-user');
 assert.equal(await resetProjectDataOnce(store,secret,'authorized-reset-1'),null);
 assert.equal(calls,1);assert.equal((await store.list('user')).length,1);
});

test('Supabase reset deletes only the Oluni carrier AND namespace, including unknown future kinds',async()=>{
 const rows=[
  {id:'a',company_id:'oluni',kind:'moodcorp.v1.user'},
  {id:'b',company_id:'oluni',kind:'moodcorp.v1.company'},
  {id:'c',company_id:'oluni',kind:'moodcorp.v1.session'},
  {id:'d',company_id:'oluni',kind:'moodcorp.v1.future-private-document'},
  {id:'e',company_id:'other-app',kind:'moodcorp.v1.user'},
  {id:'f',company_id:'oluni',kind:'startsys.chat'},
  {id:'g',company_id:'other-app',kind:'startsys.chat'}
 ];
 const db={from(table){assert.equal(table,'startsys_records');const filters=[];let deleting=false;return {
  select(column,options){assert.equal(column,'id');assert.deepEqual(options,{count:'exact',head:true});return this;},
  delete(options){assert.deepEqual(options,{count:'exact'});deleting=true;return this;},
  eq(key,value){filters.push(row=>row[key]===value);return this;},
  like(key,value){assert.equal(value,'moodcorp.v1.%');filters.push(row=>row[key].startsWith('moodcorp.v1.'));return this;},
  then(resolve,reject){try{const matched=rows.filter(row=>filters.every(fn=>fn(row)));if(deleting)for(const row of matched)rows.splice(rows.indexOf(row),1);return Promise.resolve({count:matched.length,error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}
 };}};
 const store=new SupabaseStore(db,secret);
 await assert.rejects(()=>store.resetProjectData(),/não inicializado/);
 store.root='oluni';
 assert.deepEqual(await store.resetProjectData(),{before:{records:4,accounts:1,companies:1,sessions:1},deleted:4,after:{records:0,accounts:0,companies:0,sessions:0}});
 assert.deepEqual(rows.map(row=>row.id),['e','f','g']);
});

test('a failed reset is not marked as complete and cannot silently use an unsupported store',async()=>{
 const store=new MemoryStore();
 await assert.rejects(()=>resetProjectDataOnce(store,secret,'unsupported'),/indisponível/);
 store.resetProjectData=async()=>{throw Error('database unavailable');};
 await assert.rejects(()=>resetProjectDataOnce(store,secret,'failed'),/database unavailable/);
 assert.equal((await store.list('maintenance')).length,0);
});
