import {memoryBenchmarkStep,memoryBenchmarkReplies} from './benchmarkRuntime.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import {memoryProcessJobs} from '../instagram-live-webhook/smartMemory.ts';
const memoryResponse=(status:number,body:any)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='GET')return memoryResponse(200,{ok:true,worker:'instagram-memory-worker',openaiConfigured:Boolean(Deno.env.get('OPENAI_API_KEY'))});
 if(req.method!=='POST')return memoryResponse(405,{ok:false});
 try{
  let key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||key;}catch{}
  const admin=createClient(Deno.env.get('SUPABASE_URL')||'',key,{auth:{persistSession:false,autoRefreshToken:false}});
  const secret=req.headers.get('x-memory-cron')||'';
  const {data:authorized,error}=await admin.rpc('autoreply_memory_worker_authorized',{p_secret:secret});
  if(error||!authorized)return memoryResponse(401,{ok:false,error:'Worker authorization required'});
  const body=await req.json().catch(()=>({}));const providerKey=Deno.env.get('OPENAI_API_KEY')||'';
  if(body.action==='benchmark-step'||body.action==='benchmark-replies'){
    if(!providerKey)return memoryResponse(503,{ok:false,error:'Provider key unavailable'});
    const count=Number(body.count);if(![10,50,100,500].includes(count))return memoryResponse(400,{ok:false,error:'Invalid synthetic benchmark size'});
    const measured=body.action==='benchmark-step'?await memoryBenchmarkStep({key:providerKey,count,offset:Number(body.offset||0),state:body.state}):await memoryBenchmarkReplies({key:providerKey,count,state:body.state});
    return memoryResponse(200,{ok:true,...measured});
  }
  return memoryResponse(200,{ok:true,...await memoryProcessJobs(admin,providerKey)});
 }catch{return memoryResponse(503,{ok:false,error:'Memory worker unavailable'});}
});
