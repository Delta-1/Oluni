import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {createClockRequest} from '../src/clock-request.js';
import {createSessionState} from '../src/session.js';

test('cadastro da empresa dispensa nascimento e mantém funcionário obrigatório',async t=>{
 const app=createApp({store:new MemoryStore(),secret:'oluni-test-only-secret-at-least-32-chars'}),server=app.listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const person={name:'Responsável Exemplo',email:'admin@example.com',phone:'5568999999999',password:'test-password123',mode:'company',document:'11222333000181',companyName:'Empresa Exemplo'};
 const result=await fetch(base+'/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(person)});assert.equal(result.status,201);
 const admin=await result.json();assert.equal(admin.user.birthDate,null);assert.equal(admin.user.role,'admin');
 const access=await (await fetch(base+'/admin/access',{headers:{authorization:'Bearer '+admin.token}})).json();
 const employee=await fetch(base+'/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...person,email:'employee@example.com',jobTitle:'Analista',mode:'employee',invite:access.invite})});assert.equal(employee.status,400);
});
test('resposta perdida no ponto mantém identidade no retry e libera ação seguinte',async()=>{
 const saved=new Map(),ids=['request-number-0001','request-number-0002'];let calls=0,first=true;
 const action=createClockRequest(async body=>{calls++;if(!saved.has(body.requestId))saved.set(body.requestId,{event:body.event,requestId:body.requestId});if(first){first=false;throw Error('Network response lost after persistence');}return saved.get(body.requestId);},()=>ids.shift());
 await assert.rejects(action('employee:day:entry',{event:'entry'}));
 const result=await action('employee:day:entry',{event:'entry'});assert.equal(result.requestId,'request-number-0001');assert.equal(saved.size,1);assert.equal(calls,2);
 const next=await action('employee:day:break',{event:'break_start'});assert.equal(next.requestId,'request-number-0002');assert.equal(saved.size,2);
});
test('sessões anteriores são preservadas no mesmo tipo de armazenamento e logout limpa ambas',()=>{
 const local=new Map(),tab=new Map([['moodcorp.session','a'.repeat(43)]]);
 const storage=map=>({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
 const session=createSessionState({localStorage:storage(local),sessionStorage:storage(tab)});
 assert.equal(session.get(),'a'.repeat(43));assert.equal(tab.get('oluni.session'),'a'.repeat(43));assert.equal(tab.has('moodcorp.session'),false);assert.equal(local.size,0);
 session.set('');assert.equal(tab.size,0);
});
