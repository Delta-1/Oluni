import {randomUUID} from 'node:crypto';
import {fail,lookup,text,limiter,digest,publicUser} from './security.js';
import {serial} from './attendance.js';
import {installWhatsAppIntake} from './whatsapp-intake.js';
import {installWellbeing} from './whatsapp-wellbeing.js';
export const canAttend=u=>!!u?.active&&(u.role==='admin'||u.whatsappAgent===true);
export const mediaTypes=['application/pdf','image/jpeg','image/png','image/webp','audio/ogg','audio/mpeg','audio/mp4','audio/webm','video/mp4'];
export function checkedAttachment(a){
 const mime=String(a.mime||'').split(';')[0].trim().toLowerCase(),buffer=Buffer.isBuffer(a.buffer)?a.buffer:Buffer.from(typeof a.data==='string'?a.data:'','base64');
 const head=buffer.subarray(0,12),valid=mime==='application/pdf'?head.toString().startsWith('%PDF-'):mime==='image/jpeg'?head[0]===255&&head[1]===216&&head[2]===255:mime==='image/png'?head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/webp'?head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP':mime==='audio/webm'?head.subarray(0,4).equals(Buffer.from([26,69,223,163])):mime==='audio/ogg'?head.toString('ascii',0,4)==='OggS':mime==='audio/mpeg'?head.toString('ascii',0,3)==='ID3'||(head[0]===255&&(head[1]&224)===224):['audio/mp4','audio/webm','video/mp4'].includes(mime)?head.toString('ascii',4,8)==='ftyp':false;
 if(!mediaTypes.includes(mime)||!buffer.length||buffer.length>5*1024*1024||!valid)throw fail(400,'Envie PDF, imagem, áudio ou MP4 válido de até 5 MB.');
 return {mime,buffer,voice:a.voice===true&&mime.startsWith('audio/'),sticker:a.sticker===true&&mime==='image/webp',name:text(String(a.name||'arquivo').replace(/[\x00-\x1f/\\]/g,'_'),1,150)};
}

export {installWhatsAppInbox} from "./inbox-service.js";
