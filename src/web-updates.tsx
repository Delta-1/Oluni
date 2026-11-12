import {useEffect,useRef,useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {RefreshCw,X} from 'lucide-react';
import {api} from './api';
const version='3.1.0';
export function WebUpdates(){
 const [available,setAvailable]=useState(''),last=useRef(0);
 useEffect(()=>{if(Capacitor.isNativePlatform()||import.meta.env.DEV)return;let alive=true;
  if('serviceWorker'in navigator)navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{scope:import.meta.env.BASE_URL}).catch(()=>{});
  const check=async()=>{if(document.hidden||Date.now()-last.current<60000)return;last.current=Date.now();try{const out=await api('/client-version');if(alive&&out.version!==version)setAvailable(out.version);}catch{}};
  check();const timer=setInterval(check,60000);document.addEventListener('visibilitychange',check);window.addEventListener('oluni-check-updates',check);return()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',check);window.removeEventListener('oluni-check-updates',check);};
 },[]);
 if(!available)return null;
 return <aside className="app-update-notice" role="status"><div><b>Oluni {available} disponível</b><p>Atualização encontrada. Salve o que está editando e recarregue para continuar.</p></div><button className="primary" onClick={()=>location.reload()}><RefreshCw size={17}/> Atualizar</button><button className="update-close" aria-label="Fechar atualização" onClick={()=>setAvailable('')}><X/></button></aside>;
}
