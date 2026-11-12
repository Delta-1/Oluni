import {fail,lookup,text,limiter} from './security.js';
import {serial} from './attendance.js';
import {hrAssistant} from './ai.js';
export function installWhatsAppAI({route,store,secret,admin,settingsFor,companyFor,platform,channels,ai=hrAssistant}){
 const configId=key=>lookup(secret,'wa-ai-settings',key),conversationId=(cid,uid,key=cid)=>lookup(secret,'wa-ai-conversation',cid,uid,...(key===cid?[]:[key]));
 const configFor=async(cid,key=cid)=>{
  const own=await store.get('wa-ai-settings',configId(key),cid)||key!==cid&&await store.get('wa-ai-settings',configId(cid),cid);
  const legacy=await settingsFor(cid);
  const base=own?{...own,usingLegacyKey:false}:{...legacy,provider:legacy?.provider||'gemini',model:legacy?.model||'gemini-2.5-flash',botName:'Assistente RH',instructions:'Atenda a equipe com educação. Oriente sobre ponto, documentos e serviços do setor.',mode:'menu',usingLegacyKey:legacy?.source!=='platform'&&!!legacy?.apiKey};
  return platform?platform.resolve(base):base;
 };
 const safe=s=>({provider:s.provider||'gemini',model:s.model||'gemini-2.5-flash',botName:s.botName||'Assistente RH',instructions:s.instructions||'',mode:s.mode||'menu',enabled:!!s.enabled,hasKey:!!s.apiKey,usingLegacyKey:!!s.usingLegacyKey,source:s.source||'company'});
 const keyFor=async req=>{const key=String(req.query.channelId||req.body?.channelId||req.user.companyId);if(channels)await channels.owned(req.user.companyId,key);return key;};
 route('get','/admin/whatsapp/ai',admin,async(req,res)=>res.json(safe(await configFor(req.user.companyId,await keyFor(req)))));
 route('post','/admin/whatsapp/ai',admin,async(req,res)=>{
  const cid=req.user.companyId,key=await keyFor(req),old=await configFor(cid,key),stored=await store.get('wa-ai-settings',configId(key),cid),b=req.body;
  if(!['gemini','openai'].includes(b.provider)||!['menu','automatic'].includes(b.mode))throw fail(400,'Escolha o provedor e quando a IA responde.');
  const value={provider:b.provider,model:text(b.model,2,120),botName:text(b.botName,2,80),instructions:text(b.instructions||'',0,6000),mode:b.mode,enabled:b.enabled===true};
  if(b.apiKey)value.apiKey=text(b.apiKey,10,500);else if(stored?.apiKey)value.apiKey=stored.apiKey;else if(old.source!=='platform'&&old.apiKey)value.apiKey=old.apiKey;
  if(b.removeKey===true)delete value.apiKey;
  const resolved=platform?platform.resolve(value):value;
  if(value.enabled&&!resolved.apiKey)throw fail(400,'A chave central da plataforma precisa ser ativada, ou informe uma chave própria.');
  if(value.enabled&&old.provider!==value.provider&&!b.apiKey&&value.apiKey)throw fail(400,'Ao trocar o provedor, informe a chave correspondente.');
  await store.put('wa-ai-settings',cid,value,configId(key));res.json(safe(resolved));
 });
 route('post','/admin/whatsapp/ai/test',admin,limiter(5,60000),async(req,res)=>{const settings=await configFor(req.user.companyId,await keyFor(req));if(!settings.apiKey)throw fail(400,'A IA ainda não está disponível.');const c=await companyFor(req.user.companyId);res.json({reply:await ai({...settings,enabled:true},[{role:'user',text:'Olá! Como envio um atestado e falo com o RH?'}],{companyName:c.name,testing:true})});});
 const clear=async(cid,uid,key=cid)=>store.remove('wa-ai-conversation',conversationId(cid,uid,key),cid);
 const reply=async(user,message,context)=>serial('wa-ai:'+user.companyId+':'+user.id+':'+(context.channelId||user.companyId),async()=>{
  const cid=user.companyId,key=context.channelId||cid,fresh=await store.get('user',user.id,cid);
  if(!fresh?.active||!fresh.aiConsent||!fresh.whatsappConsent)throw fail(403,'Autorize a IA e o WhatsApp no perfil para conversar.');
  const settings=await configFor(cid,key);if(!settings.enabled||!settings.apiKey)throw fail(409,'A IA ainda não está disponível.');
  const id=conversationId(cid,user.id,key),previous=await store.get('wa-ai-conversation',id,cid),history=previous&&Date.parse(previous.expiresAt)>Date.now()?previous.messages:[];
  const messages=[...history,{role:'user',text:text(message,1,4000)}].slice(-15),result=await ai(settings,messages,context),current=await store.get('user',user.id,cid),after=await configFor(cid,key);
  if(!current?.active||!current.aiConsent||!current.whatsappConsent||!after.enabled)throw fail(403,'O atendimento de IA foi desativado.');
  await store.put('wa-ai-conversation',cid,{owner:user.id,channelId:key,messages:[...messages,{role:'assistant',text:result}].slice(-16),expiresAt:new Date(Date.now()+15*60000).toISOString()},id);return result;
 });
 return {configFor,reply,clear};
}
