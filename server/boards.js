import {randomUUID} from 'node:crypto';
import {fail,text,lookup} from './security.js';
import {serial} from './attendance.js';
export function installBoards({route,store,secret}){
 const can=(u,b)=>u.companyId===b.companyId&&(b.scope==='company'||b.scope==='personal'&&b.owner===u.id||b.scope==='department'&&(u.role==='admin'||!!u.departmentId&&u.departmentId===b.departmentId));
 const owned=async(u,id)=>{const b=await store.get('board',id,u.companyId);if(!b||!can(u,b))throw fail(404,'Quadro não encontrado.');return b;};
 route('get','/boards',async(req,res)=>{
  const u=req.user,id=lookup(secret,'personal-board',u.companyId,u.id);if(!await store.get('board',id,u.companyId))await store.put('board',u.companyId,{companyId:u.companyId,owner:u.id,name:'Meu quadro',scope:'personal',createdAt:new Date().toISOString()},id);
  res.json((await store.list('board',u.companyId)).filter(b=>can(u,b)));
 });
 route('post','/boards',async(req,res)=>{const u=req.user,b=req.body;if(!['personal','department','company'].includes(b.scope))throw fail(400,'Escolha quem vê o quadro.');const d=b.departmentId||u.departmentId;
  if(b.scope==='company'&&u.role!=='admin')throw fail(403,'Somente o administrador cria quadros da empresa.');
  if(b.scope==='department'){const dep=await store.get('department',d,u.companyId);if(!dep||dep.active===false||u.role!=='admin'&&d!==u.departmentId)throw fail(403,'Escolha seu setor.');}
  res.status(201).json(await store.put('board',u.companyId,{companyId:u.companyId,owner:u.id,name:text(b.name,2,80),scope:b.scope,departmentId:b.scope==='department'?d:null,createdAt:new Date().toISOString()},'board:'+randomUUID(),true));
 });
 route('get','/boards/:id',async(req,res)=>{const b=await owned(req.user,req.params.id);res.json({board:b,notes:await store.list('sticky-note',req.user.companyId,{owner:b.id,limit:2000})});});
 const checked=b=>{const out={};if(b.text!==undefined)out.text=text(b.text,0,2000);if(b.color!==undefined){if(!['yellow','pink','purple','green','blue','white'].includes(b.color))throw fail(400,'Cor inválida.');out.color=b.color;}for(const key of ['x','y'])if(b[key]!==undefined){if(!Number.isFinite(b[key])||b[key]<0||b[key]>5000)throw fail(400,'Posição inválida.');out[key]=Math.round(b[key]);}if(b.done!==undefined)out.done=b.done===true;return out;};
 route('post','/boards/:id/notes',async(req,res)=>{const b=await owned(req.user,req.params.id);if((await store.list('sticky-note',req.user.companyId,{owner:b.id})).length>=300)throw fail(400,'Use até 300 notas por quadro.');res.status(201).json(await store.put('sticky-note',req.user.companyId,{owner:b.id,author:req.user.id,authorName:req.user.name,text:'',color:'yellow',x:30,y:30,done:false,...checked(req.body),version:1,updatedAt:new Date().toISOString()},'sticky:'+randomUUID(),true));});
 route('patch','/boards/:id/notes/:note',async(req,res)=>serial('sticky:'+req.params.note,async()=>{await owned(req.user,req.params.id);const n=await store.get('sticky-note',req.params.note,req.user.companyId);if(!n||n.owner!==req.params.id)throw fail(404,'Nota não encontrada.');if(req.body.version!==n.version)throw fail(409,'Esta nota foi alterada. Atualize o quadro.');Object.assign(n,checked(req.body),{version:n.version+1,updatedAt:new Date().toISOString()});await store.put('sticky-note',req.user.companyId,n,n.id);res.json(n);}));
 route('delete','/boards/:id/notes/:note',async(req,res)=>{await owned(req.user,req.params.id);const n=await store.get('sticky-note',req.params.note,req.user.companyId);if(!n||n.owner!==req.params.id)throw fail(404,'Nota não encontrada.');await store.remove('sticky-note',n.id,req.user.companyId);res.json({ok:true});});
}
