import {Worker} from 'node:worker_threads';
import {fail,text} from './security.js';
let active=0;
export const knowledgeTypes=['text/plain','text/markdown','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
export async function extractKnowledge(body){
 const mime=String(body.mime||'').split(';')[0],buffer=Buffer.from(body.data||'','base64'),name=text(String(body.name||'arquivo').replace(/[\x00-\x1f/\\]/g,'_'),1,150);
 if(!knowledgeTypes.includes(mime)||!buffer.length||buffer.length>5*1024*1024)throw fail(400,'Envie PDF com texto, DOCX, TXT ou Markdown de até 5 MB.');
 if(mime==='application/pdf'&&buffer.subarray(0,5).toString()!=='%PDF-'||mime.includes('wordprocessingml')&&!buffer.subarray(0,4).equals(Buffer.from([80,75,3,4])))throw fail(400,'O conteúdo não corresponde ao tipo do arquivo.');
 if(active>=2)throw fail(429,'Há documentos sendo processados. Tente novamente em instantes.');active++;
 try{return await new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./file-content-worker.js',import.meta.url),{workerData:{mime,data:buffer},resourceLimits:{maxOldGenerationSizeMb:128}});let done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(fail(400,'A leitura demorou demais. Envie um documento menor ou TXT.')),20000);
  worker.once('message',result=>result.error?finish(fail(400,result.error)):finish(null,{name,mime,buffer,text:result.text}));worker.once('error',()=>finish(fail(400,'Não foi possível ler este documento. Envie um PDF com texto ou TXT.')));worker.once('exit',()=>{if(!done)finish(fail(400,'A leitura do arquivo foi interrompida.'));});
 });}finally{active--;}
}
export function redactKnowledge(value,names=[]){let result=String(value||'').replace(/\b\d{3}[. ]?\d{3}[. ]?\d{3}[- ]?\d{2}\b/g,'[CPF omitido]').replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi,'[e-mail omitido]').replace(/(?:\+?\d[\d ()-]{8,}\d)/g,'[telefone/documento omitido]');for(const name of names.filter(v=>v&&v.length>=6))result=result.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu'),'[nome de colaborador omitido]');return result;}
export function knowledgeContext(files,question,names=[]){
 const clean=v=>String(v).normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase(),terms=[...new Set(clean(question).match(/[a-z]{4,}/g)||[])].slice(0,30),parts=[];
 for(const file of files)for(let start=0;start<file.text.length;start+=1000){const text=file.text.slice(start,start+1200),body=clean(text),score=terms.reduce((n,t)=>n+(body.includes(t)?1:0),0);parts.push({name:file.name,text,score});}
 return parts.sort((a,b)=>b.score-a.score).slice(0,10).map(p=>({title:redactKnowledge(p.name,names),text:redactKnowledge(p.text,names)}));
}
