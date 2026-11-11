import {build} from 'vite';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({configFile:false,root,base:'./',define:{'import.meta.env.VITE_API_URL':JSON.stringify('https://oluni.up.railway.app')},build:{outDir:'mobile/dist',emptyOutDir:true,target:'es2022'}});
