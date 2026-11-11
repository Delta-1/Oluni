import {fail,lookup} from './security.js';

export const attendanceMethods = ['code','qr','photo','checklist'];
export function validMethod(value, allowDefault=false) {
  if(allowDefault && (value===null || value==='default'))return null;
  if(value==='facial')throw fail(409,'A biometria facial precisa de um provedor de identificação e prova de vida configurado. Use outro método por enquanto.');
  if(!attendanceMethods.includes(value))throw fail(400,'Escolha um método de ponto válido.');
  return value;
}
export function methodFor(user,company){return user.attendanceMethod||company.attendanceMethod||'code';}
export function employeeCodeFor(n) {
  if(!Number.isSafeInteger(n)||n<0||n>269999)throw fail(409,'Limite de códigos da empresa atingido.');
  if(n<10000)return String(n).padStart(4,'0');
  // 0000 belongs to the administrator. After 9999: A0000, A0001 … Z9999.
  return String.fromCharCode(65+Math.floor((n-10000)/10000))+String(n%10000).padStart(4,'0');
}
export async function allocateEmployeeCode(store,secret,user,serial) {
  return serial('employee-codes:'+user.companyId,async()=>{
    const fresh=await store.get('user',user.id,user.companyId)||user;
    let departmentChanged=false;
    if(!fresh.departmentId&&fresh.department&&fresh.department!=='Geral'){const name=fresh.department.trim(),id=lookup(secret,'department',fresh.companyId,name.normalize('NFKC').toLocaleLowerCase('pt-BR'));let d=await store.get('department',id,fresh.companyId);if(!d){try{d=await store.put('department',fresh.companyId,{name,active:true,createdAt:new Date().toISOString()},id,true);}catch(e){if(e.status!==409)throw e;d=await store.get('department',id,fresh.companyId);}}if(d?.active!==false){fresh.departmentId=id;departmentChanged=true;}}
    if(/^[A-Z]?\d{4}$/.test(fresh.employeeCode||'')){if(departmentChanged)await store.put('user',fresh.companyId,fresh,fresh.id);return fresh;}
    const cursorId=lookup(secret,'employee-code-cursor',user.companyId);
    let cursor=await store.get('employee-code-cursor',cursorId,user.companyId);
    let n=fresh.role==='admin'?0:Math.max(1,cursor?.next||1);
    for(let tries=0;tries<270000;tries++,n++){
      const code=employeeCodeFor(n),id=lookup(secret,'employee-code',user.companyId,code);
      const existing=await store.get('employee-code',id,user.companyId);
      if(existing&&existing.owner!==fresh.id)continue;
      if(!existing){try{await store.put('employee-code',user.companyId,{owner:fresh.id},id,true);}catch(e){if(e.status===409)continue;throw e;}}
      if(fresh.employeeCode)fresh.legacyEmployeeCode=fresh.employeeCode;
      fresh.employeeCode=code;
      await store.put('user',fresh.companyId,fresh,fresh.id);
      if(n>0){cursor=await store.get('employee-code-cursor',cursorId,user.companyId);await store.put('employee-code-cursor',user.companyId,{next:Math.max(n+1,cursor?.next||1)},cursorId);}
      return fresh;
    }
    throw fail(503,'Não foi possível gerar o código. Tente novamente.');
  });
}

export function checkedLocation(body,required=false){
  const p=body.location;
  if(!p){if(required)throw fail(400,'Autorize a localização para registrar este ponto.');return null;}
  if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>100000)throw fail(400,'Localização inválida. Atualize o GPS e tente novamente.');
  if(!Number.isFinite(p.capturedAt)||Math.abs(Date.now()-p.capturedAt)>120000)throw fail(400,'Atualize sua localização antes de registrar.');
  return {lat:p.lat,lng:p.lng,accuracy:p.accuracy,capturedAt:p.capturedAt};
}
