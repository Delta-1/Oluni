import {fail,lookup,text} from './security.js';
import {serial} from './attendance.js';
import {whatsappWellbeingAssistant} from './ai.js';
export const wellbeingDefaults={enabled:false,mode:'scheduled',time:'10:00',windowStart:'10:00',windowEnd:'16:00',weekdays:[1,2,3,4,5],intervalDays:3,opening:'Como você está se sentindo no trabalho hoje? Se quiser, podemos conversar sobre seu dia.'};
const minutes=v=>Number(v.slice(0,2))*60+Number(v.slice(3));
export function localMoment(now,timezone){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));const date=`${p.year}-${p.month}-${p.day}`;return {date,minute:Number(p.hour)*60+Number(p.minute),weekday:new Date(date+'T12:00:00Z').getUTCDay()};}
export function installWellbeing({route,store,secret,admin,gateway,configFor,channels,ai=whatsappWellbeingAssistant,threadFor}){
 const configId=cid=>lookup(secret,'wa-wellbeing-settings',cid),sessionId=(cid,uid,key=cid)=>lookup(secret,'wa-wellbeing-session',cid,uid,...(key===cid?[]:[key])),historyId=(cid,uid,key=cid)=>lookup(secret,'wa-wellbeing-chat',cid,uid,...(key===cid?[]:[key]));
 const config=async cid=>({...wellbeingDefaults,...await store.get('wa-wellbeing-settings',configId(cid),cid)});
 const eligible=u=>u.active&&(u.phone||u.whatsappJid)&&u.whatsappConsent&&u.wellbeingWhatsappConsent;
 const active=async(cid,uid,key=cid)=>{const s=await store.get('wa-wellbeing-session',sessionId(cid,uid,key),cid);return s&&Date.parse(s.until)>Date.now();};
 const stop=async(cid,uid,key)=>{if(key){await Promise.all([store.remove('wa-wellbeing-session',sessionId(cid,uid,key),cid),store.remove('wa-wellbeing-chat',historyId(cid,uid,key),cid)]);}else for(const kind of ['wa-wellbeing-session','wa-wellbeing-chat'])for(const row of await store.list(kind,cid,{owner:uid}))await store.remove(kind,row.id,cid);};
 const open=async(cid,uid,key=cid)=>store.put('wa-wellbeing-session',cid,{owner:uid,channelId:key,until:new Date(Date.now()+24*3600000).toISOString()},sessionId(cid,uid,key));
 const disclosure='Sou um bot do Oluni. Participar é opcional. Para registrar humor, envie HUMOR 1 (muito mal) a HUMOR 5 (muito bem). O RH vê somente o humor que você autorizar. Esta conversa fica fora da caixa de atendimento, mas quem acessa o WhatsApp conectado pode ler as mensagens no aparelho. MENU volta aos serviços; PARAR BEM-ESTAR desativa os convites.';
 const opening=async cid=>(await config(cid)).opening+'\n\n'+disclosure;
 route('get','/admin/whatsapp/wellbeing',admin,async(req,res)=>{
  const cid=req.user.companyId,settings=await config(cid),users=await store.list('user',cid),jobs=await store.list('wa-wellbeing-delivery',cid,{limit:500});const c=await store.get('company',cid,cid);
  res.json({settings:{...settings,id:undefined},timezone:c?.timezone||'America/Rio_Branco',eligible:users.filter(eligible).length,preview:await opening(cid),deliveries:jobs.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,30).map(j=>({at:j.at,status:j.status,day:j.day})),privacy:'As conversas de bem-estar não aparecem na caixa de atendimento. O WhatsApp conectado e o provedor de IA têm acesso às mensagens. Nenhuma avaliação clínica é gerada para o RH.'});
 });
 route('post','/admin/whatsapp/wellbeing',admin,async(req,res)=>{
  const b=req.body;if(!['scheduled','automatic'].includes(b.mode))throw fail(400,'Escolha o modo dos convites.');
  for(const k of ['time','windowStart','windowEnd'])if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(b[k]||''))throw fail(400,'Informe horários válidos.');
  if(minutes(b.windowEnd)<=minutes(b.windowStart))throw fail(400,'O fim da janela deve ser depois do início.');
  if(!Array.isArray(b.weekdays)||!b.weekdays.length||b.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))throw fail(400,'Escolha os dias da semana.');
  if(!Number.isInteger(b.intervalDays)||b.intervalDays<1||b.intervalDays>30)throw fail(400,'Use intervalo de 1 a 30 dias.');
  const value={enabled:b.enabled===true,mode:b.mode,time:b.time,windowStart:b.windowStart,windowEnd:b.windowEnd,weekdays:[...new Set(b.weekdays)],intervalDays:b.intervalDays,opening:text(b.opening,10,600)};
  await store.put('wa-wellbeing-settings',req.user.companyId,value,configId(req.user.companyId));res.json(value);
 });
 route('get','/wellbeing/whatsapp',async(req,res)=>{const cid=req.user.companyId;const key=channels?await channels.connectionFor(req.user):cid,h=await store.get('wa-wellbeing-chat',historyId(cid,req.user.id,key),cid);res.json({messages:h?.messages||[],active:!!await active(cid,req.user.id,key)});});
 route('delete','/wellbeing/whatsapp',async(req,res)=>{await stop(req.user.companyId,req.user.id);res.json({ok:true});});
 const receive=async(u,message,attachment,key=u?.companyId)=>{
  if(!u)return {handled:false};const cid=u.companyId,command=message.trim().toUpperCase();
  if(['PARAR BEM-ESTAR','PARAR BEM ESTAR'].includes(command)){const fresh=await store.get('user',u.id,cid);fresh.wellbeingWhatsappConsent=false;await store.put('user',cid,fresh,u.id);await stop(cid,u.id,key);return {handled:true,reply:'Convites de bem-estar desativados. Os serviços da empresa continuam disponíveis. Você pode reativar no perfil.'};}
  const inSession=await active(cid,u.id,key),start=['BEM-ESTAR','BEM ESTAR','CONVERSAR'].includes(command);
  if(['MENU','INICIO','INÍCIO','1','PONTO','MEU PONTO','2','ATESTADO','ENVIAR ATESTADO','3','4','DOCUMENTOS','PENDÊNCIAS','RH','FALAR COM O RH','PARAR','SAIR','STOP'].includes(command)){if(inSession)await stop(cid,u.id,key);return {handled:false};}
  if(/^HUMOR\s+[1-5]$/.test(command))return {handled:false,private:true};
  if(!start&&!inSession)return {handled:false};
  if(!eligible(u)){await stop(cid,u.id,key);return {handled:true,reply:'Autorize os convites de bem-estar no perfil para participar pelo número cadastrado. MENU abre os serviços da empresa.'};}
  const settings=await config(cid);if(!settings.enabled){await stop(cid,u.id,key);return {handled:true,reply:'A conversa de bem-estar pelo WhatsApp está desativada pela empresa. Seu check-in continua no aplicativo. Envie MENU para os serviços.'};}
  if(attachment)return {handled:true,reply:'Nesta conversa de bem-estar uso apenas texto. Para enviar documentos ao RH, envie ATESTADO antes do arquivo. MENU abre os serviços.'};
  if(start){await open(cid,u.id,key);return {handled:true,reply:await opening(cid)};}
  return serial('wa-wellbeing:'+cid+':'+u.id,async()=>{
   const fresh=await store.get('user',u.id,cid),aiConfig=await configFor(cid,key);
   if(!eligible(fresh)||!await active(cid,u.id,key))return {handled:true,reply:null};
   if(!fresh.aiConsent||!aiConfig.enabled||!aiConfig.apiKey)return {handled:true,reply:'Você pode registrar como se sente com HUMOR 1 a HUMOR 5. Para uma conversa com IA, autorize os assistentes no perfil e peça ao RH para ativar a chave. MENU volta aos serviços.'};
   const id=historyId(cid,u.id,key),old=await store.get('wa-wellbeing-chat',id,cid),history=old&&Date.parse(old.until)>Date.now()?old.messages:[];
   const messages=[...history,{role:'user',text:text(message,1,4000)}].slice(-15);
   let answer;try{answer=await ai(aiConfig,messages);}catch{return {handled:true,reply:'Não consegui conversar agora. Você pode registrar HUMOR de 1 a 5 ou enviar MENU para os serviços.'};}
   const after=await store.get('user',u.id,cid),updated=await config(cid),updatedAI=await configFor(cid,key);
   if(!eligible(after)||!after.aiConsent||!updated.enabled||!updatedAI.enabled||!await active(cid,u.id,key))return {handled:true,reply:null};
   await store.put('wa-wellbeing-chat',cid,{owner:u.id,channelId:key,messages:[...messages,{role:'assistant',text:answer}].slice(-16),until:new Date(Date.now()+24*3600000).toISOString()},id);
   await open(cid,u.id,key);return {handled:true,reply:answer};
  });
 };
 let running=false,timer;
 const tick=async(now=new Date())=>{
  if(running||!gateway)return;running=true;
  try{const companies=await store.list('company');for(const saved of await store.list('wa-wellbeing-settings')){
   const company=companies.find(c=>configId(c.id)===saved.id);if(!company)continue;
   const companyId=company.id,s=await config(companyId);if(!s.enabled)continue;
   const local=localMoment(now,company.timezone||'America/Rio_Branco');if(!s.weekdays.includes(local.weekday))continue;
   const users=await store.list('user',companyId);let sent=0;
   for(const user of users.filter(eligible)){
    const key=channels?await channels.connectionFor(user):companyId,jid=user.whatsappJid||user.phone+'@s.whatsapp.net';if((await gateway.status(key)).status!=='connected')continue;
    if(sent>=30)break;const target=s.mode==='scheduled'?minutes(s.time):minutes(s.windowStart)+(parseInt(lookup(secret,'wellbeing-minute',user.id,local.date).slice(-8),16)%(minutes(s.windowEnd)-minutes(s.windowStart)));
    if(local.minute<target||local.minute>target+30||(s.mode==='automatic'&&local.minute>minutes(s.windowEnd)))continue;
    await serial('wa-wellbeing-send:'+companyId+':'+user.id,async()=>{
     const id=lookup(secret,'wa-wellbeing-delivery',companyId,user.id,local.date);if(await store.get('wa-wellbeing-delivery',id,companyId))return;
     const jobs=await store.list('wa-wellbeing-delivery',companyId,{owner:user.id,limit:60});if(jobs.some(j=>['sent','sending','uncertain'].includes(j.status)&&Math.floor((Date.parse(local.date+'T12:00Z')-Date.parse(j.day+'T12:00Z'))/86400000)<s.intervalDays))return;
     if(await active(companyId,user.id,key))return;
     const thread=await threadFor(companyId,jid,key);if(thread?.botPaused&&thread.status!=='closed')return;
     const fresh=await store.get('user',user.id,companyId);if(!eligible(fresh)||!(await config(companyId)).enabled)return;
     const job={owner:user.id,day:local.date,at:now.toISOString(),status:'sending'};
     try{await store.put('wa-wellbeing-delivery',companyId,job,id,true);}catch(e){if(e.status===409)return;throw e;}
     // Durable reservation comes first. An uncertain delivery is not retried automatically.
     try{await open(companyId,user.id,key);await gateway.sendText(key,jid,await opening(companyId));job.status='sent';sent++;}
     catch{job.status='uncertain';await stop(companyId,user.id,key);}
     await store.put('wa-wellbeing-delivery',companyId,job,id);
    });
   }
  }}finally{running=false;}
 };
 return {receive,active,stop,tick,opening,start(){if(timer)return;timer=setInterval(()=>tick().catch(()=>console.error('Oluni: envio de bem-estar pendente.')),60000);timer.unref();tick().catch(()=>{});},close(){clearInterval(timer);timer=null;}};
}
