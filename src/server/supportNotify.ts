import { typedFetch as httpFetch } from './typedFetch.js';
/** Optional outbound alerts; never block the database transaction on a provider outage. */
type EventKind='created'|'customer_replied'|'support_replied'|'status_changed';
function safe(value:unknown,max=160){return String(value||'').replace(/[\r\n<>]/g,' ').trim().slice(0,max);}
async function post(url:string,body:unknown,headers:Record<string,string>,timeoutMs=4500){
  const res=await httpFetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
  if(!res.ok)throw new Error('Provider returned '+res.status);
}
async function sendEmail(recipient:string,subject:string,plain:string){
  const key=String(process.env.RESEND_API_KEY||'').trim();
  const from=String(process.env.RESEND_FROM_EMAIL||'').trim();
  if(!key||!from||!recipient)return false;
  await post('https://api.resend.com/emails',{from,to:[recipient],subject,text:plain},{Authorization:'Bearer '+key});
  return true;
}
async function sendTelegram(plain:string){
  const token=String(process.env.SUPPORT_TELEGRAM_BOT_TOKEN||'').trim();
  const chatId=String(process.env.SUPPORT_TELEGRAM_CHAT_ID||'').trim();
  if(!token||!chatId)return false;
  await post('https://api.telegram.org/bot'+encodeURIComponent(token)+'/sendMessage',{chat_id:chatId,text:plain,disable_web_page_preview:true},{});
  return true;
}
export async function notifySupportEvent(kind:EventKind,ticket:{id:string;ticket_number:number;ticket_type:string},userEmail=''){
  const ref='AR-'+String(ticket.ticket_number).padStart(6,'0');
  const path='https://autoreplys.vercel.app/admin';
  const subject='Auto Replies · Ticket '+ref;
  const generic='Ticket '+ref+' ('+safe(ticket.ticket_type,40)+') '+kind.replaceAll('_',' ')+'.';
  const jobs:Promise<unknown>[]=[];
  if(kind==='created'||kind==='customer_replied'){
    const adminEmail=String(process.env.SUPPORT_NOTIFICATION_EMAIL||'').trim();
    if(adminEmail)jobs.push(sendEmail(adminEmail,subject,generic+'\nOpen the private admin panel: '+path));
    jobs.push(sendTelegram('Auto Replies support: '+generic+'\nOpen '+path));
  }
  if(kind==='created'||kind==='support_replied'||kind==='status_changed'){
    const customerText=kind==='created'?'Your request '+ref+' was received.': 'There is an update on your support request '+ref+'.';
    jobs.push(sendEmail(userEmail,subject,customerText+'\nSign in to view details: https://autoreplys.vercel.app/contact'));
  }
  if(!jobs.length)return;
  // Notifications are best effort. Nothing sensitive from messages or payments
  // is put into Telegram/email; the customer signs in to read ticket details.
  const result=await Promise.allSettled(jobs);
  for(const item of result)if(item.status==='rejected')console.warn('[SUPPORT_NOTIFICATION_FAILED]',{event:kind,type:item.reason?.name||'provider_error'});
}
