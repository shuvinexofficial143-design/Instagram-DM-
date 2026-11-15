import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {scanCustomerFacts,customerFactValues} from '../instagram-live-webhook/customerFacts.ts';
import {generateCatalogReply} from '../instagram-live-webhook/catalogRuntime.ts';
import {checkCatalogProvider} from './catalogCheck.ts';
import {DM_AI_MODEL} from '../instagram-live-webhook/openaiConfig.ts';
const reply=(status:number,value:any)=>Response.json(value,{status});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{ok:false});
 try{
  let key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||key;}catch{}
  const admin=createClient(Deno.env.get('SUPABASE_URL')||'',key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authorized,error}=await admin.rpc('autoreply_memory_worker_authorized',{p_secret:req.headers.get('x-memory-cron')||''});
  if(error||!authorized)return reply(401,{ok:false,error:'Internal worker authorization required'});
  const providerKey=Deno.env.get('OPENAI_API_KEY')||'';if(!providerKey)return reply(503,{ok:false,code:'provider_key_missing'});
  const body=await req.json().catch(()=>({}));if(body.action==='catalog')return reply(200,{model:DM_AI_MODEL,...await checkCatalogProvider(providerKey)});
  // Synthetic only. This endpoint has no Meta send or production customer write path.
  const sources=[{id:'synthetic-address',timestamp:'2026-11-15T00:00:00Z',text:'1. Ek\n2. Arun Kumar Sharma\n3. 9876543210\n4. Flat 12, Sant Hari Nagar, Naygaon Road, Sinnar, Ji. Nashik'},{id:'synthetic-pin',timestamp:'2026-11-15T00:01:00Z',text:'422103'}];
  const state=await scanCustomerFacts({key:providerKey,sources,history:[{role:'assistant',content:'कृपया अपना पूरा नाम, मोबाइल और पता भेजें।'}]});
  const values=customerFactValues(state);
  const outputs:any[]=[];
  for(const current of ['राज्य महाराष्ट्र है','2 minut','Kr Diya bro Aacha business he maje kro']){
   const result=await generateCatalogReply({key:providerKey,systemPrompt:'You are Ishu Mart assistant. Love Pearl Necklace costs ₹360, free delivery, COD. Estimated delivery 5–7 days. The customer already wants one unit. Collect only missing address fields, then request confirmation. Do not restart the sales pitch.',history:[{role:'user',content:sources[0].text},{role:'assistant',content:'आपकी जानकारी मिल गई है। कृपया राज्य बता दीजिए।'}],text:current,customerFacts:{...state,configuredFields:['Name','Phone','Address','City','District','State','PIN Code','Quantity']},timeoutMs:20000});
   outputs.push({input:current,reply:result.text,handoff:Boolean(result.handoff)});
  }
  return reply(200,{ok:true,model:DM_AI_MODEL,synthetic:true,no_customer_messages_sent:true,checks:{name:values.name==='Arun Kumar Sharma',phone:values.phone==='9876543210',address:Boolean(values.address?.includes('Naygaon Road')),pincode:values.pincode==='422103',state_not_invented:!values.state,house_number:Boolean(values.house_number?.includes('12')),road:Boolean(values.road?.includes('Naygaon')),area:Boolean(values.area?.includes('Sant Hari'))},fields:values,outputs});
 }catch(error:any){return reply(503,{ok:false,model:DM_AI_MODEL,error:String(error?.message||'AI check failed').slice(0,300),provider_status:error?.status||null,provider_detail:error?.providerMessage||null});}
});
