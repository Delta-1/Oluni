import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {hrAssistant,companion} from '../server/ai.js';
const secret='oluni-theme-ai-test-only-32-character-secret';
const person=(email,extra={})=>({name:'Pessoa Exemplo',email,password:'test-password-123',phone:'5568999999999',birthDate:'2000-01-01',jobTitle:'Auxiliar',...extra});
const config={provider:'gemini',model:'test-model',botName:'Equipe RH',instructions:'Oriente sobre documentos e ponto.',mode:'menu',enabled:true,apiKey:'test-only-key-not-real'};
async function fixture(t){
 const store=new MemoryStore(),calls=[],gateway={status:async()=>({status:'connected'}),sendText:async()=>{}},server=createApp({store,secret,gateway,ai:async()=> 'Escuta privada.',whatsappAI:async(settings,history,context)=>{calls.push({settings,history:structuredClone(history),context});return 'Sou a IA do RH. Para enviar um atestado, envie o arquivo neste WhatsApp.';}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const req=async(path,body,session='',method)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
 const company=async(email)=>{const r=await req('/auth/register',person(email,{mode:'company',document:'11222333000181',companyName:'Empresa Exemplo'}));assert.equal(r.status,201);return r.body;};
 const admin=await company('admin@example.test'),invite=(await req('/admin/access',undefined,admin.token)).body.invite,employee=(await req('/auth/register',person('employee@example.test',{mode:'employee',invite}))).body;
 return {store,req,company,admin,employee,calls,gateway};
}
const token=card=>new URLSearchParams(new URL(card.verificationUrl).hash.slice(1)).get('cracha');
test('modelo e cor da empresa chegam à prévia, ao crachá, à consulta e ao lote',async t=>{
 const f=await fixture(t),path='/admin/company/badge-design',oldCard=(await f.req('/badges/mine',undefined,f.employee.token)).body;
 assert.equal((await f.req(path,undefined,f.admin.token)).body.design.preset,'minimal');
 const design={preset:'triangles',accent:'#285a8c',backgroundOpacity:85,backgroundFit:'cover'};
 assert.equal((await f.req(path,design,f.admin.token)).status,200);
 assert.equal((await f.req('/badges/mine',undefined,f.employee.token)).body.company.design.preset,'triangles');
 assert.equal((await f.req('/public/badges/verify',{token:token(oldCard)})).body.company.design.accent,design.accent);
 const batch=await f.req('/admin/badges/print',{items:[{id:f.employee.user.id,quantity:2}]},f.admin.token);assert.equal(batch.body.company.design.preset,'triangles');assert.equal(batch.body.total,2);
 assert.equal((await f.req(path,design,f.employee.token)).status,403);
 const b=await f.company('other@example.test');assert.equal((await f.req(path,undefined,b.token)).body.design.preset,'minimal');
 assert.equal((await f.req(path,{...design,accent:'url(javascript:bad)'},f.admin.token)).status,400);
 assert.equal((await f.req(path,{...design,preset:'injected'},f.admin.token)).status,400);
});
test('fundo é validado, preserva imagem inteira e pode ser removido sem afetar foto ou logo',async t=>{
 const f=await fixture(t),file={mime:'image/png',data:(await sharp({create:{width:300,height:100,channels:3,background:'#456789'}}).png().toBuffer()).toString('base64')},path='/admin/company/badge-design';
 const design={preset:'image',accent:'#765292',backgroundOpacity:100,backgroundFit:'contain'};
 assert.equal((await f.req(path,design,f.admin.token)).status,400);
 const result=await f.req(path,{...design,background:file},f.admin.token);assert.equal(result.status,200);assert.equal(result.body.design.background.mime,'image/jpeg');
 const meta=await sharp(Buffer.from(result.body.design.background.data,'base64')).metadata();assert.equal(meta.width/meta.height,3);assert.equal(meta.exif,undefined);
 assert.equal(result.body.design.backgroundId,undefined);
 const before=(await f.store.list('identity-image')).length;
 assert.equal((await f.req(path,{...design,background:{mime:'image/png',data:'dGVzdA=='}},f.admin.token)).status,400);assert.equal((await f.store.list('identity-image')).length,before);
 const removed=await f.req(path,{...design,preset:'minimal',removeBackground:true},f.admin.token);assert.equal(removed.status,200);assert.equal(removed.body.design.background,null);assert.equal((await f.store.list('identity-image')).length,0);
});
test('IA do WhatsApp exige chave, restringe RH e não expõe segredo nem muda a IA privada',async t=>{
 const f=await fixture(t),path='/admin/whatsapp/ai';assert.equal((await f.req(path,{...config,apiKey:undefined},f.admin.token)).status,400);
 assert.equal((await f.req(path,config,f.employee.token)).status,403);const saved=await f.req(path,config,f.admin.token);assert.equal(saved.status,200);assert.equal(saved.body.hasKey,true);assert.equal(JSON.stringify(saved.body).includes(config.apiKey),false);
 assert.equal((await f.req('/admin/settings',undefined,f.admin.token)).body.hasKey,false);
 const b=await f.company('isolated@example.test');assert.equal((await f.req(path,undefined,b.token)).body.hasKey,false);
 assert.equal((await f.req(path,{...config,apiKey:undefined,enabled:false,removeKey:true},f.admin.token)).body.hasKey,false);
 assert.equal((await f.req('/admin/whatsapp/ai/test',{},f.admin.token)).status,400);
});
test('menu e documentos independem de IA; conversa do bot exige consentimento e não usa histórico privado',async t=>{
 const f=await fixture(t),cid=f.employee.user.companyId,u=await f.store.get('user',f.employee.user.id,cid),jid=u.phone+'@s.whatsapp.net';u.whatsappJid=jid;u.whatsappConsent=true;await f.store.put('user',cid,u,u.id);
 assert.match(await f.gateway.onMessage(cid,jid,'MENU'),/Meu ponto/);assert.match(await f.gateway.onMessage(cid,jid,'2'),/PDF/);assert.equal(f.calls.length,0);
 await f.req('/admin/whatsapp/ai',config,f.admin.token);assert.match(await f.gateway.onMessage(cid,jid,'4'),/Autorize/);
 await f.req('/profile',{aiConsent:true},f.employee.token,'PATCH');await f.req('/chat',{text:'Mensagem privada de bem-estar'},f.employee.token);
 assert.match(await f.gateway.onMessage(cid,jid,'4'),/uma IA/);assert.match(await f.gateway.onMessage(cid,jid,'Qual é o horário de atendimento?'),/IA do RH/);assert.equal(f.calls.length,1);
 assert.match(await f.gateway.onMessage(cid,jid,'Como envio um atestado?'),/PDF/);assert.equal(f.calls.length,1);
 assert.equal(JSON.stringify(f.calls[0].history).includes('bem-estar'),false);assert.equal(f.calls[0].context.companyName,'Empresa Exemplo');assert.equal(f.calls[0].context.employeeName,u.name);
 await f.gateway.onMessage(cid,jid,'MENU');assert.equal((await f.store.list('wa-ai-conversation',cid)).length,0);assert.equal((await f.store.list('chat',cid)).length,2);
 await f.gateway.onMessage(cid,jid,'PARAR');assert.equal(await f.gateway.onMessage(cid,jid,'4'),null);
});
test('modo automático atende perguntas livres e mantém comandos determinísticos',async t=>{
 const f=await fixture(t),cid=f.employee.user.companyId,u=await f.store.get('user',f.employee.user.id,cid),jid=u.phone+'@s.whatsapp.net';Object.assign(u,{whatsappJid:jid,whatsappConsent:true,aiConsent:true});await f.store.put('user',cid,u,u.id);
 await f.req('/admin/whatsapp/ai',{...config,mode:'automatic'},f.admin.token);assert.match(await f.gateway.onMessage(cid,jid,'Preciso de ajuda com meus documentos'),/IA do RH/);assert.equal(f.calls.length,1);
 assert.match(await f.gateway.onMessage(cid,jid,'ATESTADO'),/PDF/);assert.equal(f.calls.length,1);
 await f.req('/admin/whatsapp/ai',{...config,apiKey:undefined,enabled:false},f.admin.token);await f.gateway.onMessage(cid,jid,'Outra pergunta');assert.equal(f.calls.length,1);
});
test('transporte envia orientações próprias do RH e preserva a persona privada da Flora',async()=>{
 const calls=[],fetcher=async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return {ok:true,json:async()=>({choices:[{message:{content:'Resposta de teste.'}}]})};};
 const settings={...config,provider:'openai'};await hrAssistant(settings,[{role:'user',text:'Como envio o documento?'}],{document:'11222333000181',companyName:'Empresa Exemplo'},fetcher);await companion(settings,[{role:'user',text:'Como me sinto hoje'}],fetcher);
 assert.match(calls[0].body.messages[0].content,/assistente virtual de IA da empresa/);assert.match(calls[1].body.messages[0].content,/Flora/);assert.equal(calls[0].options.headers.Authorization,'Bearer '+config.apiKey);assert.equal(calls[0].body.messages[0].content.includes(config.apiKey),false);
});
