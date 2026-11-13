import {fail,lookup,text,phone} from './security.js';
export function installServiceMenus({route,store,secret,admin,channels,assistants,gateway}){
 const id=key=>lookup(secret,'wa-service-menus',key),guestId=(cid,key,jid)=>lookup(secret,'wa-service-guest',cid,key,jid);
 const employeeDefaults=key=>[{label:'Meu ponto',action:'point'},{label:'Enviar atestado',action:'document'},{label:'Falar com a equipe',action:'human'},{label:'Conversar com a assistente',action:'assistant',assistantId:assistants.primaryId(key)}];
 const visitorDefaults=[{label:'Falar com o RH',action:'human'},{label:'Enviar atestado por um colaborador',action:'human'},{label:'Outros atendimentos',action:'human'}];
 const config=async(cid,key)=>{
  const stored=await store.get('wa-service-menus',id(key),cid),legacy=await store.get('wa-visitor-settings',lookup(secret,'wa-visitor-settings',key),cid),company=await store.get('company',cid,cid);
  return stored||{employee:{enabled:true,greeting:company.greeting||'Olá! Você está no atendimento da {empresa}.',items:employeeDefaults(key)},visitor:{enabled:legacy?.enabled!==false,greeting:legacy?.greeting||'Olá! Você está no atendimento da {empresa}.',items:visitorDefaults,autoChannels:true}};
 };
 const targets=async(cid,key)=>Promise.all((await channels.all(cid)).filter(c=>c.id!==key).map(async c=>{let s;try{s=await gateway?.status(c.id);}catch{}return {id:c.id,name:c.name,phone:String(s?.phone||'').replace(/\D/g,''),connected:s?.status==='connected'};}));
 const expanded=async(cid,key,kind,cfg)=>{
  const value=cfg[kind],items=[...value.items];if(kind==='visitor'&&value.autoChannels){for(const c of await targets(cid,key))if(c.phone&&c.connected&&!items.some(v=>v.action==='channel'&&v.channelId===c.id))items.push({label:'Falar com '+c.name,action:'channel',channelId:c.id});}return items.slice(0,20);
 };
 const render=async(cid,key,kind)=>{const c=await store.get('company',cid,cid),cfg=await config(cid,key),value=cfg[kind];if(!value.enabled)return {items:[],text:null};const items=await expanded(cid,key,kind,cfg);return {items,text:value.greeting.replaceAll('{empresa}',c.name)+'\n\nComo podemos ajudar?\n'+items.map((v,i)=>`${i+1} — ${v.label}`).join('\n')+(kind==='employee'?'\nVocê também pode pedir PONTO, ATESTADO ou DOCUMENTOS diretamente. MENU mostra estas opções.':'\nResponda o número da opção. MENU mostra estas opções novamente.')};};
 const keyFor=async req=>{const key=String(req.query.channelId||req.body?.channelId||req.user.companyId);await channels.owned(req.user.companyId,key);return key;};
 route('get','/admin/whatsapp/menus',admin,async(req,res)=>{const cid=req.user.companyId,key=await keyFor(req);res.json({...await config(cid,key),targets:await targets(cid,key),assistants:await assistants.list(cid,key)});});
 route('post','/admin/whatsapp/menus',admin,async(req,res)=>{
  const cid=req.user.companyId,key=await keyFor(req),value={};for(const kind of ['employee','visitor']){const b=req.body[kind];if(!b||!Array.isArray(b.items)||!b.items.length||b.items.length>12||kind==='employee'&&b.items.length!==4)throw fail(400,kind==='employee'?'O menu da equipe deve ter quatro opções.':'Use de 1 a 12 opções para visitantes.');
   const items=[];for(const item of b.items){if(!['point','document','human','channel','phone','assistant'].includes(item.action)||kind==='visitor'&&item.action==='point')throw fail(400,'Escolha uma ação permitida para este público.');const v={label:text(item.label,2,80),action:item.action};
    if(v.action==='channel'){const target=await channels.owned(cid,String(item.channelId||''));if(target.id===key)throw fail(400,'Escolha outro WhatsApp para encaminhar o contato.');v.channelId=target.id;}
    if(v.action==='phone')v.phone=phone(item.phone);
    if(v.action==='assistant'){const a=await assistants.resolveId(cid,String(item.assistantId||''));if(a.channelId!==key||a.audience!==(kind==='employee'?'employee':'external'))throw fail(400,'Escolha um assistente deste WhatsApp e do público correto.');v.assistantId=a.assistantId;}
    items.push(v);
   }if(kind==='employee'&&items[3].action!=='assistant')throw fail(400,'A quarta opção da equipe deve abrir a assistente interna.');value[kind]={enabled:b.enabled!==false,greeting:text(b.greeting,2,700),items,...(kind==='visitor'?{autoChannels:b.autoChannels===true}:{})};
  }await store.put('wa-service-menus',cid,value,id(key));res.json(value);
 });
 const selection=async(cid,key,message,kind,jid='',knownUser)=>{if(!/^\d{1,2}$/.test(message.trim()))return null;if(kind==='employee'){const employee=knownUser||await channels.member(cid,jid,key),state=employee&&await store.get('bot-state',lookup(secret,'bot-state',cid,employee.id,...(key===cid?[]:[key])),cid);if(state?.consentPending||Date.parse(state?.aiUntil)>Date.now())return null;}const cfg=await config(cid,key);if(!cfg[kind].enabled)return null;const items=await expanded(cid,key,kind,cfg);return items[Number(message)-1]||null;};
 const handoff=async(cid,key,jid)=>{await store.put('wa-service-guest',cid,{waiting:true,until:new Date(Date.now()+86400000).toISOString()},guestId(cid,key,jid));};
 const isWaiting=async(cid,key,jid)=>{const v=await store.get('wa-service-guest',guestId(cid,key,jid),cid);return !!(v?.waiting&&Date.parse(v.until)>Date.now());};
 const reset=async(cid,key,jid)=>store.remove('wa-service-guest',guestId(cid,key,jid),cid);
 const routeContact=async(cid,key,item)=>{let number=item.phone,label=item.label;if(item.action==='channel'){const target=await channels.owned(cid,item.channelId),s=await gateway?.status(target.id);number=String(s?.phone||'').replace(/\D/g,'');label=target.name;if(s?.status!=='connected'||!number)return 'Este setor ainda não conectou seu número. Uma pessoa da equipe continuará o atendimento por aqui.';}return 'Para conversar com '+label+', abra o WhatsApp deste setor:\nhttps://wa.me/'+number+'\nO histórico desta conversa não é enviado automaticamente para outro número.';};
 const guestReply=async(cid,company,message,jid,key=cid)=>{
  const command=message.trim().toUpperCase(),cfg=await config(cid,key);if(!cfg.visitor.enabled)return null;const gid=guestId(cid,key,jid),old=await store.get('wa-service-guest',gid,cid),state=old&&Date.parse(old.until)>Date.now()?old:null;
  if(['MENU','INICIO','INÍCIO'].includes(command)){await reset(cid,key,jid);const menu=await render(cid,key,'visitor');await store.put('wa-service-guest',cid,{shown:true,until:new Date(Date.now()+86400000).toISOString()},gid);return menu.text;}
  if(state?.stopped)return null;
  const explicitHuman=['RH','FALAR COM O RH','ATENDIMENTO HUMANO'].includes(command),item=explicitHuman?{action:'human'}:state?.assistantId||state?.consentPending?null:await selection(cid,key,command,'visitor');
  if(item){
   if(['human','document'].includes(item.action)){await handoff(cid,key,jid);return 'Recebemos seu pedido. Uma pessoa da equipe continuará o atendimento por este WhatsApp. Se o arquivo for de um colaborador, a equipe fará a conferência antes de colocá-lo na pasta.';}
   if(['channel','phone'].includes(item.action)){await handoff(cid,key,jid);return routeContact(cid,key,item);}
   if(item.action==='assistant'){const a=await assistants.configFor(cid,key,item.assistantId);if(!a.enabled||!a.apiKey)return 'Este assistente externo ainda não está disponível. Envie RH para falar com a equipe.';await store.put('wa-service-guest',cid,{assistantId:a.assistantId,consentPending:true,until:new Date(Date.now()+30*60000).toISOString()},gid);return 'Você escolheu '+a.botName+', uma IA de atendimento público. Suas mensagens serão enviadas ao provedor de IA configurado pela empresa. Não envie documentos pessoais. Para começar, envie ACEITO IA. MENU volta aos serviços; RH pede atendimento humano.';}
  }
  if(state?.consentPending){if(command==='ACEITO IA'){await store.put('wa-service-guest',cid,{...state,consentPending:false,consentAt:new Date().toISOString()},gid);return 'Tudo pronto. Como posso ajudar?';}return 'Para conversar com a IA, envie ACEITO IA. Se preferir uma pessoa, envie RH.';}
  if(state?.assistantId){try{const reply=await assistants.publicReply(cid,jid,key,state.assistantId,message);state.until=new Date(Date.now()+30*60000).toISOString();await store.put('wa-service-guest',cid,state,gid);return reply;}catch{return 'A assistente está indisponível agora. Envie RH para falar com a equipe ou MENU para ver os serviços.';}}
  if(state?.waiting)return null;
  if(!state?.shown){const menu=await render(cid,key,'visitor');await store.put('wa-service-guest',cid,{shown:true,until:new Date(Date.now()+86400000).toISOString()},gid);return menu.text;}
  return 'Responda o número da opção desejada ou envie RH para falar com uma pessoa. MENU mostra as opções novamente.';
 };
 const guestStop=async(cid,jid,key=cid)=>{await store.put('wa-service-guest',cid,{stopped:true,until:new Date(Date.now()+30*86400000).toISOString()},guestId(cid,key,jid));return 'Respostas automáticas desativadas. Envie MENU se quiser voltar aos serviços.';};
 return {config,render,selection,handoff,reset,isWaiting,routeContact,guestReply,guestStop};
}
