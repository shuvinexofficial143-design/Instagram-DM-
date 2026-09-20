import { createClient } from '@supabase/supabase-js';
const URL='https://dwgxmmftybxwpurgsxkx.supabase.co',KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||''),DEF='devsinghparmar9589@gmail.com';
export default async function handler(req:any,res:any){
 if(req.method!=='PATCH'){res.setHeader('Allow','PATCH');return res.status(405).json({success:false,error:'Method Not Allowed'});}
 try{
  if(!KEY) throw Object.assign(new Error('Server admin database key is not configured.'),{status:503});
  const sb=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}}),token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();
  const {data,error}=await sb.auth.getUser(token),email=String(data?.user?.email||'').toLowerCase(),allowed=String(process.env.ADMIN_EMAILS||process.env.ADMIN_EMAIL||DEF).split(',').map(x=>x.trim().toLowerCase());
  if(error||!data?.user) throw Object.assign(new Error('Admin session is invalid or expired.'),{status:401});
  if(!allowed.includes(email)) throw Object.assign(new Error('Admin access denied.'),{status:403});
  const id=String(req.query?.planId||'').toLowerCase();if(!['free','starter','pro','business'].includes(id))return res.status(400).json({success:false,error:'Unknown plan.'});
  const b=req.body||{},clean={price_inr:Math.max(0,Math.round(Number(b.price_inr)||0)),total_messages:Math.max(0,Math.round(Number(b.total_messages)||0)),ai_replies:Math.max(0,Math.round(Number(b.ai_replies)||0)),instagram_accounts:Math.max(0,Math.round(Number(b.instagram_accounts)||0)),automations_limit:b.automations_limit===null||b.automations_limit===''?null:Math.max(0,Math.round(Number(b.automations_limit)||0)),billing_days:Math.max(1,Math.round(Number(b.billing_days)||30)),is_active:b.is_active!==false,updated_at:new Date().toISOString()};
  if(clean.ai_replies>clean.total_messages)return res.status(400).json({success:false,error:'AI replies cannot exceed total messages.'});
  const before=(await sb.from('autoreply_plans').select('*').eq('id',id).maybeSingle()).data;
  const name=id[0].toUpperCase()+id.slice(1),sort_order=['free','starter','pro','business'].indexOf(id);
  const {data:saved,error:saveErr}=await sb.from('autoreply_plans').upsert({id,name,sort_order,...clean},{onConflict:'id'}).select('*').single();if(saveErr)throw saveErr;
  await sb.from('autoreply_admin_audit_logs').insert({admin_user_id:data.user.id,admin_email:email,action:'plan.updated',entity_type:'plan',entity_id:id,before_data:before,after_data:saved});
  return res.status(200).json({success:true,plan:saved});
 }catch(e:any){return res.status(Number(e?.status)||500).json({success:false,error:e?.message||'Could not update plan.'});}
}
