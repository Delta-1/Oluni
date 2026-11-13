// Pure, local validation: the document is never sent to a lookup service.
export const normalizeDocument=value=>String(value??'').toUpperCase().replace(/[.\/\-\s]/g,'');
export function documentType(value){const v=normalizeDocument(value);return /[A-Z]/.test(v)||v.length>11?'cnpj':'cpf';}
export function formatDocument(value){
 const v=normalizeDocument(value).replace(/[^A-Z0-9]/g,'').slice(0,14),cnpj=documentType(v)==='cnpj';
 const groups=cnpj?[2,3,3,4,2]:[3,3,3,2],separators=cnpj?['.','.','/','-']:['.','.','-'];
 let result='',offset=0;
 for(let i=0;i<groups.length&&offset<v.length;i++){if(i)result+=separators[i-1];result+=v.slice(offset,offset+groups[i]);offset+=groups[i];}
 return result;
}
export function documentError(value){
 const v=normalizeDocument(value);
 if(!v)return 'Informe o CPF ou CNPJ do contratante.';
 const type=documentType(v);
 if(type==='cpf'){
  if(!/^\d{11}$/.test(v))return 'O CPF precisa ter 11 números.';
  if(/^(\d)\1+$/.test(v))return 'Confira o CPF informado.';
  for(let size=9;size<=10;size++){
   const rest=[...v.slice(0,size)].reduce((sum,c,i)=>sum+Number(c)*(size+1-i),0)*10%11;
   if((rest===10?0:rest)!==Number(v[size]))return 'Confira o CPF informado.';
  }
 }else{
  if(!/^[A-Z0-9]{12}\d{2}$/.test(v)||/^(\d)\1+$/.test(v))return 'Confira o CNPJ: são 14 caracteres, com dois números no final.';
  // Receita Federal: ASCII minus 48, weights 2..9 from right to left.
  for(let size=12;size<=13;size++){
   const rest=[...v.slice(0,size)].reverse().reduce((sum,c,i)=>sum+(c.charCodeAt(0)-48)*(2+i%8),0)%11;
   if((rest<2?0:11-rest)!==Number(v[size]))return 'Confira o CNPJ informado.';
  }
 }
 return '';
}
