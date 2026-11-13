import {randomUUID} from 'node:crypto';
import {fail,lookup,text,limiter,digest} from './security.js';
import {serial} from './attendance.js';
import {hrAssistant} from './ai.js';
import {extractKnowledge,knowledgeContext,redactKnowledge} from './file-content.js';
export function installWhatsAppAI({route,store,secret,admin,settingsFor,companyFor,platform,channels,ai=hrAssistant}){
 const configId=key=>lookup(secret,'wa-ai-settings',key),primaryId=key=>'primary:'+key;
 const configFor=async(cid,key=cid,assistantId=null)=>{
  const own=await store.get('wa-ai-settings',configId(key),cid)||key!==cid&&await store.get('wa-ai-settings',configId(cid),cid),legacy=await settingsFor(cid);
  const base=own?{...own,usingLegacyKey:false}:{...legacy,provider:legacy?.provider||'gemini',model:legacy?.model||'gemini-2.5-flash',botName:'Assistente da equipe',instructions:'Ajude com dúvidas do trabalho, serviços e regras da empresa. Use os arquivos de orientação; quando faltar informação, encaminhe à equipe responsável.',mode:'automatic',usingLegacyKey:legacy?.source!=='platform'&&!!legacy?.apiKey};
  const resolved=platform?platform.resolve(base):base;let value={...resolved,assistantId:primaryId(key),channelId:key,audience:'employee',primary:true};
  if(assistantId&&assistantId!==primaryId(key)){const a=await store.get('wa-assistant',assistantId,cid);if(!a||a.channelId!==key||a.active===false)throw fail(404,'Assistente não encontrado neste WhatsApp.');value={...value,assistantId:a.id,botName:a.name,instructions:a.instructions,audience:a.audience,enabled:a.enabled===true&&!!resolved.apiKey,primary:false};}
  return value;
 };
 const safe=s=>({id:s.assistantId,channelId:s.channelId,name:s.botName||'Assistente da equipe',audience:s.audience||'employee',primary:!!s.primary,provider:s.provider||'gemini',model:s.model||'gemini-2.5-flash',botName:s.botName||'Assistente da equipe',instructions:s.instructions||'',mode:s.mode||'automatic',enabled:!!s.enabled,hasKey:!!s.apiKey,usingLegacyKey:!!s.usingLegacyKey,source:s.source||'company'});
 const keyFor=async req=>{const key=String(req.query.channelId||req.body?.channelId||req.user.companyId);if(channels)await channels.owned(req.user.companyId,key);return key;};
 const resolveId=async(cid,id)=>{if(id.startsWith('primary:')){const key=id.slice(8);await channels.owned(cid,key);return configFor(cid,key);}const row=await store.get('wa-assistant',id,cid);if(!row||row.active===false)throw fail(404,'Assistente não encontrado.');await channels.owned(cid,row.channelId);return configFor(cid,row.channelId,id);};
 route('get','/admin/whatsapp/ai',admin,async(req,res)=>res.json(safe(await configFor(req.user.companyId,await keyFor(req)))));
 route('post','/admin/whatsapp/ai',admin,async(req,res)=>{
  const cid=req.user.companyId,key=await keyFor(req),old=await configFor(cid,key),stored=await store.get('wa-ai-settings',configId(key),cid),b=req.body;
  if(!['gemini','openai'].includes(b.provider)||!['menu','automatic'].includes(b.mode))throw fail(400,'Escolha o provedor e quando a IA responde.');
  const value={provider:b.provider,model:text(b.model,2,120),botName:text(b.botName,2,80),instructions:text(b.instructions||'',0,6000),mode:b.mode,enabled:b.enabled===true};
  if(b.apiKey)value.apiKey=text(b.apiKey,10,500);else if(stored?.apiKey)value.apiKey=stored.apiKey;else if(old.source!=='platform'&&old.apiKey)value.apiKey=old.apiKey;
  if(b.removeKey===true)delete value.apiKey;const resolved=platform?platform.resolve(value):value;
  if(value.enabled&&!resolved.apiKey)throw fail(400,'Ative a chave central ou informe uma chave própria.');if(value.enabled&&old.provider!==value.provider&&!b.apiKey&&value.apiKey)throw fail(400,'Ao trocar o provedor, informe a chave correspondente.');
  await store.put('wa-ai-settings',cid,value,configId(key));res.json(safe({...resolved,assistantId:primaryId(key),channelId:key,audience:'employee',primary:true}));
 });
 const list=async(cid,key)=>[safe(await configFor(cid,key)),...await Promise.all((await store.list('wa-assistant',cid)).filter(a=>a.channelId===key&&a.active!==false).map(async a=>safe(await configFor(cid,key,a.id))))];
 route('get','/admin/whatsapp/assistants',admin,async(req,res)=>res.json(await list(req.user.companyId,await keyFor(req))));
 route('post','/admin/whatsapp/assistants',admin,async(req,res)=>{const cid=req.user.companyId,key=await keyFor(req),b=req.body;if(!['employee','external'].includes(b.audience))throw fail(400,'Escolha o público deste assistente.');if((await list(cid,key)).length>=20)throw fail(400,'Use até 20 assistentes por WhatsApp.');const a=await store.put('wa-assistant',cid,{channelId:key,name:text(b.name,2,80),instructions:text(b.instructions||'',0,10000),audience:b.audience,enabled:b.enabled===true,active:true,createdAt:new Date().toISOString()},'wa-assistant:'+randomUUID(),true);res.status(201).json(safe(await configFor(cid,key,a.id)));});
 route('patch','/admin/whatsapp/assistants/:id',admin,async(req,res)=>{const cid=req.user.companyId,a=await store.get('wa-assistant',req.params.id,cid);if(!a||a.active===false)throw fail(404,'Assistente não encontrado.');if(req.body.audience!==undefined&&req.body.audience!==a.audience)throw fail(400,'O público é fixo. Crie outro assistente para separar os arquivos internos dos externos.');a.name=text(req.body.name,2,80);a.instructions=text(req.body.instructions||'',0,10000);a.enabled=req.body.enabled===true;await store.put('wa-assistant',cid,a,a.id);res.json(safe(await configFor(cid,a.channelId,a.id)));});
 const metadata=f=>({id:f.id,name:f.name,mime:f.mime,size:f.size,characters:f.text.length,at:f.at});
 route('get','/admin/whatsapp/assistants/:id/files',admin,async(req,res)=>{const a=await resolveId(req.user.companyId,req.params.id);res.json((await store.list('assistant-file',req.user.companyId,{owner:a.assistantId})).map(metadata));});
 route('post','/admin/whatsapp/assistants/:id/files',admin,limiter(10,60000),async(req,res)=>{
  const cid=req.user.companyId,a=await resolveId(cid,req.params.id),existing=await store.list('assistant-file',cid,{owner:a.assistantId});if(existing.length>=20)throw fail(400,'Use até 20 arquivos por assistente.');const f=await extractKnowledge(req.body);if(existing.reduce((n,v)=>n+v.text.length,0)+f.text.length>2000000)throw fail(400,'A base deste assistente atingiu o limite de texto.');
  const hash=digest(f.buffer.toString('base64')),old=existing.find(v=>v.hash===hash);if(old)return res.json(metadata(old));const id='assistant-file:'+randomUUID(),chunks=[];
  try{for(let i=0;i<f.buffer.length;i+=180000){const chunk=await store.put('assistant-file-chunk',cid,{owner:a.assistantId,fileId:id,data:f.buffer.subarray(i,i+180000).toString('base64')});chunks.push(chunk.id);}const value=await store.put('assistant-file',cid,{owner:a.assistantId,channelId:a.channelId,audience:a.audience,name:f.name,mime:f.mime,size:f.buffer.length,text:f.text,hash,chunks,at:new Date().toISOString()},id,true);res.status(201).json(metadata(value));}catch(e){for(const id of chunks)await store.remove('assistant-file-chunk',id,cid);throw e;}
 });
 route('delete','/admin/whatsapp/assistants/:id/files/:file',admin,async(req,res)=>{const cid=req.user.companyId,a=await resolveId(cid,req.params.id),f=await store.get('assistant-file',req.params.file,cid);if(!f||f.owner!==a.assistantId)throw fail(404,'Arquivo não encontrado.');for(const id of f.chunks)await store.remove('assistant-file-chunk',id,cid);await store.remove('assistant-file',f.id,cid);res.json({ok:true});});
 const clear=async(cid,uid,key=cid)=>{for(const row of await store.list('wa-ai-conversation',cid,{owner:uid}))if(row.channelId===key||!row.channelId&&key===cid)await store.remove('wa-ai-conversation',row.id,cid);};
 const guarded=(question,result,audience)=>{
  if(/```|<script\b|\b(?:function\s+\w+\s*\(|import\s+\w+\s+from|sudo\s+|SELECT\s+\*\s+FROM)\b/i.test(result))return 'Este assistente atende assuntos da empresa e não gera código de programação. Posso ajudar com uma dúvida do trabalho?';
  const clean=result.replace(/\n\s*(?:Como posso ajudar[^\n]*\n)?\s*1\s*[—–-]\s*Meu ponto[\s\S]*$/i,'').trim()||'Como posso ajudar com sua dúvida do trabalho?';return audience==='external'?redactKnowledge(clean):clean;
 };
 const answer=async(settings,messages,context)=>{
  const cid=context.companyId,files=(await store.list('assistant-file',cid,{owner:settings.assistantId})).filter(f=>f.channelId===settings.channelId&&f.audience===settings.audience),users=await store.list('user',cid),names=users.filter(u=>u.id!==context.employeeId).map(u=>u.name);
  const question=messages.at(-1)?.text||'';
  if(/(?:c[oó]digo de programa|programa[çc][aã]o|javascript|python|script|comando (?:sql|de terminal)|escreva.*c[oó]digo|write.*code)/i.test(question))return 'Este assistente atende assuntos da empresa e não gera código de programação. Posso ajudar com uma dúvida do trabalho?';
  if(settings.audience==='external'&&/\b(?:cpf|rg|sal[aá]rio|dados pessoais|endere[çc]o pessoal|telefone pessoal|senha|atestado de)\b/i.test(question)||/\b(?:cpf|rg|sal[aá]rio|telefone|endere[çc]o|atestado)\s+(?:do|da|de)\s+(?!meu\b|minha\b|mim\b|empresa\b)/i.test(question))return 'Não forneço dados pessoais de outras pessoas. Para esse assunto, fale com a equipe autorizada.';
  const sources=knowledgeContext(files,question,names),safeContext={...context,knowledge:sources};for(const key of ['companyId','employeeId','channelId','assistantId','menu'])delete safeContext[key];
  const safeSettings={...settings,instructions:redactKnowledge(settings.instructions,names)},result=await ai(safeSettings,messages,safeContext);
  return guarded(question,redactKnowledge(result,names),settings.audience);
 };
 const reply=async(user,message,context)=>serial('wa-ai:'+user.companyId+':'+user.id+':'+(context.channelId||user.companyId),async()=>{
  const cid=user.companyId,key=context.channelId||cid,fresh=await store.get('user',user.id,cid);if(!fresh?.active||!fresh.aiConsent||!fresh.whatsappConsent)throw fail(403,'Autorize a IA e o WhatsApp para conversar.');
  const settings=await configFor(cid,key,context.assistantId);if(settings.audience!=='employee'||!settings.enabled||!settings.apiKey)throw fail(409,'A assistente da equipe não está disponível.');
  const id=lookup(secret,'wa-ai-conversation-v2',cid,key,settings.assistantId,user.id),previous=await store.get('wa-ai-conversation',id,cid),history=previous&&Date.parse(previous.expiresAt)>Date.now()?previous.messages:[],messages=[...history,{role:'user',text:text(message,1,4000)}].slice(-15);
  const result=await answer(settings,messages,{...context,assistantId:settings.assistantId,audience:'employee',companyId:cid,employeeId:user.id}),current=await store.get('user',user.id,cid),after=await configFor(cid,key,settings.assistantId);if(!current?.active||!current.aiConsent||!current.whatsappConsent||!after.enabled||after.audience!=='employee')throw fail(403,'O atendimento de IA foi desativado.');
  await store.put('wa-ai-conversation',cid,{owner:user.id,channelId:key,assistantId:settings.assistantId,messages:[...messages,{role:'assistant',text:result}].slice(-16),expiresAt:new Date(Date.now()+30*60000).toISOString()},id);return result;
 });
 const publicReply=async(cid,jid,key,id,message)=>serial('public-ai:'+cid+':'+key+':'+jid,async()=>{
  const settings=await configFor(cid,key,id);if(settings.audience!=='external'||!settings.enabled||!settings.apiKey)throw fail(409,'Este assistente externo está indisponível.');const conversation=lookup(secret,'wa-public-ai-history',cid,key,id,jid),previous=await store.get('wa-public-ai-history',conversation,cid),history=previous&&Date.parse(previous.expiresAt)>Date.now()?previous.messages:[],messages=[...history,{role:'user',text:text(message,1,4000)}].slice(-15),company=await companyFor(cid);
  const result=await answer(settings,messages,{companyId:cid,companyName:company.name,channelId:key,assistantId:id,audience:'external'}),after=await configFor(cid,key,id);if(!after.enabled||after.audience!=='external')throw fail(403,'O assistente foi desativado.');await store.put('wa-public-ai-history',cid,{channelId:key,assistantId:id,messages:[...messages,{role:'assistant',text:result}].slice(-16),expiresAt:new Date(Date.now()+30*60000).toISOString()},conversation);return result;
 });
 const test=async(req,res)=>{const key=await keyFor(req),s=req.params.id?await resolveId(req.user.companyId,req.params.id):await configFor(req.user.companyId,key);if(!s.apiKey)throw fail(400,'A IA ainda não está disponível.');const c=await companyFor(req.user.companyId);res.json({reply:await answer({...s,enabled:true},[{role:'user',text:req.body.text?text(req.body.text,1,4000):'Olá! Como envio um atestado e falo com a equipe?'}],{companyId:c.id,companyName:c.name,channelId:s.channelId,audience:s.audience,testing:true})});};
 route('post','/admin/whatsapp/ai/test',admin,limiter(5,60000),test);route('post','/admin/whatsapp/assistants/:id/test',admin,limiter(5,60000),test);
 return {configFor,reply,publicReply,clear,list,primaryId,resolveId};
}
