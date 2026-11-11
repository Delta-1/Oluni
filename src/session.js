const key='oluni.session';
const legacyKey='moodcorp.session';
const valid=value=>typeof value==='string'&&/^[\w-]{43}$/.test(value)?value:'';
// Storage access can throw in private mode, embedded browsers and devices that
// block site data. In that case authentication still works for this open tab.
export function createSessionState(environment=globalThis){
 const storage=name=>{try{return environment[name];}catch{return null;}};
 const read=name=>{try{const target=storage(name);let value=valid(target?.getItem(key));if(!value){value=valid(target?.getItem(legacyKey));if(value){try{target?.setItem(key,value);target?.removeItem(legacyKey);}catch{}}}return value;}catch{return '';}};
 let current=read('localStorage')||read('sessionStorage');
 return {get:()=>current,set(value,remember=false){
  current=valid(value);
  for(const name of ['localStorage','sessionStorage'])for(const storedKey of [key,legacyKey])try{storage(name)?.removeItem(storedKey);}catch{}
  if(!current)return;
  const names=remember?['localStorage','sessionStorage']:['sessionStorage'];
  for(const name of names)try{const target=storage(name);if(target){target.setItem(key,current);return;}}catch{}
 }};
}
