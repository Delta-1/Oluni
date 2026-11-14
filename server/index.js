import {createClient} from '@supabase/supabase-js';
import {fileURLToPath} from 'node:url';
import {SupabaseStore} from './store.js';
import {createApp} from './app.js';
import {WhatsAppGateway} from './whatsapp.js';
import {resetAccountsOnce,resetProjectDataOnce} from './reset-accounts.js';
const secret=process.env.OLUNI_SECRET||process.env.MOODCORP_SECRET||'';
if(secret.length<32||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Configure OLUNI_SECRET, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
console.log('Oluni: conectando ao armazenamento.');
const store=new SupabaseStore(db,secret);await store.init();
console.log('Oluni: armazenamento conectado.');
const reset=await resetAccountsOnce(store,secret,process.env.PONTONORTE_RESET_ACCOUNTS_ONCE);
if(reset)console.log('Oluni: limpeza autorizada de contas concluída.',JSON.stringify(reset));
const projectReset=await resetProjectDataOnce(store,secret,process.env.OLUNI_RESET_DATA_ONCE);
if(projectReset){
 console.log('Oluni: limpeza completa autorizada concluída.',JSON.stringify(projectReset));
 // Verify again after the previous deployment has had time to close sockets.
 setTimeout(()=>store.projectDataCounts().then(counts=>console.log('Oluni: verificação após limpeza.',JSON.stringify(counts))).catch(()=>console.error('Oluni: verificação após limpeza indisponível.')),30000).unref();
}
const gateway=new WhatsAppGateway(store,secret),app=createApp({store,secret,gateway,staticPath:fileURLToPath(new URL('../dist',import.meta.url))});
const server=app.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>{console.log('Oluni pronto.');app.locals.whatsappHub.wellbeing.start();app.locals.welcome.start();gateway.restore().catch(()=>console.error('Reconexão do WhatsApp pendente.'));});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{app.locals.whatsappHub.wellbeing.close();app.locals.welcome.close();await gateway.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});
