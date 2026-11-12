import {fail} from './security.js';
export const badgePresets=['minimal','triangles','circles','diagonal','dots','image'];
export const badgeFonts=['Arial','Verdana','Georgia','Trebuchet MS','Courier New','Inter'];
const numeric={badgeWidthMm:[35,140,54],badgeHeightMm:[40,180,86],paperWidthMm:[100,420,210],paperHeightMm:[100,594,297],marginMm:[0,30,10],gapMm:[0,20,5],nameScale:[75,140,100],radiusMm:[0,12,3]};
export function badgeDesign(company){
 const d=company.badgeDesign||{},out={preset:badgePresets.includes(d.preset)?d.preset:'minimal',accent:/^#[0-9a-f]{6}$/i.test(d.accent||'')?d.accent:'#765292',backgroundFit:d.backgroundFit==='contain'?'contain':'cover',backgroundOpacity:Number.isInteger(d.backgroundOpacity)?Math.max(10,Math.min(100,d.backgroundOpacity)):100,fontFamily:badgeFonts.includes(d.fontFamily)?d.fontFamily:'Arial',fontWeight:d.fontWeight==='normal'?'normal':'bold',layout:['vertical','horizontal','compact'].includes(d.layout)?d.layout:'vertical',paper:['a4','letter','a5','custom'].includes(d.paper)?d.paper:'a4',orientation:d.orientation==='landscape'?'landscape':'portrait'};
 for(const [k,[min,max,defaultValue]]of Object.entries(numeric))out[k]=Number.isFinite(d[k])?Math.max(min,Math.min(max,d[k])):defaultValue;
 return out;
}
export function checkedBadgeDesign(body,old={}){
 const d={...badgeDesign({badgeDesign:old}),...body};
 if(!badgePresets.includes(d.preset)||!badgeFonts.includes(d.fontFamily)||!['vertical','horizontal','compact'].includes(d.layout))throw fail(400,'Escolha modelo, fonte e estilo válidos.');
 if(typeof d.accent!=='string'||!/^#[0-9a-f]{6}$/i.test(d.accent)||!['cover','contain'].includes(d.backgroundFit))throw fail(400,'Escolha uma cor e um enquadramento válidos.');
 if(!Number.isInteger(d.backgroundOpacity)||d.backgroundOpacity<10||d.backgroundOpacity>100)throw fail(400,'A visibilidade do fundo deve ficar entre 10% e 100%.');
 if(!['a4','letter','a5','custom'].includes(d.paper)||!['portrait','landscape'].includes(d.orientation)||!['normal','bold'].includes(d.fontWeight))throw fail(400,'Escolha uma folha e um estilo de texto válidos.');
 const out={preset:d.preset,accent:d.accent.toLowerCase(),backgroundOpacity:d.backgroundOpacity,backgroundFit:d.backgroundFit,fontFamily:d.fontFamily,fontWeight:d.fontWeight,layout:d.layout,paper:d.paper,orientation:d.orientation};
 for(const [key,[min,max]]of Object.entries(numeric)){if(!Number.isFinite(d[key])||d[key]<min||d[key]>max)throw fail(400,'Dimensão inválida: '+key);out[key]=Math.round(d[key]*10)/10;}
 const paper=d.paper==='a4'?[210,297]:d.paper==='letter'?[215.9,279.4]:d.paper==='a5'?[148,210]:[out.paperWidthMm,out.paperHeightMm];
 if(out.orientation==='landscape')paper.reverse();if(out.badgeWidthMm>paper[0]-out.marginMm*2||out.badgeHeightMm>paper[1]-out.marginMm*2)throw fail(400,'O crachá não cabe na folha e nas margens escolhidas.');
 return {...out,...(old.backgroundId?{backgroundId:old.backgroundId}:{})};
}
