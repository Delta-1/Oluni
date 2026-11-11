import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {employeeCodeFor} from '../server/workforce-policy.js';
import {ensureEmployeeCode,localDay} from '../server/attendance.js';
import {lookup} from '../server/security.js';
const secret='oluni-workforce-test-only-32-characters-secret';
const person=(email,extra={})=>({name:'Pessoa Exemplo',email,password:'test-password-123',phone:'5568999999999',birthDate:'2000-01-01',jobTitle:'Auxiliar',...extra});
const gps=()=>({lat:-10.99,lng:-68.74,accuracy:12,capturedAt:Date.now()});
const photo={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRxkAAAAASUVORK5CYII='};
async function fixture(t){
 const store=new MemoryStore(),app=createApp({store,secret}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const req=async(path,body,session='',method)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
 const company=async(email)=>{const r=await req('/auth/register',person(email,{mode:'company',companyName:'Empresa teste'}));assert.equal(r.status,201);return r.body;};
 const admin=await company('admin@example.test'),access=(await req('/admin/access',undefined,admin.token)).body;
 const employee=(await req('/auth/register',person('employee@example.test',{mode:'employee',invite:access.invite}))).body;
 const config=async(user,body)=>req('/admin/employee-config/'+user.id,body,admin.token,'PATCH');
 return {store,req,company,admin,access,employee,config};
}
function decodeLabel(image){const png=PNG.sync.read(Buffer.from(image.split(',')[1],'base64'));return jsQR(new Uint8ClampedArray(png.data),png.width,png.height).data;}

test('códigos sequenciais por empresa reservam 0000 ao ADM e ampliam com letra',async()=>{
 assert.equal(employeeCodeFor(0),'0000');assert.equal(employeeCodeFor(1),'0001');assert.equal(employeeCodeFor(9999),'9999');assert.equal(employeeCodeFor(10000),'A0000');assert.equal(employeeCodeFor(19999),'A9999');assert.equal(employeeCodeFor(20000),'B0000');
 const store=new MemoryStore();const users=Array.from({length:12},(_,i)=>({id:'u'+i,companyId:'c',role:i?'employee':'admin',active:true}));for(const u of users)await store.put('user','c',u,u.id);
 const allocated=await Promise.all(users.map(u=>ensureEmployeeCode(store,secret,u)));assert.deepEqual(allocated.map(u=>u.employeeCode),['0000',...Array.from({length:11},(_,i)=>String(i+1).padStart(4,'0'))]);
 const legacy={id:'legacy',companyId:'old',role:'employee',employeeCode:'928341'};await store.put('user','old',legacy,legacy.id);await store.put('employee-code','old',{owner:legacy.id},lookup(secret,'employee-code','old',legacy.employeeCode));const migrated=await ensureEmployeeCode(store,secret,legacy);assert.equal(migrated.employeeCode,'0001');assert.equal(migrated.legacyEmployeeCode,'928341');assert.equal((await store.get('employee-code',lookup(secret,'employee-code','old','928341'),'old')).owner,legacy.id);
 await store.put('employee-code-cursor','overflow',{next:10000},lookup(secret,'employee-code-cursor','overflow'));assert.equal((await ensureEmployeeCode(store,secret,{id:'x',companyId:'overflow',role:'employee'})).employeeCode,'A0000');
 assert.equal((await ensureEmployeeCode(store,secret,{id:'other',companyId:'other',role:'employee'})).employeeCode,'0001');
});
test('convite carrega setor assinado, impede troca no cadastro e respeita isolamento',async t=>{
 const f=await fixture(t),d=await f.req('/admin/departments',{name:'Limpeza'},f.admin.token);assert.equal(d.status,201);
 const link=await f.req('/admin/access?departmentId='+encodeURIComponent(d.body.id),undefined,f.admin.token);
 const publicAccess=await f.req('/public/access',{kind:'invite',token:link.body.invite});assert.equal(publicAccess.body.department.name,'Limpeza');
 const registered=await f.req('/auth/register',person('cleaner@example.test',{mode:'employee',invite:link.body.invite,department:'Diretoria',departmentId:'fake'}));assert.equal(registered.status,201);assert.equal(registered.body.user.departmentId,d.body.id);assert.equal(registered.body.user.department,'Limpeza');
 await f.req('/profile',{department:'Diretoria'},registered.body.token,'PATCH');assert.equal((await f.req('/bootstrap',undefined,registered.body.token)).body.user.department,'Limpeza');
 const b=await f.company('other@example.test');assert.equal((await f.req('/admin/access?departmentId='+d.body.id,undefined,b.token)).status,400);
 assert.equal((await f.req('/admin/employee-config/'+registered.body.user.id,{departmentId:d.body.id},b.token,'PATCH')).status,404);
 assert.equal((await f.req('/admin/departments/'+d.body.id,{active:false},f.admin.token,'PATCH')).status,409);
});
test('QR impresso exige identidade, localização recente, método do RH e registra uma presença',async t=>{
 const f=await fixture(t);await f.config(f.employee.user,{attendanceMethod:'qr'});
 const batch=await f.req('/admin/qr/labels',{items:[{id:f.employee.user.id,quantity:3}]},f.admin.token);assert.equal(batch.status,200);assert.equal(batch.body.total,3);assert.equal(batch.body.labels[0].code,'0001');const qrToken=decodeLabel(batch.body.labels[0].image);
 const body={event:'presence',requestId:'qr-request-identity-0001',qrToken,location:gps()};
 assert.equal((await f.req('/public/totem/punch',{token:f.access.totem,code:'0001',requestId:'totem-no-bypass-001'})).status,403);
 assert.equal((await f.req('/attendance/punch',{...body,location:undefined},f.employee.token)).status,400);
 assert.equal((await f.req('/attendance/punch',{...body,location:{...gps(),capturedAt:1}},f.employee.token)).status,400);
 const otherQR=decodeLabel((await f.req('/admin/qr/labels',{items:[{id:f.admin.user.id,quantity:1}]},f.admin.token)).body.labels[0].image);
 assert.equal((await f.req('/attendance/punch',{...body,qrToken:otherQR},f.employee.token)).status,403);
 const out=await f.req('/attendance/punch',body,f.employee.token);assert.equal(out.status,201);assert.equal(out.body.entry.event,'presence');assert.equal(out.body.nextEvent,null);assert.equal(out.body.history[0].presence,true);assert.equal(out.body.history[0].balanceMinutes,null);assert.equal(out.body.entry.location.accuracy,12);
 assert.equal((await f.req('/attendance/punch',body,f.employee.token)).body.entry.id,out.body.entry.id);
 const report=(await f.req('/admin/attendance',undefined,f.admin.token)).body;assert.equal(report.records[0].entries[0].method,'qr');
});
test('impressão limita quantidade, restringe empresa e revogação invalida QR antigo',async t=>{
 const f=await fixture(t),qr=decodeLabel((await f.req('/admin/qr/labels',{items:[{id:f.employee.user.id,quantity:1}]},f.admin.token)).body.labels[0].image);
 assert.equal((await f.req('/admin/qr/labels',{items:[{id:f.employee.user.id,quantity:0}]},f.admin.token)).status,400);
 assert.equal((await f.req('/admin/qr/labels',{items:[{id:f.employee.user.id,quantity:1}]},f.employee.token)).status,403);
 const b=await f.company('isolated@example.test');assert.equal((await f.req('/admin/qr/labels',{items:[{id:f.employee.user.id,quantity:1}]},b.token)).status,400);
 await f.config(f.employee.user,{attendanceMethod:'qr'});await f.req('/admin/qr/revoke',{},f.admin.token);
 assert.equal((await f.req('/attendance/punch',{event:'presence',requestId:'old-qr-after-revoke',qrToken:qr,location:gps()},f.employee.token)).status,403);
});
test('ponto por foto exige arquivo privado do funcionário e não permite reaproveitamento',async t=>{
 const f=await fixture(t);await f.config(f.employee.user,{attendanceMethod:'photo'});
 const body={event:'entry',requestId:'photo-punch-request-001'};assert.equal((await f.req('/attendance/punch',body,f.employee.token)).status,404);
 const image=await f.req('/media',{...photo,purpose:'clock'},f.employee.token);assert.equal(image.status,201);assert.equal(image.body.data,undefined);
 const b=await f.company('private@example.test');assert.equal((await f.req('/media/'+image.body.id,undefined,b.token)).status,404);
 const out=await f.req('/attendance/punch',{...body,proofId:image.body.id},f.employee.token);assert.equal(out.status,201);assert.equal(out.body.entry.proofId,image.body.id);
 const entry=(await f.store.list('clock-event'))[0];entry.at=new Date(Date.now()-60000).toISOString();await f.store.put('clock-event',f.employee.user.companyId,entry,entry.id);
 assert.equal((await f.req('/attendance/punch',{event:'break_start',requestId:'photo-reused-request-002',proofId:image.body.id},f.employee.token)).status,409);
 assert.equal((await f.req('/media',{mime:'image/jpeg',data:Buffer.from('fake image').toString('base64'),purpose:'clock'},f.employee.token)).status,400);
});
test('checklist exige antes, início, itens e depois; funcionário não muda evidências exigidas',async t=>{
 const f=await fixture(t),task=await f.req('/tasks',{owner:f.employee.user.id,title:'Limpar recepção',dueDate:localDay(),requiredBefore:1,requiredAfter:1,items:['Limpar piso','Retirar lixo']},f.admin.token);assert.equal(task.status,201);const id=task.body.id;
 const patch=b=>f.req('/tasks/'+id,b,f.employee.token,'PATCH');
 assert.equal((await patch({action:'start'})).status,400);assert.equal((await patch({action:'check',itemId:'1',done:true})).status,409);
 assert.equal((await f.req('/media',{...photo,purpose:'task',taskId:id,phase:'after'},f.employee.token)).status,409);
 assert.equal((await f.req('/media',{...photo,purpose:'task',taskId:id,phase:'before'},f.admin.token)).status,403);
 assert.equal((await f.req('/media',{...photo,purpose:'task',taskId:id,phase:'before'},f.employee.token)).status,201);
 assert.equal((await patch({action:'start'})).status,200);await patch({action:'check',itemId:'1',done:true});await patch({action:'check',itemId:'2',done:true});
 assert.equal((await patch({action:'complete',requiredAfter:0})).status,400);
 // Same image bytes cannot be used to prove both stages of the service.
 const after=await f.req('/media',{...photo,purpose:'task',taskId:id,phase:'after'},f.employee.token);assert.equal(after.status,409);
 const different={...photo,data:Buffer.concat([Buffer.from(photo.data,'base64'),Buffer.from([0])]).toString('base64')};assert.equal((await f.req('/media',{...different,purpose:'task',taskId:id,phase:'after'},f.employee.token)).status,201);
 const done=await patch({action:'complete'});assert.equal(done.status,200);assert.equal(done.body.status,'completed');assert.equal(done.body.photos.length,2);
 assert.equal((await patch({action:'check',itemId:'1',done:false})).status,409);
 const b=await f.company('no-task-access@example.test');assert.equal((await f.req('/tasks',undefined,b.token)).body.tasks.length,0);
});
test('setor filtra relatório e criação de tarefa própria depende de liberação do RH',async t=>{
 const f=await fixture(t),d=(await f.req('/admin/departments',{name:'Operação'},f.admin.token)).body;
 await f.config(f.employee.user,{departmentId:d.id,allowOwnTasks:false});const task={owner:f.admin.user.id,title:'Pequena tarefa',dueDate:localDay(),requiredBefore:0,requiredAfter:0,items:['Conferir']};
 assert.equal((await f.req('/tasks',task,f.employee.token)).status,403);await f.config(f.employee.user,{allowOwnTasks:true});assert.equal((await f.req('/tasks',task,f.employee.token)).body.owner,f.employee.user.id);
 await f.req('/attendance/punch',{event:'entry',requestId:'department-report-punch-001'},f.employee.token);
 assert.equal((await f.req('/admin/attendance?departmentId='+encodeURIComponent(d.id),undefined,f.admin.token)).body.records.length,1);
 assert.equal((await f.req('/admin/attendance?departmentId=missing',undefined,f.admin.token)).body.records.length,0);
 assert.equal((await f.config(f.employee.user,{attendanceMethod:'facial'})).status,409);
});
