import React,{useCallback,useEffect,useState} from 'react';
import {Download,FileText,Mail,RefreshCw,ShieldCheck} from 'lucide-react';
import {billingRequest} from '../../lib/billing';
import {auth} from '../../lib/supabase';

type Invoice={orderId:string;invoiceNumber:string;issuedAt:string;planId:string;amount:number;paidAt:string;emailSent:boolean};
const date=(value:string)=>new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
export const InvoiceCenter:React.FC=()=>{
 const [items,setItems]=useState<Invoice[]>([]),[loading,setLoading]=useState(true);
 const [emailReady,setEmailReady]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const refresh=useCallback(async()=>{try{const result=await billingRequest('invoice-list');setItems(result.invoices||[]);setEmailReady(Boolean(result.emailConfigured));setError('')}catch(e:any){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{void refresh()},[refresh]);
 async function download(invoice:Invoice){
  setBusy(invoice.orderId+':download');setError('');setMessage('');
  try{
   const token=await auth.currentUser?.getIdToken();
   if(!token)throw new Error('Sign in again to download invoices.');
   const response=await fetch('/api/billing?action=invoice&order_id='+encodeURIComponent(invoice.orderId),{
     headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(25000)
   });
   if(!response.ok){const e=await response.json().catch(()=>null);throw new Error(e?.error||'Unable to generate this invoice.');}
   const blob=await response.blob();
   if(blob.type!=='application/pdf' || blob.size<150)throw new Error('Could not verify the invoice PDF.');
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='AutoReplies-'+invoice.invoiceNumber+'.pdf';
   document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('Invoice '+invoice.invoiceNumber+' downloaded successfully.');
  }catch(e:any){setError(e.message)}finally{setBusy('')}
 }
 async function email(invoice:Invoice){
  setBusy(invoice.orderId+':email');setError('');setMessage('');
  try{const res=await billingRequest('invoice-email',{orderId:invoice.orderId});
   setMessage(res.sent?'Invoice sent to the email saved with this purchase.':'This invoice was already emailed.');
   await refresh();
  }catch(e:any){setError(e.message)}finally{setBusy('')}
 }
 return <section aria-labelledby="customer-invoices-heading" className="rounded-[24px] border border-orange-100 bg-white p-5 shadow-sm sm:p-7">
   <div className="flex flex-wrap items-start justify-between gap-4">
     <div className="flex items-start gap-3">
       <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700"><FileText className="h-5 w-5"/></span>
       <div><p className="text-xs font-bold uppercase tracking-widest text-orange-700">PAYMENT DOCUMENTS</p><h2 id="customer-invoices-heading" className="mt-1 text-xl font-bold text-slate-950">Invoices</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Download your individual paid-plan invoice PDFs. Securely available only to the account that made the purchase.</p></div>
     </div>
     <button type="button" onClick={()=>void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4"/>Refresh</button>
   </div>
   {error&&<p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
   {message&&<p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
   <div className="mt-5 space-y-3">
    {loading?<p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Loading invoices…</p>:!items.length?<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center"><FileText className="mx-auto h-6 w-6 text-slate-400"/><p className="mt-3 font-semibold text-slate-700">No paid invoices yet</p><p className="mt-1 text-sm text-slate-500">Invoices appear after a live Cashfree payment has been verified.</p></div>:items.map(i=><article key={i.orderId} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
     <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-orange-700">{i.invoiceNumber}</p><h3 className="mt-1 text-base font-bold text-slate-950">{i.planId.charAt(0).toUpperCase()+i.planId.slice(1)} plan <span className="ml-2 text-slate-500">₹{i.amount.toLocaleString('en-IN')}</span></h3><p className="mt-1 text-sm text-slate-500">Paid {date(i.paidAt)} · Issued {date(i.issuedAt)}</p><p className="mt-1 break-all text-xs text-slate-400">Order {i.orderId}</p></div>
     <div className="flex flex-wrap gap-2"><button type="button" disabled={!!busy} onClick={()=>void download(i)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-700 px-4 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-60"><Download className="h-4 w-4"/>{busy===i.orderId+':download'?'Downloading…':'Download PDF'}</button>
       <button type="button" disabled={!emailReady||!!busy||i.emailSent} onClick={()=>void email(i)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-800 disabled:opacity-50"><Mail className="h-4 w-4"/>{i.emailSent?'Email sent':'Email invoice'}</button></div>
    </article>)}
   </div>
   <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/>{emailReady?'Invoice emails are sent to the address recorded when you paid.':'Invoice email delivery will become available once our verified sending email is configured.'} These payment records are not GST tax invoices. Contact support if you require statutory tax documentation.</p>
 </section>;
};
