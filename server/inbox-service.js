import {inboxUpdates} from './inbox-updates.js';
import {randomUUID} from 'node:crypto';
import {fail,lookup,text,limiter,digest,publicUser} from './security.js';
import {serial} from './attendance.js';
import {installWhatsAppIntake} from './whatsapp-intake.js';
import {installWellbeing} from './whatsapp-wellbeing.js';
import {canAttend,checkedAttachment} from './whatsapp-inbox.js';
export function installWhatsAppInbox({route,store,secret,admin,gateway,configFor,channels,wellbeingAI,saveDocument}){
 const updates=inboxUpdates(store);
 const staff=(req,res,next)=>canAttend(req.user)?next():res.status(403).json({error:'Acesso restrito à equipe de atendimento.'});
 const tid=(cid,jid,key=cid)=>lookup(secret,'wa-thread',cid,...(key===cid?[]:[key]),jid);
 const threadFor=(cid,jid,key=cid)=>store.get('wa-thread',tid(cid,jid,key),cid);
 const context=key=>channels.resolve(key);
 const access=async(u,key)=>{const c=await channels.owned(u.companyId,key||u.companyId);if(!channels.canAccess(u,c))throw fail(403,'Você não faz parte da equipe deste WhatsApp.');return c;};
 const agents=async(cid,key)=>{const c=key?await channels.owned(cid,key):null;return (await store.list('user',cid)).filter(u=>canAttend(u)&&(!c||channels.canAccess(u,c))).map(u=>({id:u.id,name:u.name,role:u.role}));};
 const findUser=(cid,jid,key=cid)=>channels.member(cid,jid,key);
 const intake=installWhatsAppIntake({route,store,secret,admin,saveDocument,channels});
 const wellbeing=installWellbeing({route,store,secret,admin,gateway,configFor,channels,ai:wellbeingAI,threadFor});
 const threadSafe=t=>({id:t.id,name:t.name,phone:t.phone,channelId:t.channelId||t.companyId,isGroup:!!t.isGroup,status:t.status,assignedTo:t.assignedTo||null,botPaused:!!t.botPaused,updatedAt:t.updatedAt,lastMessage:t.lastMessage||'',unread:t.unread||0,tags:t.tags||[],pinned:!!t.pinned});
 const owned=async(id,u)=>{const t=await store.get('wa-thread',id,u.companyId);if(!t)throw fail(404,'Conversa não encontrada.');await access(u,t.channelId||u.companyId);return t;};
 const ensure=async(cid,jid,meta={},key=cid)=>{
  if(!/^\d[\d-]{5,30}@(s\.whatsapp\.net|lid|g\.us)$/.test(jid))throw fail(400,'Número do contato inválido.');
  const id=tid(cid,jid,key),old=await store.get('wa-thread',id,cid);if(old)return old;
  const u=await findUser(cid,jid,key),isGroup=jid.endsWith('@g.us');
  return store.put('wa-thread',cid,{companyId:cid,channelId:key,jid,isGroup,phone:isGroup?'':jid.split('@')[0],name:(u?.name||String(meta.name||'').trim()||(isGroup?'Grupo':jid.split('@')[0])).slice(0,100),transportJid:meta.transportJid||jid,status:'waiting',botPaused:isGroup,assignedTo:null,unread:0,tags:[],updatedAt:new Date().toISOString()},id);
 };
 const addFile=async(cid,threadId,attachment)=>{
  const a=checkedAttachment(attachment),id='wa-file:'+randomUUID(),chunks=[];
  try{for(let n=0;n<a.buffer.length;n+=180000){const r=await store.put('wa-file-chunk',cid,{owner:threadId,fileId:id,data:a.buffer.subarray(n,n+180000).toString('base64')});chunks.push(r.id);}await store.put('wa-file',cid,{owner:threadId,name:a.name,mime:a.mime,size:a.buffer.length,voice:!!a.voice,sticker:!!a.sticker,chunks},id);}
  catch(e){for(const part of chunks)await store.remove('wa-file-chunk',part,cid);throw e;}
  return {id,name:a.name,mime:a.mime,size:a.buffer.length,voice:!!a.voice,sticker:!!a.sticker};
 };
 const readFile=async(file,cid)=>{const parts=[];for(const id of file.chunks){const part=await store.get('wa-file-chunk',id,cid);if(!part||part.fileId!==file.id||part.owner!==file.owner)throw fail(404,'Arquivo indisponível.');parts.push(Buffer.from(part.data,'base64'));}return Buffer.concat(parts);};
 const removeFile=async(f,cid)=>{const full=await store.get('wa-file',f.id,cid);if(!full)return;for(const id of full.chunks)await store.remove('wa-file-chunk',id,cid);await store.remove('wa-file',full.id,cid);};
 const add=async(cid,t,value,id)=>{
  const msg=await store.put('wa-message',cid,{owner:t.id,channelId:t.channelId||cid,at:new Date().toISOString(),...value},id);
  t.updatedAt=msg.at;t.lastMessage=(msg.text||msg.file?.name||'Arquivo recebido').slice(0,150);
  if(value.direction==='in'){t.unread=(t.unread||0)+1;if(t.status==='closed'){t.status='waiting';t.assignedTo=null;t.botPaused=!!t.isGroup;}}
  await store.put('wa-thread',cid,t,t.id);return msg;
 };
 const messageFor=async(cid,t,id)=>{const m=await store.get('wa-message',id,cid);if(!m||m.owner!==t.id)throw fail(404,'Mensagem não encontrada.');return m;};
 const signature=(name,body,c)=>c.signaturePosition==='none'?body:c.signaturePosition==='bottom'?body+'\n*'+name+'*':'*'+name+'*'+(body?'\n'+body:'');
 const sendTo=async(t,u,b)=>{
  const cid=u.companyId,key=t.channelId||cid,c=await access(u,key);
  if(t.assignedTo!==u.id)throw fail(409,'Assuma a conversa antes de responder.');
  const requestId=text(b.requestId,16,100);if(!/^[\w-]+$/.test(requestId))throw fail(400,'Identificador de envio inválido.');
  const content=text(b.text||'',0,4000);if(!content&&!b.file)throw fail(400,'Escreva uma mensagem ou escolha um arquivo.');
  const hash=digest(JSON.stringify({text:content,file:b.file||null,replyTo:b.replyTo||null,forwarded:!!b.forwarded})),id=lookup(secret,'wa-outgoing',cid,t.id,requestId),old=await store.get('wa-message',id,cid);
  if(old){if(old.contentHash!==hash)throw fail(409,'Use um identificador novo para outra mensagem.');if(['sent','delivered','read'].includes(old.status))return old;throw fail(409,'Envio já tentado. Confira a conversa antes de tentar novamente.');}
  if(!gateway||(await gateway.status(key)).status!=='connected')throw fail(409,'Conecte este WhatsApp antes de enviar.');
  let reply,quoted;if(b.replyTo){const source=await messageFor(cid,t,b.replyTo);if(!source.providerId||source.deletedAt)throw fail(400,'Esta mensagem não pode ser citada.');reply={id:source.id,text:(source.text||source.file?.name||'Arquivo').slice(0,180),author:source.agentName||t.name};quoted={key:source.providerKey||{id:source.providerId,remoteJid:t.transportJid||t.jid,fromMe:source.direction!=='in'},message:{conversation:source.text||source.file?.name||'Arquivo'}};}
  let checked,file;if(b.file){checked=checkedAttachment(b.file);file=await addFile(cid,t.id,checked);}
  const person=await findUser(cid,t.jid,key);if(person)await wellbeing.stop(cid,person.id,key);
  const msg=await add(cid,t,{direction:'out',text:content,agentId:u.id,agentName:u.name,file:file||null,reply:reply||null,forwarded:!!b.forwarded,status:'sending',clientRequestId:requestId,contentHash:hash},id);
  try{const options={quoted,forwarded:!!b.forwarded},body=signature(u.name,content,c),sent=checked?await gateway.sendMedia(key,t.transportJid||t.jid,checked,body,options):await gateway.sendText(key,t.transportJid||t.jid,body,options);msg.providerId=sent?.key?.id||null;msg.providerKey=sent?.key||null;msg.status='sent';}
  catch{msg.status='uncertain';}
  await store.put('wa-message',cid,msg,id);return msg;
 };
 route('get','/whatsapp/updates',staff,async(req,res)=>{
  const cid=req.user.companyId,key=String(req.query.channelId||cid);await access(req.user,key);
  const abort=new AbortController(),cancel=()=>abort.abort();res.on('close',cancel);
  try{const result=await updates.wait(cid,key,String(req.query.cursor||''),abort.signal);if(!result||res.destroyed)return;const fresh=await store.get('user',req.user.id,cid);if(!canAttend(fresh))throw fail(403,'Seu acesso ao atendimento foi alterado.');await access(fresh,key);res.json(result);}finally{res.off('close',cancel);}
 });
 route('get','/whatsapp/inbox',staff,async(req,res)=>{
  const key=req.query.channelId?String(req.query.channelId):null;if(key)await access(req.user,key);
  const [allowed,rows,team]=await Promise.all([channels.list(req.user),store.list('wa-thread',req.user.companyId,{limit:5000}),agents(req.user.companyId,key)]),ids=new Set(allowed.map(c=>c.id));
  const list=rows.filter(t=>ids.has(t.channelId||req.user.companyId)&&(!key||(t.channelId||req.user.companyId)===key));
  res.json({threads:list.sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||b.updatedAt.localeCompare(a.updatedAt)).map(t=>threadSafe({...t,channelId:t.channelId||req.user.companyId})),agents:team,channels:allowed,userId:req.user.id});
 });
 route('post','/whatsapp/inbox',staff,async(req,res)=>{
  const c=await access(req.user,req.body.channelId||req.user.companyId);let jid,name;
  if(req.body.groupJid){const g=(await gateway.groups(c.id)).find(g=>g.jid===req.body.groupJid);if(!g)throw fail(404,'Grupo não encontrado neste WhatsApp.');jid=g.jid;name=g.name;}
  else{const phone=String(req.body.phone||'').replace(/\D/g,'');if(!/^\d{8,15}$/.test(phone))throw fail(400,'Escolha o país e informe o número do contato.');jid=phone+'@s.whatsapp.net';name=req.body.name;}
  const t=await ensure(req.user.companyId,jid,{name},c.id);if(name){t.name=text(name,2,100);await store.put('wa-thread',req.user.companyId,t,t.id);}res.json(threadSafe(t));
 });
 route('get','/whatsapp/groups',staff,async(req,res)=>{const c=await access(req.user,String(req.query.channelId||req.user.companyId));res.json(await gateway.groups(c.id));});
 route('get','/whatsapp/inbox/:id/messages',staff,async(req,res)=>{
  const cid=req.user.companyId,t=await owned(req.params.id,req.user),[rows,team]=await Promise.all([updates.messageRows(cid,t.id),agents(cid,t.channelId||cid)]),all=rows.filter(m=>!m.hiddenFor?.includes(req.user.id)).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  let before=null;if(req.query.before)try{before=JSON.parse(Buffer.from(String(req.query.before),'base64url').toString());if(typeof before.at!=='string'||typeof before.id!=='string')throw Error();}catch{throw fail(400,'Página de histórico inválida.');}
  const list=all.filter(m=>!before||m.at<before.at||(m.at===before.at&&m.id<before.id)),messages=list.slice(-200),first=messages[0];
  res.json({thread:threadSafe(t),agents:team,messages,hasMore:list.length>200,before:first?Buffer.from(JSON.stringify({at:first.at,id:first.id})).toString('base64url'):null});
 });
 route('post','/whatsapp/inbox/:id/read',staff,async(req,res)=>serial('inbox:'+req.params.id,async()=>{const t=await owned(req.params.id,req.user);t.unread=0;await store.put('wa-thread',req.user.companyId,t,t.id);const rows=await store.list('wa-message',req.user.companyId,{owner:t.id,limit:100});try{await gateway?.read?.(t.channelId||req.user.companyId,rows.filter(m=>m.direction==='in'&&m.providerKey).map(m=>m.providerKey));}catch{}res.json({ok:true});}));
 route('patch','/whatsapp/inbox/:id',staff,async(req,res)=>serial('inbox:'+req.params.id,async()=>{
  const cid=req.user.companyId,t=await owned(req.params.id,req.user),b=req.body;
  if(t.assignedTo&&t.assignedTo!==req.user.id&&req.user.role!=='admin')throw fail(409,'Esta conversa já está com outro atendente. Peça uma transferência.');
  if(!['claim','release','close','transfer','details'].includes(b.action))throw fail(400,'Escolha uma ação da conversa.');
  if(b.action==='claim'){t.assignedTo=req.user.id;t.status='active';t.botPaused=true;}
  if(b.action==='transfer'){if(!(await agents(cid,t.channelId||cid)).some(u=>u.id===b.assignedTo))throw fail(400,'Escolha um atendente ativo desta equipe.');t.assignedTo=b.assignedTo;t.status='active';t.botPaused=true;}
  if(b.action==='release'){t.assignedTo=null;t.status='waiting';t.botPaused=!!t.isGroup;}
  if(b.action==='close'){t.assignedTo=null;t.status='closed';t.botPaused=!!t.isGroup;}
  if(b.action==='details'){if(b.name!==undefined)t.name=text(b.name,2,100);if(b.tags!==undefined){if(!Array.isArray(b.tags)||b.tags.length>12)throw fail(400,'Use até 12 etiquetas.');t.tags=[...new Set(b.tags.map(v=>text(v,1,30)))];}if(b.pinned!==undefined)t.pinned=b.pinned===true;}
  const u=await findUser(cid,t.jid,t.channelId||cid);if(u)await wellbeing.stop(cid,u.id,t.channelId||cid);
  t.updatedAt=new Date().toISOString();await store.put('wa-thread',cid,t,t.id);res.json(threadSafe(t));
 }));
 route('post','/whatsapp/inbox/:id/messages',staff,limiter(30,60000),async(req,res)=>serial('inbox:'+req.params.id,async()=>{
  const t=await owned(req.params.id,req.user),msg=await sendTo(t,req.user,req.body);res.status(msg.status==='uncertain'?502:200).json(msg.status==='uncertain'?{error:'Não foi possível confirmar a entrega. Confira o WhatsApp antes de reenviar.'}:msg);
 }));
 route('post','/whatsapp/inbox/:id/messages/:message/action',staff,limiter(60,60000),async(req,res)=>{
  const cid=req.user.companyId,t=await owned(req.params.id,req.user),m=await messageFor(cid,t,req.params.message),b=req.body,key=t.channelId||cid;
  if(b.action==='hide'){m.hiddenFor=[...new Set([...(m.hiddenFor||[]),req.user.id])];await store.put('wa-message',cid,m,m.id);return res.json({ok:true});}
  if(b.action==='forward'){
   const target=await owned(b.targetId,req.user);if(target.id===t.id||m.deletedAt)throw fail(400,'Escolha outra conversa para encaminhar.');
   return serial('inbox:'+target.id,async()=>{const fresh=await owned(target.id,req.user);if(!fresh.assignedTo){fresh.assignedTo=req.user.id;fresh.status='active';fresh.botPaused=true;await store.put('wa-thread',cid,fresh,fresh.id);}let file;if(m.file){const full=await store.get('wa-file',m.file.id,cid);if(!full)throw fail(404,'Arquivo indisponível.');file={name:full.name,mime:full.mime,data:(await readFile(full,cid)).toString('base64'),voice:!!full.voice,sticker:!!full.sticker};}const sent=await sendTo(fresh,req.user,{text:m.text||'',file,forwarded:true,requestId:b.requestId});res.status(sent.status==='uncertain'?502:200).json(sent.status==='uncertain'?{error:'Entrega não confirmada. Confira antes de reenviar.'}:sent);});
  }
  return serial('inbox:'+t.id,async()=>{
   const fresh=await owned(t.id,req.user);if(fresh.assignedTo!==req.user.id)throw fail(409,'Assuma a conversa primeiro.');const current=await messageFor(cid,fresh,m.id);if(!current.providerId||current.deletedAt)throw fail(400,'Esta mensagem não pode ser alterada.');
   const providerKey=current.providerKey||{id:current.providerId,remoteJid:fresh.transportJid||fresh.jid,fromMe:current.direction!=='in'};
   if(b.action==='react'){const emoji=String(b.emoji||'');if(emoji.length>12||/[a-zA-Z0-9]/.test(emoji))throw fail(400,'Escolha uma reação.');await gateway.react(key,fresh.transportJid||fresh.jid,providerKey,emoji);current.reactions=(current.reactions||[]).filter(r=>r.who!==req.user.id);if(emoji)current.reactions.push({who:req.user.id,emoji});}
   else{
    if(current.direction!=='out'||current.agentId!==req.user.id&&req.user.role!=='admin')throw fail(403,'Você só pode alterar mensagens enviadas pela sua equipe.');
    if(b.action==='edit'){if(current.file)throw fail(400,'Edite somente mensagens de texto.');const body=text(b.text,1,4000),channel=await channels.owned(cid,key);await gateway.editMessage(key,fresh.transportJid||fresh.jid,providerKey,signature(current.agentName||req.user.name,body,channel));current.text=body;current.editedAt=new Date().toISOString();}
    else if(b.action==='delete'){await gateway.deleteMessage(key,fresh.transportJid||fresh.jid,providerKey);if(current.file)await removeFile(current.file,cid);current.text='';current.file=null;current.deletedAt=new Date().toISOString();current.reply=null;}
    else throw fail(400,'Escolha uma ação da mensagem.');
   }
   await store.put('wa-message',cid,current,current.id);res.json(current);
  });
 });
 route('get','/whatsapp/files/:id',staff,async(req,res)=>{const cid=req.user.companyId,f=await store.get('wa-file',req.params.id,cid);if(!f)throw fail(404,'Arquivo não encontrado.');await owned(f.owner,req.user);res.json({mime:f.mime,name:f.name,data:(await readFile(f,cid)).toString('base64')});});
 route('get','/admin/whatsapp/agents',admin,async(req,res)=>res.json((await store.list('user',req.user.companyId)).filter(u=>u.active).map(u=>({id:u.id,name:u.name,departmentId:u.departmentId||null,department:u.department,role:u.role,whatsappAgent:!!u.whatsappAgent,employeeCode:u.employeeCode}))));
 route('patch','/admin/whatsapp/agents/:id',admin,async(req,res)=>{const cid=req.user.companyId,u=await store.get('user',req.params.id,cid);if(!u||!u.active||u.role==='admin')throw fail(404,'Colaborador ativo não encontrado.');u.whatsappAgent=req.body.whatsappAgent===true;await store.put('user',cid,u,u.id);res.json(publicUser(u));});
 const receive=async(key,jid,message,attachment,meta={},legacy)=>{
  const c=await context(key);if(!c)return null;const cid=c.companyId,company=await store.get('company',cid,cid);if(!company)return null;
  const group=jid.endsWith('@g.us'),u=group?null:await findUser(cid,jid,key),command=message.trim().toUpperCase(),t=await threadFor(cid,jid,key);
  if(!group){
   const doc=await intake.document(cid,jid,message,attachment,key);if(doc.handled){if(u)await wellbeing.stop(cid,u.id,key);return doc.reply;}
   if(['PARAR BEM-ESTAR','PARAR BEM ESTAR'].includes(command))return (await wellbeing.receive(u,message,attachment,key)).reply;
   if(!(t?.botPaused&&t.status!=='closed')){const result=await wellbeing.receive(u,message,attachment,key);if(result.handled)return result.reply;if(result.private)return legacy(cid,jid,message,attachment,{...meta,channelId:key});}
   if(/^HUMOR\s+[1-5]$/.test(command))return legacy(cid,jid,message,attachment,{...meta,channelId:key});
   if(attachment&&u?.active&&!t?.botPaused&&['application/pdf','image/jpeg','image/png'].includes(attachment.mime))return 'Para enviar atestado à sua pasta, envie ATESTADO e confirme seu nome completo ou código antes do arquivo. Não informe sua senha.';
   if(/^VINCULAR\s+/i.test(message))return legacy(cid,jid,message,attachment,{...meta,channelId:key});
   if(['PARAR','SAIR','STOP'].includes(command)){if(u)await wellbeing.stop(cid,u.id,key);return u?.active?legacy(cid,jid,message,attachment,{...meta,channelId:key}):intake.guestStop(cid,jid,key);}
  }
  let current=await ensure(cid,jid,meta,key),duplicate=false;
  await serial('inbox:'+current.id,async()=>{
   current=await threadFor(cid,jid,key);const id=meta.id?lookup(secret,'wa-incoming',cid,...(key===cid?[]:[key]),jid,meta.id):undefined;
   if(id&&await store.get('wa-message',id,cid)){duplicate=true;return;}
   let file=null;if(attachment)try{file=await addFile(cid,current.id,attachment);}catch{message=message||'Arquivo recebido em formato não suportado.';}
   if(meta.transportJid)current.transportJid=meta.transportJid;
   let reply=null;if(meta.quotedProviderId){const rows=await store.list('wa-message',cid,{owner:current.id,limit:2000}),q=rows.find(m=>m.providerId===meta.quotedProviderId);if(q&&!q.deletedAt)reply={id:q.id,text:(q.text||q.file?.name||'Arquivo').slice(0,180),author:q.agentName||current.name};}
   await add(cid,current,{direction:'in',text:message,file,providerId:meta.id||null,providerKey:meta.providerKey||null,participantName:meta.participantName||null,reply,status:'received'},id);
  });
  if(duplicate||current.botPaused||group)return null;
  const response=u?.active?await legacy(cid,jid,message.slice(0,4000),attachment,{...meta,channelId:key}):await intake.guestReply(cid,company,command,jid,key),fresh=await threadFor(cid,jid,key);if(!response||fresh?.botPaused)return null;
  await serial('inbox:'+fresh.id,async()=>{const latest=await threadFor(cid,jid,key);if(!latest.botPaused)await add(cid,latest,{direction:'bot',text:response,status:'prepared'});});
  return (await threadFor(cid,jid,key))?.botPaused?null:response;
 };
 const own=async(key,jid,message,attachment,meta={})=>{
  const c=await context(key);if(!c)return;const cid=c.companyId,u=await findUser(cid,jid,key);if(u&&await wellbeing.active(cid,u.id,key))return;
  const t=await ensure(cid,jid,meta,key);await serial('inbox:'+t.id,async()=>{const rows=await store.list('wa-message',cid,{owner:t.id,limit:500});if(meta.id&&rows.some(m=>m.providerId===meta.id))return;let f=null;if(attachment)try{f=await addFile(cid,t.id,attachment);}catch{}const latest=await threadFor(cid,jid,key);latest.botPaused=true;latest.status='active';await add(cid,latest,{direction:'out',text:message,file:f,providerId:meta.id||null,providerKey:meta.providerKey||null,agentName:'WhatsApp da empresa',status:'sent'});});
 };
 const delivery=async(key,jid,response,sent,error)=>{const c=await context(key);if(!c)return;const cid=c.companyId,t=await threadFor(cid,jid,key);if(!t)return;const rows=await store.list('wa-message',cid,{owner:t.id,limit:100}),m=rows.find(m=>m.direction==='bot'&&m.status==='prepared'&&m.text===response);if(m){m.status=error?'uncertain':'sent';m.providerId=sent?.key?.id||null;m.providerKey=sent?.key||null;await store.put('wa-message',cid,m,m.id);}};
 const mutation=async(key,messageKey,update)=>{const c=await context(key);if(!c)return;const cid=c.companyId;for(const m of await store.list('wa-message',cid,{limit:5000}))if(m.providerId===messageKey.id&&(m.channelId||cid)===key){if(update.message===null){if(m.file)await removeFile(m.file,cid);m.deletedAt=new Date().toISOString();m.text='';m.file=null;}else{const edited=update.message?.editedMessage?.message||update.message,body=edited?.conversation||edited?.extendedTextMessage?.text;if(body){m.text=body.slice(0,16000);m.editedAt=new Date().toISOString();}}await store.put('wa-message',cid,m,m.id);}};
 const reaction=async(key,messageKey,value)=>{const c=await context(key);if(!c)return;const cid=c.companyId;for(const m of await store.list('wa-message',cid,{limit:5000}))if(m.providerId===messageKey.id&&(m.channelId||cid)===key){const who=value.key?.participant||value.key?.remoteJid||'contato';m.reactions=(m.reactions||[]).filter(r=>r.who!==who);if(value.text)m.reactions.push({who,emoji:value.text.slice(0,12)});await store.put('wa-message',cid,m,m.id);}};
 return {receive,own,delivery,mutation,reaction,wellbeing,connectionChanged:async key=>{const c=await context(key);if(c)updates.touch(c.companyId,key);},canSendReply:async(key,jid)=>{const c=await context(key);return !!c&&!jid.endsWith('@g.us')&&!(await threadFor(c.companyId,jid,key))?.botPaused;}};
}
