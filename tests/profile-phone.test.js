import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {checkedCPF,checkedBirthDate} from '../server/security.js';
import {countryForDial,suggestCountry,initialPhone,normalizePhone} from '../src/phone-model.js';
async function fixture(t){
 const store=new MemoryStore(),sent=[],gateway={status:async()=>({status:'connected'}),sendText:async(key,jid,message)=>sent.push({key,jid,message})},app=createApp({store,secret:'profile-phone-test-secret-at-least-32-characters',gateway,platformEnv:{}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const req=async(path,body,token='',method)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const register=async(email,phone,invite,extra={})=>{const r=await req('/auth/register',{mode:invite?'employee':'company',document:'11222333000181',companyName:'Empresa Exemplo',name:'Pessoa Exemplo',jobTitle:'Analista',birthDate:'2000-01-01',email,password:'abc123',phone,invite,...extra});assert.equal(r.status,201);return r.body;};
 const admin=await register('admin@example.test','5568999999900'),access=(await req('/admin/access',undefined,admin.token)).body,employee=await register('employee@example.test','5568999999901',access.invite),other=await register('other@example.test','5568999999902',access.invite);
 return {store,req,sent,register,admin,employee,other,access};
}
test('DDI editável identifica país e preserva números nacionais, colagem e zero inicial válido',()=>{
 assert.equal(countryForDial('55','BO'),'BR');assert.equal(countryForDial('+591','BR'),'BO');assert.equal(countryForDial('351'),'PT');assert.equal(countryForDial('1','CA'),'CA');assert.equal(countryForDial('999'),null);assert.equal(countryForDial(''),null);
 assert.equal(normalizePhone('(68) 99999-9901','55','BR'),'5568999999901');assert.equal(normalizePhone('7000 0001','591','BO'),'59170000001');assert.equal(normalizePhone('020 7946 0958','44','GB'),'442079460958');assert.equal(normalizePhone('+59170000001','55','BR'),'59170000001');
 assert.equal(initialPhone('59170000001').country,'BO');assert.equal(initialPhone('5568999999901','BO').national,'68999999901');assert.equal(initialPhone('','BO').dial,'591');
});
test('sugestão de país usa fuso e idioma sem rede ou GPS, com troca manual preservada',()=>{
 assert.equal(suggestCountry('America/Rio_Branco',['en-US']),'BR');assert.equal(suggestCountry('America/La_Paz',['pt-BR']),'BO');assert.equal(suggestCountry('Europe/Lisbon',[]),'PT');assert.equal(suggestCountry('Etc/UTC',['es-PY']),'PY');assert.equal(suggestCountry('Etc/UTC',['xx']), 'BR');
});
test('CPF e nascimento validam dígitos e datas reais e aceitam campos opcionais vazios',()=>{
 assert.equal(checkedCPF('529.982.247-25'),'52998224725');assert.equal(checkedCPF(''),null);assert.throws(()=>checkedCPF('11111111111'));assert.throws(()=>checkedCPF('52998224724'));assert.throws(()=>checkedCPF('abc52998224725'));
 assert.equal(checkedBirthDate('2000-02-29'),'2000-02-29');assert.equal(checkedBirthDate(''),null);assert.throws(()=>checkedBirthDate('2001-02-29'));assert.throws(()=>checkedBirthDate('2099-01-01'));
});
test('cadastro confere repetição de telefone sem OTP e guarda CPF opcional',async t=>{
 const f=await fixture(t),body={mode:'employee',invite:f.access.invite,name:'Pessoa Exemplo',email:'new@example.test',password:'abc123',jobTitle:'Analista',birthDate:'2000-01-01',phone:'59170000001',cpf:'529.982.247-25'};
 assert.equal((await f.req('/auth/register',{...body,phoneConfirmation:'59170000002'})).status,400);
 const r=await f.req('/auth/register',{...body,phoneConfirmation:'59170000001'});assert.equal(r.status,201);assert.equal(r.body.user.phone,'59170000001');assert.equal(r.body.user.cpf,'52998224725');assert.equal(f.sent.length,0);
});
test('colaborador atualiza seus dados e RH edita a ficha sem alterar identidade, setor indevido ou permissões',async t=>{
 const f=await fixture(t),token=f.employee.token,id=f.employee.user.id,cid=f.employee.user.companyId,previous=await f.store.get('user',id,cid);previous.whatsappJid=previous.phone+'@s.whatsapp.net';previous.phoneVerified=true;await f.store.put('user',cid,previous,id);
 const saved=await f.req('/profile',{name:'Nome corrigido',cpf:'529.982.247-25',birthDate:'2001-06-15',phone:'59170000001',jobTitle:'Assistente',address:'Rua Exemplo, 1',role:'admin',companyId:'outsider',departmentId:'fake',email:'hijack@example.test'},token,'PATCH');assert.equal(saved.status,200);assert.equal(saved.body.cpf,'52998224725');assert.equal(saved.body.birthDate,'2001-06-15');assert.equal(saved.body.role,'employee');assert.equal(saved.body.companyId,cid);assert.equal(saved.body.email,'employee@example.test');assert.notEqual(saved.body.departmentId,'fake');
 assert.equal((await f.store.get('user',id,cid)).whatsappJid,undefined);assert.equal(saved.body.phoneVerified,false);assert.match(await f.req('/bootstrap',undefined,token).then(r=>r.body.user.name),/corrigido/);
 const patch={name:'Nome revisado pelo RH',cpf:'11144477735',phone:'5568999999944',birthDate:'2002-03-04',address:'Avenida Exemplo, 2',jobTitle:'Coordenador'};
 assert.equal((await f.req('/admin/employee-config/'+id,patch,f.other.token,'PATCH')).status,403);
 const r=await f.req('/admin/employee-config/'+id,patch,f.admin.token,'PATCH');assert.equal(r.status,200);assert.equal(r.body.cpf,patch.cpf);assert.equal((await f.req('/bootstrap',undefined,token)).body.user.phone,patch.phone);assert.equal(r.body.employeeCode,'0001');
 const badge=(await f.req('/admin/employees/'+id+'/badge',undefined,f.admin.token)).body;assert.equal(badge.employee.name,patch.name);assert.equal(badge.employee.cpf,undefined);assert.equal(badge.employee.address,undefined);assert.equal(badge.employee.phone,undefined);
 const outsider=await f.register('outsider@example.test','5568999999977');assert.equal((await f.req('/admin/employee-config/'+id,patch,outsider.token,'PATCH')).status,404);
});
test('dados inválidos ou telefone/CPF duplicados são recusados sem salvar parcialmente a ficha',async t=>{
 const f=await fixture(t),token=f.employee.token,id=f.employee.user.id;assert.equal((await f.req('/profile',{name:'Nome alterado',cpf:'00000000000'},token,'PATCH')).status,400);assert.equal((await f.req('/bootstrap',undefined,token)).body.user.name,'Pessoa Exemplo');
 assert.equal((await f.req('/profile',{phone:f.other.user.phone},token,'PATCH')).status,409);assert.equal((await f.req('/profile',{birthDate:'2001-02-29'},token,'PATCH')).status,400);
 await f.req('/profile',{cpf:'52998224725'},token,'PATCH');assert.equal((await f.req('/profile',{cpf:'52998224725'},f.other.token,'PATCH')).status,409);
 assert.equal((await f.req('/profile',{cpf:''},token,'PATCH')).body.cpf,null);
});
test('troca de telefone invalida código antigo e já permite recuperação pelo número novo',async t=>{
 const f=await fixture(t),token=f.employee.token,email=f.employee.user.email;await f.req('/auth/password/request',{email});assert.equal(f.sent.length,1);const oldCode=f.sent[0].message.match(/\b\d{6}\b/)[0];
 assert.equal((await f.req('/profile',{phone:'59170000001'},token,'PATCH')).status,200);assert.equal((await f.req('/auth/password/reset',{email,password:'new123',code:oldCode})).status,400);
 await f.req('/auth/password/request',{email});assert.equal(f.sent.length,2);assert.equal(f.sent[1].jid,'59170000001@s.whatsapp.net');const code=f.sent[1].message.match(/\b\d{6}\b/)[0];assert.equal((await f.req('/auth/password/reset',{email,password:'new123',code})).status,200);
});
