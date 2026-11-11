import {randomUUID} from 'node:crypto';
import {fail,vault} from './security.js';
// Reuses the existing service-role-only STARSIS storage contract. No changes to
// its schema, accounts, messages or WhatsApp sessions. One dedicated carrier,
// a namespace on every query, and an independent encryption key isolate the app.
export class SupabaseStore {
 constructor(db,secret){this.db=db;this.crypt=vault(secret);}
 async init(){const owner='moodcorp:storage:v1';let {data,error}=await this.db.from('startsys_companies').select('id').eq('owner_id',owner).maybeSingle();if(error)throw fail(503,'Não foi possível conectar o armazenamento.');if(!data){const result=await this.db.from('startsys_companies').insert({owner_id:owner,name:'Oluni · armazenamento',settings:{application:'moodcorp',autoReply:false,teamEnabled:false}}).select('id').single();if(result.error){const retry=await this.db.from('startsys_companies').select('id').eq('owner_id',owner).single();if(retry.error)throw fail(503,'Não foi possível preparar o armazenamento.');data=retry.data;}else data=result.data;}this.root=data.id;}
 query(kind){return this.db.from('startsys_records').select('*').eq('company_id',this.root).eq('kind','moodcorp.v1.'+kind);}
 decode(row){return row?{...this.crypt.open(row.data.value),id:row.id}:null;}
 async get(kind,id,tenant){let q=this.query(kind).eq('id',id);if(tenant)q=q.eq('data->>tenant',tenant);const {data,error}=await q.maybeSingle();if(error)throw fail(503,'Não foi possível consultar os dados.');return this.decode(data);}
 async list(kind,tenant,{owner,limit=10000}={}){let out=[];for(let start=0;start<limit;start+=1000){let q=this.query(kind).order('updated_at',{ascending:false}).order('id').range(start,Math.min(start+999,limit-1));if(tenant)q=q.eq('data->>tenant',tenant);if(owner)q=q.eq('data->>owner',owner);const {data,error}=await q;if(error)throw fail(503,'Não foi possível carregar os dados.');out.push(...data.map(r=>this.decode(r)));if(data.length<1000)break;}return out;}
 async put(kind,tenant,value,id=value.id||'moodcorp:'+randomUUID(),insert=false){const row={id,company_id:this.root,kind:'moodcorp.v1.'+kind,data:{tenant,...(value.owner?{owner:value.owner}:{}),value:this.crypt.seal({...value,id})},updated_at:new Date().toISOString()};const q=this.db.from('startsys_records');const {error}=insert?await q.insert(row):await q.upsert(row,{onConflict:'id'});if(error)throw fail(error.code==='23505'?409:503,error.code==='23505'?'Este registro já existe.':'Não foi possível salvar. Tente novamente.');return {...value,id};}
 async remove(kind,id,tenant){let q=this.db.from('startsys_records').delete().eq('company_id',this.root).eq('kind','moodcorp.v1.'+kind).eq('id',id);if(tenant)q=q.eq('data->>tenant',tenant);const {error}=await q;if(error)throw fail(503,'Não foi possível remover o registro.');}
 async health(){const {error}=await this.query('company').limit(1);return !error;}
 async resetAccountKinds(kinds){
  const counts={};
  // Delete known account kinds inside this application's carrier only. Avoid
  // decrypting thousands of authentication records or one network call per row.
  for(const kind of kinds){const {error,count}=await this.db.from('startsys_records').delete({count:'exact'}).eq('company_id',this.root).eq('kind','moodcorp.v1.'+kind);if(error)throw fail(503,'Não foi possível concluir a limpeza autorizada.');counts[kind]=count||0;console.log('Oluni: limpeza de acessos',kind,counts[kind]);}
  return counts;
 }
}
export class MemoryStore {
 constructor(){this.rows=new Map();}
 async init(){} async health(){return true;}
 async get(kind,id,tenant){const r=this.rows.get(kind+':'+id);return r&&(!tenant||r.tenant===tenant)?structuredClone(r.value):null;}
 async list(kind,tenant,{owner,limit=10000}={}){return [...this.rows.values()].filter(r=>r.kind===kind&&(!tenant||r.tenant===tenant)&&(!owner||r.value.owner===owner)).map(r=>structuredClone(r.value)).slice(-limit).reverse();}
 async put(kind,tenant,value,id=value.id||'moodcorp:'+randomUUID(),insert=false){if(insert&&this.rows.has(kind+':'+id))throw fail(409,'Este registro já existe.');this.rows.set(kind+':'+id,{kind,tenant,value:structuredClone({...value,id})});return {...value,id};}
 async remove(kind,id,tenant){if(await this.get(kind,id,tenant))this.rows.delete(kind+':'+id);}
}
