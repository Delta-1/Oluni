import {randomUUID} from 'node:crypto';
import {fail,text,lookup} from './security.js';
export function createChannels({store,secret,gateway}){
 const fallback=cid=>({id:cid,companyId:cid,name:'Escritório / RH',departmentId:null,kind:'hr',active:true,legacy:true});
 const defaultFor=async cid=>await store.get('wa-channel',cid,cid)||fallback(cid);
 const resolve=async key=>{const row=await store.get('wa-channel',key);if(row?.active!==false&&row)return row;const c=await store.get('company',key,key);return c?fallback(key):null;};
 const all=async cid=>{const rows=await store.list('wa-channel',cid);return [await defaultFor(cid),...rows.filter(r=>r.id!==cid&&r.active!==false)];};
 const canAccess=(u,c)=>!!u?.active&&u.companyId===c.companyId&&(u.role==='admin'||(u.whatsappAgent===true&&(Array.isArray(c.teamIds)?c.teamIds.includes(u.id):c.id===u.companyId&&!u.whatsappChannelAccess)));
 const owned=async(cid,id=cid)=>{const c=id===cid?await defaultFor(cid):await store.get('wa-channel',id,cid);if(!c||c.active===false)throw fail(404,'Número de WhatsApp não encontrado.');return c;};
 const forUser=async u=>{const list=await all(u.companyId);return list.find(c=>c.departmentId&&c.departmentId===u.departmentId)||list[0];};
 const connectionFor=async u=>(await forUser(u)).id;
 const member=async(cid,jid,channelId=cid)=>{
  const c=await owned(cid,channelId),number=jid.endsWith('@s.whatsapp.net')?jid.split('@')[0]:null;
  const users=(await store.list('user',cid)).filter(u=>u.active),bound=users.filter(u=>u.whatsappJid===jid);
  const candidates=users.filter(u=>number&&u.phone===number);const selected=bound.length===1?bound:candidates;
  const sector=c.departmentId?selected.filter(u=>u.departmentId===c.departmentId):selected;
  return sector.length===1?{...sector[0],whatsappJid:jid}:null;
 };
 const list=async user=>Promise.all((await all(user.companyId)).filter(c=>canAccess(user,c)).map(async c=>{let status;try{status=await gateway?.status(c.id);}catch{}return {id:c.id,name:c.name,departmentId:c.departmentId,kind:c.kind,signaturePosition:c.signaturePosition||'top',teamIds:c.teamIds||null,status:status?.status||'disconnected',phone:status?.phone||null};}));
 function install(route,admin){
  route('get','/whatsapp/channels',async(req,res)=>res.json({channels:await list(req.user)}));
  route('post','/admin/whatsapp/channels',admin,async(req,res)=>{
   const cid=req.user.companyId,b=req.body,departmentId=b.departmentId||null;
   if(departmentId){const d=await store.get('department',departmentId,cid);if(!d||d.active===false)throw fail(400,'Escolha um setor ativo.');if((await all(cid)).some(c=>c.departmentId===departmentId))throw fail(409,'Este setor já possui um WhatsApp.');}
   const c={companyId:cid,name:text(b.name,2,100),departmentId,kind:['hr','support','office'].includes(b.kind)?b.kind:'support',teamIds:[],active:true};
   const saved=await store.put('wa-channel',cid,c,'wa-channel:'+randomUUID(),true);res.status(201).json(saved);
  });
  route('patch','/admin/whatsapp/channels/:id',admin,async(req,res)=>{
   const cid=req.user.companyId,c=await owned(cid,req.params.id),b=req.body;
   if(b.name!==undefined)c.name=text(b.name,2,100);
   if(b.departmentId!==undefined){if(b.departmentId){const d=await store.get('department',b.departmentId,cid);if(!d||d.active===false)throw fail(400,'Escolha um setor ativo.');if((await all(cid)).some(v=>v.id!==c.id&&v.departmentId===d.id))throw fail(409,'Este setor já possui um WhatsApp.');}c.departmentId=b.departmentId||null;}
   if(b.kind!==undefined){if(!['hr','support','office'].includes(b.kind))throw fail(400,'Escolha o tipo de atendimento.');c.kind=b.kind;}
   if(b.signaturePosition!==undefined){if(!['top','bottom','none'].includes(b.signaturePosition))throw fail(400,'Escolha a posição da assinatura.');c.signaturePosition=b.signaturePosition;}
   if(b.teamIds!==undefined){if(!Array.isArray(b.teamIds)||b.teamIds.length>200)throw fail(400,'Selecione a equipe de atendimento.');const users=await store.list('user',cid);c.teamIds=[...new Set(b.teamIds)];if(c.teamIds.some(id=>!users.some(u=>u.id===id&&u.active)))throw fail(400,'Selecione colaboradores ativos desta empresa.');for(const id of c.teamIds){const u=users.find(u=>u.id===id);if(u.role!=='admin'&&!u.whatsappAgent){u.whatsappAgent=true;u.whatsappChannelAccess=true;await store.put('user',cid,u,u.id);}}}
   delete c.legacy;await store.put('wa-channel',cid,c,c.id);res.json(c);
  });
  route('get','/admin/whatsapp/channels/:id/connection',admin,async(req,res)=>{const c=await owned(req.user.companyId,req.params.id);if(!gateway)throw fail(503,'Conexão indisponível.');res.json(await gateway.status(c.id));});
  for(const action of ['connect','disconnect','reset-start'])route('post','/admin/whatsapp/channels/:id/'+action,admin,async(req,res)=>{const c=await owned(req.user.companyId,req.params.id);if(!gateway)throw fail(503,'Conexão indisponível.');await gateway[action==='reset-start'?'resetStart':action](c.id);res.json({ok:true});});
 }
 return {resolve,all,owned,defaultFor,canAccess,forUser,connectionFor,member,list,install};
}
