import React,{useMemo,useState} from 'react';
import {getCountries,getCountryCallingCode,parsePhoneNumberFromString,type CountryCode} from 'libphonenumber-js/min';
const countries=getCountries();
const labels=new Intl.DisplayNames(['pt-BR'],{type:'region'});
const flag=(code:string)=>String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0)));
export function PhoneField({value='',label='WhatsApp',name='phone',required=true,onChange}:{value?:string,label?:string,name?:string,required?:boolean,onChange?:(v:string)=>void}){
 const initial=useMemo(()=>parsePhoneNumberFromString('+'+value.replace(/\D/g,'')),[]);
 const [country,setCountry]=useState<CountryCode>(initial?.country||'BR'),[national,setNational]=useState(initial?.nationalNumber||'');
 const ordered=useMemo(()=>['BR','BO','PT','US','AR','PY',...countries.filter(c=>!['BR','BO','PT','US','AR','PY'].includes(c)).sort((a,b)=>(labels.of(a)||a).localeCompare(labels.of(b)||b,'pt-BR'))] as CountryCode[],[]);
 const normalized=(v:string,c:CountryCode)=>{const digits=v.replace(/\D/g,'');if(!digits)return '';const p=parsePhoneNumberFromString(v,c);return p?.number.replace(/^\+/,'')||getCountryCallingCode(c)+digits;};
 const number=normalized(national,country);
 return <label className="ol-phone-label">{label}<span className="ol-phone-field"><select aria-label={'País do '+label} value={country} onChange={e=>{const c=e.target.value as CountryCode;setCountry(c);onChange?.(normalized(national,c));}}>{ordered.map(c=><option key={c} value={c}>{flag(c)} {labels.of(c)||c} +{getCountryCallingCode(c)}</option>)}</select><input aria-label={label+' com DDD'} type="tel" autoComplete="tel-national" inputMode="tel" value={national} maxLength={25} required={required} placeholder={country==='BR'?'(11) 99999-9999':country==='BO'?'7000 0000':'Número com código de área'} onChange={e=>{setNational(e.target.value);onChange?.(normalized(e.target.value,country));}}/></span><input type="hidden" name={name} value={number}/><small>Escolha o país e digite o número. O código internacional entra automaticamente.</small></label>;
}
