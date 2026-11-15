/** Durable per-conversation revisions coordinate overlapping webhook workers. */
export type DmTurn={workspace:string;sender:string;revision:number;pending_ids:string[]};
async function dmTurnRpc(admin:any,turn:{workspace:string;sender:string;revision?:number},action:string,message=''){
 const {data,error}=await admin.rpc('autoreply_dm_turn',{p_workspace:turn.workspace,p_sender:turn.sender,p_action:action,p_message:message,p_revision:turn.revision??null});
 if(error||!data||!Number.isSafeInteger(Number(data.revision)))throw Error('Conversation turn coordination unavailable');
 return data;
}
export async function registerDmTurn(admin:any,workspace:string,sender:string,message:string):Promise<DmTurn>{
 const data=await dmTurnRpc(admin,{workspace,sender},'register',message);
 return {workspace,sender,revision:Number(data.revision),pending_ids:data.pending_ids||[message]};
}
export async function observeDmTurn(admin:any,turn:DmTurn){return dmTurnRpc(admin,turn,'observe');}
export async function waitForDmTurn(admin:any,turn:DmTurn,options:{sleep?:(ms:number)=>Promise<void>;now?:()=>number;timeoutMs?:number}={}){
 const sleep=options.sleep||((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))),now=options.now||Date.now,deadline=now()+(options.timeoutMs||16000);
 while(now()<deadline){const state=await observeDmTurn(admin,turn);if(!state.latest)return false;
  turn.pending_ids=state.pending_ids||turn.pending_ids;
  if(state.ready&&Number(state.quiet_ms||0)<=0)return true;
  await sleep(Math.min(1200,Math.max(80,Number(state.quiet_ms||120))));
 }
 throw Error('Customer message batch is not ready');
}
export async function claimDmTurn(admin:any,turn:DmTurn){const state=await dmTurnRpc(admin,turn,'claim');return state.claimed===true;}
export async function finishDmTurn(admin:any,turn:DmTurn){return dmTurnRpc(admin,turn,'finish');}
export async function dropUnstoredDmInput(admin:any,turn:DmTurn,message:string){return dmTurnRpc(admin,turn,'drop',message);}
export function watchDmTurn(admin:any,turn:DmTurn){
 const controller=new AbortController();let active=true,timer:ReturnType<typeof setTimeout>|null=null;
 const check=async()=>{if(!active)return;try{const state=await observeDmTurn(admin,turn);if(!state.latest){controller.abort('superseded_customer_turn');active=false;return;}}catch{controller.abort('turn_coordination_unavailable');active=false;return;}if(active)timer=setTimeout(check,500);};
 timer=setTimeout(check,500);
 return {signal:controller.signal,stop(){active=false;if(timer)clearTimeout(timer);}};
}
