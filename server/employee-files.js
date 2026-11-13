import {randomUUID} from 'node:crypto';
import {zipSync} from 'fflate';
import {fail,text,digest,limiter} from './security.js';
import {checkedAttachment} from './whatsapp-inbox.js';
export function installEmployeeFiles({route,store,permissions}){
 const person=async(u,id)=>{const p=await store.get('user',id,u.companyId);if(!p||u.id!==p.id&&!(await permissions.caps(u)).manageFiles)throw fail(404,'Pasta não encontrada.');return p;};
 const folder=async(u,id)=>{if(!id||['cadastro','atestados'].includes(id))return;const f=await store.get('employee-folder',id,u.companyId);if(!f||f.owner!==u.id)throw fail(404,'Pasta não encontrada.');};
 const safe=f=>({id:f.id,name:f.name,mime:f.mime,size:f.size,folderId:f.folderId||null,category:f.category||'',at:f.at,source:f.source||'app',status:f.status||null,note:f.note||'',kind:f.kind||'file'});
 const list=async u=>{const [folders,files,docs]=await Promise.all([store.list('employee-folder',u.companyId,{owner:u.id}),store.list('employee-file',u.companyId,{owner:u.id}),store.list('document',u.companyId,{owner:u.id})]);return {folders:[{id:'cadastro',name:'Cadastro',owner:u.id},...folders],files:[...files.map(f=>({...safe(f),kind:'file'})),...docs.map(f=>({...safe(f),kind:'document',folderId:'atestados'}))].sort((a,b)=>b.at.localeCompare(a.at))};};
 const read=async(u,id,kind='file')=>{
  const isDoc=kind==='document',f=await store.get(isDoc?'document':'employee-file',id,u.companyId);if(!f||f.owner!==u.id)throw fail(404,'Arquivo não encontrado.');const parts=[];
  for(const id of f.chunks){const chunk=await store.get(isDoc?'document-chunk':'employee-file-chunk',id,u.companyId);if(!chunk||chunk.owner!==u.id||(isDoc?chunk.documentId:chunk.fileId)!==f.id)throw fail(503,'Arquivo indisponível.');parts.push(Buffer.from(chunk.data,'base64'));}
  return {name:f.name,mime:f.mime,buffer:Buffer.concat(parts)};
 };
 const save=async(u,b,{source='app',category='',folderId=b.folderId||null}={})=>{
  await folder(u,folderId);let f;
  if(['text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(b.mime)){
   const buffer=Buffer.isBuffer(b.buffer)?b.buffer:Buffer.from(b.data||'','base64');if(!buffer.length||buffer.length>5*1024*1024)throw fail(400,'Use um arquivo de até 5 MB.');
   const office=b.mime.startsWith('application/');if(office&&!buffer.subarray(0,4).equals(Buffer.from([80,75,3,4]))||!office&&buffer.includes(0))throw fail(400,'Formato de arquivo inválido.');f={buffer,mime:b.mime,name:text(String(b.name||'arquivo').replace(/[\x00-\x1f/\\]/g,'_'),1,150)};
  }else f=checkedAttachment(b);
  if(f.mime.startsWith('audio/')||f.mime.startsWith('video/'))throw fail(400,'Use documentos, planilhas, textos ou imagens na pasta pessoal.');
  const hash=digest(f.buffer.toString('base64')),previous=(await store.list('employee-file',u.companyId,{owner:u.id})).find(v=>v.hash===hash&&v.category===category&&v.folderId===folderId);if(previous)return safe(previous);
  const id='employee-file:'+randomUUID(),chunks=[];
  try{for(let i=0;i<f.buffer.length;i+=180000){const c=await store.put('employee-file-chunk',u.companyId,{owner:u.id,fileId:id,data:f.buffer.subarray(i,i+180000).toString('base64')});chunks.push(c.id);}const file=await store.put('employee-file',u.companyId,{owner:u.id,name:f.name,mime:f.mime,size:f.buffer.length,hash,folderId,category,chunks,at:new Date().toISOString(),source,status:source.startsWith('whatsapp')?'pending':null},id,true);return safe(file);}catch(e){for(const id of chunks)await store.remove('employee-file-chunk',id,u.companyId);throw e;}
 };
 route('get','/people/directory',async(req,res)=>{const caps=await permissions.caps(req.user);if(!caps.manageFiles&&!caps.inviteEmployees)throw fail(403,'Seu setor não tem acesso ao cadastro da equipe.');const users=await store.list('user',req.user.companyId);res.json(users.map(u=>({id:u.id,name:u.name,employeeCode:u.employeeCode,department:u.department,departmentId:u.departmentId,active:u.active})));});
 route('get','/people/:id/files',async(req,res)=>{const u=await person(req.user,req.params.id);res.json({employee:{id:u.id,name:u.name,code:u.employeeCode,department:u.department},...await list(u)});});
 route('post','/people/:id/folders',async(req,res)=>{const u=await person(req.user,req.params.id);res.status(201).json(await store.put('employee-folder',u.companyId,{owner:u.id,name:text(req.body.name,1,80),at:new Date().toISOString()},'employee-folder:'+randomUUID(),true));});
 route('post','/people/:id/files',async(req,res)=>res.status(201).json(await save(await person(req.user,req.params.id),req.body)));
 route('get','/people/:id/files/:file',async(req,res)=>{const u=await person(req.user,req.params.id),f=await read(u,req.params.file);await person(req.user,u.id);res.json({name:f.name,mime:f.mime,data:f.buffer.toString('base64')});});
 route('patch','/people/:id/files/:file',async(req,res)=>{const u=await person(req.user,req.params.id),f=await store.get('employee-file',req.params.file,u.companyId);if(!f||f.owner!==u.id)throw fail(404,'Arquivo não encontrado.');if(req.body.name!==undefined)f.name=text(req.body.name,1,150);if(req.body.folderId!==undefined){await folder(u,req.body.folderId);f.folderId=req.body.folderId||null;}if(req.body.status!==undefined){if(!(await permissions.caps(req.user)).manageFiles||!['accepted','rejected','pending'].includes(req.body.status))throw fail(403,'Somente a equipe autorizada pode analisar documentos.');f.status=req.body.status;f.note=text(req.body.note||'',0,1000);}await store.put('employee-file',u.companyId,f,f.id);res.json(safe(f));});
 route('post','/people/:id/files/export',limiter(4,60000),async(req,res)=>{const u=await person(req.user,req.params.id),all=await list(u),files=all.files.filter(f=>!req.body.folderId||f.folderId===req.body.folderId);if(!files.length)throw fail(400,'Esta pasta não possui arquivos.');if(files.length>100||files.reduce((sum,f)=>sum+f.size,0)>25*1024*1024)throw fail(400,'Baixe um lote de até 100 arquivos e 25 MB.');const zip={};for(const [index,f] of files.entries()){const value=await read(u,f.id,f.kind),name=value.name.replace(/[\x00-\x1f/\\]/g,'_').replace(/^\.+/,'');zip[String(index+1).padStart(3,'0')+'-'+name]=value.buffer;}await person(req.user,u.id);res.json({name:'documentos-'+u.employeeCode+'.zip',mime:'application/zip',data:Buffer.from(zipSync(zip,{level:0})).toString('base64')});});
 return {save,read,list,person};
}
