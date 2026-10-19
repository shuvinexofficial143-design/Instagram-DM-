import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
const response=(status:number,body:any)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
function client(){let key=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||key;}catch{}return createClient(Deno.env.get('SUPABASE_URL')||'',key,{auth:{persistSession:false,autoRefreshToken:false}});}
async function rpc(admin:any,name:string,args:any={}){const {data,error}=await admin.rpc(name,args);if(error)throw new Error(name+' unavailable');return data;}
export async function processCampaignBatch(admin:any,transport:typeof fetch=fetch){
 const jobs=await rpc(admin,'autoreply_claim_campaign_batch');let sent=0,blocked=0;
 for(const job of jobs||[]){
  const finish=(status:string,messageId:string|null,reason:string)=>rpc(admin,'autoreply_finish_campaign_recipient',{p_id:job.id,p_lease:job.lease_id,p_status:status,p_message_id:messageId,p_reason:reason});
  const key='campaign:'+job.campaign_id+':'+job.id;let reserved=false,dispatched=false;
  try{
   const {data:campaign,error}=await admin.from('autoreply_campaigns').select('status').eq('id',job.campaign_id).maybeSingle();
   if(error)throw new Error('Campaign state unavailable');
   if(campaign?.status!=='running'){await finish(campaign?.status==='paused'?'queued':'skipped',null,'Campaign paused or stopped before dispatch');blocked++;continue;}
   // Re-read the current credentials and eligibility immediately before dispatch.
   const {data:token,error:tokenError}=await admin.from('autoreply_instagram_tokens').select('account').eq('user_id',job.workspace_id).maybeSingle();
   const eligible=await rpc(admin,'autoreply_campaign_eligibility',{p_workspace:job.workspace_id,p_identifiers:[job.sender_id]});
   if(tokenError||!token?.account?.access_token||eligible?.[0]?.eligible!==true){await finish('skipped',null,'Instagram disconnected or messaging window closed');blocked++;continue;}
   const quota=await rpc(admin,'autoreply_reserve_delivery_quota',{p_workspace_id:job.workspace_id,p_delivery_key:key,p_is_ai:false});
   if(!quota?.allowed){await finish('skipped',null,quota?.reason||'Message quota unavailable');blocked++;continue;}
   reserved=true;dispatched=true;
   const result=await transport('https://graph.instagram.com/v25.0/me/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token.account.access_token},body:JSON.stringify({recipient:{id:job.sender_id},message:{text:job.message}}),signal:AbortSignal.timeout(12000)});
   const body=await result.json().catch(()=>null);
   if(result.ok&&body?.message_id){
    // Mark sent and write Inbox in one transaction before acknowledging the batch.
    await finish('sent',String(body.message_id),'');
    await rpc(admin,'autoreply_finish_delivery_quota',{p_workspace_id:job.workspace_id,p_delivery_key:key,p_sent:true});sent++;
   }else if(result.status>=400&&result.status<500){
    await finish('failed',null,String(body?.error?.message||'Instagram rejected this message'));
    await rpc(admin,'autoreply_finish_delivery_quota',{p_workspace_id:job.workspace_id,p_delivery_key:key,p_sent:false});blocked++;
   }else{await finish('unknown',null,'Instagram did not confirm delivery. Check Instagram before sending again.');blocked++;}
  }catch{
   // An ambiguous send is not retried. A pre-dispatch failure is also visible.
   try{await finish(dispatched?'unknown':'failed',null,dispatched?'Delivery confirmation interrupted. Check Instagram before sending again.':'Campaign service unavailable before sending.');}catch{}
   if(reserved&&!dispatched)try{await rpc(admin,'autoreply_finish_delivery_quota',{p_workspace_id:job.workspace_id,p_delivery_key:key,p_sent:false});}catch{}
   blocked++;
  }
 }
 return {claimed:(jobs||[]).length,sent,blocked};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='GET')return response(200,{ok:true,worker:'instagram-campaign-worker'});
 if(req.method!=='POST')return response(405,{ok:false});
 try{const admin=client(),secret=req.headers.get('x-campaign-cron')||'';
  if(!secret||!await rpc(admin,'autoreply_campaign_worker_authorized',{p_secret:secret}))return response(401,{ok:false,error:'Worker authorization required'});
  return response(200,{ok:true,...await processCampaignBatch(admin)});
 }catch{return response(503,{ok:false,error:'Campaign service unavailable'});}
});
