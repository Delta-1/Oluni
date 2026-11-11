import {fail} from './security.js';
export const badgePresets=['minimal','triangles','circles','diagonal','dots','image'];
export function badgeDesign(company){
 const d=company.badgeDesign||{};
 return {preset:badgePresets.includes(d.preset)?d.preset:'minimal',accent:/^#[0-9a-f]{6}$/i.test(d.accent||'')?d.accent:'#765292',backgroundFit:d.backgroundFit==='contain'?'contain':'cover',backgroundOpacity:Number.isInteger(d.backgroundOpacity)?Math.max(10,Math.min(100,d.backgroundOpacity)):100};
}
export function checkedBadgeDesign(body,old={}){
 const d={...badgeDesign({badgeDesign:old}),...body};
 if(!badgePresets.includes(d.preset))throw fail(400,'Escolha um modelo de crachá válido.');
 if(typeof d.accent!=='string'||!/^#[0-9a-f]{6}$/i.test(d.accent))throw fail(400,'Escolha uma cor válida para o crachá.');
 if(!['cover','contain'].includes(d.backgroundFit))throw fail(400,'Escolha um enquadramento válido.');
 if(!Number.isInteger(d.backgroundOpacity)||d.backgroundOpacity<10||d.backgroundOpacity>100)throw fail(400,'A visibilidade do fundo deve ficar entre 10% e 100%.');
 return {preset:d.preset,accent:d.accent.toLowerCase(),backgroundOpacity:d.backgroundOpacity,backgroundFit:d.backgroundFit,...(old.backgroundId?{backgroundId:old.backgroundId}:{})};
}
