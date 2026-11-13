import {lookup,text} from './security.js';
const normalize=s=>String(s||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').trim().toUpperCase();
export function installWhatsAppIntake({route,store,secret,admin,saveDocument,channels}){
 const stateId=(cid,jid,key=cid)=>lookup(secret,'wa-document-intake',cid,...(key===cid?[]:[key]),jid),configId=key=>lookup(secret,'wa-visitor-settings',key);
 const keyFor=async req=>{const key=String(req.query.channelId||req.body?.channelId||req.user.companyId);await channels.owned(req.user.companyId,key);return key;};
 // Compatibility endpoint: the action editor lives at /admin/whatsapp/menus.
 const defaults={enabled:true,greeting:'Olá! Você está no atendimento da {empresa}.',menu:'1 — Falar com o RH\n2 — Enviar atestado por um colaborador\n3 — Outros atendimentos'};
 route('get','/admin/whatsapp/visitors',admin,async(req,res)=>res.json({...defaults,...await store.get('wa-visitor-settings',configId(await keyFor(req)),req.user.companyId)}));
 route('post','/admin/whatsapp/visitors',admin,async(req,res)=>{const s={enabled:req.body.enabled===true,greeting:text(req.body.greeting,2,700),menu:text(req.body.menu,2,1500)};await store.put('wa-visitor-settings',req.user.companyId,s,configId(await keyFor(req)));res.json(s);});
 const clear=(cid,jid,key=cid)=>store.remove('wa-document-intake',stateId(cid,jid,key),cid);
 const document=async(cid,jid,message,attachment,key=cid,knownUser)=>{
  const command=normalize(message),id=stateId(cid,jid,key),old=await store.get('wa-document-intake',id,cid),state=old&&Date.parse(old.expiresAt)>Date.now()?old:null,u=knownUser||await channels.member(cid,jid,key);
  if(!u?.active||!u.whatsappConsent){if(old)await clear(cid,jid,key);return {handled:false};}
  if(['MENU','INICIO','RH','FALAR COM O RH','PARAR','SAIR','STOP','4','BEM-ESTAR','CONVERSAR','PARAR BEM-ESTAR'].includes(command)||/^HUMOR\s+[1-5]$/.test(command)){if(old)await clear(cid,jid,key);return {handled:false};}
  if(['ATESTADO','ENVIAR ATESTADO'].includes(command)||/\b(?:ENVIAR|MANDAR|ENTREGAR|ENVIO)\b.*\bATESTADO\b/.test(command)){
   if(/\b(?:OUTRO|OUTRA|COLEGA|EM NOME|MINHA MAE|MEU PAI|MINHA ESPOSA|MEU ESPOSO|MEU FILHO|MINHA FILHA)\b/.test(command)||(await store.list('user',cid)).some(v=>v.id!==u.id&&v.name&&normalize(v.name).length>5&&command.includes(normalize(v.name))))return {handled:false,human:true};
   await store.put('wa-document-intake',cid,{stage:'file',owner:u.id,phone:u.phone,expiresAt:new Date(Date.now()+30*60000).toISOString()},id);
   return {handled:true,reply:'Pode enviar seu atestado em PDF, JPG ou PNG de até 5 MB. Este número está vinculado ao seu cadastro; o arquivo será salvo apenas na sua pasta, para análise humana. Não informe senha. MENU cancela.'};
  }
  if(!state){if(old)await clear(cid,jid,key);return {handled:false};}
  if(state.owner!==u.id||state.phone&&state.phone!==u.phone){await clear(cid,jid,key);return {handled:true,reply:'O cadastro mudou. Peça à equipe para conferir seu número antes de enviar documentos.'};}
  if(!attachment)return {handled:true,reply:'Envie seu atestado como PDF, JPG ou PNG de até 5 MB, ou MENU para voltar aos serviços.'};
  try{await saveDocument(u,attachment);await clear(cid,jid,key);return {handled:true,reply:'Recebemos seu documento e colocamos na sua pasta para análise da equipe. Você pode acompanhar pelo aplicativo.'};}catch(e){return {handled:true,reply:e.status?e.message:'Não foi possível salvar agora. Tente novamente ou fale com a equipe.'};}
 };
 return {document,clear};
}
