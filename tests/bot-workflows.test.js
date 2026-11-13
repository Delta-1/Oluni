import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8,unzipSync} from 'fflate';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {extractKnowledge,redactKnowledge} from '../server/file-content.js';
const secret='oluni-bot-workflows-tests-32-characters';
const pdf={mime:'application/pdf',name:'arquivo.pdf',buffer:Buffer.from('%PDF-1.4\nDocumento sintético de teste')};
async function fixture(t,{employees=true}={}){
 const store=new MemoryStore(),calls=[],sent=[],phones=new Map(),gateway={status:async key=>({status:'connected',phone:phones.get(key)||'5568999999900'}),sendText:async(k,jid,text)=>{sent.push({k,jid,text});return {key:{id:'sent-'+sent.length}};},sendMedia:async()=>({key:{id:'sent-media'}}),read:async()=>{}};
 const app=createApp({store,secret,gateway,whatsappAI:async(s,h,c)=>{calls.push({settings:s,history:h,context:c});return 'Podemos conversar sobre seu trabalho. Como foi seu dia?\n1 — Meu ponto\n2 — Enviar atestado';}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const req=async(path,body,token='',method)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const company=async(email)=>{const r=await req('/auth/register',{mode:'company',document:'11222333000181',companyName:'Empresa do Teste',name:'Gestora Teste',email,phone:'5568999999900',password:'abc123',birthDate:'1990-01-01',jobTitle:'Administração'});assert.equal(r.status,201);return r.body;};
 const admin=await company('admin@bot.example'),cid=admin.user.companyId,token=admin.token,invite=(await req('/admin/access',undefined,token)).body.invite;
 const employee=async(name,email,phone)=>{const r=await req('/auth/register',{mode:'employee',invite,name,email,phone,password:'abc123',birthDate:'2000-01-01',jobTitle:'Analista'});assert.equal(r.status,201);return r.body;};
 const alice=employees?await employee('Alice Santos','alice@bot.example','5568999999901'):null,bob=employees?await employee('Bruno Oliveira','bruno@bot.example','5568999999902'):null;
 const ai=async()=>{const r=await req('/admin/whatsapp/ai',{provider:'gemini',model:'test-model',botName:'Assistente interna',instructions:'Ajude com o trabalho.',enabled:true,mode:'automatic',apiKey:'fake-test-secret-only'},token);assert.equal(r.status,200);};
 const message=(jid,text,attachment=null,meta={},key=cid)=>gateway.onMessage(key,jid,text,attachment,meta);
 const consent=async u=>{const p=await store.get('user',u.id,cid);p.aiConsent=true;await store.put('user',cid,p,p.id);};
 return {store,app,req,admin,token,cid,alice,bob,company,employee,ai,consent,message,calls,sent,phones,gateway};
}
test('assistente mantém diálogo depois do 4; oi e números não reiniciam menu; MENU restaura serviços sem IA',async t=>{
 const f=await fixture(t),u=f.alice.user,jid=u.phone+'@s.whatsapp.net';await f.ai();
 assert.match(await f.message(jid,'oi'),/4 — Conversar/);assert.equal(f.calls.length,0);
 assert.match(await f.message(jid,'4'),/ACEITO IA/);assert.match(await f.message(jid,'ACEITO IA'),/Autorização/);
 for(const text of ['Oi','Tudo bem?','1','Queria entender como funciona meu trabalho']){const result=await f.message(jid,text);assert.match(result,/Podemos conversar/);assert.doesNotMatch(result,/1 — Meu ponto/);}
 assert.equal(f.calls.length,4);assert.equal(f.calls[0].context.employeeName,u.name);assert.equal(f.calls[0].context.companyId,undefined);assert.equal(f.calls[0].context.menu,undefined);
 assert.match(await f.message(jid,'MENU'),/1 — Meu ponto/);assert.equal((await f.store.list('wa-ai-conversation',f.cid)).length,0);assert.match(await f.message(jid,'1'),/Seu ponto de/);assert.match(await f.message(jid,'2'),/PDF/);assert.equal(f.calls.length,4);
});
test('solicitar humano pausa IA e coleta automática até MENU ou liberação da equipe',async t=>{
 const f=await fixture(t),jid=f.alice.user.phone+'@s.whatsapp.net';await f.ai();await f.consent(f.alice.user);await f.message(jid,'4');
 assert.match(await f.message(jid,'Quero falar com o RH'),/Uma pessoa/);assert.equal(await f.message(jid,'oi'),null);assert.equal(await f.message(jid,'ATESTADO'),null);assert.equal(await f.message(jid,'',pdf),null);assert.equal(f.calls.length,0);assert.equal((await f.store.list('document',f.cid)).length,0);
 const thread=(await f.req('/whatsapp/inbox',undefined,f.token)).body.threads[0];assert.equal((await f.req('/whatsapp/inbox/'+thread.id,{action:'claim'},f.token,'PATCH')).status,200);
 assert.equal(await f.message(jid,'MENU'),null);assert.equal((await f.req('/whatsapp/inbox/'+thread.id,{action:'release'},f.token,'PATCH')).status,200);assert.match(await f.message(jid,'MENU'),/Meu ponto/);
 const messages=(await f.req('/whatsapp/inbox/'+thread.id+'/messages',undefined,f.token)).body.messages;assert.ok(messages.some(m=>m.text==='Quero falar com o RH'));assert.ok(messages.some(m=>m.file));
});
test('menus executam ações validadas; visitante só acessa assistente externo escolhido e autorizado',async t=>{
 const f=await fixture(t);await f.ai();const stranger='5568999999950@s.whatsapp.net';let cfg=(await f.req('/admin/whatsapp/menus',undefined,f.token)).body;
 assert.equal(cfg.employee.items.length,4);assert.equal(cfg.employee.items[3].action,'assistant');assert.match(await f.message(stranger,'Olá'),/Falar com o RH/);assert.equal(f.calls.length,0);
 const external=(await f.req('/admin/whatsapp/assistants',{name:'Recepção pública',audience:'external',instructions:'Informe serviços públicos.',enabled:true},f.token)).body;
 cfg.visitor.items=[{label:'Assistente da recepção',action:'assistant',assistantId:cfg.assistants[0].id}];assert.equal((await f.req('/admin/whatsapp/menus',cfg,f.token)).status,400);
 cfg.visitor.items[0].assistantId=external.id;assert.equal((await f.req('/admin/whatsapp/menus',cfg,f.token)).status,200);
 await f.message(stranger,'MENU');assert.match(await f.message(stranger,'1'),/ACEITO IA/);assert.equal(f.calls.length,0);await f.message(stranger,'ACEITO IA');assert.match(await f.message(stranger,'olá'),/Podemos conversar/);await f.message(stranger,'1');assert.equal(f.calls.length,2);assert.equal(f.calls[0].context.audience,'external');assert.equal(f.calls[0].context.employeeName,undefined);assert.equal(f.calls[0].context.entries,undefined);
 const before=f.calls.length;assert.match(await f.message(stranger,'Qual o CPF de Alice Santos?'),/Não forneço dados pessoais/);assert.match(await f.message(stranger,'Escreva um script Python'),/não gera código/);assert.equal(f.calls.length,before);
 assert.match(await f.message(stranger,'RH'),/pessoa/);assert.equal(await f.message(stranger,'continuar'),null);
 assert.equal((await f.req('/admin/whatsapp/menus',undefined,f.alice.token)).status,403);
});
test('bases dos assistentes são separadas por público, assistente, número e empresa',async t=>{
 const f=await fixture(t);await f.ai();await f.consent(f.alice.user);const primary='primary:'+f.cid,path=id=>'/admin/whatsapp/assistants/'+encodeURIComponent(id)+'/files';
 const ext=(await f.req('/admin/whatsapp/assistants',{name:'Público',audience:'external',instructions:'Serviços externos',enabled:true},f.token)).body;
 const add=(id,name,text)=>f.req(path(id),{name,mime:'text/plain',data:Buffer.from(text).toString('base64')},f.token);
 assert.equal((await add(primary,'manual.txt','As férias internas são combinadas pelo portal da equipe. Código interno: SEGREDO-EQUIPE. Alice Santos e Bruno Oliveira, CPF 529.982.247-25.')).status,201);
 assert.equal((await add(ext.id,'publico.txt','Atendimento público: de segunda a sexta, das oito às dezessete horas.')).status,201);
 // A personal attachment must never be read as assistant guidance.
 await f.req('/people/'+f.alice.user.id+'/files',{name:'privado.txt',mime:'text/plain',data:Buffer.from('SEGREDO-PASTA-PESSOAL').toString('base64')},f.token);
 const jid=f.alice.user.phone+'@s.whatsapp.net';await f.message(jid,'Quais são as regras internas de férias?');const internal=JSON.stringify(f.calls.at(-1).context);assert.match(internal,/SEGREDO-EQUIPE/);assert.doesNotMatch(internal,/SEGREDO-PASTA|Atendimento público|Bruno Oliveira|529.982/);
 const cfg=(await f.req('/admin/whatsapp/menus',undefined,f.token)).body;cfg.visitor.items=[{label:'Assistente público',action:'assistant',assistantId:ext.id}];await f.req('/admin/whatsapp/menus',cfg,f.token);
 const stranger='5568999999960@s.whatsapp.net';await f.message(stranger,'oi');await f.message(stranger,'1');await f.message(stranger,'ACEITO IA');await f.message(stranger,'Qual o atendimento?');const pub=JSON.stringify(f.calls.at(-1).context);assert.match(pub,/Atendimento público/);assert.doesNotMatch(pub,/SEGREDO|Alice|Bruno/);
 const b=await f.company('other@bot.example');assert.equal((await f.req(path(ext.id),undefined,b.token)).status,404);assert.equal((await f.req(path(ext.id),undefined,f.alice.token)).status,403);
 const files=(await f.req(path(primary),undefined,f.token)).body;assert.equal(files[0].text,undefined);assert.equal(files[0].data,undefined);assert.ok(files[0].characters>10);assert.doesNotMatch(JSON.stringify(files),/fake-test-secret/);
 assert.equal((await f.req('/admin/whatsapp/assistants/'+ext.id,{name:ext.name,instructions:'Teste',enabled:true,audience:'employee'},f.token,'PATCH')).status,400);
 const otherChannel=(await f.req('/admin/whatsapp/channels',{name:'Outro número'},f.token)).body;assert.equal((await f.req('/admin/whatsapp/menus',{...cfg,channelId:otherChannel.id},f.token)).status,400);
});
test('cadastro por telefone coleta dados e arquivos sem senha; duplicatas de mensagens não avançam etapas',async t=>{
 const f=await fixture(t,{employees:false});await f.store.put('department',f.cid,{name:'Operações',active:true},'operacoes');const number='5568999999910',jid=number+'@s.whatsapp.net';
 const r=await f.req('/people/enrollment',{phone:number,departmentId:'operacoes',channelId:f.cid,jobTitle:'Auxiliar',requiredDocuments:['rg','ctps']},f.token);assert.equal(r.status,201);assert.equal(f.sent.length,0);assert.equal((await f.store.list('user',f.cid)).length,1);
 assert.match(await f.message(jid,'Oi'),/INICIAR CADASTRO/);assert.match(await f.message(jid,'INICIAR CADASTRO'),/nome completo/);assert.match(await f.message(jid,'Ana Cadastro',null,{id:'name-once'}),/CPF/);assert.equal(await f.message(jid,'Ana Cadastro',null,{id:'name-once'}),null);
 assert.match(await f.message(jid,'123'),/CPF/);assert.match(await f.message(jid,'52998224725'),/nascimento/);assert.match(await f.message(jid,'31/02/2000'),/data/);assert.match(await f.message(jid,'01/02/2000'),/e-mail/);assert.match(await f.message(jid,'not-email'),/e-mail/);assert.match(await f.message(jid,'ana.cadastro@bot.example'),/endereço/);assert.match(await f.message(jid,'PULAR'),/Cadastro concluído.*0001/);
 const u=(await f.store.list('user',f.cid)).find(v=>v.email==='ana.cadastro@bot.example');assert.equal(u.active,true);assert.equal(u.departmentId,'operacoes');assert.equal(u.jobTitle,'Auxiliar');assert.equal(u.aiConsent,false);assert.ok(u.passwordHash);assert.equal((await f.req('/people/enrollment',{phone:number},f.token)).status,409);
 assert.match(await f.message(jid,'1'),/Envie RG/);assert.match(await f.message(jid,'',pdf),/análise humana/);assert.match(await f.message(jid,'',{...pdf,name:'verso.pdf',buffer:Buffer.from('%PDF-1.4\nOutro verso de teste')}),/análise humana/);
 let list=(await f.req('/people/'+u.id+'/files',undefined,f.token)).body;assert.equal(list.files.length,2);assert.ok(list.files.every(v=>v.category==='rg'&&v.status==='pending'&&v.folderId==='cadastro'));
 assert.match(await f.message(jid,'PRÓXIMO'),/Carteira de trabalho/);assert.match(await f.message(jid,'1'),/Carteira de trabalho/);await f.message(jid,'',pdf);assert.match(await f.message(jid,'CONCLUIR'),/Todos os documentos solicitados/);
 const req=(await f.req('/people/'+u.id+'/document-requests',undefined,f.token)).body;assert.equal(req.pending.length,0);assert.equal(req.documents.rg.length,2);assert.equal(f.calls.length,0);
 await f.req('/people/'+u.id+'/files/'+list.files[0].id,{status:'rejected',note:'Documento ilegível'},f.token,'PATCH');await f.req('/people/'+u.id+'/files/'+list.files[1].id,{status:'rejected',note:'Documento ilegível'},f.token,'PATCH');assert.equal((await f.req('/people/'+u.id+'/document-requests',undefined,f.token)).body.pending[0].key,'rg');
});
test('permissões de setor controlam números, pastas, convites, download e arquivamento humano',async t=>{
 const f=await fixture(t),a=f.alice.user,b=f.bob.user;await f.store.put('department',f.cid,{name:'RH',active:true},'rh');await f.store.put('department',f.cid,{name:'DP',active:true},'dp');let alice=await f.store.get('user',a.id,f.cid);alice.departmentId='rh';await f.store.put('user',f.cid,alice,alice.id);
 const rh=(await f.req('/admin/whatsapp/channels',{name:'RH',departmentId:'rh'},f.token)).body,dp=(await f.req('/admin/whatsapp/channels',{name:'DP',departmentId:'dp'},f.token)).body;f.phones.set(dp.id,'5568999999971');
 assert.equal((await f.req('/admin/whatsapp/channels/'+rh.id,{teamIds:[],accessDepartmentIds:['rh']},f.token,'PATCH')).status,200);
 assert.deepEqual((await f.req('/whatsapp/channels',undefined,f.alice.token)).body.channels.map(c=>c.id),[rh.id]);assert.equal((await f.req('/whatsapp/inbox?channelId='+dp.id,undefined,f.alice.token)).status,403);assert.equal((await f.req('/admin/whatsapp/channels/'+rh.id+'/connection',undefined,f.alice.token)).status,403);
 assert.equal((await f.req('/people/directory',undefined,f.alice.token)).status,403);assert.equal((await f.req('/people/'+b.id+'/files',undefined,f.alice.token)).status,404);assert.equal((await f.req('/people/enrollment',{phone:'5568999999930'},f.alice.token)).status,403);
 assert.equal((await f.req('/admin/people/access',{documentDepartmentIds:['rh'],inviteDepartmentIds:['rh']},f.token)).status,200);const directory=(await f.req('/people/directory',undefined,f.alice.token)).body;assert.equal(directory.find(u=>u.id===b.id).phone,undefined);assert.equal(directory.find(u=>u.id===b.id).email,undefined);
 const file=(await f.req('/people/'+b.id+'/files',{name:'registro.txt',mime:'text/plain',data:Buffer.from('Documento privado sintético').toString('base64'),folderId:'cadastro'},f.alice.token)).body;assert.equal((await f.req('/people/'+b.id+'/files/'+file.id,undefined,f.bob.token)).status,200);assert.equal((await f.req('/people/'+a.id+'/files/'+file.id,undefined,f.alice.token)).status,404);
 const exported=await f.req('/people/'+b.id+'/files/export',{folderId:'cadastro'},f.alice.token);assert.equal(exported.status,200);assert.equal(Object.keys(unzipSync(Buffer.from(exported.body.data,'base64'))).length,1);
 const outsider='5568999999990@s.whatsapp.net';await f.message(outsider,'oi',pdf,{},rh.id);const thread=(await f.req('/whatsapp/inbox?channelId='+rh.id,undefined,f.alice.token)).body.threads[0],message=(await f.req('/whatsapp/inbox/'+thread.id+'/messages',undefined,f.alice.token)).body.messages.find(v=>v.file);assert.equal((await f.req('/whatsapp/files/'+message.file.id+'/archive',{employeeId:b.id,folderId:'atestados'},f.alice.token)).status,200);assert.equal((await f.store.list('document',f.cid))[0].owner,b.id);
 const cfg=(await f.req('/admin/whatsapp/menus?channelId='+rh.id,undefined,f.token)).body;assert.ok(cfg.targets.some(c=>c.id===dp.id&&c.phone==='5568999999971'));assert.match(await f.message('5568999999980@s.whatsapp.net','MENU',null,{},rh.id),/Falar com DP/);
 await f.req('/admin/people/access',{documentDepartmentIds:[],inviteDepartmentIds:[]},f.token);assert.equal((await f.req('/people/'+b.id+'/files',undefined,f.alice.token)).status,404);assert.equal((await f.req('/people/'+b.id+'/files/export',{},f.alice.token)).status,404);
 await f.req('/admin/whatsapp/channels/'+rh.id,{teamIds:[],accessDepartmentIds:[]},f.token,'PATCH');assert.equal((await f.req('/whatsapp/inbox/'+thread.id+'/messages',undefined,f.alice.token)).status,403);
});
test('extração limitada de TXT, DOCX e PDF lê conteúdo sem executar instruções',async()=>{
 const txt=await extractKnowledge({name:'manual.txt',mime:'text/plain',data:Buffer.from('Regra de atendimento: responda com respeito.').toString('base64')});assert.match(txt.text,/respeito/);
 const doc=zipSync({'word/document.xml':strToU8('<w:document><w:p><w:t>Manual de boas-vindas &amp; regras da equipe.</w:t></w:p></w:document>')});assert.match((await extractKnowledge({name:'manual.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',data:Buffer.from(doc).toString('base64')})).text,/boas-vindas & regras/);
 const stream='BT /F1 16 Tf 50 700 Td (Welcome to the company manual.) Tj ET',objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];let text='%PDF-1.4\n',offsets=[0];for(const [i,obj]of objects.entries()){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${obj}\nendobj\n`;}const offset=Buffer.byteLength(text);text+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
 assert.match((await extractKnowledge({name:'manual.pdf',mime:'application/pdf',data:Buffer.from(text).toString('base64')})).text,/company manual/);
 await assert.rejects(()=>extractKnowledge({name:'fake.pdf',mime:'application/pdf',data:Buffer.from('not a PDF').toString('base64')}),/conteúdo/);await assert.rejects(()=>extractKnowledge({name:'vazio.txt',mime:'text/plain',data:Buffer.from('abc').toString('base64')}),/texto suficiente/);
 assert.doesNotMatch(redactKnowledge('bruno oliveira 529.982.247-25 contato@exemplo.com',['Bruno Oliveira']),/bruno oliveira|529\.982|contato@/);
});
test('cobrança de documentos usa número autorizado, exige consentimento e não duplica envios concorrentes',async t=>{
 const f=await fixture(t),id=f.alice.user.id,jid=f.alice.user.phone+'@s.whatsapp.net',path='/people/'+id+'/document-requests';
 assert.equal((await f.req(path,{requiredDocuments:['rg'],channelId:f.cid},f.token)).status,200);
 const replies=await Promise.all([f.req(path+'/remind',{},f.token),f.req(path+'/remind',{},f.token)]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,429]);assert.equal(f.sent.length,1);assert.equal(f.sent[0].jid,jid);assert.match(f.sent[0].text,/RG/);
 assert.match(await f.message(jid,'RH'),/pessoa/);assert.equal(await f.message(jid,'1'),null);await f.message(jid,'MENU');assert.match(await f.message(jid,'DOCUMENTOS'),/RG/);
 const other=await f.company('second@bot.example');assert.equal((await f.req(path+'/remind',{},other.token)).status,400);assert.equal((await f.req('/people/enrollment',{phone:'5568999999918',channelId:f.cid},other.token)).status,403);
});
