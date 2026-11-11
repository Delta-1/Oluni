import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';
import {MemoryStore} from '../server/store.js';
import {createSessionState} from '../src/session.js';

test('HTML is never cached across releases; obsolete assets return 404 instead of HTML',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'moodcorp-startup-'));
 await mkdir(join(directory,'assets'));
 await writeFile(join(directory,'index.html'),'<!doctype html><html><body>MoodCorp entry</body></html>');
 await writeFile(join(directory,'assets','current-hash.js'),'console.log("current");');
 const app=createApp({store:new MemoryStore(),secret:'startup-test-secret-at-least-32-characters',staticPath:directory});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port;
 for(const path of ['/','/index.html','/painel']){const r=await fetch(origin+path);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/,path);assert.match(r.headers.get('content-type'),/text\/html/);}
 const stale=await fetch(origin+'/assets/obsolete-hash.js');assert.equal(stale.status,404);assert.doesNotMatch(stale.headers.get('content-type')||'',/text\/html/);assert.match(stale.headers.get('cache-control'),/no-store/);
 const css=await fetch(origin+'/assets/obsolete-hash.css');assert.equal(css.status,404);assert.doesNotMatch(css.headers.get('content-type')||'',/text\/html/);
 const current=await fetch(origin+'/assets/current-hash.js');assert.equal(current.status,200);assert.match(current.headers.get('content-type'),/javascript/);assert.match(current.headers.get('cache-control'),/immutable/);
});

test('blocked browser storage never prevents startup, login or logout',()=>{
 const blocked={get localStorage(){throw new Error('SecurityError');},get sessionStorage(){throw new Error('SecurityError');}};
 const state=createSessionState(blocked),token='a'.repeat(43);
 assert.equal(state.get(),'');assert.doesNotThrow(()=>state.set(token,true));assert.equal(state.get(),token);
 assert.doesNotThrow(()=>state.set(''));assert.equal(state.get(),'');
});

test('a tab session never silently becomes a remembered login',()=>{
 const saved=new Map();const local={getItem:()=>null,removeItem:()=>{},setItem:(key,value)=>saved.set(key,value)};
 const blockedSession={getItem(){throw Error('disabled');},removeItem(){throw Error('disabled');},setItem(){throw Error('disabled');}};
 const state=createSessionState({localStorage:local,sessionStorage:blockedSession});state.set('b'.repeat(43),false);
 assert.equal(state.get(),'b'.repeat(43));assert.equal(saved.size,0);
});

test('malformed cached sessions are ignored and remembered login tolerates quota errors',()=>{
 const memory=new Map();const session={getItem:key=>memory.get(key),removeItem:key=>memory.delete(key),setItem:(key,value)=>memory.set(key,value)};
 const local={getItem:()=>'{old invalid session}',removeItem(){throw Error('blocked');},setItem(){throw Error('QuotaExceededError');}};
 const state=createSessionState({localStorage:local,sessionStorage:session});assert.equal(state.get(),'');state.set('c'.repeat(43),true);
 assert.equal(memory.get('oluni.session'),'c'.repeat(43));state.set('');assert.equal(memory.size,0);
});

test('GitHub Pages can reach the API through restricted CORS, including authenticated preflights',async t=>{
 const app=createApp({store:new MemoryStore(),secret:'pages-test-secret-at-least-32-characters'}),server=app.listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const preflight=await fetch(base+'/api/auth/login',{method:'OPTIONS',headers:{Origin:'https://delta-1.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://delta-1.github.io');assert.match(preflight.headers.get('access-control-allow-headers'),/Authorization/);assert.match(preflight.headers.get('vary'),/Origin/);
 const health=await fetch(base+'/api/health',{headers:{Origin:'https://delta-1.github.io'}});assert.equal(health.status,200);assert.equal(health.headers.get('access-control-allow-origin'),'https://delta-1.github.io');
 const unauthorized=await fetch(base+'/api/bootstrap',{headers:{Origin:'https://delta-1.github.io'}});assert.equal(unauthorized.status,401);assert.equal(unauthorized.headers.get('access-control-allow-origin'),'https://delta-1.github.io');
 const forbidden=await fetch(base+'/api/auth/login',{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}});assert.equal(forbidden.status,403);assert.equal(forbidden.headers.get('access-control-allow-origin'),null);
});
