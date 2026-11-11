import React from 'react';
import {setSession} from './api';
export class AppErrorBoundary extends React.Component<React.PropsWithChildren, {failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){if(!this.state.failed)return this.props.children;return <div className="loading app-recovery" role="alert"><div className="logo">oluni</div><h1>Vamos tentar de novo?</h1><p>Não foi possível carregar esta tela. Você pode atualizar a página ou voltar ao acesso.</p><div className="button-row"><button className="button" onClick={()=>{const url=new URL(location.href);url.searchParams.set('atualizar',String(Date.now()));location.replace(url.href);}}>Atualizar página</button><button className="button secondary" onClick={()=>{setSession('');location.reload();}}>Voltar ao acesso</button></div></div>;}
}
