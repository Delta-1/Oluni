import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../server/store.js';
import {inboxUpdates} from '../server/inbox-updates.js';
import {createApp} from '../server/app.js';
import {WhatsAppGateway} from '../server/whatsapp.js';
const secret='oluni-live-tests-with-only-synthetic-data-12345';
test('notificação acorda sem esperar o intervalo e isola empresa, canal e conteúdo privado',async()=>{
 const store=new MemoryStore(),hub=inboxUpdates(store),first=await hub.wait('a','channel-a',''),other=await hub.wait('b','channel-a',''),abort=new AbortController();
 let completed=false;const pending=hub.wait('a','channel-a',first.cursor,abort.signal).then(r=>{completed=true;return r;});
 await store.put('chat','a',{owner:'employee',text:'Conversa privada'},'private');await store.put('wa-message','b',{owner:'t',channelId:'channel-a',at:new Date().toISOString(),text:'Outra empresa'},'other');assert.equal(completed,false);
 const start=performance.now();await store.put('wa-message','a',{owner:'t',channelId:'channel-a',at:new Date().toISOString(),text:'Mensagem do atendimento'},'message');const result=await pending;assert.ok(performance.now()-start<1000);assert.equal(result.changed,true);assert.deepEqual(Object.keys(result).sort(),['changed','cursor']);assert.ok(!JSON.stringify(result).includes('Mensagem'));assert.notEqual(result.cursor,first.cursor);assert.notEqual(other.cursor,result.cursor);
 const c=new AbortController(),waiting=hub.wait('a','channel-a',result.cursor,c.signal);c.abort();assert.equal(await waiting,null);
});
test('cache do histórico evita novas leituras e reflete edição, exclusão lógica e ocultação sem misturar empresas',async()=>{
 const store=new MemoryStore();let reads=0;const original=store.list.bind(store);store.list=async(...a)=>{reads++;return original(...a);};const hub=inboxUpdates(store),m={owner:'thread',channelId:'c',at:'2026-11-12T10:00Z',text:'Original'};await store.put('wa-message','a',m,'m');
 const first=await hub.messageRows('a','thread');first[0].text='Mutação local';assert.equal((await hub.messageRows('a','thread'))[0].text,'Original');assert.equal(reads,1);
 await store.put('wa-message','a',{...m,text:'Editada',hiddenFor:['user']},'m');assert.equal((await hub.messageRows('a','thread'))[0].text,'Editada');assert.deepEqual((await hub.messageRows('a','thread'))[0].hiddenFor,['user']);
 await store.put('wa-message','a',{...m,text:'',deletedAt:'2026-11-12T11:00Z'},'m');assert.equal((await hub.messageRows('a','thread'))[0].text,'');assert.equal(reads,1);assert.equal((await hub.messageRows('b','thread')).length,0);
});
test('consulta em espera revalida permissão revogada e não dá acesso a outra empresa',async t=>{
 const store=new MemoryStore(),gateway={status:async()=>({status:'connected'})},app=createApp({store,secret,gateway}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const origin='http://127.0.0.1:'+server.address().port+'/api';
 const req=async(path,body,token)=>{const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json()};};
 const register=email=>req('/auth/register',{mode:'company',companyName:'Empresa Exemplo',name:'Pessoa Exemplo',email,password:'abc123',phone:'5568999999999',jobTitle:'RH'});
 const a=(await register('a@example.test')).body,b=(await register('b@example.test')).body,cid=a.user.companyId;assert.equal((await req('/whatsapp/updates?channelId='+cid,undefined,b.token)).status,404);
 const first=(await req('/whatsapp/updates?channelId='+cid,undefined,a.token)).body,waiting=req('/whatsapp/updates?channelId='+cid+'&cursor='+encodeURIComponent(first.cursor),undefined,a.token);
 const u=await store.get('user',a.user.id,cid);u.active=false;await store.put('user',cid,u,u.id);await store.put('wa-thread',cid,{channelId:cid,name:'Contato',updatedAt:new Date().toISOString()},'thread');const result=await waiting;assert.ok([401,403].includes(result.status));
});
test('conexão ativa reutiliza configuração e lê chaves de transporte em paralelo sem perder gravações',async()=>{
 const store=new MemoryStore(),gateway=new WhatsAppGateway(store,secret);let resolves=0;gateway.resolveContext=async()=>{resolves++;return {companyId:'tenant'};};gateway.sessions.set('channel',{status:'connected',config:{requested:true,startedAt:'2026-11-12T10:00Z',phone:'5500000000000'}});
 await gateway.status('channel');await gateway.status('channel');assert.equal(resolves,0);
 const auth=await gateway.storedAuth('channel');await auth.state.keys.set({session:{one:{value:1},two:{value:2}}});const rows=await auth.state.keys.get('session',['one','two']);assert.equal(rows.one.value,1);assert.equal(rows.two.value,2);assert.equal(resolves,1);await auth.state.keys.set({session:{one:null}});assert.equal((await auth.state.keys.get('session',['one'])).one,null);
});
