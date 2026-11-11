import {createSessionState} from './session.js';
const session=createSessionState();
const apiOrigin=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
const preview=import.meta.env.DEV&&new URLSearchParams(location.search).get('preview')==='1';
export function setSession(token:string,remember=false){session.set(token,remember);}
export const hasSession=()=>!!session.get()||preview;
export async function api<T=any>(path:string,body?:unknown,method?:string):Promise<T>{const current=session.get();let res:Response;try{res=await fetch(apiOrigin+'/api'+path+(preview?(path.includes('?')?'&':'?')+'local-preview=1':''),{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(current?{Authorization:'Bearer '+current}:{}),...(preview?{'X-Oluni-Preview':'local-only'}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});}catch{throw Error('Não foi possível conectar ao Oluni. Verifique sua conexão e tente novamente.');}if(!res.headers.get('content-type')?.includes('application/json'))throw Error('Não foi possível carregar os dados. Atualize a página e tente novamente.');const data=await res.json();if(!res.ok){if(res.status===401&&current){setSession('');window.dispatchEvent(new Event('oluni:logout'));}throw Object.assign(Error(data.error||'Não foi possível concluir.'),{status:res.status});}return data;}
