import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {WhatsAppGateway,acceptInboxEvent} from '../server/whatsapp.js';
import {checkedBadgeDesign} from '../server/badge-design.js';
import {voiceToOpus} from '../server/voice.js';
const secret='oluni-v3-tests-at-least-32-characters';
async function fixture(t,{platform=false}={}){
 const store=new MemoryStore(),sent=[],calls=[],states=new Map(),gateway={status:async k=>({status:states.get(k)||'connected'}),connect:async k=>states.set(k,'qr_pending'),disconnect:async k=>states.set(k,'disconnected'),sendText:async(k,jid,text,options)=>{sent.push({k,jid,text,options});return {key:{id:'sent-'+sent.length,remoteJid:jid,fromMe:true}};},sendMedia:async(k,jid,file,text,options)=>{sent.push({k,jid,file,text,options});return {key:{id:'sent-'+sent.length,remoteJid:jid,fromMe:true}};},groups:async()=>[{jid:'120123456789@g.us',name:'Equipe'}],read:async()=>{},editMessage:async(...x)=>calls.push(['edit',...x]),deleteMessage:async(...x)=>calls.push(['delete',...x]),react:async(...x)=>calls.push(['react',...x])};
 const ai=async(s)=>{assert.equal(s.apiKey,'platform-secret-never-serialize');return 'Resposta de exemplo';};
 const app=createApp({store,secret,gateway,ai,whatsappAI:ai,platformEnv:platform?{OLUNI_AI_API_KEY:'platform-secret-never-serialize'}:{}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const request=async(path,body,token='',method)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const register=async(email,phone,invite)=>{const r=await request('/auth/register',{mode:invite?'employee':'company',invite,document:'11222333000181',companyName:'Empresa Exemplo',name:'Pessoa '+email.split('@')[0],email,phone,password:'abc123',birthDate:'2000-01-01',jobTitle:'Analista',department:'Geral'});assert.equal(r.status,201);return r.body;};
 const admin=await register('admin@example.com','5568999999900'),access=(await request('/admin/access',undefined,admin.token)).body,employee=await register('employee@example.com','5568999999901',access.invite),other=await register('other@example.com','59170000001',access.invite);
 return {app,store,gateway,sent,calls,states,request,register,admin,employee,other};
}
test('telefone cadastrado reconhece o colaborador sem OTP; ambiguidades não escolhem uma conta',async t=>{
 const f=await fixture(t),u=f.employee.user,jid=u.phone+'@s.whatsapp.net';assert.equal((await f.store.get('user',u.id)).phoneVerified,undefined);
 assert.match(await f.gateway.onMessage(u.companyId,jid,'MENU'),/Meu ponto/);assert.equal(f.sent.length,0);
 const other=await f.store.get('user',f.other.user.id);other.phone=u.phone;await f.store.put('user',u.companyId,other,other.id);
 assert.equal(await f.app.locals.channels.member(u.companyId,jid),null);
 const linked=await f.store.get('user',u.id);linked.whatsappJid=jid;await f.store.put('user',u.companyId,linked,linked.id);assert.equal((await f.app.locals.channels.member(u.companyId,jid)).id,u.id);
});
test('setores isolam conexões, equipes, histórico, arquivos e identificação de colaborador',async t=>{
 const f=await fixture(t),cid=f.admin.user.companyId;await f.store.put('department',cid,{name:'Financeiro',active:true},'dep-fin');await f.store.put('department',cid,{name:'RH',active:true},'dep-rh');
 const u=await f.store.get('user',f.employee.user.id);u.departmentId='dep-fin';await f.store.put('user',cid,u,u.id);
 const a=(await f.request('/admin/whatsapp/channels',{name:'Financeiro',departmentId:'dep-fin'},f.admin.token)).body,b=(await f.request('/admin/whatsapp/channels',{name:'RH',departmentId:'dep-rh'},f.admin.token)).body;
 assert.equal((await f.request('/admin/whatsapp/channels/'+a.id,{teamIds:[u.id],signaturePosition:'bottom'},f.admin.token,'PATCH')).status,200);
 assert.equal((await f.request('/whatsapp/channels',undefined,f.employee.token)).body.channels.length,1);
 assert.equal((await f.request('/whatsapp/inbox?channelId='+b.id,undefined,f.employee.token)).status,403);
 assert.equal(await f.app.locals.channels.connectionFor(u),a.id);assert.equal(await f.app.locals.channels.member(cid,u.phone+'@s.whatsapp.net',b.id),null);
 await f.gateway.onMessage(a.id,'5568999999920@s.whatsapp.net','Olá',null,{id:'a-one'});await f.gateway.onMessage(b.id,'5568999999920@s.whatsapp.net','Olá',null,{id:'b-one'});
 const ta=(await f.request('/whatsapp/inbox?channelId='+a.id,undefined,f.employee.token)).body.threads[0],tb=(await f.request('/whatsapp/inbox?channelId='+b.id,undefined,f.admin.token)).body.threads[0];assert.notEqual(ta.id,tb.id);
 assert.equal((await f.request('/whatsapp/inbox/'+tb.id+'/messages',undefined,f.employee.token)).status,403);
 assert.equal((await f.request('/admin/whatsapp/channels/'+a.id,{teamIds:[]},f.admin.token,'PATCH')).status,200);assert.equal((await f.request('/whatsapp/channels',undefined,f.employee.token)).body.channels.length,0);
});
test('atendimento cita, edita, reage, encaminha, apaga e atende grupos sem bot',async t=>{
 const f=await fixture(t),cid=f.admin.user.companyId,token=f.admin.token,jid='5568999999922@s.whatsapp.net';await f.gateway.onMessage(cid,jid,'Mensagem inicial',null,{id:'provider-1',providerKey:{id:'provider-1',remoteJid:jid,fromMe:false}});
 let inbox=(await f.request('/whatsapp/inbox',undefined,token)).body;const thread=inbox.threads[0];await f.request('/whatsapp/inbox/'+thread.id,{action:'claim'},token,'PATCH');const incoming=(await f.request('/whatsapp/inbox/'+thread.id+'/messages',undefined,token)).body.messages.find(m=>m.direction==='in');
 const sent=await f.request('/whatsapp/inbox/'+thread.id+'/messages',{text:'Olá!',replyTo:incoming.id,requestId:'outgoing-request-0001'},token);assert.equal(sent.status,200);assert.equal(f.sent.at(-1).options.quoted.key.id,'provider-1');assert.equal(sent.body.reply.id,incoming.id);
 const action='/whatsapp/inbox/'+thread.id+'/messages/'+sent.body.id+'/action';assert.equal((await f.request(action,{action:'edit',text:'Olá, tudo bem?'},token)).status,200);assert.equal((await f.request(action,{action:'react',emoji:'👍'},token)).status,200);
 const group=(await f.request('/whatsapp/inbox',{channelId:cid,groupJid:'120123456789@g.us'},token)).body;assert.equal(group.isGroup,true);assert.equal(await f.gateway.onMessage(cid,'120123456789@g.us','oi',null,{id:'group-1',participantName:'Pessoa'}),null);
 assert.equal((await f.request(action,{action:'forward',targetId:group.id,requestId:'forward-request-0001'},token)).status,200);assert.equal(f.sent.at(-1).options.forwarded,true);
 await f.gateway.onMutation(cid,{id:'provider-1',remoteJid:jid},{message:{editedMessage:{message:{conversation:'Texto alterado no telefone'}}}});const editedIncoming=(await f.request('/whatsapp/inbox/'+thread.id+'/messages',undefined,token)).body.messages.find(m=>m.id===incoming.id);assert.equal(editedIncoming.text,'Texto alterado no telefone');
 assert.equal((await f.request(action,{action:'delete'},token)).status,200);assert.ok(f.calls.some(c=>c[0]==='edit'));assert.ok(f.calls.some(c=>c[0]==='delete'));assert.ok(f.calls.some(c=>c[0]==='react'));
 const deleted=(await f.request('/whatsapp/inbox/'+thread.id+'/messages',undefined,token)).body.messages.find(m=>m.id===sent.body.id);assert.ok(deleted.deletedAt);assert.equal(deleted.text,'');
});
test('Flora e bot herdam chave central, sem retornar ou copiar segredo ao banco',async t=>{
 const f=await fixture(t,{platform:true}),token=f.admin.token,cid=f.admin.user.companyId;
 for(const path of ['/bootstrap','/platform/ai','/admin/settings','/admin/whatsapp/ai']){const r=await f.request(path,undefined,token);assert.equal(r.status,200);assert.ok(!JSON.stringify(r.body).includes('platform-secret'));}
 assert.equal((await f.request('/admin/settings',undefined,token)).body.source,'platform');
 assert.equal((await f.request('/admin/settings',{provider:'gemini',model:'gemini-2.5-flash',enabled:true},token)).status,200);
 let s=(await f.request('/admin/whatsapp/ai',undefined,token)).body;assert.equal(s.source,'platform');assert.equal((await f.request('/admin/whatsapp/ai',s,token)).status,200);assert.equal((await f.request('/admin/whatsapp/ai',undefined,token)).body.source,'platform');
 for(const kind of ['settings','wa-ai-settings'])for(const row of await f.store.list(kind,cid))assert.equal(row.apiKey,undefined);
 assert.equal((await f.request('/admin/settings/test',{},token)).body.reply,'Resposta de exemplo');
});
test('onboarding exige conexão ou decisão explícita de conectar depois e oferece QR de instalação',async t=>{
 const f=await fixture(t);f.states.set(f.admin.user.companyId,'disconnected');assert.equal((await f.request('/bootstrap',undefined,f.admin.token)).body.onboardingRequired,true);
 assert.equal((await f.request('/onboarding',{step:'install'},f.admin.token)).status,409);assert.equal((await f.request('/onboarding',{step:'install',skipConnection:true},f.admin.token)).status,200);
 assert.equal((await f.request('/onboarding',{step:'done',skipConnection:true},f.admin.token)).status,200);assert.equal((await f.request('/bootstrap',undefined,f.admin.token)).body.onboardingRequired,false);
 assert.equal((await f.request('/onboarding',{step:'whatsapp'},f.employee.token)).status,400);assert.equal((await f.request('/onboarding',{step:'done'},f.employee.token)).status,200);
 const app=(await f.request('/public/app')).body;assert.match(app.qrImage,/^data:image\/png;base64,/);assert.match(app.installUrl,/instalar=1/);assert.equal(app.version,'3.3.0');
});
test('pastas pessoais permitem documentos e movimentação, mantendo isolamento por funcionário e empresa',async t=>{
 const f=await fixture(t),id=f.employee.user.id,p='/people/'+id,token=f.employee.token;
 const folder=(await f.request(p+'/folders',{name:'Contratos'},token)).body;
 const upload=await f.request(p+'/files',{name:'exemplo.txt',mime:'text/plain',data:Buffer.from('Um contrato de exemplo').toString('base64'),folderId:folder.id},token);assert.equal(upload.status,201);
 assert.equal((await f.request(p+'/files/'+upload.body.id,undefined,f.other.token)).status,404);assert.equal((await f.request(p+'/files/'+upload.body.id,undefined,f.admin.token)).status,200);
 assert.equal((await f.request(p+'/files/'+upload.body.id,{folderId:null},token,'PATCH')).body.folderId,null);
 const outsider=await f.register('outsider@example.com','5568999999944');assert.equal((await f.request(p+'/files',undefined,outsider.token)).status,404);
 assert.equal((await f.request(p+'/files',{name:'bad.pdf',mime:'application/pdf',data:Buffer.from('not pdf').toString('base64')},token)).status,400);
});
test('post-its pessoais e de setor têm permissões e impedem sobrescrever edição concorrente',async t=>{
 const f=await fixture(t),token=f.employee.token;const list=(await f.request('/boards',undefined,token)).body,own=list[0];assert.equal(own.scope,'personal');
 const note=(await f.request('/boards/'+own.id+'/notes',{text:'Uma ideia',x:20,y:40,color:'pink'},token)).body;assert.equal((await f.request('/boards/'+own.id,undefined,f.other.token)).status,404);
 assert.equal((await f.request('/boards/'+own.id+'/notes/'+note.id,{text:'Editada',version:1},token,'PATCH')).status,200);assert.equal((await f.request('/boards/'+own.id+'/notes/'+note.id,{text:'Antiga',version:1},token,'PATCH')).status,409);
 assert.equal((await f.request('/boards',{name:'Empresa',scope:'company'},token)).status,403);
 const shared=(await f.request('/boards',{name:'Equipe',scope:'company'},f.admin.token)).body;assert.equal((await f.request('/boards/'+shared.id,undefined,f.other.token)).status,200);
 await f.store.put('department',f.admin.user.companyId,{name:'RH',active:true},'dept-1');const sector=(await f.request('/boards',{name:'Notas RH',scope:'department',departmentId:'dept-1'},f.admin.token)).body;assert.equal((await f.request('/boards/'+sector.id,undefined,f.other.token)).status,404);
});
test('crachá valida fonte, dimensões e encaixe na folha personalizada',()=>{
 const d=checkedBadgeDesign({fontFamily:'Georgia',layout:'horizontal',badgeWidthMm:86,badgeHeightMm:54,paper:'letter',gapMm:4,marginMm:12});assert.equal(d.badgeWidthMm,86);assert.equal(d.fontFamily,'Georgia');
 assert.throws(()=>checkedBadgeDesign({fontFamily:'url(evil)'}),/válidos/);assert.throws(()=>checkedBadgeDesign({paper:'custom',paperWidthMm:100,paperHeightMm:100,marginMm:30,badgeWidthMm:80}),/não cabe/);
});
test('gateway envia áudio Opus, citações e grupos preservando marcadores de entrega por conexão',async()=>{
 const store=new MemoryStore(),gateway=new WhatsAppGateway(store,secret),sent=[];const sock={sendMessage:async(jid,body,options)=>{sent.push({jid,body,options});return {key:{id:'p-'+sent.length}};},readMessages:async()=>{},groupFetchAllParticipating:async()=>({'120123456789@g.us':{id:'120123456789@g.us',subject:'Equipe',participants:[]}})};gateway.sessions.set('c',{status:'connected',sock});
 const key={id:'x',remoteJid:'120123456789@g.us',fromMe:false};await gateway.sendText('c',key.remoteJid,'Citada',{quoted:{key,message:{conversation:'Teste'}}});await gateway.editMessage('c',key.remoteJid,{...key,fromMe:true},'Editada');assert.equal(sent[0].options.quoted.key.id,'x');assert.equal(sent[1].body.edit.fromMe,true);assert.equal((await gateway.groups('c'))[0].name,'Equipe');
 assert.equal(acceptInboxEvent({key:{id:'g',remoteJid:key.remoteJid},message:{conversation:'oi'},messageTimestamp:Math.floor(Date.now()/1000)},'notify','2020-01-01'),true);
 const samples=8000,pcm=Buffer.alloc(samples*2),header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(8000,24);header.writeUInt32LE(16000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);const opus=await voiceToOpus(Buffer.concat([header,pcm]));assert.equal(opus.subarray(0,4).toString(),'OggS');
 await gateway.sendMedia('c',key.remoteJid,{mime:'audio/ogg',buffer:opus,voice:true,name:'voz.ogg'});assert.equal(sent.at(-1).body.ptt,true);assert.match(sent.at(-1).body.mimetype,/opus/);
});
