import {randomUUID} from 'node:crypto';
import {fail,lookup,text,limiter,digest,publicUser} from './security.js';
import {serial} from './attendance.js';
import {installWhatsAppIntake} from './whatsapp-intake.js';
import {installWellbeing} from './whatsapp-wellbeing.js';
export const canAttend=u=>!!u?.active&&(u.role==='admin'||u.whatsappAgent===true);
export const mediaTypes=['application/pdf','image/jpeg','image/png','image/webp','audio/ogg','audio/mpeg','audio/mp4','video/mp4'];
export function checkedAttachment(a){
 const mime=String(a.mime||'').split(';')[0].trim().toLowerCase(),buffer=a.buffer||Buffer.from(a.data||'','base64');
 const head=buffer.subarray(0,12),valid=mime==='application/pdf'?head.toString().startsWith('%PDF-'):mime==='image/jpeg'?head[0]===255&&head[1]===216&&head[2]===255:mime==='image/png'?head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/webp'?head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP':mime==='audio/ogg'?head.toString('ascii',0,4)==='OggS':mime==='audio/mpeg'?head.toString('ascii',0,3)==='ID3'||(head[0]===255&&(head[1]&224)===224):['audio/mp4','video/mp4'].includes(mime)?head.toString('ascii',4,8)==='ftyp':false;
 if(!mediaTypes.includes(mime)||!buffer.length||buffer.length>5*1024*1024||!valid)throw fail(400,'Envie PDF, imagem, áudio ou MP4 válido de até 5 MB.');
 return {mime,buffer,name:text(String(a.name||'arquivo').replace(/[\x00-\x1f/\\]/g,'_'),1,150)};
}
export function installWhatsAppInbox({route,store,secret,admin,gateway,configFor,wellbeingAI,saveDocument}){
 const staff=(req,res,next)=>canAttend(req.user)?next():res.status(403).json({error:'Acesso restrito à equipe de atendimento.'});
 const tid=(cid,jid)=>lookup(secret,'wa-thread',cid,jid),threadFor=(cid,jid)=>store.get('wa-thread',tid(cid,jid),cid);
 const intake=installWhatsAppIntake({route,store,secret,admin,saveDocument});
 const wellbeing=installWellbeing({route,store,secret,admin,gateway,configFor,ai:wellbeingAI,threadFor});
 const findUser=async(cid,jid)=>(await store.list('user',cid)).find(u=>u.whatsappJid===jid);
 const agents=async cid=>(await store.list('user',cid)).filter(canAttend).map(u=>({id:u.id,name:u.name,role:u.role}));
 const threadSafe=t=>({id:t.id,name:t.name,phone:t.phone,status:t.status,assignedTo:t.assignedTo||null,botPaused:!!t.botPaused,updatedAt:t.updatedAt,lastMessage:t.lastMessage||'',unread:t.unread||0});
 const owned=async(id,u)=>{const t=await store.get('wa-thread',id,u.companyId);if(!t)throw fail(404,'Conversa não encontrada.');return t;};
 const ensure=async(cid,jid,meta={})=>{
  if(!/^\d{6,20}@(s\.whatsapp\.net|lid)$/.test(jid))throw fail(400,'Número do contato inválido.');
  const id=tid(cid,jid),old=await store.get('wa-thread',id,cid);if(old)return old;
  const u=await findUser(cid,jid);return store.put('wa-thread',cid,{jid,phone:jid.split('@')[0],name:(u?.name||String(meta.name||'').trim()||jid.split('@')[0]).slice(0,100),transportJid:meta.transportJid||jid,status:'waiting',botPaused:false,assignedTo:null,unread:0,updatedAt:new Date().toISOString()},id);
 };
 const addFile=async(cid,threadId,attachment)=>{
  const a=checkedAttachment(attachment),id='wa-file:'+randomUUID(),chunks=[];
  try{for(let n=0;n<a.buffer.length;n+=180000){const r=await store.put('wa-file-chunk',cid,{owner:threadId,fileId:id,data:a.buffer.subarray(n,n+180000).toString('base64')});chunks.push(r.id);}await store.put('wa-file',cid,{owner:threadId,name:a.name,mime:a.mime,size:a.buffer.length,chunks},id);}
  catch(e){for(const part of chunks)await store.remove('wa-file-chunk',part,cid);throw e;}
  return {id,name:a.name,mime:a.mime,size:a.buffer.length};
 };
 const readFile=async(file,cid)=>{const parts=[];for(const id of file.chunks){const part=await store.get('wa-file-chunk',id,cid);if(!part)throw fail(404,'Arquivo indisponível.');parts.push(Buffer.from(part.data,'base64'));}return Buffer.concat(parts);};
 const add=async(cid,t,value,id)=>{
  const msg=await store.put('wa-message',cid,{owner:t.id,at:new Date().toISOString(),...value},id);
  t.updatedAt=msg.at;t.lastMessage=(msg.text||msg.file?.name||'Arquivo recebido').slice(0,150);if(value.direction==='in'){t.unread=(t.unread||0)+1;if(t.status==='closed'){t.status='waiting';t.assignedTo=null;t.botPaused=false;}}
  await store.put('wa-thread',cid,t,t.id);return msg;
 };
 route('get','/whatsapp/inbox',staff,async(req,res)=>{
  const list=await store.list('wa-thread',req.user.companyId,{limit:2000});res.json({threads:list.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(threadSafe),agents:await agents(req.user.companyId),userId:req.user.id});
 });
 route('post','/whatsapp/inbox',staff,async(req,res)=>{
  const phone=String(req.body.phone||'').replace(/\D/g,'');if(!/^\d{8,15}$/.test(phone))throw fail(400,'Informe o telefone com DDI, somente números.');
  const t=await ensure(req.user.companyId,phone+'@s.whatsapp.net');if(req.body.name){t.name=text(req.body.name,2,100);await store.put('wa-thread',req.user.companyId,t,t.id);}res.json(threadSafe(t));
 });
 route('get','/whatsapp/inbox/:id/messages',staff,async(req,res)=>{
  const cid=req.user.companyId,t=await owned(req.params.id,req.user),all=(await store.list('wa-message',cid,{owner:t.id,limit:10000})).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  let before=null;if(req.query.before)try{before=JSON.parse(Buffer.from(String(req.query.before),'base64url').toString());if(typeof before.at!=='string'||typeof before.id!=='string')throw Error();}catch{throw fail(400,'Página de histórico inválida.');}
  const list=all.filter(m=>!before||m.at<before.at||(m.at===before.at&&m.id<before.id)),messages=list.slice(-200),first=messages[0];
  res.json({thread:threadSafe(t),messages,hasMore:list.length>200,before:first?Buffer.from(JSON.stringify({at:first.at,id:first.id})).toString('base64url'):null});
 });
 route('post','/whatsapp/inbox/:id/read',staff,async(req,res)=>serial('inbox:'+req.params.id,async()=>{const t=await owned(req.params.id,req.user);t.unread=0;await store.put('wa-thread',req.user.companyId,t,t.id);res.json({ok:true});}));
 route('patch','/whatsapp/inbox/:id',staff,async(req,res)=>serial('inbox:'+req.params.id,async()=>{
  const cid=req.user.companyId,t=await owned(req.params.id,req.user),b=req.body;
  if(t.assignedTo&&t.assignedTo!==req.user.id&&req.user.role!=='admin')throw fail(409,'Esta conversa já está com outro atendente. Peça uma transferência ao RH.');
  if(!['claim','release','close','transfer'].includes(b.action))throw fail(400,'Escolha uma ação da conversa.');
  if(b.action==='claim'){t.assignedTo=req.user.id;t.status='active';t.botPaused=true;}
  if(b.action==='transfer'){if(!(await agents(cid)).some(u=>u.id===b.assignedTo))throw fail(400,'Escolha um atendente ativo.');t.assignedTo=b.assignedTo;t.status='active';t.botPaused=true;}
  if(b.action==='release'){t.assignedTo=null;t.status='waiting';t.botPaused=false;}
  if(b.action==='close'){t.assignedTo=null;t.status='closed';t.botPaused=false;}
  const u=await findUser(cid,t.jid);if(u)await wellbeing.stop(cid,u.id);
  t.updatedAt=new Date().toISOString();await store.put('wa-thread',cid,t,t.id);res.json(threadSafe(t));
 }));
 route('post','/whatsapp/inbox/:id/messages',staff,limiter(30,60000),async(req,res)=>serial('inbox:'+req.params.id,async()=>{
  const cid=req.user.companyId,t=await owned(req.params.id,req.user),b=req.body;
  if(t.assignedTo!==req.user.id)throw fail(409,'Assuma a conversa antes de responder.');
  const requestId=text(b.requestId,16,100);if(!/^[\w-]+$/.test(requestId))throw fail(400,'Identificador de envio inválido.');
  const content=text(b.text||'',0,4000);if(!content&&!b.file)throw fail(400,'Escreva uma mensagem ou escolha um arquivo.');
  const hash=digest(JSON.stringify({text:content,file:b.file||null})),id=lookup(secret,'wa-outgoing',cid,t.id,requestId),old=await store.get('wa-message',id,cid);
  if(old){if(old.contentHash!==hash)throw fail(409,'Use um identificador novo para outra mensagem.');if(old.status==='sent')return res.json(old);throw fail(409,'Envio já tentado. Confira a conversa antes de tentar novamente.');}
  if(!gateway||(await gateway.status(cid)).status!=='connected')throw fail(409,'Conecte o WhatsApp da empresa antes de enviar.');
  let checked,file;if(b.file){checked=checkedAttachment(b.file);file=await addFile(cid,t.id,checked);}
  const u=await findUser(cid,t.jid);if(u)await wellbeing.stop(cid,u.id);
  const msg=await add(cid,t,{direction:'out',text:content,agentId:req.user.id,agentName:req.user.name,file:file||null,status:'sending',contentHash:hash},id);
  try{const sent=checked?await gateway.sendMedia(cid,t.transportJid||t.jid,checked,`*${req.user.name}*${content?'\n'+content:''}`):await gateway.sendText(cid,t.transportJid||t.jid,`*${req.user.name}*\n${content}`);msg.providerId=sent?.key?.id||null;msg.status='sent';}
  catch{msg.status='uncertain';}
  await store.put('wa-message',cid,msg,id);res.status(msg.status==='sent'?200:502).json(msg.status==='sent'?msg:{error:'Não foi possível confirmar a entrega. Confira o WhatsApp antes de reenviar.'});
 }));
 route('get','/whatsapp/files/:id',staff,async(req,res)=>{
  const cid=req.user.companyId,f=await store.get('wa-file',req.params.id,cid);if(!f)throw fail(404,'Arquivo não encontrado.');await owned(f.owner,req.user);res.json({mime:f.mime,name:f.name,data:(await readFile(f,cid)).toString('base64')});
 });
 route('get','/admin/whatsapp/agents',admin,async(req,res)=>res.json((await store.list('user',req.user.companyId)).filter(u=>u.active).map(u=>({id:u.id,name:u.name,role:u.role,whatsappAgent:!!u.whatsappAgent,employeeCode:u.employeeCode}))));
 route('patch','/admin/whatsapp/agents/:id',admin,async(req,res)=>{
  const cid=req.user.companyId,u=await store.get('user',req.params.id,cid);if(!u||!u.active||u.role==='admin')throw fail(404,'Colaborador ativo não encontrado.');u.whatsappAgent=req.body.whatsappAgent===true;await store.put('user',cid,u,u.id);res.json(publicUser(u));
 });
 const receive=async(cid,jid,message,attachment,meta={},legacy)=>{
  const company=await store.get('company',cid,cid);if(!company)return null;
  const u=await findUser(cid,jid),command=message.trim().toUpperCase(),t=await threadFor(cid,jid);
  const doc=await intake.document(cid,jid,message,attachment);if(doc.handled){if(u)await wellbeing.stop(cid,u.id);return doc.reply;}
  // Honor opt-outs even when a human has assumed the general service thread.
  if(['PARAR BEM-ESTAR','PARAR BEM ESTAR'].includes(command))return (await wellbeing.receive(u,message,attachment)).reply;
  if(!(t?.botPaused&&t.status!=='closed')){const result=await wellbeing.receive(u,message,attachment);if(result.handled)return result.reply;if(result.private)return legacy(cid,jid,message,attachment);}
  // Employee documents and numeric mood reports never enter the shared inbox.
  if(/^HUMOR\s+[1-5]$/.test(command))return legacy(cid,jid,message,attachment);
  if(attachment&&u?.active&&!t?.botPaused&&['application/pdf','image/jpeg','image/png'].includes(attachment.mime))return 'Para enviar atestado à sua pasta, envie ATESTADO e confirme seu nome completo ou código antes do arquivo. Não informe sua senha.';
  if(/^VINCULAR\s+/i.test(message))return legacy(cid,jid,message,attachment);
  if(['PARAR','SAIR','STOP'].includes(command)){if(u)await wellbeing.stop(cid,u.id);return u?.active?legacy(cid,jid,message,attachment):intake.guestStop(cid,jid);}
  let current=await ensure(cid,jid,meta),duplicate=false;
  await serial('inbox:'+current.id,async()=>{
   current=await threadFor(cid,jid);const id=meta.id?lookup(secret,'wa-incoming',cid,jid,meta.id):undefined;
   if(id&&await store.get('wa-message',id,cid)){duplicate=true;return;}
   let file=null;if(attachment)try{file=await addFile(cid,current.id,attachment);}catch{message=message||'Arquivo recebido em formato não suportado. Solicite outro arquivo ao contato.';}
   if(meta.transportJid)current.transportJid=meta.transportJid;
   await add(cid,current,{direction:'in',text:message,file,providerId:meta.id||null,status:'received'},id);
  });
  if(duplicate||current.botPaused)return null;
  const response=u?.active?await legacy(cid,jid,message.slice(0,4000),attachment):await intake.guestReply(cid,company,command,jid);const fresh=await threadFor(cid,jid);if(!response||fresh?.botPaused)return null;
  await serial('inbox:'+fresh.id,async()=>{const latest=await threadFor(cid,jid);if(!latest.botPaused)await add(cid,latest,{direction:'bot',text:response,status:'prepared'});});
  return (await threadFor(cid,jid))?.botPaused?null:response;
 };
 const own=async(cid,jid,message,attachment,meta={})=>{
  const u=await findUser(cid,jid);if(u&&await wellbeing.active(cid,u.id))return;
  const t=await ensure(cid,jid,meta);await serial('inbox:'+t.id,async()=>{
   const rows=await store.list('wa-message',cid,{owner:t.id,limit:500});if(meta.id&&rows.some(m=>m.providerId===meta.id))return;
   let f=null;if(attachment)try{f=await addFile(cid,t.id,attachment);}catch{}
   const latest=await threadFor(cid,jid);latest.botPaused=true;latest.status='active';
   await add(cid,latest,{direction:'out',text:message,file:f,providerId:meta.id||null,agentName:'WhatsApp da empresa',status:'sent'});
  });
 };
 const delivery=async(cid,jid,response,sent,error)=>{
  const t=await threadFor(cid,jid);if(!t)return;const rows=await store.list('wa-message',cid,{owner:t.id,limit:100});const m=rows.find(m=>m.direction==='bot'&&m.status==='prepared'&&m.text===response);if(m){m.status=error?'uncertain':'sent';m.providerId=sent?.key?.id||null;await store.put('wa-message',cid,m,m.id);}
 };
 return {receive,own,delivery,wellbeing,canSendReply:async(cid,jid)=>!(await threadFor(cid,jid))?.botPaused};
}
