// Keep the request identity when a response is lost. A retry can then retrieve
// the saved event rather than accidentally advance the employee's sequence.
export function createClockRequest(send,makeId=()=>crypto.randomUUID()){
 let pending=null;
 return async(context,payload)=>{
  if(!pending||pending.context!==context)pending={context,requestId:makeId()};
  try{const result=await send({...payload,requestId:pending.requestId});pending=null;return result;}
  catch(error){if(error.status>=400&&error.status<500)pending=null;throw error;}
 };
}
