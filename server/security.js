import {createHash,createHmac,randomBytes,createCipheriv,createDecipheriv,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(rawScrypt);
export const fail=(status,message)=>Object.assign(new Error(message),{status});
export const digest=value=>createHash('sha256').update(String(value)).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export const lookup=(secret,...parts)=>'moodcorp:'+createHmac('sha256',secret).update(parts.join(':')).digest('hex');
export const day=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function text(value,min=0,max=4000){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw fail(400,`Preencha o campo com ${min} a ${max} caracteres.`);return value.trim();}
export function phone(value){const v=String(value||'').replace(/\D/g,'');if(!/^[1-9]\d{7,14}$/.test(v))throw fail(400,'Confira o país e o telefone com DDD ou código de área.');return v;}
export function checkedCPF(value){
 if(value===null||value==='')return null;
 if(typeof value!=='string'||!/^[\d.\-\s]+$/.test(value))throw fail(400,'Informe um CPF válido, com 11 números.');
 const digits=value.replace(/\D/g,'');if(!/^\d{11}$/.test(digits)||/^(\d)\1{10}$/.test(digits))throw fail(400,'Informe um CPF válido, com 11 números.');
 for(const length of [9,10]){let sum=0;for(let i=0;i<length;i++)sum+=Number(digits[i])*(length+1-i);const check=(sum*10)%11;if(Number(digits[length])!==(check===10?0:check))throw fail(400,'Confira os dígitos do CPF.');}
 return digits;
}
export function checkedBirthDate(value){
 if(value===null||value==='')return null;const birthDate=text(value,10,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)||!Number.isFinite(Date.parse(birthDate))||new Date(birthDate).toISOString().slice(0,10)!==birthDate||birthDate>day()||birthDate<'1900-01-01')throw fail(400,'Informe uma data de nascimento válida.');
 return birthDate;
}
export function profile(body){
 const birthDate=checkedBirthDate(body.birthDate||null);if(!birthDate&&body.mode!=='company')throw fail(400,'Informe sua data de nascimento.');
 const email=text(body.email,5,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Informe um e-mail válido.');
 const number=phone(body.phone);if(body.phoneConfirmation!==undefined&&phone(body.phoneConfirmation)!==number)throw fail(400,'Os números de telefone não conferem.');
 return {name:text(body.name,3,120),phone:number,jobTitle:text(body.jobTitle||(body.mode==='company'?'RH':''),2,100),department:text(body.department||'Geral',2,100),birthDate,email,...(body.cpf!==undefined?{cpf:checkedCPF(body.cpf)}:{})};
}

export async function hashPassword(password){if(typeof password!=='string'||password.length<6||password.length>200)throw fail(400,'Use uma senha de 6 a 200 caracteres.');const salt=randomBytes(16).toString('hex');return salt+':'+Buffer.from(await scrypt(password,salt,64)).toString('hex');}
export async function verifyPassword(password,stored){const [salt,hash]=String(stored||'dummysalt:00').split(':');const key=Buffer.from(await scrypt(typeof password==='string'&&password.length<=200?password:'',salt,64)),other=Buffer.from(hash||'00','hex');return key.length===other.length&&timingSafeEqual(key,other);}
export function vault(secret){if(secret.length<32)throw Error('MOODCORP_SECRET deve ter pelo menos 32 caracteres.');const key=createHash('sha256').update('moodcorp:v1:'+secret).digest();return {seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64');},open(value){const raw=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));cipher.setAuthTag(raw.subarray(-16));return JSON.parse(Buffer.concat([cipher.update(raw.subarray(12,-16)),cipher.final()]).toString());}};}
export function limiter(max=90,windowMs=60000){const entries=new Map();const timer=setInterval(()=>{for(const [k,v]of entries)if(v.until<Date.now())entries.delete(k);},60000);timer.unref();return (req,res,next)=>{const key=req.user?.id||req.ip;let item=entries.get(key);if(!item||item.until<Date.now())item={count:0,until:Date.now()+windowMs};item.count++;entries.set(key,item);if(item.count>max)return res.status(429).set('Retry-After',String(Math.ceil((item.until-Date.now())/1000))).json({error:'Muitas tentativas. Aguarde um pouco e tente novamente.'});next();};}
export const publicUser=u=>Object.fromEntries(['id','companyId','name','email','phone','jobTitle','department','birthDate','cpf','address','role','shareMood','aiConsent','whatsappConsent','wellbeingWhatsappConsent','whatsappAgent','phoneVerified','employeeCode','departmentId','attendanceMethod','allowOwnTasks','avatarUpdatedAt','active'].map(k=>[k,u[k]]));
export const publicCompany=c=>({id:c.id,name:c.name,sector:c.sector,code:c.code,createdAt:c.createdAt});
