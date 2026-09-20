import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL='https://dwgxmmftybxwpurgsxkx.supabase.co';
const SERVICE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
const DEFAULT_ADMIN_EMAIL='devsinghparmar9589@gmail.com';
const allowed=()=>String(process.env.ADMIN_EMAILS||process.env.ADMIN_EMAIL||DEFAULT_ADMIN_EMAIL).split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const defaults=[
{id:'free',name:'Free',price_inr:0,total_messages:1500,ai_replies:1000,instagram_accounts:1,automations_limit:5,billing_days:30,is_active:true,sort_order:0},
{id:'starter',name:'Starter',price_inr:299,total_messages:7500,ai_replies:5000,instagram_accounts:1,automations_limit:null,billing_days:30,is_active:true,sort_order:1},
{id:'pro',name:'Pro',price_inr:599,total_messages:25000,ai_replies:15000,instagram_accounts:2,automations_limit:null,billing_days:30,is_active:true,sort_order:2},
{id:'business',name:'Business',price_inr:1299,total_messages:75000,ai_replies:40000,instagram_accounts:5,automations_limit:null,billing_days:30,is_active:true,sort_order:3},
];
async function admin(req:any){
 if(!SERVICE_KEY) throw Object.assign(new Error('Server admin database key is not configured.'),{status:503});
 const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();
 if(!token) throw Object.assign(new Error('Admin authentication is required.'),{status:401});
 const sb=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await sb.auth.getUser(token);
 const email=String(data?.user?.email||'').toLowerCase();
 if(error||!data?.user||!email) throw Object.assign(new Error('Admin session is invalid or expired.'),{status:401});
 if(!allowed().includes(email)) throw Object.assign(new Error('This Google account is not authorized for Admin Panel.'),{status:403});
 return {sb,user:data.user,email};
}
export default async function handler(req:any,res:any){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({success:false,error:'Method Not Allowed'});}
 try{
  const {sb,email}=await admin(req);
  const [profilesR,docsR,usageR,plansR,auditR]=await Promise.all([
   sb.from('autoreply_profiles').select('*'),
   sb.from('autoreply_documents').select('user_id,collection,id,data,updated_at'),
   sb.from('autoreply_usage_monthly').select('*').order('updated_at',{ascending:false}).limit(500),
   sb.from('autoreply_plans').select('*').order('sort_order',{ascending:true}),
   sb.from('autoreply_admin_audit_logs').select('*').order('created_at',{ascending:false}).limit(30),
  ]);
  const map=new Map<string,any>();
  for(const p of profilesR.data||[]){const uid=String(p.user_id||p.id||'');if(!uid)continue;map.set(uid,{uid,email:p.email||'',displayName:p.display_name||p.name||String(p.email||'').split('@')[0]||'User',photoURL:p.avatar_url||'',role:p.role||'user',last_login_at:p.last_login_at||null,last_active_at:p.last_active_at||p.updated_at||null,instagramAccounts:0,instagramUsernames:[],automations:0,contacts:0,messages:0,aiReplies:0});}
  for(const d of docsR.data||[]){const uid=String(d.user_id||'');if(!uid)continue;if(!map.has(uid))map.set(uid,{uid,email:'',displayName:'User',photoURL:'',role:'user',last_login_at:null,last_active_at:d.updated_at||null,instagramAccounts:0,instagramUsernames:[],automations:0,contacts:0,messages:0,aiReplies:0});const u=map.get(uid),x=d.data||{},col=String(d.collection||'');if(col==='instagram_account'&&x.username){u.instagramAccounts++;if(!u.instagramUsernames.includes(x.username))u.instagramUsernames.push(x.username);}else if(col==='automations')u.automations++;else if(col==='contacts')u.contacts++;else if(col==='inbox_messages'&&x.direction==='out'&&x.is_automated){u.messages++;if(x.automation_type==='ai'||x.is_ai===true)u.aiReplies++;}}
  for(const row of usageR.data||[]){const u=map.get(String(row.user_id||''));if(!u)continue;u.messages=Math.max(u.messages,Number(row.total_messages??row.message_count??row.messages_used??0));u.aiReplies=Math.max(u.aiReplies,Number(row.ai_replies??row.ai_reply_count??row.ai_replies_used??0));}
  const users=Array.from(map.values()),now=Date.now(),active=(days:number)=>users.filter(u=>u.last_active_at&&now-new Date(u.last_active_at).getTime()<=days*86400000).length;
  return res.status(200).json({success:true,admin:{email},stats:{totalUsers:users.length,active24h:active(1),active7d:active(7),active30d:active(30),connectedInstagram:users.reduce((n,u)=>n+u.instagramAccounts,0),totalAutomations:users.reduce((n,u)=>n+u.automations,0),totalMessages:users.reduce((n,u)=>n+u.messages,0),totalAiReplies:users.reduce((n,u)=>n+u.aiReplies,0)},users,plans:plansR.data?.length?plansR.data:defaults,auditLogs:auditR.data||[]});
 }catch(e:any){return res.status(Number(e?.status)||500).json({success:false,error:e?.message||'Could not load admin data.'});}
}
