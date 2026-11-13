import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {WhatsAppGateway,acceptInboxEvent} from '../server/whatsapp.js';
import {checkedAttachment} from '../server/whatsapp-inbox.js';
const secret='oluni-communications-tests-secret-only-12345';
const schedule={enabled:true,mode:'scheduled',time:'10:00',windowStart:'10:00',windowEnd:'16:00',weekdays:[0,1,2,3,4,5,6],intervalDays:3,opening:'Como foi seu dia de trabalho? Quer conversar?'};
const person=(email,extra={})=>({name:'Pessoa Exemplo',email,password:'test-password-123',phone:'5568999999999',birthDate:'2000-01-01',jobTitle:'Auxiliar',...extra});
async function fixture(t,{wellbeingAI=async()=> 'Sou a Flora, uma IA. O que ajudaria a tornar seu dia mais leve?'}={}){
 const store=new MemoryStore(),sent=[],aiCalls=[],gateway={status:async()=>({status:'connected'}),sendText:async(cid,jid,text)=>{sent.push({cid,jid,text});return {key:{id:'sent-'+sent.length}};},sendMedia:async(cid,jid,file,caption)=>{sent.push({cid,jid,file,caption});return {key:{id:'sent-'+sent.length}};}};
 const app=createApp({store,secret,gateway,wellbeingAI,whatsappAI:async(s,h,c)=>{aiCalls.push(h);return 'Sou a IA dos serviços.';}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const req=async(path,body,session='',method)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
 const company=async(email)=>{const r=await req('/auth/register',person(email,{mode:'company',document:'11222333000181',companyName:'Empresa Exemplo',phone:'5568999999990'}));assert.equal(r.status,201);return r.body;};
 const admin=await company('admin@example.test'),invite=(await req('/admin/access',undefined,admin.token)).body.invite;
 const employee=(await req('/auth/register',person('employee@example.test',{mode:'employee',invite}))).body;
 const operator=(await req('/auth/register',person('operator@example.test',{mode:'employee',invite,phone:'5568999999998'}))).body;
 const cid=admin.user.companyId;
 const link=async(consent=true)=>{const u=await store.get('user',employee.user.id,cid);Object.assign(u,{whatsappJid:u.phone+'@s.whatsapp.net',phoneVerified:true,whatsappConsent:true,wellbeingWhatsappConsent:consent,aiConsent:true});await store.put('user',cid,u,u.id);return u;};
 const configure=()=>req('/admin/whatsapp/wellbeing',schedule,admin.token);
 const configureAI=()=>req('/admin/whatsapp/ai',{provider:'gemini',model:'test-model',botName:'RH',instructions:'Atenda com respeito.',mode:'automatic',enabled:true,apiKey:'test-key-not-real'},admin.token);
 const grant=()=>req('/admin/whatsapp/agents/'+operator.user.id,{whatsappAgent:true},admin.token,'PATCH');
 return {app,store,gateway,sent,req,admin,employee,operator,cid,company,link,configure,configureAI,grant,aiCalls};
}
test('convite programado exige autorização específica, horário local e reserva durável',async t=>{
 const f=await fixture(t);await f.link(false);await f.configure();const now=new Date('2026-11-11T15:00:00Z'); // Rio Branco 10:00
 await f.app.locals.whatsappHub.wellbeing.tick(now);assert.equal(f.sent.length,0);
 await f.link(true);await f.app.locals.whatsappHub.wellbeing.tick(new Date('2026-11-11T14:59:00Z'));assert.equal(f.sent.length,0);
 await f.app.locals.whatsappHub.wellbeing.tick(now);await f.app.locals.whatsappHub.wellbeing.tick(now);assert.equal(f.sent.length,1);assert.match(f.sent[0].text,/opcional/);assert.match(f.sent[0].text,/aparelho/);
 // A new process instance sees the reservation and does not resend.
 const another=createApp({store:f.store,secret,gateway:{...f.gateway}});await another.locals.whatsappHub.wellbeing.tick(now);assert.equal(f.sent.length,1);
 assert.equal((await f.store.list('wa-wellbeing-delivery',f.cid))[0].status,'sent');
});
test('modo automático varia o horário dentro da janela e valida configuração',async t=>{
 const f=await fixture(t);await f.link();const bad=await f.req('/admin/whatsapp/wellbeing',{...schedule,windowStart:'16:00',windowEnd:'10:00'},f.admin.token);assert.equal(bad.status,400);
 await f.req('/admin/whatsapp/wellbeing',{...schedule,mode:'automatic',windowStart:'10:00',windowEnd:'10:01'},f.admin.token);
 await f.app.locals.whatsappHub.wellbeing.tick(new Date('2026-11-11T15:00:00Z'));assert.equal(f.sent.length,1);
 assert.equal((await f.req('/admin/whatsapp/wellbeing',schedule,f.employee.token)).status,403);
});
test('entrega incerta não é repetida e não gera insistência no mesmo dia',async t=>{
 const f=await fixture(t);await f.link();await f.configure();f.gateway.sendText=async()=>{f.sent.push('attempt');throw Error('timeout after send');};
 await f.app.locals.whatsappHub.wellbeing.tick(new Date('2026-11-11T15:00Z'));await f.app.locals.whatsappHub.wellbeing.tick(new Date('2026-11-11T15:01Z'));
 assert.equal(f.sent.length,1);assert.equal((await f.store.list('wa-wellbeing-delivery',f.cid))[0].status,'uncertain');
});
test('conversa de bem-estar usa histórico separado e só o próprio colaborador pode consultá-lo',async t=>{
 const f=await fixture(t),u=await f.link();await f.configure();await f.configureAI();
 assert.match(await f.gateway.onMessage(f.cid,u.whatsappJid,'BEM-ESTAR'),/opcional/);
 assert.match(await f.gateway.onMessage(f.cid,u.whatsappJid,'Estou cansado e queria conversar'),/Flora/);
 assert.equal((await f.req('/whatsapp/inbox',undefined,f.admin.token)).body.threads.length,0);
 assert.equal((await f.req('/wellbeing/whatsapp',undefined,f.employee.token)).body.messages.length,2);
 assert.equal((await f.req('/wellbeing/whatsapp',undefined,f.admin.token)).body.messages.length,0);
 await f.gateway.onMessage(f.cid,u.whatsappJid,'HUMOR 4');assert.equal((await f.store.list('checkin',f.cid))[0].mood,4);assert.equal(f.aiCalls.length,0);
 const result=await f.gateway.onMessage(f.cid,u.whatsappJid,'PARAR BEM-ESTAR');assert.match(result,/desativados/);assert.equal((await f.store.get('user',u.id,f.cid)).whatsappConsent,true);assert.equal((await f.store.get('user',u.id,f.cid)).wellbeingWhatsappConsent,false);
});
test('revogar autorização durante geração cancela a resposta privada',async t=>{
 let finish,started;const began=new Promise(r=>started=r);const f=await fixture(t,{wellbeingAI:async()=>{started();return new Promise(r=>finish=r);}}),u=await f.link();await f.configure();await f.configureAI();await f.gateway.onMessage(f.cid,u.whatsappJid,'BEM-ESTAR');
 const pending=f.gateway.onMessage(f.cid,u.whatsappJid,'Quero falar sobre meu dia');await began;await f.req('/profile',{wellbeingWhatsappConsent:false},f.employee.token,'PATCH');finish('Resposta que não deve ser entregue');assert.equal(await pending,null);assert.equal((await f.store.list('wa-wellbeing-chat',f.cid)).length,0);
});
test('contatos externos entram na caixa sem exigir conta de colaborador; acesso é separado do RH',async t=>{
 const f=await fixture(t);assert.match(await f.gateway.onMessage(f.cid,'5568991112222@s.whatsapp.net','Olá, preciso de atendimento',null,{id:'ext-1',name:'Contato Exemplo'}),/Falar com o RH/);
 const list=await f.req('/whatsapp/inbox',undefined,f.admin.token);assert.equal(list.body.threads.length,1);assert.equal(list.body.threads[0].name,'Contato Exemplo');
 assert.equal((await f.req('/whatsapp/inbox',undefined,f.operator.token)).status,403);await f.grant();assert.equal((await f.req('/whatsapp/inbox',undefined,f.operator.token)).status,200);
 assert.equal((await f.req('/admin/whatsapp/ai',undefined,f.operator.token)).status,403);
 const other=await f.company('other@example.test');assert.equal((await f.req('/whatsapp/inbox/'+list.body.threads[0].id+'/messages',undefined,other.token)).status,404);
 assert.equal((await f.req('/profile',{whatsappAgent:true},f.employee.token,'PATCH')).body.whatsappAgent,undefined);
});
test('dois atendentes não assumem juntos; resposta tem idempotência e identificação',async t=>{
 const f=await fixture(t);await f.grant();await f.gateway.onMessage(f.cid,'5568991112222@s.whatsapp.net','Olá',null,{id:'m1'});
 const id=(await f.req('/whatsapp/inbox',undefined,f.admin.token)).body.threads[0].id;
 const a=await f.req('/whatsapp/inbox/'+id,{action:'claim'},f.operator.token,'PATCH');assert.equal(a.status,200);
 assert.equal((await f.req('/whatsapp/inbox/'+id,{action:'claim'},f.employee.token,'PATCH')).status,403);
 const request={text:'Olá, como posso ajudar?',requestId:'test-request-123456'};
 assert.equal((await f.req('/whatsapp/inbox/'+id+'/messages',request,f.operator.token)).status,200);
 assert.equal((await f.req('/whatsapp/inbox/'+id+'/messages',request,f.operator.token)).status,200);assert.equal(f.sent.length,1);assert.match(f.sent[0].text,/^\*Pessoa Exemplo\*/);
 assert.equal((await f.req('/whatsapp/inbox/'+id+'/messages',{...request,text:'Different'},f.operator.token)).status,409);
 await f.req('/whatsapp/inbox/'+id,{action:'transfer',assignedTo:f.admin.user.id},f.operator.token,'PATCH');assert.equal((await f.req('/whatsapp/inbox/'+id+'/messages',{...request,requestId:'new-request-123456'},f.operator.token)).status,409);
});
test('assumir pausa o bot e os convites; devolver permite serviços novamente',async t=>{
 const f=await fixture(t),u=await f.link();await f.configure();await f.configureAI();await f.gateway.onMessage(f.cid,u.whatsappJid,'MENU');const id=(await f.req('/whatsapp/inbox',undefined,f.admin.token)).body.threads[0].id;
 await f.req('/whatsapp/inbox/'+id,{action:'claim'},f.admin.token,'PATCH');assert.equal(await f.gateway.onMessage(f.cid,u.whatsappJid,'Como envio meus documentos?'),null);assert.equal(f.aiCalls.length,0);
 await f.app.locals.whatsappHub.wellbeing.tick(new Date('2026-11-11T15:00Z'));assert.equal(f.sent.length,0);
 await f.req('/whatsapp/inbox/'+id,{action:'release'},f.admin.token,'PATCH');assert.match(await f.gateway.onMessage(f.cid,u.whatsappJid,'MENU'),/Meu ponto/);
});
test('deduplica recebimentos e não expõe atestados na caixa dos atendentes',async t=>{
 const f=await fixture(t),u=await f.link();await f.gateway.onMessage(f.cid,'5568991112222@s.whatsapp.net','A',null,{id:'same'});await f.gateway.onMessage(f.cid,'5568991112222@s.whatsapp.net','A',null,{id:'same'});assert.equal((await f.store.list('wa-message',f.cid)).filter(m=>m.direction==='in').length,1);
 await f.gateway.onMessage(f.cid,u.whatsappJid,'ATESTADO');await f.gateway.onMessage(f.cid,u.whatsappJid,u.employeeCode);const privateFile={mime:'application/pdf',buffer:Buffer.from('%PDF-1.4\nDocumento de demonstração'),name:'documento.pdf'};assert.match(await f.gateway.onMessage(f.cid,u.whatsappJid,'',privateFile),/Recebemos/);
 const list=await f.store.list('wa-message',f.cid);assert.equal(list.some(m=>m.file),false);assert.equal((await f.req('/documents',undefined,f.employee.token)).body.documents?.length??(await f.store.list('document',f.cid)).length,1);
});
test('anexos de atendimento ficam no tenant e não aceitam HTML disfarçado',async t=>{
 const f=await fixture(t);const file={mime:'application/pdf',buffer:Buffer.from('%PDF-1.4\narquivo fictício'),name:'arquivo.pdf'};await f.gateway.onMessage(f.cid,'5568991112222@s.whatsapp.net','Veja o arquivo',file,{id:'file1'});
 const item=(await f.store.list('wa-message',f.cid)).find(m=>m.file);assert.ok(item.file.id);
 assert.equal((await f.req('/whatsapp/files/'+item.file.id,undefined,f.employee.token)).status,403);
 const other=await f.company('other@example.test');assert.equal((await f.req('/whatsapp/files/'+item.file.id,undefined,other.token)).status,404);
 assert.equal((await f.req('/whatsapp/files/'+item.file.id,undefined,f.admin.token)).status,200);
 assert.throws(()=>checkedAttachment({mime:'application/pdf',buffer:Buffer.from('<html>not a PDF</html>')}));
 assert.equal(checkedAttachment({mime:'audio/ogg; codecs=opus',buffer:Buffer.from('OggSdemo'),name:'audio.ogg'}).mime,'audio/ogg');
});
test('eventos próprios entram como atendimento humano e ecos dos envios do sistema são ignorados',async t=>{
 const f=await fixture(t),g=new WhatsAppGateway(f.store,secret),raw={key:{id:'own-phone',remoteJid:'5568991112222@s.whatsapp.net',fromMe:true},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'Mensagem pelo celular'}};
 assert.equal(acceptInboxEvent(raw,'append',new Date(Date.now()-5000).toISOString()),true);
 assert.equal(acceptInboxEvent({...raw,key:{...raw.key,remoteJid:'group@g.us'}},'notify',new Date(0).toISOString()),false);
 g.onOwnMessage=f.app.locals.whatsappHub.own;g.canReceiveFile=async()=>true;await g.save(f.cid,{requested:true,startedAt:new Date(Date.now()-5000).toISOString()});const session={status:'connected',stop:false,sock:{sendMessage:async()=>({key:{id:'system-echo'}})}};g.sessions.set(f.cid,session);
 await g.receiveRaw(f.cid,session,session.sock,raw,'append');assert.equal((await f.store.list('wa-thread',f.cid))[0].botPaused,true);
 await g.sendText(f.cid,raw.key.remoteJid,'Código de verificação de teste');await g.receiveRaw(f.cid,session,session.sock,{...raw,key:{...raw.key,id:'system-echo'}},'notify');assert.equal((await f.store.list('wa-message',f.cid)).length,1);
});

test('visitante usa menu sem IA e documentos enviados em nome de outra pessoa ficam com a equipe',async t=>{
 const f=await fixture(t);await f.configureAI();const stranger='5568991112222@s.whatsapp.net',registered='5568999999999@s.whatsapp.net';
 assert.match(await f.gateway.onMessage(f.cid,stranger,'Quero informações'),/Falar com o RH/);assert.equal(f.aiCalls.length,0);
 assert.match(await f.gateway.onMessage(f.cid,stranger,'2'),/Uma pessoa da equipe/);assert.equal(await f.gateway.onMessage(f.cid,stranger,'ATESTADO'),null);
 assert.equal(await f.gateway.onMessage(f.cid,stranger,f.employee.user.employeeCode),null);assert.equal(await f.gateway.onMessage(f.cid,stranger,f.employee.user.name),null);
 const file={mime:'application/pdf',name:'exemplo.pdf',buffer:Buffer.from('%PDF-1.4\nArquivo de teste')};await f.gateway.onMessage(f.cid,stranger,'',file);
 assert.equal((await f.store.list('document',f.cid)).length,0);assert.ok((await f.store.list('wa-message',f.cid)).some(m=>m.file));
 assert.match(await f.gateway.onMessage(f.cid,registered,'ATESTADO'),/vinculado ao seu cadastro/);assert.match(await f.gateway.onMessage(f.cid,registered,'',file),/Recebemos/);
 assert.equal((await f.store.list('document',f.cid))[0].owner,f.employee.user.id);assert.equal((await f.store.get('user',f.employee.user.id,f.cid)).phoneVerified,undefined);assert.equal(f.aiCalls.length,0);
});
test('telefone reconhecido dispensa nova identificação e autorização de atendimento pode ser revogada',async t=>{
 const f=await fixture(t),u=await f.link();assert.match(await f.gateway.onMessage(f.cid,u.whatsappJid,'2'),/vinculado ao seu cadastro/);
 await f.grant();assert.equal((await f.req('/whatsapp/inbox',undefined,f.operator.token)).status,200);await f.req('/admin/whatsapp/agents/'+f.operator.user.id,{whatsappAgent:false},f.admin.token,'PATCH');assert.equal((await f.req('/whatsapp/inbox',undefined,f.operator.token)).status,403);
});

test('dois atendentes concorrentes recebem uma única atribuição',async t=>{
 const f=await fixture(t);await f.grant();await f.req('/admin/whatsapp/agents/'+f.employee.user.id,{whatsappAgent:true},f.admin.token,'PATCH');await f.gateway.onMessage(f.cid,'5568991112222@s.whatsapp.net','RH');const id=(await f.req('/whatsapp/inbox',undefined,f.admin.token)).body.threads[0].id;
 const results=await Promise.all([f.req('/whatsapp/inbox/'+id,{action:'claim'},f.operator.token,'PATCH'),f.req('/whatsapp/inbox/'+id,{action:'claim'},f.employee.token,'PATCH')]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
});
test('frequência mínima, dias escolhidos e tolerância evitam envio atrasado em massa',async t=>{
 const f=await fixture(t),u=await f.link();await f.configure();await f.app.locals.whatsappHub.wellbeing.tick(new Date('2026-11-11T16:00Z'));assert.equal(f.sent.length,0);
 await f.app.locals.whatsappHub.wellbeing.tick(new Date('2026-11-11T15:00Z'));assert.equal(f.sent.length,1);await f.gateway.onMessage(f.cid,u.whatsappJid,'MENU');await f.app.locals.whatsappHub.wellbeing.tick(new Date('2026-11-12T15:00Z'));assert.equal(f.sent.length,1);
 await f.app.locals.whatsappHub.wellbeing.tick(new Date('2026-11-14T15:00Z'));assert.equal(f.sent.length,2);
});

test('marcadores persistentes impedem que códigos enviados pelo sistema vazem após reinício',async t=>{
 const f=await fixture(t),g=new WhatsAppGateway(f.store,secret),cid=f.cid,jid='5568991112222@s.whatsapp.net';const s={status:'connected',stop:false,sock:{sendMessage:async()=>({key:{id:'private-code-id'}})}};g.sessions.set(cid,s);await g.save(cid,{requested:true,startedAt:new Date(Date.now()-10000).toISOString()});await g.sendText(cid,jid,'Oluni: seu código para verificar o WhatsApp é 123456. Válido por 10 minutos. Não compartilhe.');
 const restarted=new WhatsAppGateway(f.store,secret);restarted.onOwnMessage=f.app.locals.whatsappHub.own;
 await restarted.receiveRaw(cid,s,s.sock,{key:{id:'private-code-id',remoteJid:jid,fromMe:true},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:'Texto de sistema já enviado'}},'append');assert.equal((await f.store.list('wa-message',cid)).length,0);
});
test('visitante pode parar o menu automático sem ganhar acesso à IA',async t=>{
 const f=await fixture(t),jid='5568991112222@s.whatsapp.net';assert.match(await f.gateway.onMessage(f.cid,jid,'PARAR'),/desativadas/);assert.equal(await f.gateway.onMessage(f.cid,jid,'Olá'),null);assert.match(await f.gateway.onMessage(f.cid,jid,'MENU'),/Falar com o RH/);assert.equal(f.aiCalls.length,0);
});
