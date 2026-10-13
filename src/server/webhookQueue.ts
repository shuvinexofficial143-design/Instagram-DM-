import { createHash,randomUUID,timingSafeEqual } from 'node:crypto';
import { cleanEnvironment,SUPABASE_URL } from './supabaseConfig.js';

type Queued={event_hash:string;payload:any;lease_id:string;attempts:number;status?:string};
const key=()=>cleanEnvironment(process.env.SUPABASE_SERVICE_ROLE_KEY);
function config(){
  const token=key();
  if(!token)throw new Error('Durable webhook queue unavailable: no private database key');
  return {apikey:token,Authorization:'Bearer '+token,'Content-Type':'application/json'};
}
async function rest(path:string,method:'GET'|'POST'|'PATCH'='GET',body?:unknown,additional:Record<string,string>={}){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),10000);
  try{
    const response=await fetch(SUPABASE_URL+'/rest/v1/'+path,{
      method,headers:{...config(),...additional},signal:ctrl.signal,
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    if(!response.ok)throw new Error('Webhook queue datastore request failed (HTTP '+response.status+')');
    const data=await response.json().catch(()=>[]);
    return data;
  }finally{clearTimeout(timer)}
}
export const durableWebhookEnabled=()=>process.env.WEBHOOK_DURABLE_QUEUE_ENABLED==='true';
export function authorizedQueueDrain(req:any){
  const expected=cleanEnvironment(process.env.WEBHOOK_QUEUE_SECRET);
  const supplied=String(req.headers?.['x-autoreply-queue-secret']||'');
  return Boolean(expected&&supplied&&Buffer.byteLength(expected)===Buffer.byteLength(supplied)
    &&timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)));
}
export async function queueWebhookEvent(raw:Buffer,payload:any){
  const hash=createHash('sha256').update(raw).digest('hex');
  const lease=randomUUID();
  const inserted=await rest('autoreply_webhook_queue?on_conflict=event_hash','POST',{
    event_hash:hash,payload,status:'processing',attempts:1,lease_id:lease,claimed_at:new Date().toISOString()
  },{Prefer:'resolution=ignore-duplicates,return=representation'});
  if(Array.isArray(inserted)&&inserted[0])return {created:true,hash,lease,attempts:1};
  const found=await rest('autoreply_webhook_queue?select=status&event_hash=eq.'+hash+'&limit=1');
  return {created:false,hash,lease:'',status:found?.[0]?.status||'pending',attempts:0};
}
export async function finishWebhook(hash:string,lease:string,success:boolean,attempts:number){
  if(!/^[a-f0-9]{64}$/.test(hash)||!lease)return;
  const delayMs=Math.min(30*60*1000,15000*(2**Math.min(7,Math.max(0,attempts-1))));
  const dead=attempts>=8;
  await rest('autoreply_webhook_queue?event_hash=eq.'+hash+'&lease_id=eq.'+encodeURIComponent(lease),'PATCH',
    success?
    {status:'processed',payload:{},processed_at:new Date().toISOString(),last_error:null,lease_id:null}:
    {status:dead?'dead':'pending',next_attempt_at:new Date(Date.now()+delayMs).toISOString(),
     last_error:'Processor failed; check server logs',lease_id:null},
    {Prefer:'return=representation'});
}
export async function drainQueuedWebhooks(
  handler:(event:any)=>Promise<unknown>
){
  const claimed=await rest('rpc/autoreply_claim_webhook_queue','POST',{p_limit:1},{Prefer:'return=representation'});
  if(!Array.isArray(claimed)||!claimed.length)return {processed:0,queued:0};
  let processed=0;
  for(const row of claimed as Queued[]){
    try{
      await handler(row.payload);
      await finishWebhook(row.event_hash,row.lease_id,true,row.attempts);
      processed++;
    }catch(e:any){
      console.error('[DURABLE_WEBHOOK_RETRY_FAILED]',{attempts:row.attempts,kind:e?.name||'error'});
      await finishWebhook(row.event_hash,row.lease_id,false,row.attempts);
    }
  }
  return {processed,queued:claimed.length};
}
