import QRCode from 'qrcode';
import {fail} from './security.js';
export const appVersion='3.0.0';
export function installPublicApp({route,publicAppUrl}){
 const origin=new URL(publicAppUrl||process.env.PUBLIC_APP_URL||'https://oluni.up.railway.app/');origin.search='';origin.hash='';
 const install=new URL(origin);install.searchParams.set('instalar','1');
 route('get','/client-version',async(req,res)=>res.json({version:appVersion}));
 route('get','/public/app',async(req,res)=>res.json({version:appVersion,appUrl:origin.href,installUrl:install.href,apkUrl:'https://github.com/Delta-1/Oluni/releases/download/android-preview/Oluni.apk',qrImage:await QRCode.toDataURL(install.href,{width:300,margin:2})}));
}
export function installOnboarding({route,store,admin,channels,gateway,platform}){
 route('get','/onboarding',async(req,res)=>{const u=req.user,c=await store.get('company',u.companyId,u.companyId),step=u.role==='admin'?c.onboarding:u.onboarding;res.json({required:!step?.completed,step:step?.step||(u.role==='admin'?'whatsapp':'install'),admin:u.role==='admin',platform:platform.safe(),channels:u.role==='admin'?await channels.list(u):[]});});
 route('post','/onboarding',async(req,res)=>{
  const u=req.user,b=req.body,allowed=u.role==='admin'?['whatsapp','install','done']:['install','done'];
  if(!allowed.includes(b.step))throw fail(400,'Etapa inválida.');
  if(u.role==='admin'){
   const c=await store.get('company',u.companyId,u.companyId),channel=await channels.owned(u.companyId,b.channelId||u.companyId);
   if(b.step!=='whatsapp'&&b.skipConnection!==true&&(await gateway?.status(channel.id))?.status!=='connected')throw fail(409,'Conecte o WhatsApp ou escolha conectar depois.');
   c.onboarding={step:b.step,completed:b.step==='done',channelId:channel.id,skippedConnection:b.skipConnection===true,at:new Date().toISOString()};await store.put('company',c.id,c,c.id);
  }else{u.onboarding={step:b.step,completed:b.step==='done',at:new Date().toISOString()};await store.put('user',u.companyId,u,u.id);}
  res.json({ok:true});
 });
 route('get','/platform/ai',async(req,res)=>res.json(platform.safe()));
}
