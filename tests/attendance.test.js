import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {summarize,localDay} from '../server/attendance.js';
import {resetAccountsOnce} from '../server/reset-accounts.js';
const secret='pontonorte-tests-only-at-least-32-characters';
const person=(email,extra={})=>({name:'Pessoa Exemplo',email,password:'segredo-teste123',phone:'5568999999999',birthDate:'1999-05-20',jobTitle:'Analista',department:'Geral',...extra});
async function fixture(t){
  const store=new MemoryStore(),sent=[],gateway={status:async()=>({status:'connected'}),sendText:async(cid,jid,message)=>sent.push({cid,jid,message})};
  const app=createApp({store,secret,gateway}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const request=async(path,body,session='',method)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const register=async(email)=>{const r=await request('/auth/register',person(email,{mode:'company',companyName:'Empresa Exemplo'}));assert.equal(r.status,201);const links=await request('/admin/access',undefined,r.body.token);return {...r.body,links:links.body};};
  const admin=await register('admin@example.com');const registered=await request('/auth/register',person('employee@example.com',{invite:admin.links.invite,mode:'employee',role:'admin'}));assert.equal(registered.status,201);
  return {store,sent,gateway,request,register,admin,employee:registered.body};
}
test('cadastro de colaborador exige convite válido e impede elevar privilégios',async t=>{
 const f=await fixture(t);
 assert.equal(f.employee.user.role,'employee');assert.equal(f.employee.user.employeeCode,'0001');assert.equal(f.admin.user.employeeCode,'0000');
 assert.equal((await f.request('/auth/register',person('no-link@example.com',{mode:'employee',companyCode:'A1B2C3D4E5'}))).status,400);
 assert.equal((await f.request('/public/access',{token:f.admin.links.invite+'a',kind:'invite'})).status,400);
 assert.equal((await f.request('/public/access',{token:f.admin.links.invite,kind:'totem'})).status,400);
});
test('ponto usa hora do servidor, sequencia, idempotência e concorrência',async t=>{
 const f=await fixture(t),session=f.employee.token;
 assert.equal((await f.request('/attendance/punch',{event:'exit',requestId:'wrong-sequence-001'},session)).status,409);
 const body={event:'entry',requestId:'same-request-test-0001',at:'1900-01-01T00:00:00Z'};
 const results=await Promise.all([f.request('/attendance/punch',body,session),f.request('/attendance/punch',body,session)]);
 assert.ok(results.every(r=>r.status===201));assert.equal((await f.store.list('clock-event')).length,1);
 assert.equal(results[0].body.entry.id,results[1].body.entry.id);assert.notEqual(results[0].body.entry.at,body.at);
 assert.equal((await f.request('/attendance/punch',{event:'break_start',requestId:'double-click-test-001'},session)).status,409);
 assert.equal((await f.request('/admin/attendance',undefined,session)).status,403);
 const b=await f.register('other-admin@example.com');assert.equal((await f.request('/admin/attendance',undefined,b.token)).body.records.length,0);
});
test('totem aceita código só no link da própria empresa e perde acesso após renovação',async t=>{
 const f=await fixture(t),b=await f.register('other@example.com'),code=f.employee.user.employeeCode;
 assert.equal((await f.request('/public/totem/punch',{token:b.links.totem,code,requestId:'other-company-code-001'})).status,400);
 const result=await f.request('/public/totem/punch',{token:f.admin.links.totem,code,requestId:'correct-company-001'});assert.equal(result.status,201);
 assert.equal(result.body.event,'entry');assert.equal(result.body.name,'Pessoa');assert.equal(result.body.email,undefined);
 await f.request('/admin/access/revoke',{kind:'totem'},f.admin.token);
 assert.equal((await f.request('/public/access',{token:f.admin.links.totem,kind:'totem'})).status,400);
});
test('relatório desconta intervalo e trata jornada que cruza meia-noite',()=>{
 const company={timezone:'America/Rio_Branco',dailyMinutes:480,weekdays:[1,2,3,4,5]},owner='person';
 const entries=[['entry','2026-11-10T23:00:00Z'],['break_start','2026-11-11T03:00:00Z'],['break_end','2026-11-11T04:00:00Z'],['exit','2026-11-11T08:00:00Z']].map(([event,at])=>({owner,event,at,day:'2026-11-10'}));
 const [r]=summarize(entries,company,'2026-11-10','2026-11-10');assert.equal(r.workedMinutes,480);assert.equal(r.balanceMinutes,0);assert.equal(r.complete,true);
 assert.equal(localDay(new Date('2026-11-11T03:00:00Z')),'2026-11-10');
 assert.equal(summarize(entries.slice(0,2),company,'2026-11-10','2026-11-10')[0].balanceMinutes,null);
});
test('documentos são privados, validados e deduplicados por colaborador',async t=>{
 const f=await fixture(t),pdf={name:'atestado-exemplo.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.4\nExample only\n%%EOF').toString('base64')};
 const r=await f.request('/documents',pdf,f.employee.token);assert.equal(r.status,201);assert.equal(r.body.status,'pending');assert.equal(r.body.data,undefined);
 assert.equal((await f.request('/documents',pdf,f.employee.token)).body.id,r.body.id);assert.equal((await f.store.list('document')).length,1);
 const b=await f.register('isolated@example.com');assert.equal((await f.request('/documents/'+r.body.id+'/file',undefined,b.token)).status,404);
 assert.equal((await f.request('/admin/documents/'+r.body.id,{status:'accepted'},f.employee.token,'PATCH')).status,403);
 assert.equal((await f.request('/admin/documents/'+r.body.id,{status:'accepted'},f.admin.token,'PATCH')).status,200);
 assert.equal((await f.request('/documents/'+r.body.id+'/file',undefined,f.employee.token)).body.data,pdf.data);
 assert.equal((await f.request('/documents',{...pdf,data:Buffer.from('not pdf').toString('base64')},f.employee.token)).status,400);
});
test('WhatsApp recupera senha sem verificação inicial, valida código e revoga sessões',async t=>{
 const f=await fixture(t),email=f.employee.user.email;
 const noAccount=await f.request('/auth/password/request',{email:'missing@example.com'});
 const registered=await f.request('/auth/password/request',{email});assert.deepEqual(registered.body,noAccount.body);assert.equal(f.sent.length,1);
 assert.equal((await f.store.get('user',f.employee.user.id)).phoneVerified,undefined);
 const reset=f.sent[0].message.match(/\b\d{6}\b/)[0];
 assert.equal((await f.request('/auth/password/reset',{email,code:'000000',password:'new-password123'})).status,400);
 assert.equal((await f.request('/auth/password/reset',{email,code:reset,password:'new-password123'})).status,200);
 assert.equal((await f.request('/bootstrap',undefined,f.employee.token)).status,401);
 assert.equal((await f.request('/auth/password/reset',{email,code:reset,password:'another-password123'})).status,400);
 assert.equal((await f.request('/auth/login',{email,password:'new-password123'})).status,200);
});
test('bot atende menu e recebe atestado sem IA, com identidade verificada',async t=>{
 const f=await fixture(t),u=await f.store.get('user',f.employee.user.id);u.whatsappJid=u.phone+'@s.whatsapp.net';u.whatsappConsent=true;await f.store.put('user',u.companyId,u,u.id);
 assert.match(await f.gateway.onMessage(u.companyId,u.whatsappJid,'MENU'),/Meu ponto/);
 assert.match(await f.gateway.onMessage(u.companyId,u.whatsappJid,'2'),/PDF/);
 assert.match(await f.gateway.onMessage(u.companyId,u.whatsappJid,u.employeeCode),/Identificação confirmada/);
 const result=await f.gateway.onMessage(u.companyId,u.whatsappJid,'',{mime:'application/pdf',name:'exemplo.pdf',buffer:Buffer.from('%PDF-1.4\nexample')});assert.match(result,/Recebemos/);
 assert.equal((await f.store.list('document',u.companyId))[0].owner,u.id);
 assert.equal(await f.gateway.onMessage('other-company',u.whatsappJid,'MENU'),null);
 await f.gateway.onMessage(u.companyId,u.whatsappJid,'3');const requests=await f.request('/admin/hr-requests',undefined,f.admin.token);assert.equal(requests.body.length,1);
 assert.equal((await f.request('/admin/hr-requests/'+requests.body[0].id+'/reply',{text:'Olá, em que posso ajudar?'},f.admin.token)).status,200);assert.match(f.sent.at(-1).message,/RH:/);
});
test('limpeza de contas executa uma vez, revoga acessos e preserva registros históricos',async()=>{
 const store=new MemoryStore();await store.put('company','c',{name:'Old'},'c');await store.put('user','c',{email:'old@example.com'},'u');await store.put('session','c',{userId:'u'},'s');await store.put('checkin','c',{owner:'u',mood:3},'historic');
 const result=await resetAccountsOnce(store,secret,'authorized-test-reset');assert.equal(result.user,1);assert.equal((await store.list('user')).length,0);assert.equal((await store.list('session')).length,0);assert.equal((await store.list('company')).length,0);assert.equal((await store.list('checkin')).length,1);
 await store.put('user','new',{email:'new@example.com'},'new');assert.equal(await resetAccountsOnce(store,secret,'authorized-test-reset'),null);assert.equal((await store.list('user')).length,1);
});
