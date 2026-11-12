import {personalData} from './personal-data.js';
import QRCode from 'qrcode';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {fail,text,lookup,digest,publicUser} from './security.js';
import {validMethod,methodFor,checkedLocation} from './workforce-policy.js';

// Every query remains inside the company's encrypted application namespace.
export function installWorkforce({route,store,secret,admin,companyFor,serial,forUser}) {
  const owned=async(kind,id,user)=>{const row=await store.get(kind,id,user.companyId);if(!row||(user.role!=='admin'&&row.owner!==user.id))throw fail(404,'Registro não encontrado.');return row;};
  const sectors=cid=>store.list('department',cid,{limit:2000});
  route('get','/departments',async(req,res)=>res.json((await sectors(req.user.companyId)).filter(s=>s.active!==false)));
  route('post','/admin/departments',admin,async(req,res)=>{
    const cid=req.user.companyId,name=text(req.body.name,2,80),id=lookup(secret,'department',cid,name.normalize('NFKC').toLocaleLowerCase('pt-BR'));
    const old=await store.get('department',id,cid);
    if(old?.active!==false&&old)throw fail(409,'Este setor já está cadastrado.');
    if((await sectors(cid)).length>=2000&&!old)throw fail(400,'Limite de setores atingido.');
    res.status(201).json(await store.put('department',cid,{name,active:true,createdAt:old?.createdAt||new Date().toISOString()},id));
  });
  route('patch','/admin/departments/:id',admin,async(req,res)=>{
    const row=await store.get('department',req.params.id,req.user.companyId);if(!row)throw fail(404,'Setor não encontrado.');
    if(req.body.active===false){const users=await store.list('user',req.user.companyId);if(users.some(u=>u.departmentId===row.id&&u.active))throw fail(409,'Mova os colaboradores deste setor antes de arquivá-lo.');row.active=false;}
    await store.put('department',req.user.companyId,row,row.id);res.json(row);
  });
  route('patch','/admin/employee-config/:id',admin,async(req,res)=>serial('user-edit:'+req.params.id,async()=>{
    const cid=req.user.companyId,existing=await store.get('user',req.params.id,cid),b=req.body;
    if(!existing)throw fail(404,'Colaborador não encontrado.');
    const u=await personalData(store,existing,b);
    if(b.departmentId!==undefined){const d=b.departmentId?await store.get('department',b.departmentId,cid):null;if(b.departmentId&&(!d||d.active===false))throw fail(400,'Escolha um setor ativo desta empresa.');u.departmentId=d?.id||null;u.department=d?.name||'Geral';}
    if(b.attendanceMethod!==undefined)u.attendanceMethod=validMethod(b.attendanceMethod,true);
    if(b.allowOwnTasks!==undefined){if(b.allowOwnTasks===null)delete u.allowOwnTasks;else u.allowOwnTasks=b.allowOwnTasks===true;}
    
    await store.put('user',cid,u,u.id);res.json(publicUser(await forUser(u)));
  }));

  const qrToken=(company,user)=>{
    const data=Buffer.from(JSON.stringify({c:company.id,u:user.id,v:company.qrVersion||1})).toString('base64url');
    return 'oluni:qr:'+data+'.'+createHmac('sha256',secret).update('oluni-qr:'+data).digest('base64url');
  };
  const checkQr=(raw,company,user)=>{
    if(typeof raw!=='string'||raw.length>1200||!raw.startsWith('oluni:qr:'))throw fail(400,'Leia um QR Code de presença do Oluni.');
    const [payload,signature,extra]=raw.slice(9).split('.'),expected=createHmac('sha256',secret).update('oluni-qr:'+(payload||'')).digest(),actual=Buffer.from(signature||'','base64url');
    if(extra||actual.length!==expected.length||!timingSafeEqual(expected,actual))throw fail(400,'QR Code inválido.');
    let p;try{p=JSON.parse(Buffer.from(payload,'base64url'));}catch{throw fail(400,'QR Code inválido.');}
    if(p.c!==company.id||p.u!==user.id||p.v!==(company.qrVersion||1))throw fail(403,'Use o seu QR Code, emitido pelo RH da sua empresa.');
  };
  route('post','/admin/qr/labels',admin,async(req,res)=>{
    if(!Array.isArray(req.body.items)||!req.body.items.length||req.body.items.length>200)throw fail(400,'Selecione de 1 a 200 colaboradores por lote.');
    const total=req.body.items.reduce((n,i)=>n+Number(i.quantity),0);if(!Number.isSafeInteger(total)||total>240||total<1)throw fail(400,'Imprima no máximo 240 etiquetas por lote.');
    const c=await companyFor(req.user.companyId),labels=[];
    for(const item of req.body.items){if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100)throw fail(400,'Use de 1 a 100 cópias por pessoa.');const u=await store.get('user',item.id,c.id);if(!u?.active)throw fail(400,'Selecione apenas pessoas ativas da sua empresa.');const withCode=await forUser(u);labels.push({id:u.id,name:u.name,department:u.department,code:withCode.employeeCode,quantity:item.quantity,image:await QRCode.toDataURL(qrToken(c,u),{width:260,margin:4,errorCorrectionLevel:'M'})});}
    res.json({company:c.name,labels,total});
  });
  route('post','/admin/qr/revoke',admin,async(req,res)=>{const c=await companyFor(req.user.companyId);c.qrVersion=(c.qrVersion||1)+1;await store.put('company',c.id,c,c.id);res.json({ok:true});});

  const mediaSafe=m=>({id:m.id,owner:m.owner,taskId:m.taskId||null,phase:m.phase||null,purpose:m.purpose,at:m.at,mime:m.mime,size:m.size});
  route('post','/media',async(req,res)=>serial('media:'+req.user.id,async()=>{
    const b=req.body,u=req.user,purpose=b.purpose;
    if(!['clock','task'].includes(purpose)||!['image/jpeg','image/png'].includes(b.mime)||typeof b.data!=='string'||b.data.length>4300000)throw fail(400,'Envie uma foto JPG ou PNG de até 3 MB.');
    let task;if(purpose==='task'){task=await owned('task',b.taskId,u);if(task.owner!==u.id)throw fail(403,'Somente o responsável pode enviar fotos.');if(['completed','cancelled'].includes(task.status))throw fail(409,'Esta tarefa já foi encerrada.');if(!['before','after'].includes(b.phase))throw fail(400,'Escolha antes ou depois.');if(b.phase==='after'&&task.status!=='in_progress')throw fail(409,'Inicie a tarefa e envie as fotos de antes primeiro.');}
    const buf=Buffer.from(b.data,'base64'),png=buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=buf[0]===255&&buf[1]===216&&buf[2]===255;
    if(!buf.length||buf.length>3*1024*1024||!(b.mime==='image/png'?png:jpg))throw fail(400,'Foto inválida. Use JPG ou PNG de até 3 MB.');
    const hash=digest(buf.toString('base64')),id=lookup(secret,'proof',u.companyId,u.id,purpose,task?.id||'',b.phase||'',hash),old=await store.get('proof',id,u.companyId);if(old)return res.json(mediaSafe(old));
    const recent=await store.list('proof',u.companyId,{owner:u.id,limit:1000});
    if(task&&recent.some(m=>m.taskId===task.id&&m.hash===hash&&m.phase!==b.phase))throw fail(409,'Use uma foto nova para comprovar o depois do serviço.');
    if(recent.filter(m=>Date.now()-Date.parse(m.at)<86400000).length>=120)throw fail(429,'Limite diário de fotos atingido. Procure o RH.');
    const chunks=[];
    try{for(let n=0;n<buf.length;n+=180000){const part=await store.put('proof-chunk',u.companyId,{owner:u.id,proofId:id,data:buf.subarray(n,n+180000).toString('base64')});chunks.push(part.id);}
      const m=await store.put('proof',u.companyId,{owner:u.id,purpose,taskId:task?.id||null,phase:task?b.phase:null,at:new Date().toISOString(),mime:b.mime,size:buf.length,hash,chunks},id,true);res.status(201).json(mediaSafe(m));
    }catch(e){for(const chunk of chunks)await store.remove('proof-chunk',chunk,u.companyId);throw e;}
  }));
  route('get','/media/:id',async(req,res)=>{const m=await owned('proof',req.params.id,req.user),parts=[];for(const id of m.chunks){const part=await store.get('proof-chunk',id,req.user.companyId);if(!part||part.proofId!==m.id)throw fail(503,'Foto temporariamente indisponível.');parts.push(Buffer.from(part.data,'base64'));}res.json({...mediaSafe(m),data:Buffer.concat(parts).toString('base64')});});

  const tasksFor=async user=>{
    const tasks=await store.list('task',user.companyId,user.role==='admin'?{limit:10000}:{owner:user.id,limit:2000});
    const proofs=await store.list('proof',user.companyId,user.role==='admin'?{limit:20000}:{owner:user.id,limit:2000});
    return tasks.map(t=>({...t,photos:proofs.filter(m=>m.taskId===t.id).map(mediaSafe)})).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.createdAt.localeCompare(b.createdAt));
  };
  route('get','/tasks',async(req,res)=>{
    const c=await companyFor(req.user.companyId),tasks=await tasksFor(req.user);
    res.json({tasks,canCreate:req.user.role==='admin'||req.user.allowOwnTasks===true||(req.user.allowOwnTasks!==false&&c.allowOwnTasks===true)});
  });
  route('post','/tasks',async(req,res)=>{
    const u=req.user,c=await companyFor(u.companyId),b=req.body;
    if(u.role!=='admin'&&!(u.allowOwnTasks===true||(u.allowOwnTasks!==false&&c.allowOwnTasks===true)))throw fail(403,'Peça ao RH para liberar a criação de pequenas tarefas.');
    const owner=u.role==='admin'?String(b.owner||''):u.id,target=await store.get('user',owner,u.companyId);
    if(!target?.active)throw fail(400,'Escolha um colaborador ativo da empresa.');
    const dueDate=text(b.dueDate,10,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(Date.parse(dueDate+'T12:00:00Z'))||new Date(dueDate+'T12:00:00Z').toISOString().slice(0,10)!==dueDate)throw fail(400,'Escolha uma data válida.');
    const requiredBefore=Number(b.requiredBefore??1),requiredAfter=Number(b.requiredAfter??1);
    if([requiredBefore,requiredAfter].some(n=>!Number.isInteger(n)||n<0||n>10))throw fail(400,'Use de 0 a 10 fotos por etapa.');
    if(!Array.isArray(b.items)||b.items.length<1||b.items.length>40)throw fail(400,'Adicione de 1 a 40 itens ao checklist.');
    if((await store.list('task',u.companyId,{owner,limit:2000})).filter(t=>t.status!=='completed').length>=100)throw fail(400,'Conclua as tarefas em aberto antes de criar outras.');
    const task=await store.put('task',u.companyId,{owner,title:text(b.title,3,160),description:text(b.description||'',0,1500),departmentId:target.departmentId||null,department:target.department||'Geral',dueDate,requiredBefore,requiredAfter,items:b.items.map((item,i)=>({id:String(i+1),text:text(item.text||item,1,200),done:false})),status:'pending',createdBy:u.id,createdAt:new Date().toISOString()});res.status(201).json({...task,photos:[]});
  });
  route('patch','/tasks/:id',async(req,res)=>serial('task:'+req.params.id,async()=>{
    const u=req.user,t=await owned('task',req.params.id,u),b=req.body;
    if(t.owner!==u.id)throw fail(403,'Somente o responsável pode atualizar o checklist.');
    if(['completed','cancelled'].includes(t.status))throw fail(409,'Esta tarefa já foi encerrada.');
    const photos=(await store.list('proof',u.companyId,{owner:u.id,limit:2000})).filter(p=>p.taskId===t.id);
    const before=photos.filter(p=>p.phase==='before'),after=photos.filter(p=>p.phase==='after');
    if(b.action==='start'){if(before.length<t.requiredBefore)throw fail(400,`Envie ${t.requiredBefore} foto(s) de antes para iniciar.`);if(t.status==='pending'){t.status='in_progress';t.startedAt=new Date().toISOString();}}
    else if(b.action==='check'){if(t.status!=='in_progress')throw fail(409,'Registre o antes e inicie o serviço primeiro.');const item=t.items.find(i=>i.id===String(b.itemId));if(!item)throw fail(404,'Item não encontrado.');item.done=b.done===true;}
    else if(b.action==='complete'){if(t.status!=='in_progress'||!t.items.every(i=>i.done)||before.length<t.requiredBefore||after.length<t.requiredAfter)throw fail(400,'Marque todos os itens e envie as fotos exigidas de antes e depois.');t.status='completed';t.completedAt=new Date().toISOString();}
    else throw fail(400,'Escolha uma ação válida.');
    await store.put('task',u.companyId,t,t.id);res.json({...t,photos:photos.map(mediaSafe)});
  }));
  route('delete','/admin/tasks/:id',admin,async(req,res)=>{const t=await owned('task',req.params.id,req.user);if(t.status!=='pending')throw fail(409,'Só é possível cancelar tarefas ainda não iniciadas.');t.status='cancelled';await store.put('task',req.user.companyId,t,t.id);res.json({ok:true});});

  const validatePunch=async(user,company,body,source)=>{
    const method=methodFor(user,company);
    if(source==='totem'&&method!=='code')throw fail(403,'Seu método de ponto é pelo aplicativo. Confira com o RH.');
    if(source!=='totem'&&body.method&&body.method!==method)throw fail(403,'O método de ponto foi alterado pelo RH. Atualize a tela.');
    const location=checkedLocation(body,source!=='totem'&&(method==='qr'||company.locationRequired===true));
    let proof;
    if(method==='qr')checkQr(body.qrToken,company,user);
    if(method==='photo'){
      proof=await owned('proof',body.proofId,user);
      if(proof.owner!==user.id||proof.purpose!=='clock'||Date.now()-Date.parse(proof.at)>120000)throw fail(400,'Tire uma nova foto para comprovar este ponto.');
      if((await store.list('clock-event',user.companyId,{owner:user.id,limit:3000})).some(e=>e.proofId===proof.id))throw fail(409,'Esta foto já foi usada em outro registro.');
    }
    if(method==='checklist'){
      const tasks=await store.list('task',user.companyId,{owner:user.id,limit:2000});
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:company.timezone||'America/Rio_Branco'}).format(new Date());
      const daily=tasks.filter(t=>t.dueDate===today&&t.status!=='cancelled');
      if(!daily.length||daily.some(t=>t.status!=='completed'))throw fail(409,'Conclua os checklists atribuídos para hoje antes de confirmar a presença.');
    }
    return {method,...(location?{location}:{}),...(proof?{proofId:proof.id}:{})};
  };
  return {validatePunch,sectors};
}
