import {createHmac, randomInt, timingSafeEqual} from 'node:crypto';
import {fail, lookup, digest, text, publicUser, hashPassword, token} from './security.js';
import {allocateEmployeeCode,methodFor,validMethod} from './workforce-policy.js';
import {installWorkforce} from './workforce.js';

// Keep the same event order as Oluni/mobile/src/clock-flow.ts.
export const events = ['entry', 'break_start', 'break_end', 'exit'];
export const eventLabels = {presence:'Presença',entry:'Entrada', break_start:'Início do intervalo', break_end:'Fim do intervalo', exit:'Saída'};
const queues = new Map();
export async function serial(key, fn) {
  const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(fn);
  queues.set(key, next);
  try { return await next; } finally { if (queues.get(key) === next) queues.delete(key); }
}
export function localDay(date = new Date(), timezone = 'America/Rio_Branco') {
  return new Intl.DateTimeFormat('en-CA', {timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
}
export function companySettings(c) {
  return {timezone:c.timezone || 'America/Rio_Branco', dailyMinutes:c.dailyMinutes ?? 480,
    greeting:c.greeting || 'Olá! Você está no atendimento da empresa.',
    menu:c.menu || 'Como posso ajudar?\n1 — Meu ponto\n2 — Enviar atestado\n3 — Falar com o RH\n4 — Conversar com a assistente',
    weekdays:c.weekdays || [1,2,3,4,5], inviteVersion:c.inviteVersion || 1, totemVersion:c.totemVersion || 1, attendanceMethod:c.attendanceMethod||'code', locationRequired:c.locationRequired===true, attendanceMode:c.attendanceMode||'journey', allowOwnTasks:c.allowOwnTasks===true};
}
export function accessToken(secret, company, kind, departmentId=null) {
  const settings = companySettings(company);
  const payload = Buffer.from(JSON.stringify({cid:company.id, kind, ...(kind==='invite'&&departmentId?{did:departmentId}:{}), v:kind==='invite'?settings.inviteVersion:settings.totemVersion, exp:Date.now()+180*86400000})).toString('base64url');
  return payload+'.'+createHmac('sha256',secret).update('pontonorte:'+payload).digest('base64url');
}
export async function resolveAccess(store,secret,raw,kind) {
  if (typeof raw !== 'string' || raw.length>1000) throw fail(400,'Peça um novo link ao RH.');
  const [payload, signature, extra] = raw.split('.');
  const expected = createHmac('sha256',secret).update('pontonorte:'+(payload||'')).digest();
  const supplied = Buffer.from(signature||'','base64url');
  if (extra || supplied.length!==expected.length || !timingSafeEqual(expected,supplied)) throw fail(400,'Este link não é válido. Peça outro ao RH.');
  let data; try { data=JSON.parse(Buffer.from(payload,'base64url')); } catch { throw fail(400,'Link inválido.'); }
  if (data.kind!==kind || !Number.isFinite(data.exp) || data.exp<Date.now()) throw fail(400,'Este link expirou. Peça outro ao RH.');
  const company=await store.get('company',data.cid,data.cid);
  if (!company || data.v!==(kind==='invite'?companySettings(company).inviteVersion:companySettings(company).totemVersion)) throw fail(400,'Este link foi desativado. Peça outro ao RH.');
  if(kind==='invite'&&data.did){const d=await store.get('department',data.did,company.id);if(!d||d.active===false)throw fail(400,'O setor deste convite não está disponível. Peça um novo link ao RH.');return {...company,invitedDepartment:{id:d.id,name:d.name}};}
  return company;
}
export async function ensureEmployeeCode(store,secret,user) { return allocateEmployeeCode(store,secret,user,serial); }
export function summarize(entries,company,from,to,users=[]) {
  const settings=companySettings(company), grouped=new Map();
  for(const e of entries) {
    if(e.day<from||e.day>to)continue;
    const key=e.owner+':'+e.day;
    if(!grouped.has(key))grouped.set(key,{owner:e.owner,day:e.day,entries:[]});
    grouped.get(key).entries.push(e);
  }
  return [...grouped.values()].map(row=>{
    row.entries.sort((a,b)=>a.at.localeCompare(b.at));
    let seconds=0;
    for(const [start,end]of [['entry','break_start'],['break_end','exit']]) {
      const a=row.entries.find(e=>e.event===start), b=row.entries.find(e=>e.event===end);
      if(a&&b)seconds+=Math.max(0,(Date.parse(b.at)-Date.parse(a.at))/1000);
    }
    const presence=row.entries.some(e=>e.event==='presence'),complete=presence||row.entries.length===4, workedMinutes=Math.floor(seconds/60);
    const weekday=new Date(row.day+'T12:00:00Z').getUTCDay(), expected=settings.weekdays.includes(weekday)?settings.dailyMinutes:0;
    const user=users.find(u=>u.id===row.owner);
    return {...row,name:user?.name||'',department:user?.department||'',departmentId:user?.departmentId||null,employeeCode:user?.employeeCode||'',workedMinutes,complete,presence,
      expectedMinutes:expected,balanceMinutes:complete&&!presence?workedMinutes-expected:null};
  }).sort((a,b)=>b.day.localeCompare(a.day)||a.name.localeCompare(b.name));
}
export function installAttendance({route,store,secret,admin,companyFor,gateway,peoplePermissions,connectionFor=async u=>u.companyId,reply}) {
  const forUser=async u=>ensureEmployeeCode(store,secret,u);
  const mine=async(user)=>{
    const c=await companyFor(user.companyId), today=localDay(new Date(),companySettings(c).timezone);
    const all=(await store.list('clock-event',user.companyId,{owner:user.id,limit:3000})).sort((a,b)=>a.at.localeCompare(b.at));
    const recent=all.at(-1);
    const ongoing=recent&&!['exit','presence'].includes(recent.event)&&Date.now()-Date.parse(recent.at)<20*3600000;
    const shiftDay=ongoing?recent.day:today;
    const current=all.filter(e=>e.day===shiftDay), userWithCode=await forUser(user);
    return {user:publicUser(userWithCode),today,shiftDay,entries:current,nextEvent:(['qr','checklist'].includes(methodFor(userWithCode,c))||c.attendanceMode==='presence')?(current.length?null:'presence'):(events[current.length]||null),
      history:summarize(all,c,'1900-01-01','2999-12-31'),settings:companySettings(c),method:methodFor(userWithCode,c),presenceOnly:['qr','checklist'].includes(methodFor(userWithCode,c))||c.attendanceMode==='presence'};
  };
  const punch=async(user,body,source='online')=>serial('punch:'+user.id,async()=>{
    const requestId=text(body.requestId,16,100);
    if(!/^[\w-]+$/.test(requestId))throw fail(400,'Identificador de registro inválido.');
    const previous=(await store.list('clock-event',user.companyId,{owner:user.id,limit:3000})).find(e=>e.requestId===requestId);
    if(previous)return {entry:previous,...await mine(user)};
    const state=await mine(user);
    if(!state.nextEvent)throw fail(409,'Sua jornada de hoje já está completa.');
    if(body.event!==state.nextEvent)throw fail(409,'Seu ponto mudou. Atualize a tela antes de registrar.');
    const last=state.entries.at(-1);
    if(last&&Date.now()-Date.parse(last.at)<30000)throw fail(409,'Ponto já registrado. Aguarde 30 segundos antes do próximo.');
    const c=await companyFor(user.companyId),proof=await workforce.validatePunch(user,c,body,source);
    const entry={...proof,departmentId:user.departmentId||null,department:user.department||'Geral',owner:user.id,day:state.shiftDay,event:state.nextEvent,at:new Date().toISOString(),source,requestId};
    // A fixed slot is also a database-level guard against simultaneous requests.
    const id=lookup(secret,'clock-event',user.companyId,user.id,state.shiftDay,state.entries.length);
    await store.put('clock-event',user.companyId,entry,id,true);
    return {entry:{...entry,id},...await mine(user)};
  });
  const workforce=installWorkforce({route,store,secret,admin,companyFor,serial,forUser});
  route('get','/attendance/mine',async(req,res)=>res.json(await mine(req.user)));
  route('post','/attendance/punch',async(req,res)=>res.status(201).json(await punch(req.user,req.body)));
  route('get','/admin/access',admin,async(req,res)=>{
    const c=await companyFor(req.user.companyId);
    const departmentId=String(req.query.departmentId||'');if(departmentId){const d=await store.get('department',departmentId,c.id);if(!d||d.active===false)throw fail(400,'Escolha um setor ativo.');}
    res.json({invite:accessToken(secret,c,'invite',departmentId||null),totem:accessToken(secret,c,'totem'),departmentId:departmentId||null});
  });
  route('post','/admin/access/revoke',admin,async(req,res)=>{
    if(!['invite','totem'].includes(req.body.kind))throw fail(400,'Escolha o link que deseja renovar.');
    const c=await companyFor(req.user.companyId),s=companySettings(c),key=req.body.kind==='invite'?'inviteVersion':'totemVersion';
    c[key]=s[key]+1;await store.put('company',c.id,c,c.id);res.json({ok:true});
  });
  route('get','/admin/attendance',admin,async(req,res)=>{
    const c=await companyFor(req.user.companyId),today=localDay(new Date(),companySettings(c).timezone);
    const from=String(req.query.from||today.slice(0,8)+'01'),to=String(req.query.to||today);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw fail(400,'Confira o período do relatório.');
    const users=(await store.list('user',c.id)).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')||a.id.localeCompare(b.id));const employees=[];
    for(const u of users)employees.push(publicUser(await forUser(u)));
    const entries=await store.list('clock-event',c.id,{limit:50000});
    const departmentId=String(req.query.departmentId||''),records=summarize(entries,c,from,to,employees).filter(r=>!departmentId||r.departmentId===departmentId);
    const departments=await workforce.sectors(c.id);
    const todayEntries=entries.filter(e=>e.day===today);
    const active=users.filter(u=>u.active&&u.role==='employee');
    const present=new Set(todayEntries.map(e=>e.owner));
    res.json({today,employees,records,departments,stats:{employees:active.length,present:active.filter(u=>present.has(u.id)).length,
      pending:active.filter(u=>!present.has(u.id)).length,documents:(await store.list('document',c.id)).filter(d=>d.status==='pending').length},settings:companySettings(c)});
  });
  route('get','/admin/attendance/settings',admin,async(req,res)=>res.json(companySettings(await companyFor(req.user.companyId))));
  route('post','/admin/attendance/settings',admin,async(req,res)=>{
    const c=await companyFor(req.user.companyId),b=req.body;
    try { new Intl.DateTimeFormat('pt-BR',{timeZone:b.timezone}).format(); }catch{throw fail(400,'Fuso horário inválido.');}
    const minutes=Number(b.dailyMinutes);
    if(!Number.isInteger(minutes)||minutes<1||minutes>960)throw fail(400,'Confira os minutos da jornada diária.');
    if(!Array.isArray(b.weekdays)||!b.weekdays.length||b.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))throw fail(400,'Escolha os dias de trabalho.');
    const attendanceMethod=validMethod(b.attendanceMethod||c.attendanceMethod||'code');if(b.attendanceMode&&!['journey','presence'].includes(b.attendanceMode))throw fail(400,'Escolha jornada ou presença.');
    Object.assign(c,{attendanceMethod,locationRequired:b.locationRequired===true,allowOwnTasks:b.allowOwnTasks===true,attendanceMode:b.attendanceMode||c.attendanceMode||'journey',timezone:b.timezone,dailyMinutes:minutes,weekdays:[...new Set(b.weekdays)],greeting:text(b.greeting,1,1000),menu:text(b.menu,1,2000)});
    await store.put('company',c.id,c,c.id);res.json(companySettings(c));
  });
  const safeDocument=d=>({id:d.id,owner:d.owner,name:d.name,mime:d.mime,size:d.size,at:d.at,status:d.status,source:d.source,note:d.note||''});
  const saveDocument=async(user,file,source)=>{
    if(!['application/pdf','image/jpeg','image/png'].includes(file.mime))throw fail(400,'Envie um PDF, JPG ou PNG.');
    const buffer=Buffer.isBuffer(file.buffer)?file.buffer:Buffer.from(String(file.data||''),'base64');
    if(!buffer.length||buffer.length>5*1024*1024)throw fail(400,'O arquivo deve ter até 5 MB.');
    const valid=file.mime==='application/pdf'?buffer.subarray(0,5).toString()==='%PDF-':file.mime==='image/jpeg'?buffer[0]===255&&buffer[1]===216&&buffer[2]===255:buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if(!valid)throw fail(400,'O formato do arquivo não corresponde ao conteúdo.');
    const hash=digest(buffer.toString('base64')),id=lookup(secret,'document',user.companyId,user.id,hash);
    const previous=await store.get('document',id,user.companyId);if(previous)return safeDocument(previous);
    // Encrypted chunks reuse the existing durable store; no public bucket or URL.
    const key=token(), chunks=[];
    try {
      for(let start=0;start<buffer.length;start+=180000){const chunk=await store.put('document-chunk',user.companyId,{owner:user.id,documentId:id,key,data:buffer.subarray(start,start+180000).toString('base64')});chunks.push(chunk.id);}
      const d=await store.put('document',user.companyId,{owner:user.id,name:text(file.name||'atestado',1,180),mime:file.mime,size:buffer.length,at:new Date().toISOString(),status:'pending',source,chunks,note:''},id,true);
      return safeDocument(d);
    }catch(e){for(const chunkId of chunks)await store.remove('document-chunk',chunkId,user.companyId);if(e.status===409){const existing=await store.get('document',id,user.companyId);if(existing)return safeDocument(existing);}throw e;}
  };
  route('post','/documents',async(req,res)=>res.status(201).json(await saveDocument(req.user,req.body,'app')));
  route('get','/documents',async(req,res)=>res.json((await store.list('document',req.user.companyId,(await peoplePermissions.caps(req.user)).manageFiles?{}:{owner:req.user.id})).map(safeDocument)));
  route('get','/documents/:id/file',async(req,res)=>{
    const d=await store.get('document',req.params.id,req.user.companyId);
    if(!d||(d.owner!==req.user.id&&!(await peoplePermissions.caps(req.user)).manageFiles))throw fail(404,'Documento não encontrado.');
    const parts=[];for(const id of d.chunks){const chunk=await store.get('document-chunk',id,req.user.companyId);if(!chunk||chunk.documentId!==d.id)throw fail(503,'Documento temporariamente indisponível.');parts.push(Buffer.from(chunk.data,'base64'));}
    res.json({name:d.name,mime:d.mime,data:Buffer.concat(parts).toString('base64')});
  });
  route('patch','/admin/documents/:id',peoplePermissions.requireCapability('manageFiles'),async(req,res)=>{
    const d=await store.get('document',req.params.id,req.user.companyId);if(!d)throw fail(404,'Documento não encontrado.');
    if(!['pending','accepted','rejected'].includes(req.body.status))throw fail(400,'Status inválido.');
    d.status=req.body.status;d.note=text(req.body.note||'',0,1000);await store.put('document',req.user.companyId,d,d.id);res.json(safeDocument(d));
  });
  route('get','/admin/hr-requests',admin,async(req,res)=>{
    const users=await store.list('user',req.user.companyId);
    res.json((await store.list('hr-request',req.user.companyId)).map(r=>{const u=users.find(u=>u.id===r.owner);return {...r,name:u?.name||'Colaborador',phone:u?.phone||''};}));
  });
  route('post','/admin/hr-requests/:id/reply',admin,async(req,res)=>{
    const r=await store.get('hr-request',req.params.id,req.user.companyId),body=text(req.body.text,1,2000);
    if(!r)throw fail(404,'Solicitação não encontrada.');
    const u=await store.get('user',r.owner,req.user.companyId);
    if(!u?.active||!u.phone||!u.whatsappConsent)throw fail(409,'Este colaborador não está com o WhatsApp autorizado.');
    if(!gateway?.sendText)throw fail(409,'WhatsApp indisponível.');
    await gateway.sendText(r.channelId||await connectionFor(u),u.whatsappJid||u.phone+'@s.whatsapp.net','RH: '+body);
    r.status='answered';r.reply=body;r.answeredAt=new Date().toISOString();
    await store.put('hr-request',req.user.companyId,r,r.id);res.json({ok:true});
  });
  return {mine,punch,saveDocument};
}

export function installPublicAttendance({route,store,secret,gateway,limiter,companyFor,connectionFor=async u=>u.companyId,getAttendance}) {
  route('post','/public/access',limiter(30,60000),async(req,res)=>{
    const kind=req.body.kind==='totem'?'totem':'invite',c=await resolveAccess(store,secret,req.body.token,kind);
    res.json({name:c.name,timezone:companySettings(c).timezone,department:c.invitedDepartment||null,attendanceMethod:c.attendanceMethod||'code'});
  });
  route('post','/public/totem/punch',limiter(20,60000),async(req,res)=>{
    const c=await resolveAccess(store,secret,req.body.token,'totem'),code=String(req.body.code||'').trim().toUpperCase();
    if(!/^(?:[A-Z]?\d{4}|\d{6})$/.test(code))throw fail(400,'Digite os 4 números do seu código e a letra, se houver.');
    const item=await store.get('employee-code',lookup(secret,'employee-code',c.id,code),c.id);
    const user=item&&await store.get('user',item.owner,c.id);
    if(!user?.active)throw fail(400,'Código não encontrado. Confira com o RH.');
    const state=await getAttendance().mine(user);
    const out=await getAttendance().punch(user,{...req.body,event:state.nextEvent},'totem');
    res.status(201).json({name:user.name.split(' ')[0],event:out.entry.event,at:out.entry.at});
  });
  const otpId=(purpose,email)=>lookup(secret,'otp',purpose,email);
  const sendOTP=async(purpose,user)=>serial('otp:'+purpose+':'+user.email,async()=>{
    const id=otpId(purpose,user.email),old=await store.get('otp',id,user.companyId);
    if(old&&old.phone===user.phone&&Date.parse(old.expiresAt)>Date.now())return;
    const connection=await connectionFor(user);if(!gateway?.sendText||(await gateway.status(connection)).status!=='connected')return;
    const code=String(randomInt(100000,1000000));
    const saved={owner:user.id,companyId:user.companyId,phone:user.phone,hash:lookup(secret,'otp-value',purpose,user.id,code),attempts:0,expiresAt:new Date(Date.now()+10*60000).toISOString()};
    await store.put('otp',user.companyId,saved,id);
    try{await gateway.sendText(connection,user.phone+'@s.whatsapp.net',`Oluni: seu código para ${purpose==='reset'?'redefinir a senha':'verificar o WhatsApp'} é ${code}. Válido por 10 minutos. Não compartilhe.`);}
    catch{await store.remove('otp',id,user.companyId);}
  });
  const consume=async(purpose,email,code,fn)=>serial('otp:'+purpose+':'+email,async()=>{
    const id=otpId(purpose,email),record=await store.get('otp',id);
    if(!record||record.used||Date.parse(record.expiresAt)<Date.now()||record.attempts>=5)throw fail(400,'Código inválido ou expirado. Solicite um novo após 10 minutos.');
    record.attempts++;await store.put('otp',record.companyId,record,id);
    if(record.hash!==lookup(secret,'otp-value',purpose,record.owner,String(code||'')))throw fail(400,'Código inválido ou expirado.');
    const u=await store.get('user',record.owner,record.companyId);if(!u?.active||u.phone!==record.phone)throw fail(400,'Este acesso não está disponível.');
    record.used=true;await store.put('otp',record.companyId,record,id);await fn(u);
  });
  route('post','/auth/password/request',limiter(5,15*60000),async(req,res)=>{
    const email=String(req.body.email||'').trim().toLowerCase(),u=await store.get('user',lookup(secret,'email',email));
    if(u?.active)await sendOTP('reset',u);
    res.json({ok:true,message:'Se o e-mail tiver um WhatsApp cadastrado e a empresa estiver conectada, enviaremos um código. Confira seu WhatsApp ou procure o RH.'});
  });
  route('post','/auth/password/reset',limiter(10,15*60000),async(req,res)=>{
    const passwordHash=await hashPassword(req.body.password),email=String(req.body.email||'').trim().toLowerCase();
    await consume('reset',email,req.body.code,async u=>{u.passwordHash=passwordHash;await store.put('user',u.companyId,u,u.id);for(const s of await store.list('session',u.companyId))if(s.userId===u.id)await store.remove('session',s.id,u.companyId);});res.json({ok:true});
  });
  return {sendOTP,consume};
}
