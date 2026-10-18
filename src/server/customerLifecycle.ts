import { fetch as httpFetch } from 'undici';
import {timingSafeEqual} from 'node:crypto';
import {authenticatedUser,cleanEnvironment} from './supabaseConfig.js';
import {billingDb,businessDetails} from './cashfree.js';

const validEmail=(email:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<200;
const mask=(email:string)=>email.replace(/^(.{2}).*(@[^@]+)$/,'$1***$2');
export const mailConfigured=()=>Boolean(cleanEnvironment(process.env.RESEND_API_KEY)&&cleanEnvironment(process.env.RESEND_FROM_EMAIL));
function htmlEscape(s:string){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||''));}
function trimmed(value:unknown,max=100){return String(value||'').trim().slice(0,max);}
async function sendProvider(to:string,subject:string,plain:string,html:string,key:string){
 if(!mailConfigured())return null;
 const token=cleanEnvironment(process.env.RESEND_API_KEY),from=cleanEnvironment(process.env.RESEND_FROM_EMAIL);
 const r=await httpFetch('https://api.resend.com/emails',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':key},
  body:JSON.stringify({from,to:[to],subject,text:plain,html}),signal:AbortSignal.timeout(8000)
 });
 if(!r.ok){console.warn('[CUSTOMER_MAIL_PROVIDER_FAILED]',{status:r.status});return null;}
 const data=await r.json().catch(()=>null);
 return data?.id||null;
}
async function sendWelcome(row:any){
 if(!mailConfigured()||row.welcome_sent_at||!validEmail(row.email))return;
 const lock=await billingDb('rpc/autoreply_claim_welcome_email','POST',{p_user_id:row.user_id});
 if(lock!==true)return;
 const name=htmlEscape(trimmed(row.display_name,80)||'there');
 const body=`Hi ${name},\n\nWelcome to Auto Replies! Your account is ready. Connect your Instagram account, create an automation, and test how your replies work.\n\nYour plan and active limits are always visible under Billing & Usage.\n\nGet started: https://autoreplys.vercel.app/\nHelp: https://autoreplys.vercel.app/help\n\nYou will not receive inactivity tips unless you turn them on in Settings.`;
 const html=`<div style="font:16px/1.7 Arial,sans-serif;max-width:620px;margin:auto;background:#fff7ed;padding:28px;border-radius:20px"><p style="color:#c2410c;font-weight:700;letter-spacing:2px">AUTO REPLIES</p><h1 style="color:#0f172a;font-size:28px">Welcome, ${name}!</h1><p>Your account is ready. Set up Instagram automations in three quick steps.</p><ol><li>Connect your Instagram business account.</li><li>Create your first reply automation.</li><li>Test it and review your Inbox.</li></ol><a style="display:inline-block;background:#c2410c;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none" href="https://autoreplys.vercel.app/">Open your dashboard</a><p style="color:#475569">See your current plan and limits under <strong>Billing &amp; Usage</strong>. Need help? <a href="https://autoreplys.vercel.app/help">Contact support</a>.</p><p style="font-size:13px;color:#64748b">Optional learning reminders are off until you enable them in Settings.</p></div>`;
 try{const id=await sendProvider(row.email,'Welcome to Auto Replies — start your first automation',body,html,'autoreply-welcome/'+row.user_id);
   if(id)await billingDb('autoreply_customer_email_lifecycle?user_id=eq.'+encodeURIComponent(row.user_id),'PATCH',{welcome_sent_at:new Date().toISOString(),welcome_claimed_at:null});
 }catch(e:any){console.warn('[WELCOME_MAIL_UNAVAILABLE]',{kind:e?.name||'network'})}
}

