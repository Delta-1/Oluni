import {randomUUID} from 'node:crypto';
import {fail,text,digest} from './security.js';
import {checkedAttachment} from './whatsapp-inbox.js';
export function installEmployeeFiles({route,store}){
 const person=async(u,id)=>{const p=await store.get('user',id,u.companyId);if(!p||u.role!=='admin'&&p.id!==u.id)throw fail(404,'Pasta não encontrada.');return p;};
 const safe=f=>({id:f.id,name:f.name,mime:f.mime,size:f.size,folderId:f.folderId||null,at:f.at,source:f.source||'app',status:f.status||null,note:f.note||'',kind:f.chunks?'file':'document'});
 route('get','/people/:id/files',async(req,res)=>{
  const u=await person(req.user,req.params.id),cid=u.companyId;
  const [folders,files,docs]=await Promise.all([store.list('employee-folder',cid,{owner:u.id}),store.list('employee-file',cid,{owner:u.id}),store.list('document',cid,{owner:u.id})]);
  res.json({employee:{id:u.id,name:u.name,code:u.employeeCode,department:u.department},folders,files:[...files.map(f=>({...safe(f),kind:'file'})),...docs.map(f=>({...safe(f),kind:'document',folderId:'atestados'}))].sort((a,b)=>b.at.localeCompare(a.at))});
 });
 route('post','/people/:id/folders',async(req,res)=>{const u=await person(req.user,req.params.id);res.status(201).json(await store.put('employee-folder',u.companyId,{owner:u.id,name:text(req.body.name,1,80),at:new Date().toISOString()},'employee-folder:'+randomUUID(),true));});
 route('post','/people/:id/files',async(req,res)=>{
  const u=await person(req.user,req.params.id),cid=u.companyId,b=req.body;
  if(b.folderId){const folder=await store.get('employee-folder',b.folderId,cid);if(!folder||folder.owner!==u.id)throw fail(404,'Pasta não encontrada.');}
  let f;
  if(['text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(b.mime)){
   const buffer=Buffer.from(b.data||'','base64');if(!buffer.length||buffer.length>5*1024*1024)throw fail(400,'Use um arquivo de até 5 MB.');
   const office=b.mime.startsWith('application/');if(office&&!buffer.subarray(0,4).equals(Buffer.from([80,75,3,4]))||!office&&buffer.includes(0))throw fail(400,'Formato de arquivo inválido.');
   f={buffer,mime:b.mime,name:text(String(b.name||'arquivo').replace(/[\x00-\x1f/\\]/g,'_'),1,150)};
  }else f=checkedAttachment(b);
  if(f.mime.startsWith('audio/')||f.mime.startsWith('video/'))throw fail(400,'Use documentos, planilhas, textos ou imagens na pasta pessoal.');
  const id='employee-file:'+randomUUID(),chunks=[];
  try{for(let i=0;i<f.buffer.length;i+=180000){const c=await store.put('employee-file-chunk',cid,{owner:u.id,fileId:id,data:f.buffer.subarray(i,i+180000).toString('base64')});chunks.push(c.id);}const file=await store.put('employee-file',cid,{owner:u.id,name:f.name,mime:f.mime,size:f.buffer.length,hash:digest(f.buffer.toString('base64')),folderId:b.folderId||null,chunks,at:new Date().toISOString(),source:'app'},id,true);res.status(201).json({...safe(file),kind:'file'});}catch(e){for(const id of chunks)await store.remove('employee-file-chunk',id,cid);throw e;}
 });
 route('get','/people/:id/files/:file',async(req,res)=>{const u=await person(req.user,req.params.id),f=await store.get('employee-file',req.params.file,u.companyId);if(!f||f.owner!==u.id)throw fail(404,'Arquivo não encontrado.');const parts=[];for(const id of f.chunks){const c=await store.get('employee-file-chunk',id,u.companyId);if(!c||c.owner!==u.id||c.fileId!==f.id)throw fail(503,'Arquivo indisponível.');parts.push(Buffer.from(c.data,'base64'));}res.json({name:f.name,mime:f.mime,data:Buffer.concat(parts).toString('base64')});});
 route('patch','/people/:id/files/:file',async(req,res)=>{const u=await person(req.user,req.params.id),f=await store.get('employee-file',req.params.file,u.companyId);if(!f||f.owner!==u.id)throw fail(404,'Arquivo não encontrado.');if(req.body.name!==undefined)f.name=text(req.body.name,1,150);if(req.body.folderId!==undefined){const folder=req.body.folderId?await store.get('employee-folder',req.body.folderId,u.companyId):null;if(req.body.folderId&&folder?.owner!==u.id)throw fail(404,'Pasta não encontrada.');f.folderId=folder?.id||null;}await store.put('employee-file',u.companyId,f,f.id);res.json({...safe(f),kind:'file'});});
}
