import { billingDb } from './cashfree.js';
import { generateInvoicePdf, invoiceLabel, type PaidInvoice } from './invoicePdf.js';
import { cleanEnvironment } from './supabaseConfig.js';
import { generateReceiptPng } from './receiptImage.js';

export function invoiceEmailConfigured(){
  return Boolean(cleanEnvironment(process.env.RESEND_API_KEY)&&cleanEnvironment(process.env.RESEND_FROM_EMAIL));
}
export async function ensurePaidInvoice(order:any):Promise<PaidInvoice>{
  if(!order||order.status!=='paid'||order.environment!=='production'||order.currency!=='INR'
    ||!order.paid_at||!order.cf_payment_id){
    throw Object.assign(new Error('A verified live payment is required for an invoice.'),{status:409});
  }
  const row=await billingDb('rpc/autoreply_issue_paid_invoice','POST',
     {p_order_id:order.order_id,p_owner_user_id:order.owner_user_id});
  if(!row?.order_id||row.owner_user_id!==order.owner_user_id||row.order_id!==order.order_id)
    throw Object.assign(new Error('Unable to issue invoice for this payment.'),{status:503});
  return row as PaidInvoice;
}
/** Exactly-once merchant email claim; provider idempotency defends retried sends. */
export async function emailInvoiceIfConfigured(order:any,opts:{forceFeedback?:boolean}={}){
  if(!invoiceEmailConfigured()){
    if(opts.forceFeedback)throw Object.assign(new Error('Invoice email is not configured yet. Download the PDF instead.'),{status:503,code:'EMAIL_NOT_CONFIGURED'});
    return {sent:false,configured:false};
  }
  const invoice=await ensurePaidInvoice(order);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.customer_email)){
    if(opts.forceFeedback)throw Object.assign(new Error('No valid customer email is recorded for this payment. Contact support.'),{status:409});
    return {sent:false,configured:true};
  }
  const lock=await billingDb('rpc/autoreply_claim_invoice_email','POST',{p_order_id:invoice.order_id});
  if(lock!==true){
    const state=await billingDb('autoreply_billing_invoices?select=email_sent_at&order_id=eq.'+encodeURIComponent(invoice.order_id)+'&limit=1');
    return {sent:!!state?.[0]?.email_sent_at,configured:true,alreadySent:!!state?.[0]?.email_sent_at};
  }
  // Once claimed, the claim is held for 15 minutes to avoid concurrent
  // webhook/status requests sending the same email in parallel.
  const pdf=generateInvoicePdf(invoice);
  const number=invoiceLabel(invoice);
  const from=cleanEnvironment(process.env.RESEND_FROM_EMAIL),key=cleanEnvironment(process.env.RESEND_API_KEY);
  // Source plan features from the server catalog; do not trust browser data.
  const catalog=await billingDb('autoreply_plans?select=id,name,total_messages,ai_replies,instagram_accounts,automations_limit&'+'id=eq.'+encodeURIComponent(order.plan_id)+'&limit=1').catch(()=>[]);
  const plan=catalog?.[0];
  const safe=(v:unknown)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||''));
  const date=(s:any)=>s&&Number.isFinite(Date.parse(s))?new Date(s).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'}):'See Billing & Usage';
  const expiry=order.access_expires_at||null;
  const limits=plan?[
    'Standard replies: '+Number(plan.total_messages||0).toLocaleString('en-IN'),
    'AI replies: '+Number(plan.ai_replies||0).toLocaleString('en-IN'),
    'Instagram accounts: '+Number(plan.instagram_accounts||0).toLocaleString('en-IN'),
    'Automations: '+(plan.automations_limit===null?'Unlimited':Number(plan.automations_limit).toLocaleString('en-IN'))
  ]:[];
  const summary='Plan: '+(plan?.name||invoice.plan_id)+'\nAmount paid: INR '+invoice.amount_inr+
    '\nPaid: '+date(invoice.paid_at)+'\nAccess expiry: '+date(expiry)+'\nBilling period: '+invoice.billing_days+' days'+
    '\n'+limits.join('\n');
  const png=generateReceiptPng(invoice,expiry);
  const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:26px 10px;color:#0f172a"><div style="max-width:660px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden"><div style="background:#fff7ed;padding:28px"><p style="color:#c2410c;font-size:13px;font-weight:700;letter-spacing:2px">AUTO REPLIES</p><h1 style="font-size:26px;margin:10px 0">Payment successful!</h1><p style="font-size:16px;color:#475569">Thank you for choosing Auto Replies. Your plan and payment details are below.</p></div><div style="padding:25px"><img src="cid:autoreply-receipt" width="100%" alt="Plan payment receipt" style="max-width:620px;height:auto;border:1px solid #e2e8f0;border-radius:12px;display:block;margin:0 0 25px"><table style="border-collapse:collapse;width:100%;font-size:15px"><tr><td style="padding:11px 0;color:#64748b">Invoice</td><td style="text-align:right;font-weight:700">${safe(number)}</td></tr><tr><td style="padding:11px 0;color:#64748b">Plan</td><td style="text-align:right;font-weight:700">${safe(plan?.name||invoice.plan_id)}</td></tr><tr><td style="padding:11px 0;color:#64748b">Amount paid</td><td style="text-align:right;font-weight:700;color:#c2410c">INR ${invoice.amount_inr}</td></tr><tr><td style="padding:11px 0;color:#64748b">Payment date</td><td style="text-align:right">${date(invoice.paid_at)}</td></tr><tr><td style="padding:11px 0;color:#64748b">Plan valid until</td><td style="text-align:right;font-weight:700">${date(expiry)}</td></tr></table>${limits.length?`<h3 style="margin-top:24px">Your current plan allowances</h3><ul style="line-height:1.9">${limits.map(l=>'<li>'+safe(l)+'</li>').join('')}</ul>`:''}<p style="background:#fff7ed;padding:15px;border-radius:10px;color:#7c2d12;font-size:14px">Your plan is a one-time ${invoice.billing_days}-day purchase, with no automatic renewal. Exact remaining usage is shown in your dashboard.</p><p style="font-size:14px;color:#475569">Your PDF invoice is attached. Open <a href="https://autoreplys.vercel.app/billing">Billing &amp; Usage</a> to download it again. Need help? <a href="https://autoreplys.vercel.app/contact">Contact support</a>.</p><p style="font-size:12px;color:#64748b">This is a verified payment record, not a GST tax invoice.</p></div></div></body></html>`;
  const payload={
    from,to:[invoice.customer_email],subject:'Your Auto Replies plan is active — invoice '+number,
    text:'Thank you for your Auto Replies purchase.\n\nInvoice: '+number+'\n'+summary+
      '\n\nThe PDF invoice and PNG image receipt are included. View Billing & Usage: https://autoreplys.vercel.app/billing\n\nThis is a payment record, not a GST tax invoice.',
    html,
    attachments:[
      {filename:'AutoReplies-'+number+'.pdf',content:pdf.toString('base64'),content_type:'application/pdf'},
      {filename:'AutoReplies-'+number+'.png',content:png.toString('base64'),content_type:'image/png',content_id:'autoreply-receipt'}
    ]
  };
  let response:Response;
  try{
    response=await fetch('https://api.resend.com/emails',{method:'POST',
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'billing-invoice/'+invoice.order_id},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(7000)});
  }catch(error:any){
    console.warn('[INVOICE_EMAIL_PROVIDER_NETWORK]',{name:error?.name||'Error'});
    if(opts.forceFeedback)throw Object.assign(new Error('Email service is temporarily unavailable. The PDF is ready to download.'),{status:503});
    return {sent:false,configured:true};
  }
  const details=await response.json().catch(()=>null);
  if(!response.ok||!details?.id){
    console.warn('[INVOICE_EMAIL_PROVIDER]',{status:response.status});
    if(opts.forceFeedback)throw Object.assign(new Error('Email could not be sent. Your invoice is available for download.'),{status:503});
    return {sent:false,configured:true};
  }
  await billingDb('autoreply_billing_invoices?order_id=eq.'+encodeURIComponent(invoice.order_id),'PATCH',{
    email_sent_at:new Date().toISOString(),email_provider_id:String(details.id).slice(0,100),email_claimed_at:null
  });
  return {sent:true,configured:true,alreadySent:false};
}
