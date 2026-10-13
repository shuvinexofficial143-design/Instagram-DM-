import { billingDb } from './cashfree.js';
import { generateInvoicePdf, invoiceLabel, type PaidInvoice } from './invoicePdf.js';
import { cleanEnvironment } from './supabaseConfig.js';

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
  const payload={
    from,to:[invoice.customer_email],
    subject:'Auto Replies payment invoice '+number,
    text:'Thank you for your Auto Replies purchase.\n\nInvoice: '+number+'\nPlan: '+invoice.plan_id+' ('+invoice.billing_days+' days)\nAmount paid: INR '+invoice.amount_inr+'\n\nYour payment invoice is attached as PDF. You can also download it any time from Billing & Usage.\n\nThis document is a payment record, not a GST tax invoice.',
    attachments:[{filename:'AutoReplies-'+number+'.pdf',content:pdf.toString('base64')}]
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
