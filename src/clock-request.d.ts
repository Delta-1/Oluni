export function createClockRequest(send:(payload:any)=>Promise<any>,makeId?:()=>string):(context:string,payload:any)=>Promise<any>;
