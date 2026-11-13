import {useState} from 'react';
import './brand.css';
export function BrandLogo({loading=false}:{loading?:boolean}){
 const [turn,setTurn]=useState(0);
 return <button type="button" className="pn-brand ol-brand-button" aria-label="Oluni · animar relógio" title="Toque para animar os ponteiros" onClick={()=>setTurn(v=>v+1)}>
  <span className="ol-brand-icon"><span key={turn} className={'ol-clock-face'+(turn?' ol-clock-clicked':loading?' ol-clock-loading':'')} onAnimationEnd={event=>{if(loading&&event.animationName==='oluni-hour-turn')setTurn(0);}} aria-hidden="true">
   <svg className="ol-clock-glyph" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/></svg>
   <span className="ol-clock-hand ol-clock-minute"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 12V8"/></svg></span>
   <span className="ol-clock-hand ol-clock-hour"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 12l2 2"/></svg></span>
  </span></span><b>oluni</b>
 </button>;
}
