import makeWASocket,{initAuthCreds,BufferJSON,proto,DisconnectReason,fetchLatestBaileysVersion,normalizeMessageContent,downloadMediaMessage} from 'baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import {lookup,fail} from './security.js';
export function acceptMessage(raw,type,start){const at=Number(raw.messageTimestamp?.toString?.()||0)*1000;const jid=raw.key?.remoteJid||'';return type==='notify'&&!raw.key?.fromMe&&!!raw.key?.id&&!!raw.message&&(jid.endsWith('@s.whatsapp.net')||jid.endsWith('@lid'))&&Number.isFinite(at)&&at>=Date.parse(start);}
export class WhatsAppGateway {
 constructor(store,secret){this.store=store;this.secret=secret;this.sessions=new Map();this.queues=new Map();this.onMessage=async()=>null;}
 async config(cid){return await this.store.get('wa-config',lookup(this.secret,'wa-config',cid),cid)||{requested:false,startedAt:null};}
 async save(cid,value){return this.store.put('wa-config',cid,value,lookup(this.secret,'wa-config',cid));}
 async status(cid){const c=await this.config(cid),s=this.sessions.get(cid);return {status:s?.status||'disconnected',qr:s?.qr||null,phone:s?.phone||c.phone||null,lastError:s?.lastError||null,startedAt:c.startedAt};}
 async storedAuth(cid){const id=k=>lookup(this.secret,'wa-auth',cid,k);const read=async k=>{const r=await this.store.get('wa-auth',id(k),cid);return r?JSON.parse(r.value,BufferJSON.reviver):null;};const write=async(k,v)=>this.store.put('wa-auth',cid,{value:JSON.stringify(v,BufferJSON.replacer)},id(k));const creds=await read('creds')||initAuthCreds();return {state:{creds,keys:{get:async(type,ids)=>{const out={};for(const key of ids){let v=await read(type+'-'+key);if(type==='app-state-sync-key'&&v)v=proto.Message.AppStateSyncKeyData.fromObject(v);out[key]=v;}return out;},set:async data=>{for(const [type,items]of Object.entries(data))for(const [k,v]of Object.entries(items))if(v)await write(type+'-'+k,v);else await this.store.remove('wa-auth',id(type+'-'+k),cid);}}},save:()=>write('creds',creds)};}
 async connect(cid){const current=this.sessions.get(cid);if(current&&['connected','connecting','qr_pending'].includes(current.status))return;const c=await this.config(cid);c.requested=true;await this.save(cid,c);this.start(cid).catch(()=>{});}
 async start(cid,attempt=0){const old=this.sessions.get(cid);if(old?.status==='connected'||old?.status==='connecting')return;const s={status:'connecting',qr:null,stop:false,lastError:null};this.sessions.set(cid,s);try{const c=await this.config(cid);if(!c.requested)return;const auth=await this.storedAuth(cid);let version;try{version=(await fetchLatestBaileysVersion()).version;}catch{}const sock=makeWASocket({auth:auth.state,logger:pino({level:'silent'}),...(version?{version}:{}),browser:['Ponto Norte','Chrome','2.0.0'],syncFullHistory:false,shouldSyncHistoryMessage:()=>false,markOnlineOnConnect:false});s.sock=sock;
 sock.ev.on('creds.update',()=>{auth.save().catch(()=>{s.lastError='Não foi possível salvar a sessão. Reconecte o WhatsApp.';});});
 sock.ev.on('connection.update',u=>{(async()=>{if(this.sessions.get(cid)!==s||s.stop)return;if(u.qr){s.qr=await QRCode.toDataURL(u.qr);s.status='qr_pending';}if(u.connection==='open'){s.status='connected';s.qr=null;s.phone=sock.user?.id?.split(':')[0];const config=await this.config(cid);if(!config.startedAt)config.startedAt=new Date().toISOString();config.phone=s.phone;config.requested=true;await this.save(cid,config);}if(u.connection==='close'){s.status='disconnected';s.qr=null;if(s.stop)return;const code=u.lastDisconnect?.error?.output?.statusCode;if(code===DisconnectReason.loggedOut){s.lastError='Sessão encerrada. Gere outro QR Code.';await this.save(cid,{...await this.config(cid),requested:false});for(const a of await this.store.list('wa-auth',cid))await this.store.remove('wa-auth',a.id,cid);}else{const next=attempt+1;s.lastError='Reconectando ao WhatsApp…';s.timer=setTimeout(()=>{if(this.sessions.get(cid)===s&&!s.stop)this.start(cid,next).catch(()=>{});},Math.min(60000,2000*2**Math.min(next,5)));s.timer.unref();}}})().catch(()=>{s.lastError='Não foi possível atualizar a conexão.';});});
 // Deliberately no contacts.upsert, chats or messaging-history.set listeners.
 sock.ev.on('messages.upsert',({messages,type})=>{for(const raw of messages){if(s.stop)break;const old=this.queues.get(cid)||Promise.resolve();const task=old.catch(()=>{}).then(async()=>{if(s.stop)return;const c=await this.config(cid);if(!c.requested||!c.startedAt||!acceptMessage(raw,type,c.startedAt))return;const content=normalizeMessageContent(raw.message)||{},media=content.documentMessage||content.imageMessage;
 let message=content.conversation||content.extendedTextMessage?.text||media?.caption||'';
 if((!message&&!media)||message.length>4000)return;
 let sender=raw.key.remoteJid;
 if(sender.endsWith('@lid')){
  const alt=raw.key.remoteJidAlt;
  if(alt?.endsWith('@s.whatsapp.net'))sender=alt;
  else{try{sender=await sock.signalRepository.lidMapping.getPNForLID(sender)||sender;}catch{}}
 }
 let attachment=null;
 if(media){
  const allowed=await this.canReceiveFile?.(cid,sender);
  if(!allowed)return;
  const mime=media.mimetype||'';
  if(!['application/pdf','image/jpeg','image/png'].includes(mime)||Number(media.fileLength||0)>5*1024*1024){await sock.sendMessage(raw.key.remoteJid,{text:'Envie um PDF, JPG ou PNG de até 5 MB.'});return;}
  const stream=await downloadMediaMessage(raw,'stream',{}, {logger:pino({level:'silent'}),reuploadRequest:sock.updateMediaMessage});
  const parts=[];let size=0;
  for await(const chunk of stream){size+=chunk.length;if(size>5*1024*1024){stream.destroy();await sock.sendMessage(raw.key.remoteJid,{text:'O arquivo deve ter até 5 MB.'});return;}parts.push(chunk);}
  attachment={buffer:Buffer.concat(parts),mime,name:media.fileName||('atestado.'+(mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg'))};
 }
const receiptId=lookup(this.secret,'wa-receipt',cid,raw.key.remoteJid,raw.key.id);try{await this.store.put('wa-receipt',cid,{day:new Date().toISOString().slice(0,10)},receiptId,true);}catch(e){if(e.status===409)return;throw e;}const response=await this.onMessage(cid,sender,message,attachment);if(response&&!s.stop&&s.status==='connected')await sock.sendMessage(raw.key.remoteJid,{text:response});});this.queues.set(cid,task);task.catch(()=>{}).finally(()=>{if(this.queues.get(cid)===task)this.queues.delete(cid);});}});
 }catch{s.status='disconnected';s.lastError='Não foi possível iniciar o WhatsApp. Tente gerar outro QR Code.';}}
 async sendText(cid,jid,message){const s=this.sessions.get(cid);if(s?.status!=='connected'||!s.sock)throw fail(409,'O WhatsApp da empresa está desconectado.');return s.sock.sendMessage(jid,{text:message});}
 async disconnect(cid){const s=this.sessions.get(cid);await this.save(cid,{...await this.config(cid),requested:false});if(s){s.stop=true;clearTimeout(s.timer);await s.sock?.logout().catch(()=>{});s.sock?.end(undefined);}this.sessions.delete(cid);for(const row of await this.store.list('wa-auth',cid))await this.store.remove('wa-auth',row.id,cid);}
 async resetStart(cid){const c=await this.config(cid);if(!c.startedAt)throw fail(409,'Conecte o WhatsApp primeiro.');c.startedAt=new Date().toISOString();await this.save(cid,c);}
 async restore(){for(const config of await this.store.list('wa-config'))if(config.requested){const cid=(await this.store.list('company')).find(c=>lookup(this.secret,'wa-config',c.id)===config.id)?.id;if(cid)this.start(cid).catch(()=>{});}}
 async close(){for(const s of this.sessions.values()){s.stop=true;clearTimeout(s.timer);s.sock?.end(undefined);}}
}
