import {useEffect,useState} from 'react';
import {api} from './api';
type Data=Record<string,any>;
const labels:Data={not_requested:'Aguardando preparação',pending:'Aguardando conexão do WhatsApp',sending:'Enviando mensagem',sent:'Mensagem enviada',delivered:'Entrega confirmada pelo WhatsApp',read:'Leitura confirmada pelo WhatsApp',uncertain:'Envio sem confirmação · confira o WhatsApp',cancelled:'Envio pausado por mudança no cadastro',blocked:'Número associado a mais de um cadastro · conferir'};
export function WelcomeStatus({team=false}:{team?:boolean}){
 const [data,setData]=useState<any>(null),[users,setUsers]=useState<Data[]>([]);useEffect(()=>{let active=true;const load=()=>api(team?'/people/welcome':'/profile/welcome').then(v=>{if(active)setData(v);}).catch(()=>{});load();if(team)api('/people/directory').then(setUsers).catch(()=>{});const timer=setInterval(()=>{if(!document.hidden)load();},15000);return()=>{active=false;clearInterval(timer);};},[team]);
 if(!data)return null;
 return team?<details className="ol-sector-tools"><summary>Boas-vindas pelo WhatsApp</summary><div className="ol-compact-list">{data.map((r:Data)=><div key={r.owner}><span><b>{users.find(u=>u.id===r.owner)?.name||'Colaborador'}</b><small>{labels[r.status]||r.status}</small></span></div>)}</div>{!data.length&&<p className="pn-small">As mensagens dos próximos cadastros aparecerão aqui.</p>}<p className="pn-small">Envio não verifica a titularidade do número. Entrega e leitura dependem dos avisos recebidos do WhatsApp.</p></details>:<p className="ol-welcome-status"><b>WhatsApp:</b> {labels[data.status]||data.status}. Não é necessário repetir ou confirmar o número.</p>;
}
