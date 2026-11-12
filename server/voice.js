import {spawn} from 'node:child_process';
import {fail} from './security.js';
import {serial} from './attendance.js';
// Browser recorders commonly produce WebM. WhatsApp voice notes use Ogg/Opus.
export const voiceToOpus=buffer=>serial('voice-transcoding',()=>new Promise((resolve,reject)=>{
 const p=spawn('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-i','pipe:0','-vn','-threads','1','-c:a','libopus','-b:a','32k','-f','ogg','pipe:1'],{stdio:['pipe','pipe','ignore']});
 const chunks=[];let size=0,done=false;
 const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(result);};
 const timer=setTimeout(()=>{p.kill('SIGKILL');finish(fail(503,'O áudio demorou demais. Grave uma mensagem mais curta.'));},20000);timer.unref();
 p.on('error',()=>finish(fail(503,'A gravação de voz está indisponível. Envie o áudio como arquivo.')));
 p.stdout.on('data',b=>{size+=b.length;if(size>5*1024*1024){p.kill('SIGKILL');finish(fail(400,'Grave um áudio menor.'));}else chunks.push(b);});
 p.on('close',code=>{const out=Buffer.concat(chunks);finish(code!==0||out.subarray(0,4).toString()!=='OggS'?fail(400,'Não foi possível preparar este áudio.'):null,out);});
 p.stdin.on('error',()=>{});p.stdin.end(buffer);
}));
