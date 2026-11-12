import {useEffect,useRef} from 'react';
import {api} from './api';
export function useInboxUpdates(channelId:string,refresh:()=>Promise<unknown>){
 const latest=useRef(refresh);latest.current=refresh;
 useEffect(()=>{if(!channelId)return;let active=true,generation=0,controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined,cursor='';
 const run=async(version:number)=>{if(!active||document.hidden||version!==generation)return;const request=new AbortController();controller=request;try{const result=await api<{cursor:string,changed:boolean}>('/whatsapp/updates?channelId='+encodeURIComponent(channelId)+'&cursor='+encodeURIComponent(cursor),undefined,undefined,{signal:request.signal});if(!active||version!==generation)return;cursor=result.cursor;if(result.changed)await latest.current();if(active&&version===generation)timer=setTimeout(()=>run(version),80);}catch{if(active&&version===generation&&!request.signal.aborted)timer=setTimeout(()=>run(version),3000);}};
 const restart=()=>{generation++;controller?.abort();clearTimeout(timer);if(!document.hidden){cursor='';run(generation);}};document.addEventListener('visibilitychange',restart);restart();return()=>{active=false;generation++;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',restart);};
 },[channelId]);
}
