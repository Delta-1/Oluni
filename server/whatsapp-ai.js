import {fail,lookup,text,limiter} from './security.js';
import {serial} from './attendance.js';
import {hrAssistant} from './ai.js';
export function installWhatsAppAI({route,store,secret,admin,settingsFor,companyFor,ai=hrAssistant}){
 const configId=cid=>lookup(secret,'wa-ai-settings',cid),conversationId=(cid,uid)=>lookup(secret,'wa-ai-conversation',cid,uid);
 const configFor=async cid=>{
  const own=await store.get('wa-ai-settings',configId(cid),cid);
  if(own)return {...own,usingLegacyKey:false};
  const legacy=await settingsFor(cid);
  return {...legacy,provider:legacy?.provider||'gemini',model:legacy?.model||'gemini-2.5-flash',botName:'Assistente RH',instructions:'Atenda a equipe com educação. Oriente sobre ponto, documentos e contato com o RH.',mode:'menu',usingLegacyKey:!!legacy?.apiKey};
 };
 const safe=s=>({provider:s.provider||'gemini',model:s.model||'gemini-2.5-flash',botName:s.botName||'Assistente RH',instructions:s.instructions||'',mode:s.mode||'menu',enabled:!!s.enabled,hasKey:!!s.apiKey,usingLegacyKey:!!s.usingLegacyKey});
 route('get','/admin/whatsapp/ai',admin,async(req,res)=>res.json(safe(await configFor(req.user.companyId))));
 route('post','/admin/whatsapp/ai',admin,async(req,res)=>{
  const cid=req.user.companyId,old=await configFor(cid),b=req.body;
  if(!['gemini','openai'].includes(b.provider))throw fail(400,'Escolha o provedor de IA.');
  if(!['menu','automatic'].includes(b.mode))throw fail(400,'Escolha quando a IA deve responder.');
  const value={provider:b.provider,model:text(b.model,2,120),botName:text(b.botName,2,80),instructions:text(b.instructions||'',0,6000),mode:b.mode,enabled:b.enabled===true};
  if(b.apiKey)value.apiKey=text(b.apiKey,10,500);else if(old.apiKey)value.apiKey=old.apiKey;
  if(b.removeKey===true)delete value.apiKey;
  if(value.enabled&&!value.apiKey)throw fail(400,'Adicione a chave de API para ativar o bot de IA do WhatsApp.');
  if(value.enabled&&old.provider!==value.provider&&!b.apiKey&&value.apiKey)throw fail(400,'Ao trocar o provedor, informe a chave de API correspondente.');
  await store.put('wa-ai-settings',cid,value,configId(cid));res.json(safe(value));
 });
 route('post','/admin/whatsapp/ai/test',admin,limiter(5,60000),async(req,res)=>{
  const settings=await configFor(req.user.companyId);if(!settings.apiKey)throw fail(400,'Salve uma chave de API antes de testar.');
  const c=await companyFor(req.user.companyId),response=await ai({...settings,enabled:true},[{role:'user',text:'Olá! Como envio um atestado e falo com o RH?'}],{companyName:c.name,testing:true});res.json({reply:response});
 });
 const clear=async(cid,uid)=>store.remove('wa-ai-conversation',conversationId(cid,uid),cid);
 const reply=async(user,message,context)=>serial('wa-ai:'+user.companyId+':'+user.id,async()=>{
  const fresh=await store.get('user',user.id,user.companyId);
  if(!fresh?.active||!fresh.aiConsent||!fresh.whatsappConsent)throw fail(403,'Autorize a IA e o WhatsApp no seu perfil para conversar.');
  const settings=await configFor(user.companyId);
  if(!settings.enabled||!settings.apiKey)throw fail(409,'A IA do WhatsApp ainda não foi configurada.');
  const id=conversationId(user.companyId,user.id),previous=await store.get('wa-ai-conversation',id,user.companyId),history=previous&&Date.parse(previous.expiresAt)>Date.now()?previous.messages:[];
  const messages=[...history,{role:'user',text:text(message,1,4000)}].slice(-15),result=await ai(settings,messages,context),current=await store.get('user',user.id,user.companyId),after=await configFor(user.companyId);
  if(!current?.active||!current.aiConsent||!current.whatsappConsent||!after.enabled)throw fail(403,'O atendimento de IA foi desativado.');
  await store.put('wa-ai-conversation',user.companyId,{owner:user.id,messages:[...messages,{role:'assistant',text:result}].slice(-16),expiresAt:new Date(Date.now()+15*60000).toISOString()},id);
  return result;
 });
 return {configFor,reply,clear};
}
