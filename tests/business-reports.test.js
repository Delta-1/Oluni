import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {analyzeShift,attendanceReport,reportPeriod} from '../server/business-reports.js';
const settings={timezone:'America/Sao_Paulo',dailyMinutes:480,weekdays:[1,2,3,4,5]};
const shift=(owner,day,values=[['entry','08:00'],['break_start','12:00'],['break_end','13:00'],['exit','17:00']])=>values.map(([event,time],i)=>({id:owner+day+i,owner,day,event,at:day+'T'+time+':00-03:00',source:'online'}));
async function fixture(t){const store=new MemoryStore(),secret='business-reports-secret-at-least-32-characters',app=createApp({store,secret,platformEnv:{}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const req=async(path,body,token='',method)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const company=async(email)=>{const r=await req('/auth/register',{mode:'company',document:'11222333000181',companyName:'Empresa Exemplo',name:'Pessoa Exemplo',email,password:'abc123',phone:'5568999999900',jobTitle:'RH'});assert.equal(r.status,201);return r.body;};
 const admin=await company('admin@example.test'),cid=admin.user.companyId,access=(await req('/admin/access',undefined,admin.token)).body,employee=(await req('/auth/register',{mode:'employee',invite:access.invite,name:'Pessoa Exemplo',email:'employee@example.test',password:'abc123',phone:'5568999999901',birthDate:'2000-01-01',jobTitle:'Analista'})).body;
 const c=await store.get('company',cid,cid);Object.assign(c,settings);await store.put('company',cid,c,cid);const u=await store.get('user',employee.user.id,cid);u.createdAt='2026-01-01T12:00Z';u.shareMood=true;await store.put('user',cid,u,u.id);
 return {store,req,company,admin,employee,cid,user:u};
}
test('espelho desconta intervalo, soma segundos antes de arredondar e trata jornada noturna pelo dia de entrada',()=>{
 const normal=analyzeShift(shift('u','2026-11-09'),settings,'2026-11-09');assert.equal(normal.workedMinutes,480);assert.equal(normal.balanceMinutes,0);assert.equal(normal.complete,true);
 const night=[['entry','2026-11-09T22:00:00-03:00'],['break_start','2026-11-10T02:00:00-03:00'],['break_end','2026-11-10T03:00:00-03:00'],['exit','2026-11-10T07:00:00-03:00']].map(([event,at])=>({event,at}));assert.equal(analyzeShift(night,settings,'2026-11-09').workedMinutes,480);
 const seconds=[['entry','08:00:20'],['break_start','12:00:00'],['break_end','13:00:10'],['exit','17:00:40']].map(([event,at])=>({event,at:'2026-11-09T'+at+'-03:00'}));assert.equal(analyzeShift(seconds,settings,'2026-11-09').workedMinutes,480);
});
test('jornadas abertas não fecham saldo, registros inconsistentes não viram horas e presença não inventa jornada',()=>{
 const open=analyzeShift(shift('u','2026-11-09').slice(0,2),settings,'2026-11-09');assert.equal(open.status,'open');assert.equal(open.workedMinutes,240);assert.equal(open.balanceMinutes,null);
 const invalid=analyzeShift(shift('u','2026-11-09',[['entry','08:00'],['exit','17:00']]),settings,'2026-11-09');assert.equal(invalid.status,'review');assert.equal(invalid.workedMinutes,null);assert.equal(invalid.balanceMinutes,null);
 const duplicate=shift('u','2026-11-09');duplicate[2].event='break_start';assert.equal(analyzeShift(duplicate,settings,'2026-11-09').status,'review');assert.equal(analyzeShift([{event:'entry',at:'invalid'}],settings,'2026-11-09').status,'review');
 const presence=analyzeShift([{event:'presence',at:'2026-11-09T08:00-03:00'}],settings,'2026-11-09');assert.equal(presence.status,'presence');assert.equal(presence.workedMinutes,null);assert.equal(presence.expectedMinutes,null);
 const weekend=analyzeShift(shift('u','2026-11-08'),settings,'2026-11-08');assert.equal(weekend.expectedMinutes,0);assert.equal(weekend.balanceMinutes,480);
});
test('dias sem marcação respeitam cadastro, dias previstos, hoje e futuro sem gerar débito automático',()=>{
 const period=reportPeriod({from:'2026-11-08',to:'2026-11-15'},'2026-11-12'),u={id:'u',name:'Exemplo',active:true,createdAt:'2026-11-10T12:00Z'};const report=attendanceReport([u],shift('u','2026-11-10'),settings,period),p=report.employees[0];assert.equal(p.days.find(d=>d.day==='2026-11-09').status,'before_registration');assert.equal(p.days.find(d=>d.day==='2026-11-11').status,'missing');assert.equal(p.days.find(d=>d.day==='2026-11-12').status,'waiting');assert.equal(p.days.find(d=>d.day==='2026-11-13').status,'future');assert.equal(report.summary.missingDays,1);assert.equal(report.summary.balanceMinutes,0);assert.equal(report.summary.workedMinutes,480);
 assert.throws(()=>reportPeriod({from:'2026-02-30',to:'2026-03-01'},'2026-11-12'));assert.throws(()=>reportPeriod({from:'2025-01-01',to:'2026-11-12'},'2026-11-12'));assert.throws(()=>reportPeriod({from:'2026-11-12',to:'2026-11-01'},'2026-11-12'));
});
test('relatórios de ponto são restritos ao RH da empresa, filtram pessoa/setor e exportam todo o filtro',async t=>{
 const f=await fixture(t);for(const e of shift(f.user.id,'2026-11-09'))await f.store.put('clock-event',f.cid,e,e.id);const q='?from=2026-11-09&to=2026-11-09';
 assert.equal((await f.req('/admin/business-reports/attendance'+q,undefined,f.employee.token)).status,403);const own=await f.req('/admin/business-reports/attendance'+q+'&employeeId='+f.user.id,undefined,f.admin.token);assert.equal(own.status,200);assert.equal(own.body.summary.workedMinutes,480);assert.equal(own.body.days[0].status,'complete');
 const other=await f.company('other@example.test');assert.equal((await f.req('/admin/business-reports/attendance'+q+'&employeeId='+f.user.id,undefined,other.token)).status,404);assert.equal((await f.req('/admin/business-reports/attendance'+q+'&departmentId=missing',undefined,f.admin.token)).status,404);
 const exported=(await f.req('/admin/business-reports/attendance/export'+q+'&employeeId='+f.user.id,undefined,f.admin.token)).body,text=Buffer.from(exported.data,'base64').toString();assert.match(text,/8:00/);assert.match(text,/2026-11-09/);assert.equal(own.body.summary.balanceMinutes,0);
 for(let i=0;i<54;i++)await f.store.put('user',f.cid,{companyId:f.cid,name:i===0?'=2+2':'Pessoa '+i,active:true,role:'employee',createdAt:'2026-01-01T12:00Z'},'extra-'+i);
 const paged=(await f.req('/admin/business-reports/attendance'+q,undefined,f.admin.token)).body;assert.equal(paged.employees.length,50);assert.equal(paged.pagination.total,55);
 const all=(await f.req('/admin/business-reports/attendance/export'+q,undefined,f.admin.token)).body;assert.equal(Buffer.from(all.data,'base64').toString().trim().split('\r\n').length,56);assert.ok(Buffer.from(all.data,'base64').toString().includes("'=2+2"));
});
test('WhatsApp conta apenas o período/canal, mostra situação atual e mantém mensagens sob consulta com isolamento',async t=>{
 const f=await fixture(t),id='thread-a',ch='channel-a';await f.store.put('wa-channel',f.cid,{companyId:f.cid,name:'RH',departmentId:'dep-a',active:true},ch);await f.store.put('department',f.cid,{name:'RH',active:true},'dep-a');
 await f.store.put('wa-thread',f.cid,{companyId:f.cid,channelId:ch,name:'Contato',status:'active',updatedAt:'2026-11-09T13:00Z'},id);
 const rows=[{direction:'in',text:'Uma pergunta',at:'2026-11-09T12:00Z',status:'received'},{direction:'out',agentId:f.admin.user.id,agentName:'RH',text:'Uma resposta',at:'2026-11-09T12:01Z',status:'read'},{direction:'bot',text:'Menu',at:'2026-11-09T12:02Z',status:'sent'},{direction:'in',text:'Fora do período',at:'2026-11-08T12:00Z',status:'received'}];for(let i=0;i<rows.length;i++)await f.store.put('wa-message',f.cid,{owner:id,channelId:ch,...rows[i]},'m'+i);
 await f.store.put('chat',f.cid,{owner:f.user.id,text:'Segredo privado da Flora',at:'2026-11-09T13:00Z'},'private');
 const q='?from=2026-11-09&to=2026-11-09&channelId='+ch,r=(await f.req('/admin/business-reports/whatsapp'+q,undefined,f.admin.token)).body;assert.equal(r.summary.incoming,1);assert.equal(r.summary.outgoing,1);assert.equal(r.summary.bot,1);assert.equal(r.summary.read,1);assert.equal(r.summary.active,1);assert.ok(!JSON.stringify(r).includes('Uma pergunta'));assert.equal(r.agents[0].messages,1);
 const archive=(await f.req('/admin/business-reports/whatsapp/'+id+'/archive'+q,undefined,f.admin.token)).body;assert.equal(archive.messages.length,3);assert.equal(archive.messages[0].text,'Uma pergunta');assert.ok(!JSON.stringify(archive).includes('Segredo privado'));
 const other=await f.company('outsider@example.test');assert.equal((await f.req('/admin/business-reports/whatsapp/'+id+'/archive'+q,undefined,other.token)).status,404);assert.equal((await f.req('/admin/business-reports/whatsapp?from=2026-11-09&to=2026-11-09&channelId=missing',undefined,f.admin.token)).status,404);
});
test('bem-estar respeita consentimento atual e compartilhamento individual, sem notas privadas ou IA',async t=>{
 const f=await fixture(t),q='?from=2026-11-01&to=2026-11-30';await f.store.put('checkin',f.cid,{owner:f.user.id,day:'2026-11-09',mood:4,shared:true,note:'Anotação privada'},'check-a');await f.store.put('checkin',f.cid,{owner:f.user.id,day:'2026-11-10',mood:1,shared:false,note:'Não compartilhar'},'check-b');
 const r=(await f.req('/admin/business-reports/wellbeing'+q+'&employeeId='+f.user.id,undefined,f.admin.token)).body;assert.equal(r.summary.checkins,1);assert.equal(r.summary.average,4);assert.equal(r.employees[0].history.length,1);assert.ok(!JSON.stringify(r).includes('Anotação privada'));
 const u=await f.store.get('user',f.user.id,f.cid);u.shareMood=false;await f.store.put('user',f.cid,u,u.id);const revoked=(await f.req('/admin/business-reports/wellbeing'+q,undefined,f.admin.token)).body;assert.equal(revoked.summary.checkins,0);assert.ok(!revoked.employees.some(p=>p.id===u.id));
 const exported=(await f.req('/admin/business-reports/wellbeing/export'+q,undefined,f.admin.token)).body;assert.ok(!Buffer.from(exported.data,'base64').toString().includes('Anotação privada'));
});
