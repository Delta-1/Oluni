import {fail,text,phone,checkedCPF,checkedBirthDate} from './security.js';
// Shared whitelist for a person's own profile and the same-company RH editor.
export async function personalData(store,user,body){
 const next={...user};
 if(body.name!==undefined)next.name=text(body.name,3,120);
 if(body.jobTitle!==undefined)next.jobTitle=text(body.jobTitle,2,100);
 if(body.birthDate!==undefined)next.birthDate=checkedBirthDate(body.birthDate);
 if(body.cpf!==undefined)next.cpf=checkedCPF(body.cpf);
 if(body.address!==undefined)next.address=text(body.address,0,240);
 if(body.phone!==undefined){const number=phone(body.phone);if(number!==next.phone){next.phone=number;delete next.whatsappJid;next.phoneVerified=false;}}
 const changedPhone=next.phone!==user.phone,changedCPF=next.cpf&&next.cpf!==user.cpf;
 if(changedPhone||changedCPF){const users=await store.list('user',user.companyId);if(changedPhone&&users.some(u=>u.id!==user.id&&u.active&&u.phone===next.phone))throw fail(409,'Este telefone já está cadastrado para outra pessoa da empresa. Confira o número.');if(changedCPF&&users.some(u=>u.id!==user.id&&u.cpf===next.cpf))throw fail(409,'Este CPF já está cadastrado para outra pessoa da empresa. Confira o CPF.');}
 return next;
}
