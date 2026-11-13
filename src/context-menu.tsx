import {useEffect,useLayoutEffect,useRef,useState,type MouseEvent as ReactMouseEvent} from 'react';
import {createPortal} from 'react-dom';
import './context-menu.css';
export type ContextAction={label:string;run:()=>void;disabled?:boolean};
type ContextState={x:number;y:number;items:ContextAction[];opener:HTMLElement};
export function openContextMenu(event:ReactMouseEvent<HTMLElement>,items:ContextAction[]){
 event.preventDefault();event.stopPropagation();
 if(!items.length)return;
 const rect=event.currentTarget.getBoundingClientRect();
 window.dispatchEvent(new CustomEvent<ContextState>('oluni:context-menu',{detail:{x:event.clientX||rect.left+16,y:event.clientY||rect.bottom,items,opener:event.currentTarget}}));
}
export function AppContextMenu(){
 const [menu,setMenu]=useState<ContextState|null>(null),box=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const open=(event:Event)=>setMenu((event as CustomEvent<ContextState>).detail);
  const context=(event:MouseEvent)=>{if(event.defaultPrevented)return;if((event.target as Element)?.closest('.pn')){event.preventDefault();setMenu(null);}};
  window.addEventListener('oluni:context-menu',open);window.addEventListener('contextmenu',context);
  return()=>{window.removeEventListener('oluni:context-menu',open);window.removeEventListener('contextmenu',context);};
 },[]);
 useLayoutEffect(()=>{
  if(!menu||!box.current)return;
  const element=box.current,rect=element.getBoundingClientRect();
  element.style.left=Math.max(8,Math.min(menu.x,window.innerWidth-rect.width-8))+'px';element.style.top=Math.max(8,Math.min(menu.y,window.innerHeight-rect.height-8))+'px';
  element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
 },[menu]);
 useEffect(()=>{
  if(!menu)return;
  const outside=(event:PointerEvent)=>{if(!box.current?.contains(event.target as Node))setMenu(null);};
  const resize=()=>setMenu(null),scroll=(event:Event)=>{if(!box.current?.contains(event.target as Node))setMenu(null);};
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setMenu(null);if(menu.opener.isConnected)menu.opener.focus();}
   else if(event.key==='Tab')setMenu(null);
   else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();const buttons=[...box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]];
    const current=buttons.indexOf(document.activeElement as HTMLButtonElement),index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[index]?.focus();
   }
  };
  window.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);window.addEventListener('scroll',scroll,true);window.addEventListener('keydown',key);
  return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);window.removeEventListener('scroll',scroll,true);window.removeEventListener('keydown',key);};
 },[menu]);
 if(!menu)return null;
 return createPortal(<div className="pn ol-context-layer"><div ref={box} role="menu" aria-label="Atalhos" className="ol-context-menu" style={{left:menu.x,top:menu.y}} onContextMenu={event=>event.preventDefault()}>{menu.items.map((item,index)=><button type="button" role="menuitem" key={index} disabled={item.disabled} onClick={()=>{setMenu(null);item.run();}}>{item.label}</button>)}</div></div>,document.body);
}