const drips=[
 {subject:'Your first Instagram automation is only a few steps away',headline:'Start your first automation',tip:'Connect your Instagram account, choose a trigger such as a DM keyword, and test the reply before going live.',cta:'Open your workspace'},
 {subject:'Auto Replies tip: test DMs and make responses feel natural',headline:'Your DMs can work smarter',tip:'Check your Inbox, try the reply preview, and adjust your message before turning on any automation.',cta:'Review Inbox'},
 {subject:'See your plan usage and available reply limits',headline:'Know what your plan includes',tip:'You can view your current plan, reply allowance, active status and expiry date inside Billing & Usage. Never guess from an old email.',cta:'View Billing & Usage'},
 {subject:'Need help getting started? Our support team can guide you',headline:'We are here to help',tip:'If Instagram connection or AI replies are confusing, open a private support ticket. No need to share passwords or OTPs.',cta:'Open support'}
];
const href=['https://autoreplys.vercel.app/','https://autoreplys.vercel.app/','https://autoreplys.vercel.app/billing','https://autoreplys.vercel.app/contact'];
export async function deliverOnboardingBatch(){
 if(!mailConfigured())return {configured:false,sent:0};
 const rows=await billingDb('rpc/autoreply_claim_onboarding_emails','POST',{p_limit:4});
 let sent=0;
 for(const row of Array.isArray(rows)?rows:[]){
  const stage=Number(row.onboarding_stage);
  if(!validEmail(row.email)||!drips[stage])continue;
  // Recheck latest activity, consent, claim and stage; opt-outs must win.
  const state=await billingDb('autoreply_customer_email_lifecycle?select=user_id,marketing_opt_in,onboarding_stage,onboarding_claimed_at,last_seen_at&user_id=eq.'+encodeURIComponent(row.user_id)+'&limit=1');
  const current=state?.[0];
  if(!current?.marketing_opt_in||current.onboarding_stage!==stage||!current.onboarding_claimed_at
    ||Date.now()-Date.parse(current.last_seen_at)<3*(stage+1)*86400000)continue;
  // Show the verified current plan only in the plan-focused reminder.
  // Expired/free users must never be described as having paid access.
  let planLine='';
  if(stage===2){
    const subs=await billingDb('autoreply_billing_subscriptions?select=plan_id,expires_at&owner_user_id=eq.'+
      encodeURIComponent(row.user_id)+'&limit=1').catch(()=>[]);
    const sub=subs?.[0];
    const valid=sub?.expires_at&&Date.parse(sub.expires_at)>Date.now();
    planLine=valid
      ?'Current paid plan: '+String(sub.plan_id).slice(0,45)+'. Valid until '+
          new Date(sub.expires_at).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})+'.'
      :'No active paid plan is confirmed. Check Billing & Usage for your current status.';
  }
  const company=businessDetails();
  const footer=htmlEscape(trimmed(company.legalName,100)+' · '+trimmed(company.address,160));
  const campaign=drips[stage],name=htmlEscape(trimmed(row.display_name,60)||'there');
  const optout='https://autoreplys.vercel.app/api/workspace-data?action=mail-unsubscribe&token='+encodeURIComponent(row.unsubscribe_token);
  const plain=`Hi ${trimmed(row.display_name,60)||'there'},\n\n${campaign.tip}\n${planLine?planLine+'\\n':''}\nOpen: ${href[stage]}\n\nThis is tip ${stage+1} of 4, because you opted in for onboarding emails. We stop if you return to the website.\nUnsubscribe: ${optout}\n\nSent by ${company.legalName}, ${company.address}`;
  const html=`<div style="max-width:620px;margin:auto;padding:30px;background:#fff7ed;border-radius:20px;font:16px/1.7 Arial,sans-serif"><p style="color:#c2410c;letter-spacing:2px;font-weight:700">AUTO REPLIES</p><h2 style="color:#0f172a">${campaign.headline}</h2><p>Hi ${name},</p><p>${campaign.tip}</p>${planLine?'<p style="font-weight:700">'+htmlEscape(planLine)+'</p>':''}<a href="${href[stage]}" style="display:inline-block;background:#c2410c;padding:12px 20px;color:#fff;text-decoration:none;border-radius:10px">${campaign.cta}</a><p style="margin-top:30px;font-size:13px;color:#64748b">Tip ${stage+1} of 4 · You opted in to product tips. <a href="${optout}">Unsubscribe with one click</a>.</p><p style="font-size:12px;color:#64748b">${footer}</p></div>`;
  try{
    const id=await sendProvider(row.email,campaign.subject,plain,html,'autoreply-onboard/'+row.user_id+'/'+stage);
    if(id){
      // Only the same lease can advance; a concurrent newer visit stops the next tip.
      await billingDb('rpc/autoreply_complete_onboarding_email','POST',
       {p_user_id:row.user_id,p_stage:stage,p_claimed_at:current.onboarding_claimed_at});
      sent++;
    }
  }catch(e:any){console.warn('[ONBOARDING_MAIL_FAILED]',{kind:e?.name||'network'})}
 }
 return {configured:true,sent,claimed:Array.isArray(rows)?rows.length:0};
}
export default async function lifecycleHandler(req:any,res:any){
 res.setHeader('Cache-Control','private,no-store');
 try{
  const action=String(req.query?.action||'');
  if(action==='mail-unsubscribe'){
    if(req.method!=='GET')return res.status(405).json({ok:false});
    const token=trimmed(req.query?.token,40);
    if(!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(token))return res.status(400).send('Invalid unsubscribe link.');
    await billingDb('autoreply_customer_email_lifecycle?unsubscribe_token=eq.'+encodeURIComponent(token),'PATCH',
      {marketing_opt_in:false,onboarding_claimed_at:null,updated_at:new Date().toISOString()});
    return res.redirect(303,'/settings?email_unsubscribed=1');
  }
  if(action==='mail-drain'){
    const secret=cleanEnvironment(process.env.CUSTOMER_EMAIL_CRON_SECRET);
    const supplied=String(req.headers?.['x-autoreply-mail-secret']||'');
    if(req.method!=='POST'||!secret||Buffer.byteLength(secret)!==Buffer.byteLength(supplied)
      ||!timingSafeEqual(Buffer.from(secret),Buffer.from(supplied)))return res.status(403).json({ok:false});
    return res.status(200).json({ok:true,...await deliverOnboardingBatch()});
  }
  const user:any=await authenticatedUser(req);
  if(!user?.id||!user.email||!user.email_confirmed_at||user.is_anonymous) return res.status(401).json({ok:false,error:'Sign in with a confirmed email.'});
  if(!validEmail(String(user.email)))return res.status(400).json({ok:false,error:'Invalid account email.'});
  if(action==='mail-activity'){
    if(req.method!=='POST')return res.status(405).json({ok:false});
    const row=await billingDb('rpc/autoreply_touch_email_lifecycle','POST',{p_user_id:user.id,p_email:user.email,
      p_name:trimmed(user.user_metadata?.full_name||user.user_metadata?.name||String(user.email).split('@')[0],100)});
    // Once per account; no repeated welcome on tab refresh or token rotation.
    await sendWelcome(row);
    return res.status(200).json({ok:true,marketingOptIn:row.marketing_opt_in,welcomeSent:Boolean(row.welcome_sent_at)});
  }
  if(action==='mail-preferences'){
    if(req.method==='POST'){
      if(typeof req.body?.marketingOptIn!=='boolean')return res.status(400).json({ok:false,error:'Explicit opt-in or opt-out is required.'});
      const record=await billingDb('rpc/autoreply_touch_email_lifecycle','POST',{p_user_id:user.id,p_email:user.email,
        p_name:trimmed(user.user_metadata?.full_name||user.user_metadata?.name||'Customer',100)});
      const updated=await billingDb('autoreply_customer_email_lifecycle?user_id=eq.'+encodeURIComponent(user.id),'PATCH',
       {marketing_opt_in:req.body.marketingOptIn,onboarding_claimed_at:null,updated_at:new Date().toISOString()});
      return res.status(200).json({ok:true,marketingOptIn:Boolean(updated?.[0]?.marketing_opt_in)});
    }
    if(req.method!=='GET')return res.status(405).json({ok:false});
    const rows=await billingDb('autoreply_customer_email_lifecycle?select=marketing_opt_in,onboarding_stage&user_id=eq.'+encodeURIComponent(user.id)+'&limit=1');
    return res.status(200).json({ok:true,marketingOptIn:Boolean(rows?.[0]?.marketing_opt_in),tipsSent:Number(rows?.[0]?.onboarding_stage||0)});
  }
  return res.status(404).json({ok:false,error:'Unknown mail action.'});
 }catch(e:any){
  console.warn('[CUSTOMER_LIFECYCLE_ERROR]',{action:String(req.query?.action||'').slice(0,35),kind:e?.name||'error'});
  return res.status(503).json({ok:false,error:'Email preferences are temporarily unavailable.'});
 }
}
