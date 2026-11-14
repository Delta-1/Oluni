import {lookup,text} from './security.js';
const normalize=s=>String(s||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').trim().toUpperCase();
export function installWhatsAppIntake({route,store,secret,admin,certificates,channels}){
 const stateId=(cid,jid,key=cid)=>lookup(secret,'wa-document-intake',cid,...(key===cid?[]:[key]),jid),configId=key=>lookup(secret,'wa-visitor-settings',key);
 const keyFor=async req=>{const key=String(req.query.channelId||req.body?.channelId||req.user.companyId);await channels.owned(req.user.companyId,key);return key;};
 const defaults={enabled:true,greeting:'Olá! Você está no atendimento da {empresa}.',menu:'1 — Falar com o RH\n2 — Enviar atestado por um colaborador\n3 — Outros atendimentos'};
 route('get','/admin/whatsapp/visitors',admin,async(req,res)=>res.json({...defaults,...await store.get('wa-visitor-settings',configId(await keyFor(req)),req.user.companyId)}));
 route('post','/admin/whatsapp/visitors',admin,async(req,res)=>{const s={enabled:req.body.enabled===true,greeting:text(req.body.greeting,2,700),menu:text(req.body.menu,2,1500)};await store.put('wa-visitor-settings',req.user.companyId,s,configId(await keyFor(req)));res.json(s);});
 const clear=(cid,jid,key=cid)=>store.remove('wa-document-intake',stateId(cid,jid,key),cid);
 const document=async(cid,jid,message,attachment,key=cid,knownUser,meta={})=>{
  const command=normalize(message),id=stateId(cid,jid,key),old=await store.get('wa-document-intake',id,cid),state=old&&Date.parse(old.expiresAt)>Date.now()?old:null,u=knownUser||await channels.member(cid,jid,key),requested=/\bATESTADO(?:S)?\b/.test(command);
  if(['MENU','INICIO','RH','FALAR COM O RH','PARAR','SAIR','STOP'].includes(command)){if(old)await clear(cid,jid,key);return {handled:false};}
  if(u?.active&&!u.whatsappConsent)return {handled:false};
  const recognized=(requested||state||attachment)&&message.trim()&&await certificates.identify(cid,message,u?.id),hasIdentity=recognized?.candidateIds?.length>0;
  if(state?.submissionId&&!attachment&&hasIdentity){await certificates.claim(cid,state.submissionId,message);await clear(cid,jid,key);return {handled:true,reply:'Identificação recebida. O RH vai conferir o nome ou código e o atestado antes de enviar o arquivo para a pasta correta.'};}
  if(attachment&&(requested||state||hasIdentity)){
   try{const claim=requested||hasIdentity?message:state?.claim||'',row=await certificates.stage(cid,attachment,{senderId:u?.active?u.id:null,phone:u?.phone||jid.split('@')[0],jid,channelId:key,claim,providerId:meta.id});await store.put('wa-document-intake',cid,{submissionId:row.id,expiresAt:new Date(Date.now()+86400000).toISOString()},id);return {handled:true,reply:'Recebi o atestado. Ele está em Pendentes para o RH conferir e confirmar o colaborador antes de enviar para a pasta.'+(!row.claim?' Se puder, informe o nome completo ou o código que corresponde ao documento.':'')};}catch(e){return {handled:true,reply:e.status?e.message:'Não consegui guardar o arquivo agora. Tente novamente ou peça atendimento ao RH.'};}
  }
  if(requested){await store.put('wa-document-intake',cid,{claim:hasIdentity?message:'',expiresAt:new Date(Date.now()+86400000).toISOString()},id);return {handled:true,reply:'Pode enviar o atestado em PDF, JPG ou PNG de até 5 MB e escrever o nome completo ou código do colaborador. O RH confere a identidade e confirma antes de enviar para a pasta. Pode continuar conversando comigo enquanto isso.'};}
  if(state&&!state.submissionId&&hasIdentity){state.claim=message;await store.put('wa-document-intake',cid,state,id);return {handled:true,reply:'Nome ou código anotado para conferência do RH. Pode enviar o atestado.'};}
  return {handled:false};
 };
 return {document,clear};
}
