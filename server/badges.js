import sharp from 'sharp';
import QRCode from 'qrcode';
import {createHmac} from 'node:crypto';
import {fail,lookup,digest,publicUser,limiter} from './security.js';
import {badgeDesign,checkedBadgeDesign} from './badge-design.js';

// Profile and company images are decoded, resized and re-encoded without EXIF.
// They are separate from attendance and task evidence, in the encrypted store.
export async function normalizeIdentityImage(file,purpose='avatar'){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.mime)||typeof file.data!=='string'||file.data.length>4200000||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw fail(400,'Escolha uma imagem JPG, PNG ou WebP de até 3 MB.');
  const input=Buffer.from(file.data,'base64');if(!input.length||input.length>3*1024*1024)throw fail(400,'A imagem deve ter até 3 MB.');
  try{
    const image=sharp(input,{limitInputPixels:8000000,failOn:'warning'}),meta=await image.metadata();
    if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw Error('Unsupported image');
    const logo=purpose==='logo',background=purpose==='badge-background';
    const data=await image.rotate().resize(logo?{width:500,height:220,fit:'inside',withoutEnlargement:true}:background?{width:800,height:1274,fit:'inside',withoutEnlargement:true}:{width:480,height:600,fit:'cover',position:'centre'}).toFormat(logo?'png':'jpeg',logo?{compressionLevel:9}:{quality:85,mozjpeg:true}).toBuffer();
    if(data.length>600000)throw Error('Image too large');
    return {mime:logo?'image/png':'image/jpeg',data:data.toString('base64'),updatedAt:new Date().toISOString()};
  }catch{throw fail(400,'Não foi possível ler esta imagem. Escolha outro JPG, PNG ou WebP.');}
}
export async function saveIdentityImage(store,cid,owner,image,purpose='avatar'){
  return store.put('identity-image',cid,{owner,purpose,...image});
}
const displayImage=image=>image?{mime:image.mime,data:image.data,updatedAt:image.updatedAt}:null;

