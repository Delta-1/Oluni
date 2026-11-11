import express from 'express';
import {randomUUID,randomBytes} from 'node:crypto';
import {fail,digest,token,lookup,day,text,profile,hashPassword,verifyPassword,limiter,publicUser,publicCompany} from './security.js';
import {companion} from './ai.js';
import {installAttendance,installPublicAttendance,resolveAccess,ensureEmployeeCode} from './attendance.js';
import {validMethod} from './workforce-policy.js';
import {createBadgeService,normalizeIdentityImage} from './badges.js';
import {serial as attendanceSerial} from './attendance.js';
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const validCode=v=>String(v||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
const reportSafe=r=>({id:r.id,category:r.category,title:r.title,body:r.body,status:r.status,day:r.day,reply:r.reply||'',anonymous:true});
const feedbackSafe=f=>({id:f.id,rating:f.rating,body:f.body,day:f.day,anonymous:f.anonymous,author:f.author||null});
export function createApp({store,secret,gateway=null,ai=companion,staticPath,publicAppUrl}){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
 app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(self), microphone=(), geolocation=(self)','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});if(req.path.startsWith('/api')){
  res.set('Cache-Control','no-store');
  const origin=req.get('origin'),host=req.get('x-forwarded-host')||req.get('host');
  const allowed=new Set(['https://delta-1.github.io','https://localhost','capacitor://localhost',...(process.env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean)]);
  if(origin){
   const sameOrigin=origin===`https://${host}`||(process.env.NODE_ENV!=='production'&&origin===`http://${host}`);
   if(!sameOrigin&&!allowed.has(origin))return res.status(403).json({error:'Origem não autorizada.'});
   res.vary('Origin');res.set({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'});
  }
  if(req.method==='OPTIONS')return res.sendStatus(204);
 }next();});
 app.use(express.json({limit:'8mb'}));app.use('/api',limiter(240));
 const route=(method,path,...handlers)=>app[method]('/api'+path,...handlers.map(h=>h.constructor.name==='AsyncFunction'?wrap(h):h));
 const auth=async(req,res,next)=>{const raw=String(req.get('authorization')||'').replace(/^Bearer /,'');if(!/^[\w-]{43}$/.test(raw))throw fail(401,'Entre na sua conta.');const session=await store.get('session',lookup(secret,'session',digest(raw)));if(!session||Date.parse(session.expiresAt)<Date.now())throw fail(401,'Sua sessão expirou. Entre novamente.');const user=await store.get('user',session.userId,session.companyId);if(!user||!user.active)throw fail(401,'Esta conta não está ativa.');req.user=user;req.sessionId=session.id;next();};
 const admin=(req,res,next)=>{if(req.user.role!=='admin')return res.status(403).json({error:'Acesso restrito ao RH administrador.'});next();};
 const settingsFor=cid=>store.get('settings',lookup(secret,'settings',cid),cid);
 const companyFor=async id=>{const c=await store.get('company',id,id);if(!c)throw fail(404,'Empresa não encontrada.');return c;};
 const issue=async(user,remember)=>{const raw=token(),id=lookup(secret,'session',digest(raw));await store.put('session',user.companyId,{userId:user.id,companyId:user.companyId,expiresAt:new Date(Date.now()+(remember?30*86400000:8*3600000)).toISOString()},id,true);return {token:raw,user:publicUser(user)};};
 route('get','/health',async(req,res)=>{const healthy=await store.health();res.status(healthy?200:503).json({service:'Oluni',version:'2.3.0',database:healthy});});
 const badges=createBadgeService({route,store,secret,companyFor,forUser:u=>ensureEmployeeCode(store,secret,u),publicAppUrl,serial:attendanceSerial});
 let attendance;
 const verification=installPublicAttendance({route,store,secret,gateway,limiter,companyFor,getAttendance:()=>attendance});
 const authLimit=limiter(20,900000);
 route('post','/auth/register',authLimit,async(req,res)=>{const p=profile(req.body),passwordHash=await hashPassword(req.body.password),id=lookup(secret,'email',p.email);if(await store.get('user',id))throw fail(409,'Não foi possível cadastrar. Se já tem uma conta, faça login.');const photo=req.body.photo?await normalizeIdentityImage(req.body.photo):null;const isAdmin=req.body.mode==='company';let c,codeId;
 if(isAdmin){const companyId='moodcorp:'+randomUUID(),code=randomBytes(5).toString('hex').toUpperCase();c={id:companyId,name:text(req.body.companyName,2,120),sector:text(req.body.sector||'Serviços',2,100),attendanceMethod:validMethod(req.body.attendanceMethod||'code'),code,createdAt:new Date().toISOString()};codeId=lookup(secret,'code',code);await store.put('company',companyId,c,companyId,true);try{await store.put('code',companyId,{companyId},codeId,true);}catch(e){await store.remove('company',companyId,companyId);throw e;}}
 else {c=await resolveAccess(store,secret,req.body.invite,'invite');}
 if(!isAdmin){p.departmentId=c.invitedDepartment?.id||null;p.department=c.invitedDepartment?.name||'Geral';}
 const user={...p,id,companyId:c.id,role:isAdmin?'admin':'employee',active:true,passwordHash,shareMood:false,aiConsent:false,whatsappConsent:false,createdAt:new Date().toISOString()};
 let photoId;try{photoId=await badges.addRegistrationPhoto(user,photo);await store.put('user',c.id,user,id,true);}catch(e){if(photoId)await store.remove('identity-image',photoId,c.id);if(isAdmin){await store.remove('code',codeId,c.id);await store.remove('company',c.id,c.id);}throw e;}
 res.status(201).json(await issue(await ensureEmployeeCode(store,secret,user),req.body.remember===true));});
 route('post','/auth/login',authLimit,async(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase(),u=await store.get('user',lookup(secret,'email',email));if(!await verifyPassword(req.body.password,u?.passwordHash)||!u?.active)throw fail(401,'E-mail ou senha incorretos.');res.json(await issue(await ensureEmployeeCode(store,secret,u),req.body.remember===true));});
 route('post','/reports/lookup',limiter(20,900000),async(req,res)=>{const capability=String(req.body.protocol||'').trim();if(!/^[\w-]{43}$/.test(capability))throw fail(404,'Protocolo não encontrado.');const r=await store.get('report',lookup(secret,'report',digest(capability)));if(!r)throw fail(404,'Protocolo não encontrado.');res.json(reportSafe(r));});
 app.use('/api',wrap(auth));
 badges.installAuthenticated(admin);
 route('post','/profile/whatsapp/request',async(req,res)=>{if(!gateway?.sendText||(await gateway.status(req.user.companyId)).status!=='connected')throw fail(409,'O RH precisa conectar o WhatsApp da empresa primeiro.');await verification.sendOTP('verify',req.user);res.json({ok:true});});
 route('post','/profile/whatsapp/verify',async(req,res)=>{await verification.consume('verify',req.user.email,req.body.code,async u=>{if((await store.list('user',u.companyId)).some(other=>other.id!==u.id&&other.whatsappJid===u.phone+'@s.whatsapp.net'))throw fail(409,'Este WhatsApp já está vinculado a outra conta. Procure o RH.');u.phoneVerified=true;u.whatsappConsent=true;u.whatsappJid=u.phone+'@s.whatsapp.net';await store.put('user',u.companyId,u,u.id);});res.json({ok:true});});
 route('post','/auth/logout',async(req,res)=>{await store.remove('session',req.sessionId,req.user.companyId);res.json({ok:true});});
 route('get','/bootstrap',async(req,res)=>{const u=await ensureEmployeeCode(store,secret,req.user),c=await companyFor(u.companyId);const own=await store.list('checkin',c.id,{owner:u.id,limit:400});const settings=await settingsFor(c.id);res.json({user:publicUser(u),company:publicCompany(c),checkins:own.sort((a,b)=>b.day.localeCompare(a.day)),aiAvailable:!!(settings?.enabled&&settings?.apiKey)});});
 route('patch','/profile',async(req,res)=>{const u={...req.user};for(const k of ['shareMood','aiConsent','whatsappConsent'])if(req.body[k]!==undefined)u[k]=req.body[k]===true;if(req.body.name)u.name=text(req.body.name,3,120);if(req.body.jobTitle)u.jobTitle=text(req.body.jobTitle,2,100);await store.put('user',u.companyId,u,u.id);res.json(publicUser(u));});
 route('post','/auth/password',async(req,res)=>{const u=req.user;if(!await verifyPassword(req.body.currentPassword,u.passwordHash))throw fail(400,'Senha atual incorreta.');u.passwordHash=await hashPassword(req.body.password);await store.put('user',u.companyId,u,u.id);for(const s of await store.list('session',u.companyId))if(s.userId===u.id&&s.id!==req.sessionId)await store.remove('session',s.id,u.companyId);res.json({ok:true});});
 route('post','/checkins',limiter(20,60000),async(req,res)=>{const mood=Number(req.body.mood);if(!Number.isInteger(mood)||mood<1||mood>5)throw fail(400,'Escolha como você está se sentindo.');const u=req.user,when=day(),id=lookup(secret,'checkin',u.id,when);const entry={owner:u.id,day:when,mood,note:text(req.body.note||'',0,1500),shared:req.body.shared===true,source:'app',at:new Date().toISOString()};await store.put('checkin',u.companyId,entry,id);res.json({...entry,id});});
 route('post','/feedback',limiter(5,60000),async(req,res)=>{const rating=Number(req.body.rating);if(!Number.isInteger(rating)||rating<1||rating>5)throw fail(400,'Escolha uma avaliação de 1 a 5.');const anonymous=req.body.anonymous!==false;await store.put('feedback',req.user.companyId,{body:text(req.body.body,10,4000),rating,anonymous,day:day(),...(!anonymous?{author:req.user.name}:{})});res.status(201).json({ok:true});});
 route('post','/reports',limiter(5,60000),async(req,res)=>{const category=text(req.body.category,2,80);if(!['Assédio','Discriminação','Segurança','Conduta','Outro'].includes(category))throw fail(400,'Selecione a categoria.');const capability=token();await store.put('report',req.user.companyId,{title:text(req.body.title,5,160),body:text(req.body.body,20,8000),category,status:'recebida',day:day(),reply:''},lookup(secret,'report',digest(capability)),true);res.status(201).json({protocol:capability});});
 route('get','/chat',async(req,res)=>{const messages=await store.list('chat',req.user.companyId,{owner:req.user.id,limit:200});res.json(messages.sort((a,b)=>a.at.localeCompare(b.at)).map(m=>({id:m.id,role:m.role,text:m.text,at:m.at})));});
 const chatQueues=new Map();
 const serial=async(key,fn)=>{const old=chatQueues.get(key)||Promise.resolve();const next=old.catch(()=>{}).then(fn);chatQueues.set(key,next);try{return await next;}finally{if(chatQueues.get(key)===next)chatQueues.delete(key);}};
 const reply=async(user,message,source='app')=>serial(user.id,async()=>{const fresh=await store.get('user',user.id,user.companyId);if(!fresh?.aiConsent||!fresh.active)throw fail(403,'Autorize o uso da IA em Meu perfil antes de conversar.');const settings=await settingsFor(user.companyId);const history=(await store.list('chat',user.companyId,{owner:user.id,limit:40})).sort((a,b)=>a.at.localeCompare(b.at));const result=await ai(settings,[...history,{role:'user',text:message}]);const current=await store.get('user',user.id,user.companyId);if(!current?.active||!current.aiConsent)throw fail(403,'O consentimento para IA foi desativado.');await store.put('chat',user.companyId,{owner:user.id,role:'user',text:message,at:new Date().toISOString(),source});const saved=await store.put('chat',user.companyId,{owner:user.id,role:'assistant',text:result,at:new Date(Date.now()+1).toISOString(),source});return {id:saved.id,role:'assistant',text:result,at:saved.at};});
 route('post','/chat',limiter(12,60000),async(req,res)=>res.json(await reply(req.user,text(req.body.text,1,4000))));
 route('delete','/chat',async(req,res)=>serial(req.user.id,async()=>{for(const m of await store.list('chat',req.user.companyId,{owner:req.user.id}))await store.remove('chat',m.id,req.user.companyId);res.json({ok:true});}));
 route('post','/whatsapp/link',limiter(5,60000),async(req,res)=>{if(!req.user.whatsappConsent)throw fail(403,'Ative o atendimento por WhatsApp no seu perfil.');const code=randomBytes(6).toString('hex').toUpperCase();await store.put('wa-link',req.user.companyId,{userId:req.user.id,expiresAt:new Date(Date.now()+600000).toISOString()},lookup(secret,'wa-link',req.user.companyId,code),true);res.json({code,expiresIn:600});});
 route('get','/admin/overview',admin,async(req,res)=>{const cid=req.user.companyId,[users,checkins,feedback,reports]=await Promise.all(['user','checkin','feedback','report'].map(k=>store.list(k,cid)));const active=users.filter(u=>u.active);const recent=checkins.filter(c=>c.day>=day(new Date(Date.now()-6*86400000))&&c.shared&&active.some(u=>u.id===c.owner&&u.shareMood));const today=recent.filter(c=>c.day===day());const employees=active.map(u=>{const list=recent.filter(c=>c.owner===u.id).sort((a,b)=>b.day.localeCompare(a.day));return {...publicUser(u),mood:list[0]?{mood:list[0].mood,day:list[0].day}:null};});res.json({employees,stats:{employees:active.filter(u=>u.role==='employee').length,participation:today.length,average:today.length?today.reduce((sum,c)=>sum+c.mood,0)/today.length:null,openReports:reports.filter(r=>r.status!=='resolvida').length},trend:Array.from({length:7},(_,i)=>{const d=day(new Date(Date.now()-(6-i)*86400000)),list=recent.filter(c=>c.day===d);return {day:d,average:list.length?list.reduce((n,c)=>n+c.mood,0)/list.length:null,count:list.length};}),distribution:[1,2,3,4,5].map(mood=>({mood,count:today.filter(c=>c.mood===mood).length})),feedback:feedback.map(feedbackSafe),reports:reports.map(reportSafe)});});
 route('patch','/admin/employees/:id',admin,async(req,res)=>{const target=await store.get('user',req.params.id,req.user.companyId);if(!target||target.role==='admin')throw fail(404,'Colaborador não encontrado.');target.active=req.body.active===true;await store.put('user',target.companyId,target,target.id);if(!target.active)for(const s of await store.list('session',target.companyId))if(s.userId===target.id)await store.remove('session',s.id,target.companyId);res.json({ok:true});});
 route('get','/admin/employees',admin,async(req,res)=>res.json((await store.list('user',req.user.companyId)).map(publicUser)));
 route('post','/admin/company/code',admin,async(req,res)=>{const c=await companyFor(req.user.companyId),old=c.code;c.code=randomBytes(5).toString('hex').toUpperCase();await store.put('code',c.id,{companyId:c.id},lookup(secret,'code',c.code),true);try{await store.put('company',c.id,c,c.id);}catch(e){await store.remove('code',lookup(secret,'code',c.code),c.id);throw e;}await store.remove('code',lookup(secret,'code',old),c.id);res.json(publicCompany(c));});
 route('patch','/admin/reports/:id',admin,async(req,res)=>{const r=await store.get('report',req.params.id,req.user.companyId);if(!r)throw fail(404,'Relato não encontrado.');if(!['recebida','em_analise','resolvida'].includes(req.body.status))throw fail(400,'Status inválido.');r.status=req.body.status;r.reply=text(req.body.reply||'',0,4000);await store.put('report',req.user.companyId,r,r.id);res.json(reportSafe(r));});
 const safeSettings=s=>({provider:s?.provider||'gemini',model:s?.model||'gemini-2.5-flash',enabled:!!s?.enabled,hasKey:!!s?.apiKey});
 route('get','/admin/settings',admin,async(req,res)=>res.json(safeSettings(await settingsFor(req.user.companyId))));
 route('post','/admin/settings',admin,async(req,res)=>{const cid=req.user.companyId,old=await settingsFor(cid)||{};const s={...old,provider:req.body.provider==='openai'?'openai':'gemini',model:text(req.body.model,2,120),enabled:req.body.enabled===true};if(req.body.apiKey)s.apiKey=text(req.body.apiKey,10,500);if(req.body.removeKey===true)delete s.apiKey;if(s.enabled&&!s.apiKey)throw fail(400,'Adicione a chave de API para ativar a IA.');await store.put('settings',cid,s,lookup(secret,'settings',cid));res.json(safeSettings(s));});
 route('post','/admin/settings/test',admin,limiter(5,60000),async(req,res)=>{const s=await settingsFor(req.user.companyId);res.json({reply:await ai({...s,enabled:true},[{role:'user',text:'Olá! Como funciona o apoio de escuta?'}])});});
 route('get','/admin/whatsapp',admin,async(req,res)=>{if(!gateway)throw fail(503,'Integração indisponível.');res.json(await gateway.status(req.user.companyId));});
 route('post','/admin/whatsapp/connect',admin,async(req,res)=>{if(!gateway)throw fail(503,'Integração indisponível.');await gateway.connect(req.user.companyId);res.json({ok:true});});
 route('post','/admin/whatsapp/disconnect',admin,async(req,res)=>{if(!gateway)throw fail(503,'Integração indisponível.');await gateway.disconnect(req.user.companyId);res.json({ok:true});});
 route('post','/admin/whatsapp/reset-start',admin,async(req,res)=>{await gateway.resetStart(req.user.companyId);res.json({ok:true});});
 attendance=installAttendance({route,store,secret,admin,companyFor,gateway,reply});
 if(gateway)gateway.canReceiveFile=async(cid,jid)=>(await store.list('user',cid)).some(u=>u.active&&u.whatsappConsent&&u.whatsappJid===jid);
 if(gateway)gateway.onMessage=async(cid,jid,message,attachment=null)=>{
  const users=await store.list('user',cid);
  let u=users.find(u=>u.active&&u.whatsappJid===jid&&u.whatsappConsent);
  const link=/^VINCULAR\s+([A-F0-9]{12})$/i.exec(message.trim());
  if(link){
   const id=lookup(secret,'wa-link',cid,link[1].toUpperCase()),entry=await store.get('wa-link',id,cid);
   if(!entry||Date.parse(entry.expiresAt)<Date.now())return null;
   const target=await store.get('user',entry.userId,cid);
   if(!target?.active||!target.whatsappConsent)return null;
   if(users.some(other=>other.id!==target.id&&other.whatsappJid===jid))return 'Este WhatsApp já está vinculado a outra conta. Procure o RH.';
   target.whatsappJid=jid;
   if(jid===target.phone+'@s.whatsapp.net')target.phoneVerified=true;
   await store.put('user',cid,target,target.id);await store.remove('wa-link',id,cid);
   return 'Seu WhatsApp foi vinculado ao Oluni. Envie MENU para começar. Para registrar humor, envie HUMOR e um número de 1 a 5. Envie PARAR para encerrar.';
  }
  if(!u)return null;
  if(/^(PARAR|SAIR|STOP)$/i.test(message.trim())){u.whatsappConsent=false;await store.put('user',cid,u,u.id);return 'Atendimento por WhatsApp desativado. Você pode reativar pelo perfil no Oluni.';}
  const c=await companyFor(cid),settings=(await attendance.mine(u)).settings;
  if(attachment){
   try{await attendance.saveDocument(u,attachment,'whatsapp');return 'Recebemos seu documento e colocamos na sua pasta. O RH fará a análise. Você pode acompanhar pelo aplicativo.';}
   catch(e){return e.status?e.message:'Não foi possível salvar o documento agora. Tente pelo aplicativo.';}
  }
  const command=message.trim().toUpperCase();
  if(['1','PONTO','MEU PONTO'].includes(command)){
   const state=await attendance.mine(u);
   const labels={entry:'Entrada',break_start:'Início do intervalo',break_end:'Fim do intervalo',exit:'Saída'};
   return 'Seu ponto de '+state.shiftDay+':\n'+(state.entries.map(e=>labels[e.event]+' — '+new Date(e.at).toLocaleTimeString('pt-BR',{timeZone:settings.timezone})).join('\n')||'Nenhum registro hoje.')+'\nPara bater o ponto, abra o aplicativo ou use o totem da empresa.';
  }
  if(['2','ATESTADO','ENVIAR ATESTADO'].includes(command))return 'Envie seu atestado como PDF, JPG ou PNG, com até 5 MB. Ele será salvo na sua pasta para o RH analisar. Não é necessário informar sua senha.';
  if(['3','RH','FALAR COM O RH'].includes(command)){await store.put('hr-request',cid,{owner:u.id,text:'Solicitou atendimento pelo WhatsApp',at:new Date().toISOString(),status:'pending'});return 'Sua solicitação foi encaminhada ao RH. A equipe poderá responder por este WhatsApp.';}
  const mood=/^HUMOR\s+([1-5])$/i.exec(message.trim());
  if(mood){await store.put('checkin',cid,{owner:u.id,day:day(),mood:Number(mood[1]),note:'',shared:u.shareMood===true,source:'whatsapp',at:new Date().toISOString()},lookup(secret,'checkin',u.id,day()));return 'Seu humor foi registrado conforme suas preferências de compartilhamento.';}
  const stateId=lookup(secret,'bot-state',cid,u.id);
  if(['MENU','INICIO','INÍCIO','OI','OLA','OLÁ'].includes(command)){await store.remove('bot-state',stateId,cid);return settings.greeting+'\n\n'+settings.menu;}
  if(command==='4'){await store.put('bot-state',cid,{owner:u.id,aiUntil:new Date(Date.now()+15*60000).toISOString()},stateId);return 'Envie sua mensagem para a assistente. A IA precisa estar ativada pelo RH e autorizada no seu perfil. Envie MENU para voltar.';}
  const state=await store.get('bot-state',stateId,cid);
  if(state?.aiUntil&&Date.parse(state.aiUntil)>Date.now()){
   if(!u.aiConsent)return 'Autorize a IA no seu perfil para conversar. Envie MENU para voltar aos serviços.';
   try{return (await reply(u,message,'whatsapp')).text;}catch{return 'A assistente está indisponível. Envie MENU para continuar com os serviços automáticos.';}
  }
  return settings.greeting+'\n\n'+settings.menu;
 };

 if(staticPath){
  app.use(express.static(staticPath,{maxAge:0,index:'index.html',setHeaders(res,path){res.setHeader('Cache-Control',path.endsWith('.html')?'no-store, max-age=0':path.includes('/assets/')?'public, max-age=31536000, immutable':'no-cache');}}));
  app.get('*',(req,res)=>{
   res.set('Cache-Control','no-store, max-age=0');
   // An obsolete script must never be served index.html with HTTP 200. Cached
   // HTML from a previous release otherwise produces a blank page (MIME error).
   if(req.path.startsWith('/api')||req.path.startsWith('/assets/')||/\.[a-z0-9]+$/i.test(req.path))return res.status(404).json({error:'Arquivo não encontrado. Atualize a página para carregar a versão atual.'});
   res.sendFile(staticPath+'/index.html');
  });
 }
 app.use((error,req,res,next)=>{if(res.headersSent)return next(error);res.status(error.status||500).json({error:error.status?error.message:'Ocorreu uma falha. Tente novamente.'});});
 return app;
}
