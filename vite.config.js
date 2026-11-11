import {defineConfig} from 'vite';
export default defineConfig({base:process.env.GITHUB_PAGES==='true'?'/Oluni/':'/',server:{allowedHosts:['terminal.local']},plugins:[{name:'local-preview-api',async configureServer(server){
 // The development server is explicitly ephemeral. Production never imports
 // MemoryStore and refuses to start without real database credentials.
 const {MemoryStore}=await import('./server/store.js');
 const {createApp}=await import('./server/app.js');
 const {seedPreview}=await import('./server/preview.js');
 const store=new MemoryStore();await store.init();
 const previewToken=await seedPreview(store);
 const app=createApp({store,secret:'moodcorp-local-preview-only-not-a-production-secret'});
 server.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/api'))return next();if(req.url.includes('local-preview=1'))req.headers.authorization='Bearer '+previewToken;app(req,res,next);});
}}],build:{target:'es2022'}});
