import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,Check,Eye,EyeOff} from 'lucide-react';
import {api,setSession} from './api';
import {PhoneField} from './phone-field';
import {MethodSelect} from './workforce';
import {documentError,documentType,formatDocument,normalizeDocument} from './company-document.js';
import './registration.css';
const steps=['Você','Contato','Empresa'];
export function CompanyRegistration({onEnter}:{onEnter:()=>void}){
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[show,setShow]=useState(false),[document,setDocument]=useState('');
 const form=useRef<HTMLFormElement>(null),documentInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{documentInput.current?.setCustomValidity(document?documentError(document):'');},[document]);
 useEffect(()=>{form.current?.querySelector<HTMLElement>(`[data-step="${step}"] input:not([type=hidden])`)?.focus();},[step]);
 const changeDocument=(input:HTMLInputElement)=>{
  const before=input.value.slice(0,input.selectionStart??input.value.length).replace(/[^A-Z0-9]/gi,'').length;
  const value=formatDocument(input.value);setDocument(value);
  requestAnimationFrame(()=>{if(!input.isConnected)return;let position=0,count=0;while(position<value.length&&count<before){if(/[A-Z0-9]/.test(value[position]))count++;position++;}input.setSelectionRange(position,position);});
 };
 const validate=(index:number)=>{
  const controls=form.current?.querySelectorAll<HTMLInputElement|HTMLSelectElement>(`[data-step="${index}"] input:not([type=hidden]),[data-step="${index}"] select`);
  return [...controls||[]].find(input=>!input.checkValidity());
 };
 const submit=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(busy)return;setError('');
  const invalid=validate(step);if(invalid){invalid.reportValidity();return;}
  if(step<2){setStep(step+1);return;}
  for(let i=0;i<3;i++){const missing=validate(i);if(missing){setStep(i);requestAnimationFrame(()=>missing.reportValidity());return;}}
  const body=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);
  try{
   const out=await api('/auth/register',{...body,document:normalizeDocument(document),mode:'company',jobTitle:'RH',department:'Geral'});
   setSession(out.token);onEnter();
  }catch(e){const message=(e as Error).message;setError(message);if(/CPF|CNPJ|empresa/i.test(message))setStep(2);else if(/telefone|número|WhatsApp/i.test(message))setStep(1);else if(/e-mail|senha|conta|nome/i.test(message))setStep(0);
  }finally{setBusy(false);}
 };
 return <form ref={form} onSubmit={submit} noValidate className="ol-company-register" aria-label="Cadastrar empresa">
  <ol className="ol-register-progress" aria-label="Etapas do cadastro">{steps.map((label,index)=><li key={label} aria-current={step===index?'step':undefined} className={index<=step?'reached':''}><span>{index<step?<Check size={13}/>:index+1}</span>{label}</li>)}</ol>
  <div className="ol-register-step" data-step="0" hidden={step!==0}><h3>Quem vai administrar?</h3><p>Crie seu acesso para cuidar da empresa.</p><label>Nome completo<input name="name" autoComplete="name" required minLength={3} maxLength={120} placeholder="Seu nome completo" disabled={busy}/></label><label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="voce@empresa.com.br" disabled={busy}/></label><label>Senha<span className="pn-password"><input name="password" type={show?'text':'password'} autoComplete="new-password" minLength={6} maxLength={200} required placeholder="Pelo menos 6 caracteres" disabled={busy}/><button type="button" aria-label={show?'Ocultar senha':'Mostrar senha'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label></div>
  <div className="ol-register-step" data-step="1" hidden={step!==1}><h3>Como falar com você?</h3><p>Informe seu telefone e confira a digitação.</p><PhoneField confirm/></div>
  <div className="ol-register-step" data-step="2" hidden={step!==2}><h3>Agora, sua empresa.</h3><p>Informe o CPF ou CNPJ de quem contrata o Oluni.</p><label>Nome da empresa<input name="companyName" required minLength={2} maxLength={120} autoComplete="organization" placeholder="Como sua empresa se chama?" disabled={busy}/></label><label>CPF ou CNPJ <span className="ol-document-type" aria-live="polite">{document?documentType(document).toUpperCase():'Obrigatório'}</span><input ref={documentInput} name="document" type="text" inputMode={documentType(document)==='cnpj'?'text':'numeric'} autoCapitalize="characters" autoComplete="off" spellCheck={false} value={document} onChange={e=>changeDocument(e.currentTarget)} required maxLength={18} placeholder="Digite o CPF ou CNPJ" disabled={busy}/><small>A pontuação é automática. Continue digitando para usar CNPJ.</small></label><label>Método de ponto inicial<MethodSelect name="attendanceMethod"/><small>Você pode mudar depois, inclusive por colaborador.</small></label></div>
  {error&&<p className="pn-alert" role="alert">{error}</p>}
  <div className="ol-register-actions">{step>0&&<button className="pn-button secondary" type="button" disabled={busy} onClick={()=>{setError('');setStep(step-1);}}><ArrowLeft size={16}/>Voltar</button>}<button className="pn-button" disabled={busy}>{busy?'Criando…':step===2?'Criar empresa':'Continuar'}<ArrowRight size={17}/></button></div>
  <small className="ol-register-count" role="status">Etapa {step+1} de 3</small>
 </form>;
}
