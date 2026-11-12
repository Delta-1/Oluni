import {lookup,text,fail} from './security.js';
const normalize=s=>String(s||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function installWhatsAppIntake({route,store,secret,admin,saveDocument,channels}){
 const stateId=(cid,jid,key=cid)=>lookup(secret,'wa-document-intake',cid,...(key===cid?[]:[key]),jid),configId=key=>lookup(secret,'wa-visitor-settings',key),guestId=(cid,jid,key=cid)=>lookup(secret,'wa-visitor-session',cid,...(key===cid?[]:[key]),jid);
 const keyFor=async req=>{const key=String(req.query.channelId||req.body?.channelId||req.user.companyId);if(channels)await channels.owned(req.user.companyId,key);return key;};
 const defaults={enabled:true,greeting:'Olá! Você está no atendimento da {empresa}.',menu:'Como podemos ajudar?\n1 - Falar com o RH\n2 - Enviar atestado (colaboradores)\n3 - Outros atendimentos da empresa\n\nEnvie a opção ou MENU. Para atestado, escolha 2 antes de enviar o arquivo.'};
 const settings=async(cid,key=cid)=>({...defaults,...await store.get('wa-visitor-settings',configId(key),cid)});
 route('get','/admin/whatsapp/visitors',admin,async(req,res)=>res.json(await settings(req.user.companyId,await keyFor(req))));
 route('post','/admin/whatsapp/visitors',admin,async(req,res)=>{const s={enabled:req.body.enabled===true,greeting:text(req.body.greeting,2,700),menu:text(req.body.menu,2,1500)};await store.put('wa-visitor-settings',req.user.companyId,s,configId(await keyFor(req)));res.json(s);});
 const clear=(cid,jid,key=cid)=>store.remove('wa-document-intake',stateId(cid,jid,key),cid);
 const document=async(cid,jid,message,attachment,key=cid)=>{
  const command=message.trim().toUpperCase(),id=stateId(cid,jid,key),old=await store.get('wa-document-intake',id,cid),state=old&&Date.parse(old.expiresAt)>Date.now()?old:null;
  if(['2','ATESTADO','ENVIAR ATESTADO'].includes(command)){
   await store.put('wa-document-intake',cid,{stage:'identity',attempts:0,expiresAt:new Date(Date.now()+15*60000).toISOString()},id);
   return {handled:true,reply:'Para enviar seu atestado em PDF, JPG ou PNG de até 5 MB, informe primeiro seu nome completo ou seu código de identificação (ex.: 0001). Não informe sua senha. O telefone desta conversa deve ser o cadastrado no Oluni. MENU cancela.'};
  }
  if(['MENU','INICIO','INÍCIO','OI','OLA','OLÁ','1','3','4','RH','FALAR COM O RH','ATENDIMENTO','PARAR','SAIR','STOP','BEM-ESTAR','CONVERSAR','PARAR BEM-ESTAR'].includes(command)||/^HUMOR\s+[1-5]$/.test(command)){if(old)await clear(cid,jid,key);return {handled:false};}
  if(!state){if(old)await clear(cid,jid,key);return {handled:false};}
  const channel=channels?await channels.owned(cid,key):null,users=(await store.list('user',cid)).filter(u=>!channel?.departmentId||u.departmentId===channel.departmentId),phone=jid.endsWith('@s.whatsapp.net')?jid.split('@')[0]:'';
  if(state.stage==='identity'){
   if(attachment)return {handled:true,reply:'Antes do arquivo, digite seu nome completo ou o código do colaborador. Não informe sua senha.'};
   const candidates=users.filter(u=>u.active&&u.phone===phone&&(normalize(u.name)===normalize(message)||String(u.employeeCode||'').toUpperCase()===command));
   if(candidates.length!==1){state.attempts++;if(state.attempts>=5)await clear(cid,jid,key);else await store.put('wa-document-intake',cid,state,id);return {handled:true,reply:'Não foi possível confirmar o cadastro com este telefone e identificação. Confira seu nome completo/código e use o WhatsApp cadastrado. Você também pode enviar pelo aplicativo ou digitar RH para atendimento.'};}
   state.owner=candidates[0].id;state.stage='file';await store.put('wa-document-intake',cid,state,id);
   return {handled:true,reply:'Identificação confirmada. Agora envie seu atestado como PDF, JPG ou PNG de até 5 MB. O arquivo será encaminhado à sua pasta para análise do RH.'};
  }
  const user=users.find(u=>u.id===state.owner&&u.active&&u.phone===phone);
  if(!user){await clear(cid,jid,key);return {handled:true,reply:'A confirmação precisa ser refeita. Envie ATESTADO para começar novamente ou RH para atendimento.'};}
  if(!attachment)return {handled:true,reply:'Sua identificação foi confirmada. Envie agora o PDF, JPG ou PNG de até 5 MB, ou MENU para cancelar.'};
  try{await saveDocument(user,attachment);await clear(cid,jid,key);return {handled:true,reply:'Recebemos seu documento e colocamos na sua pasta. O RH fará a análise. Você pode acompanhar pelo aplicativo.'};}
  catch(e){return {handled:true,reply:e.status?e.message:'Não foi possível salvar agora. Tente novamente ou envie pelo aplicativo.'};}
 };
 const guestStop=async(cid,jid,key=cid)=>{await store.put('wa-visitor-session',cid,{stopped:true,until:new Date(Date.now()+30*86400000).toISOString()},guestId(cid,jid,key));return 'Respostas automáticas desativadas. Se quiser voltar ao menu, envie MENU.';};
 const guestReply=async(cid,company,command,jid,key=cid)=>{
  const s=await settings(cid,key);if(!s.enabled)return null;
  const old=await store.get('wa-visitor-session',guestId(cid,jid,key),cid);if(old?.stopped&&Date.parse(old.until)>Date.now()){if(command!=='MENU')return null;await store.remove('wa-visitor-session',old.id,cid);}
  if(['1','RH','FALAR COM O RH'].includes(command)){await store.put('wa-visitor-session',cid,{until:new Date(Date.now()+86400000).toISOString()},guestId(cid,jid,key));return 'Recebemos seu pedido de atendimento ao RH. Aguarde uma pessoa da equipe responder por este WhatsApp.';}
  if(['3','ATENDIMENTO','OUTROS'].includes(command)){await store.put('wa-visitor-session',cid,{until:new Date(Date.now()+86400000).toISOString()},guestId(cid,jid,key));return 'Recebemos seu pedido de atendimento à empresa. Conte em uma mensagem como podemos ajudar. Uma pessoa da equipe continuará a conversa.';}
  const waiting=await store.get('wa-visitor-session',guestId(cid,jid,key),cid);if(waiting&&Date.parse(waiting.until)>Date.now()&&!['MENU','OI','OLA','OLÁ','INICIO'].includes(command))return null;
  return s.greeting.replaceAll('{empresa}',company.name)+'\n\n'+s.menu;
 };
 return {document,guestReply,guestStop,clear};
}
