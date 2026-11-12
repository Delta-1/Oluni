// Shared provider credentials are read on the server only. Never serialized.
export function createPlatformAI(env=process.env){
 const provider=env.OLUNI_AI_PROVIDER==='openai'?'openai':'gemini';
 const apiKey=env.OLUNI_AI_API_KEY||(provider==='openai'?env.OPENAI_API_KEY:env.GEMINI_API_KEY)||'';
 const model=env.OLUNI_AI_MODEL||(provider==='openai'?'gpt-5-mini':'gemini-2.5-flash');
 const available=!!apiKey&&env.OLUNI_AI_ENABLED!=='false';
 return {
  resolve(value={}){if(value?.apiKey&&value.source!=='platform')return {...value,source:'company'};return {...value,provider,model,apiKey:available?apiKey:undefined,enabled:available&&value?.enabled!==false,source:available?'platform':'unavailable'};},
  safe(){return {available,provider,model,source:available?'platform':'unavailable',billing:{mode:'pilot',monthlyFee:0,botIncluded:true}};}
 };
}
