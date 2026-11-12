// No authenticated responses, employee files, API calls or attendance records
// are cached. The installed app always obtains current code from the network.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>new Response('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Oluni · Sem conexão</title><body style="background:#18121f;color:#e6d6ef;font:18px Arial;padding:40px"><h1>Conecte para continuar.</h1><p>Seu ponto só é confirmado ao chegar ao servidor.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
