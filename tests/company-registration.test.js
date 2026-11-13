import test from 'node:test';
import assert from 'node:assert/strict';
import {documentError,formatDocument,normalizeDocument,documentType} from '../src/company-document.js';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
test('máscara alterna CPF/CNPJ ao digitar, colar e apagar, inclusive CNPJ alfanumérico',()=>{
 assert.equal(formatDocument('52998224725'),'529.982.247-25');
 assert.equal(formatDocument('529.982.247-251'),'52.998.224/7251');
 assert.equal(formatDocument('11.222.333/0001-81'),'11.222.333/0001-81');
 assert.equal(formatDocument('11222333000'),'112.223.330-00');
 assert.equal(formatDocument('12abc34501de35'),'12.ABC.345/01DE-35');
 assert.equal(documentType('12.ABC'),'cnpj');assert.equal(normalizeDocument('11.222.333/0001-81'),'11222333000181');
});
test('documentos vazios, repetidos ou com dígitos incorretos são recusados',()=>{
 for(const value of ['',undefined,'123','11111111111','52998224724','11222333000180','12ABC34501DE34','abc52998224725','112223330001810'])assert.ok(documentError(value),String(value));
 for(const value of ['529.982.247-25','11.222.333/0001-81','12.ABC.345/01DE-35'])assert.equal(documentError(value),'',value);
});
test('cadastro exige documento antes de gravar; guarda normalizado sem expor no bootstrap ou convite',async t=>{
 const store=new MemoryStore(),app=createApp({store,secret:'company-register-test-secret-at-least-32-characters',platformEnv:{}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const req=async(path,body,token)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};};
 const base={mode:'company',name:'Pessoa Exemplo',companyName:'Empresa Exemplo',email:'document@example.test',password:'abc123',phone:'5568999999900'};
 for(const document of [undefined,'','11111111111','11222333000180']){
  const response=await req('/auth/register',{...base,document});assert.equal(response.status,400);assert.match(response.body.error,/CPF|CNPJ/);assert.equal(store.rows.size,0);
 }
 for(const [i,document]of ['529.982.247-25','11.222.333/0001-81','12.ABC.345/01DE-35'].entries()){
  const response=await req('/auth/register',{...base,email:`document${i}@example.test`,document});assert.equal(response.status,201);
  const company=await store.get('company',response.body.user.companyId);assert.equal(company.document,normalizeDocument(document));assert.equal(company.documentType,i===0?'cpf':'cnpj');
  const boot=await req('/bootstrap',null,response.body.token);assert.equal(boot.status,200);assert.equal(boot.body.company.document,undefined);assert.equal(boot.body.user.cpf,undefined);
  const access=await req('/admin/access',null,response.body.token);const invite=await req('/public/access',{token:access.body.invite,kind:'invite'});assert.equal(invite.status,200);assert.equal(invite.body.document,undefined);
 }
});
