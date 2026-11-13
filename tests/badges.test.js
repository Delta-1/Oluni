import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
const secret='oluni-badges-tests-only-at-least-32-chars';
const person=(email,extra={})=>({name:'Pessoa Exemplo',email,password:'test-password-123',phone:'5568999999999',birthDate:'2000-01-01',jobTitle:'Auxiliar',...extra});
async function fixture(t){
 const store=new MemoryStore(),server=createApp({store,secret,publicAppUrl:'https://oluni.up.railway.app/'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const req=async(path,body,session='',method)=>{const res=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:method||(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
 const company=async(email)=>{const r=await req('/auth/register',person(email,{mode:'company',document:'11222333000181',companyName:'Empresa Exemplo'}));assert.equal(r.status,201);return r.body;};
 const admin=await company('admin@example.test'),invite=(await req('/admin/access',undefined,admin.token)).body.invite;
 const avatar={mime:'image/jpeg',data:(await sharp({create:{width:80,height:100,channels:3,background:'#bb9977'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'PRIVATE EXIF'}}}).toBuffer()).toString('base64')};
 const employee=(await req('/auth/register',person('employee@example.test',{mode:'employee',invite,photo:avatar}))).body;
 return {store,req,company,admin,invite,employee,avatar};
}
const badgeToken=card=>new URLSearchParams(new URL(card.verificationUrl).hash.slice(1)).get('cracha');
test('foto no convite fica disponível sem aprovação e imagem é normalizada sem metadados',async t=>{
 const f=await fixture(t);assert.equal(f.employee.user.employeeCode,'0001');assert.ok(f.employee.user.avatarUpdatedAt);assert.equal(f.employee.user.avatarId,undefined);
 const image=await f.req('/people/'+f.employee.user.id+'/photo',undefined,f.employee.token);assert.equal(image.status,200);assert.equal(image.body.mime,'image/jpeg');
 const meta=await sharp(Buffer.from(image.body.data,'base64')).metadata();assert.equal(meta.width,480);assert.equal(meta.height,600);assert.equal(meta.exif,undefined);
 assert.equal((await f.req('/people/'+f.employee.user.id+'/photo',undefined,f.admin.token)).status,200);
 const b=await f.company('other@example.test');assert.equal((await f.req('/people/'+f.employee.user.id+'/photo',undefined,b.token)).status,404);
 assert.equal((await f.req('/auth/register',person('invalid@example.test',{mode:'employee',invite:f.invite,photo:{mime:'image/jpeg',data:'ZmFrZQ=='}}))).status,400);
 assert.equal((await f.store.list('user')).some(u=>u.email==='invalid@example.test'),false);
});
test('usuário troca e remove a própria foto; crachá acompanha a versão atual',async t=>{
 const f=await fixture(t),before=(await f.req('/badges/mine',undefined,f.employee.token)).body,rows=await f.store.list('identity-image');assert.equal(rows.length,1);
 const replacement={mime:'image/png',data:(await sharp({create:{width:100,height:120,channels:3,background:'#336699'}}).png().toBuffer()).toString('base64')};
 assert.equal((await f.req('/profile/photo',replacement,f.employee.token)).status,200);assert.equal((await f.store.list('identity-image')).length,1);
 const now=(await f.req('/public/badges/verify',{token:badgeToken(before)})).body;assert.notEqual(now.employee.photo.data,before.employee.photo.data);
 assert.equal((await f.req('/profile/photo',{},f.employee.token,'DELETE')).status,200);assert.equal((await f.store.list('identity-image')).length,0);
 assert.equal((await f.req('/public/badges/verify',{token:badgeToken(before)})).body.employee.photo,null);
});
test('logo é exclusiva do RH e aparece em crachás sem alterar regras da empresa',async t=>{
 const f=await fixture(t),before=await f.store.get('company',f.admin.user.companyId,f.admin.user.companyId);
 assert.equal((await f.req('/admin/company/logo',f.avatar,f.employee.token)).status,403);
 assert.equal((await f.req('/admin/company/logo',f.avatar,f.admin.token)).status,200);
 const card=(await f.req('/admin/employees/'+f.employee.user.id+'/badge',undefined,f.admin.token)).body;
 assert.equal(card.company.name,'Empresa Exemplo');assert.equal(card.company.logo.mime,'image/png');assert.equal(card.employee.code,'0001');assert.equal(card.employee.photo.mime,'image/jpeg');
 const after=await f.store.get('company',before.id,before.id);assert.equal(after.code,before.code);assert.equal(after.attendanceMethod,before.attendanceMethod);
 assert.equal((await f.req('/admin/company/logo',{},f.admin.token,'DELETE')).status,200);assert.equal((await f.req('/badges/mine',undefined,f.admin.token)).body.company.logo,null);
});
test('QR do crachá consulta somente identificação; não autentica nem registra ponto',async t=>{
 const f=await fixture(t),card=(await f.req('/admin/employees/'+f.employee.user.id+'/badge',undefined,f.admin.token)).body;
 const png=PNG.sync.read(Buffer.from(card.qrImage.split(',')[1],'base64')),url=jsQR(new Uint8ClampedArray(png.data),png.width,png.height).data;assert.equal(url,card.verificationUrl);assert.equal(new URL(url).origin,'https://oluni.up.railway.app');assert.equal(new URL(url).search,'');
 const token=badgeToken(card),result=await f.req('/public/badges/verify',{token});assert.equal(result.status,200);assert.equal(result.body.employee.active,true);
 assert.deepEqual(Object.keys(result.body.employee).sort(),['active','code','department','jobTitle','name','photo']);
 for(const sensitive of ['email','phone','birthDate','passwordHash','shareMood','aiConsent','companyId','id'])assert.equal(result.body.employee[sensitive],undefined);
 assert.equal((await f.req('/bootstrap',undefined,token)).status,401);assert.equal((await f.req('/public/badges/verify',{token:'0001'})).status,404);
 assert.equal((await f.store.list('clock-event')).length,0);assert.equal(result.body.qrImage,undefined);
});
test('desativar colaborador muda consulta online e renovar QR revoga crachá anterior',async t=>{
 const f=await fixture(t),path='/admin/employees/'+f.employee.user.id+'/badge',card=(await f.req(path,undefined,f.admin.token)).body,token=badgeToken(card);
 await f.req('/admin/employees/'+f.employee.user.id,{active:false},f.admin.token,'PATCH');
 assert.equal((await f.req('/public/badges/verify',{token})).body.employee.active,false);
 const renewed=await f.req(path+'/renew',{},f.admin.token);assert.equal(renewed.status,200);assert.notEqual(badgeToken(renewed.body),token);
 assert.equal((await f.req('/public/badges/verify',{token})).status,404);assert.equal((await f.req('/public/badges/verify',{token:badgeToken(renewed.body)})).body.employee.active,false);
});
test('visualização e impressão respeitam empresa, privilégio e quantidade',async t=>{
 const f=await fixture(t),b=await f.company('isolated@example.test'),items=[{id:f.employee.user.id,quantity:2},{id:f.admin.user.id,quantity:1}];
 assert.equal((await f.req('/admin/employees/'+f.employee.user.id+'/badge',undefined,b.token)).status,404);
 assert.equal((await f.req('/admin/badges/print',{items},f.employee.token)).status,403);
 assert.equal((await f.req('/admin/badges/print',{items},b.token)).status,400);
 assert.equal((await f.req('/admin/badges/print',{items:[{id:f.employee.user.id,quantity:21}]},f.admin.token)).status,400);
 const batch=await f.req('/admin/badges/print',{items},f.admin.token);assert.equal(batch.status,200);assert.equal(batch.body.total,3);assert.equal(batch.body.cards.length,2);assert.equal(batch.body.cards[0].quantity,2);
 assert.equal(batch.body.cards[0].employee.code,'0001');assert.equal(batch.body.cards[1].employee.code,'0000');
});
