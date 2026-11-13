import {useState} from 'react';
import './brand.css';
export function BrandLogo({loading=false}:{loading?:boolean}){
 const [turn,setTurn]=useState(0);
 return <button type="button" className="pn-brand ol-brand-button" aria-label="Oluni · animar relógio" title="Toque para girar o relógio" onClick={()=>setTurn(v=>v+1)}><span key={turn} className="ol-brand-icon"><svg className={'ol-clock-glyph'+(loading?' ol-clock-loading':turn?' ol-clock-clicked':'')} width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/></svg></span><b>oluni</b></button>;
}