export function createBadgeService({route,store,secret,companyFor,forUser,publicAppUrl,serial}){
  const rawOrigin=publicAppUrl||process.env.PUBLIC_APP_URL||'https://oluni.up.railway.app/';
  const appUrl=new URL(rawOrigin);if(appUrl.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&appUrl.protocol==='http:'))throw Error('PUBLIC_APP_URL deve usar HTTPS.');appUrl.search='';appUrl.hash='';
  const imageFor=async(id,cid,owner,purpose)=>{if(!id)return null;const row=await store.get('identity-image',id,cid);return row?.owner===owner&&row.purpose===purpose?displayImage(row):null;};
  const designFor=async c=>({...badgeDesign(c),background:await imageFor(c.badgeDesign?.backgroundId,c.id,c.id,'badge-background')});
  const identityFor=async c=>{const [logo,design]=await Promise.all([imageFor(c.logoId,c.id,c.id,'logo'),designFor(c)]);return {name:c.name,logo,design};};
  const publicCard=async(user,company,identity)=>{
    const [brand,photo]=await Promise.all([identity?Promise.resolve(identity):identityFor(company),imageFor(user.avatarId,company.id,user.id,'avatar')]);
    return {company:brand,employee:{name:user.name,code:user.employeeCode,jobTitle:user.jobTitle,department:user.department,active:user.active===true,photo},checkedAt:new Date().toISOString()};
  };
  const badgeFor=async(user,company,identity)=>{
    const u=await forUser(user),version=u.badgeVersion||1;
    const raw=createHmac('sha256',secret).update('oluni-public-badge:'+company.id+':'+u.id+':'+version).digest('base64url');
    await store.put('badge-link',company.id,{owner:u.id,companyId:company.id,version},lookup(secret,'badge-link',digest(raw)));
    const url=new URL(appUrl);url.hash='cracha='+raw;
    return {...await publicCard(u,company,identity),verificationUrl:url.href,qrImage:await QRCode.toDataURL(url.href,{width:320,margin:4,errorCorrectionLevel:'M'})};
  };
  // An opaque capability identifies one badge. It never authenticates a user.
  route('post','/public/badges/verify',limiter(60,60000),async(req,res)=>{
    const raw=req.body.token;if(typeof raw!=='string'||! /^[\w-]{43}$/.test(raw))throw fail(404,'Crachá não encontrado ou link renovado.');
    const ref=await store.get('badge-link',lookup(secret,'badge-link',digest(raw)));
    if(!ref)throw fail(404,'Crachá não encontrado ou link renovado.');
    // The reference is resolved by capability, then checked inside its tenant.
    const u=await store.get('user',ref.owner,ref.companyId);
    if(!u||(u.badgeVersion||1)!==ref.version)throw fail(404,'Crachá não encontrado ou link renovado.');
    const scoped=await store.get('badge-link',ref.id,u.companyId);if(!scoped||scoped.owner!==u.id)throw fail(404,'Crachá não encontrado.');
    const c=await store.get('company',u.companyId,u.companyId);if(!c)throw fail(404,'Crachá não encontrado.');
    res.set('X-Robots-Tag','noindex, nofollow, noarchive');res.json(await publicCard(u,c));
  });
  return {
    async addRegistrationPhoto(user,file){if(!file)return null;const image=await saveIdentityImage(store,user.companyId,user.id,file);user.avatarId=image.id;user.avatarUpdatedAt=image.updatedAt;return image.id;},
    installAuthenticated(admin){
      route('post','/profile/photo',limiter(20,60000),async(req,res)=>serial('avatar:'+req.user.id,async()=>{
        const image=await normalizeIdentityImage(req.body),u=await store.get('user',req.user.id,req.user.companyId),saved=await saveIdentityImage(store,u.companyId,u.id,image),old=u.avatarId;
        u.avatarId=saved.id;u.avatarUpdatedAt=saved.updatedAt;
        try{await store.put('user',u.companyId,u,u.id);}catch(e){await store.remove('identity-image',saved.id,u.companyId);throw e;}
        if(old)await store.remove('identity-image',old,u.companyId);
        res.json(publicUser(u));
      }));
      route('delete','/profile/photo',async(req,res)=>serial('avatar:'+req.user.id,async()=>{const u=await store.get('user',req.user.id,req.user.companyId),old=u.avatarId;delete u.avatarId;delete u.avatarUpdatedAt;await store.put('user',u.companyId,u,u.id);if(old)await store.remove('identity-image',old,u.companyId);res.json(publicUser(u));}));
      route('get','/people/:id/photo',async(req,res)=>{if(req.user.role!=='admin'&&req.params.id!==req.user.id)throw fail(404,'Foto não encontrada.');const u=await store.get('user',req.params.id,req.user.companyId),image=u&&await imageFor(u.avatarId,u.companyId,u.id,'avatar');if(!image)throw fail(404,'Foto não encontrada.');res.json(image);});
      route('get','/admin/company/identity',admin,async(req,res)=>{const c=await companyFor(req.user.companyId);res.json({name:c.name,logo:await imageFor(c.logoId,c.id,c.id,'logo')});});
      route('post','/admin/company/logo',admin,limiter(20,60000),async(req,res)=>serial('company-identity:'+req.user.companyId,async()=>{
        const image=await normalizeIdentityImage(req.body,'logo'),c=await companyFor(req.user.companyId),saved=await saveIdentityImage(store,c.id,c.id,image,'logo'),old=c.logoId;c.logoId=saved.id;c.logoUpdatedAt=saved.updatedAt;
        try{await store.put('company',c.id,c,c.id);}catch(e){await store.remove('identity-image',saved.id,c.id);throw e;}
        if(old)await store.remove('identity-image',old,c.id);res.json({name:c.name,logo:displayImage(saved)});
      }));
      route('delete','/admin/company/logo',admin,async(req,res)=>serial('company-identity:'+req.user.companyId,async()=>{const c=await companyFor(req.user.companyId),old=c.logoId;delete c.logoId;delete c.logoUpdatedAt;await store.put('company',c.id,c,c.id);if(old)await store.remove('identity-image',old,c.id);res.json({name:c.name,logo:null});}));
      route('get','/admin/company/badge-design',admin,async(req,res)=>{const c=await companyFor(req.user.companyId);res.json({design:await designFor(c),preview:await badgeFor(req.user,c)});});
      route('post','/admin/company/badge-design',admin,limiter(20,60000),async(req,res)=>serial('company-identity:'+req.user.companyId,async()=>{
        const c=await companyFor(req.user.companyId),design=checkedBadgeDesign(req.body,c.badgeDesign),old=design.backgroundId;let saved;
        if(req.body.background&&req.body.removeBackground===true)throw fail(400,'Escolha enviar ou remover a imagem de fundo.');
        if(req.body.background){const image=await normalizeIdentityImage(req.body.background,'badge-background');saved=await saveIdentityImage(store,c.id,c.id,image,'badge-background');design.backgroundId=saved.id;}
        if(req.body.removeBackground===true)delete design.backgroundId;
        if(design.preset==='image'&&!design.backgroundId){if(saved)await store.remove('identity-image',saved.id,c.id);throw fail(400,'Escolha uma imagem para usar como fundo.');}
        c.badgeDesign=design;
        try{await store.put('company',c.id,c,c.id);}catch(e){if(saved)await store.remove('identity-image',saved.id,c.id);throw e;}
        if(old&&old!==design.backgroundId)await store.remove('identity-image',old,c.id);
        res.json({design:await designFor(c)});
      }));
      route('get','/badges/mine',async(req,res)=>res.json(await badgeFor(req.user,await companyFor(req.user.companyId))));
      route('get','/admin/employees/:id/badge',admin,async(req,res)=>{const u=await store.get('user',req.params.id,req.user.companyId);if(!u)throw fail(404,'Colaborador não encontrado.');res.json(await badgeFor(u,await companyFor(u.companyId)));});
      route('post','/admin/employees/:id/badge/renew',admin,async(req,res)=>serial('badge:'+req.params.id,async()=>{const u=await store.get('user',req.params.id,req.user.companyId);if(!u)throw fail(404,'Colaborador não encontrado.');u.badgeVersion=(u.badgeVersion||1)+1;await store.put('user',u.companyId,u,u.id);res.json(await badgeFor(u,await companyFor(u.companyId)));}));
      route('post','/admin/badges/print',admin,async(req,res)=>{
        const items=req.body.items;if(!Array.isArray(items)||items.length<1||items.length>60)throw fail(400,'Selecione de 1 a 60 pessoas por lote.');
        let total=0;const users=[];for(const item of items){if(!item||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>20)throw fail(400,'Use de 1 a 20 cópias por pessoa.');total+=item.quantity;const u=await store.get('user',item.id,req.user.companyId);if(!u?.active)throw fail(400,'Selecione pessoas ativas desta empresa.');users.push({u,quantity:item.quantity});}
        if(total>60)throw fail(400,'Imprima até 60 crachás por lote.');
        const c=await companyFor(req.user.companyId),cards=[],identity=await identityFor(c);
        for(let start=0;start<users.length;start+=5){const group=await Promise.all(users.slice(start,start+5).map(async({u,quantity})=>{const {company,...card}=await badgeFor(u,c,identity);return {...card,id:u.id,quantity};}));cards.push(...group);}
        res.json({company:identity,cards,total});
      });
    }
  };
}
