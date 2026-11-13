import {fileURLToPath} from 'node:url';
import {parentPort,workerData} from 'node:worker_threads';
import {unzipSync,strFromU8} from 'fflate';
const MAX_TEXT=200000;
const decodeXML=s=>s.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[\da-f]+|\d+);/gi,v=>{const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[v])return named[v];const n=v.startsWith('&#x')?parseInt(v.slice(3,-1),16):parseInt(v.slice(2,-1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';});
try{
 const {mime,data}=workerData,buffer=new Uint8Array(data);let result='';
 if(mime==='application/pdf'){
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:buffer,isEvalSupported:false,standardFontDataUrl:fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url)),useSystemFonts:false,disableFontFace:true,stopAtErrors:true});
  const doc=await task.promise;
  try{if(doc.numPages>100)throw Error('Use um PDF de até 100 páginas.');for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),content=await page.getTextContent();result+=content.items.map(item=>item.str||'').join(' ')+'\n';page.cleanup();if(result.length>MAX_TEXT)throw Error('Use um documento com até 200 mil caracteres.');}}finally{await task.destroy();}
 }else if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
  const files=unzipSync(buffer,{filter:entry=>entry.name==='word/document.xml'&&entry.originalSize>0&&entry.originalSize<=2000000&&entry.size<=5000000});
  if(!files['word/document.xml'])throw Error('Arquivo Word inválido ou muito grande.');
  result=decodeXML(strFromU8(files['word/document.xml']).replace(/<w:(?:p|br)\b[^>]*>/g,'\n').replace(/<[^>]*>/g,''));
 }else{result=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(result.includes('\0'))throw Error('Envie um arquivo de texto UTF-8.');}
 result=result.trim();if(result.length<10)throw Error('Não há texto suficiente. Para PDF escaneado, envie uma versão com texto selecionável ou um TXT.');if(result.length>MAX_TEXT)throw Error('Use um documento com até 200 mil caracteres.');
 parentPort.postMessage({text:result});
}catch(error){parentPort.postMessage({error:error.message||'Não foi possível ler o documento.'});}
