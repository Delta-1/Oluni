import {fail,lookup} from './security.js';
export function createPeoplePermissions({store,secret,route,admin}){
 const id=cid=>lookup(secret,'people-access',cid);
 const config=async cid=>({documentDepartmentIds:[],inviteDepartmentIds:[],...await store.get('people-access',id(cid),cid)});
 const caps=async user=>{
  const u=await store.get('user',user.id,user.companyId);if(!u?.active)return {manageFiles:false,inviteEmployees:false};
  if(u.role==='admin')return {manageFiles:true,inviteEmployees:true};
  const d=u.departmentId&&await store.get('department',u.departmentId,u.companyId);if(!d||d.active===false)return {manageFiles:false,inviteEmployees:false};
  const c=await config(u.companyId);return {manageFiles:c.documentDepartmentIds.includes(d.id),inviteEmployees:c.inviteDepartmentIds.includes(d.id)};
 };
 const requireCapability=kind=>async(req,res,next)=>{if(!(await caps(req.user))[kind])throw fail(403,'A administração geral precisa autorizar seu setor.');next();};
 route('get','/admin/people/access',admin,async(req,res)=>res.json(await config(req.user.companyId)));
 route('post','/admin/people/access',admin,async(req,res)=>{
  const cid=req.user.companyId,departments=(await store.list('department',cid)).filter(d=>d.active!==false),value={};
  for(const field of ['documentDepartmentIds','inviteDepartmentIds']){const ids=req.body[field];if(!Array.isArray(ids)||ids.length>2000||ids.some(id=>typeof id!=='string'||!departments.some(d=>d.id===id)))throw fail(400,'Selecione setores ativos desta empresa.');value[field]=[...new Set(ids)];}
  await store.put('people-access',cid,value,id(cid));res.json(value);
 });
 return {caps,config,requireCapability};
}
