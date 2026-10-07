import React, {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,CreditCard,Loader2,LockKeyhole,ReceiptText,ShieldCheck,TriangleAlert,XCircle} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {getPlanConfig} from '../../lib/planUsage';
import {billingRequest,openCashfreeCheckout,BillingConfiguration,BillingOrder} from '../../lib/billing';

export const CheckoutPage:React.FC=()=>{
 const {user,firebaseUser,setActiveTab}=useApp();
 const params=new URLSearchParams(window.location.search);
 const requested=params.get('plan')||'pro';const orderId=params.get('order_id')||'';
 const [cfg,setCfg]=useState<BillingConfiguration|null>(null),[order,setOrder]=useState<BillingOrder|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[waiting,setWaiting]=useState(false);
 const [name,setName]=useState(user.name||''),[email,setEmail]=useState(firebaseUser?.email||user.email||''),[phone,setPhone]=useState(''),[agreed,setAgreed]=useState(false);
 const requestId=useRef(crypto.randomUUID());
 const plan=getPlanConfig(order?.planId||requested);
 const paid=order?.status==='paid', active=paid&&order.activationStatus==='active', test=paid&&order.activationStatus==='test', review=paid&&order.activationStatus==='review', expired=order?.status==='expired';
 useEffect(()=>{let live=true;billingRequest('config').then(p=>{if(live)setCfg(p);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 useEffect(()=>{
  if(!orderId)return;
  let stopped=false,timer:ReturnType<typeof setTimeout>;let attempts=0;
  const poll=async()=>{if(stopped)return;setBusy(true);try{const p=await billingRequest('status',undefined,orderId);if(stopped)return;setOrder(p.order);setError('');if(['paid','expired'].includes(p.order.status))return;}catch(e:any){if(!stopped)setError(e.message);}finally{if(!stopped)setBusy(false);}
   attempts++;if(attempts<30&&!stopped)timer=setTimeout(()=>void poll(),attempts<5?2000:5000);else if(!stopped)setWaiting(true);
  };void poll();return()=>{stopped=true;clearTimeout(timer);};
 },[orderId]);
 const pay=async()=>{
  setBusy(true);setError('');try{
   const p=await billingRequest('create',{planId:plan.id,name,email,phone,requestId:requestId.current});
   if(p.order.status==='paid'){window.location.assign('/billing/checkout?order_id='+encodeURIComponent(p.order.orderId));return;}
   // Persist the return destination before leaving, including cancellation/back navigation.
   window.history.replaceState(null,'','/billing/checkout?order_id='+encodeURIComponent(p.order.orderId));
   setOrder(p.order);
   await openCashfreeCheckout(p.paymentSessionId,p.mode);
   window.location.assign('/billing/checkout?order_id='+encodeURIComponent(p.order.orderId));
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 };
 const check=async()=>{setBusy(true);setError('');try{const p=await billingRequest('status',undefined,orderId||order?.orderId);setOrder(p.order);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const attemptFailed=order?.lastAttempt==='FAILED'||order?.lastAttempt==='USER_DROPPED';
 const heading=active?'Payment successful':test?'Test payment confirmed':review?'Payment received · activation under review':expired?'Checkout expired':attemptFailed?'Payment was not completed':orderId||order?'Confirming your payment':'Complete your upgrade';
 const description=active?'Your payment is verified and this purchase has been activated. Billing & Usage shows your current plan and limits.':test?'The sandbox flow worked. No real payment was collected and your live plan has not changed.':review?'We have your payment record. Contact support with the order reference; your current plan remains available.':expired?'This payment session has expired. Check your payment history before starting a new checkout.':attemptFailed?'Your last payment attempt did not complete. Continue the existing checkout to try again. If your bank shows a debit, check the status first.':orderId||order?'We are checking the payment provider and your plan activation. Please do not pay again while confirmation is pending.':'Review your plan and billing details, then continue to secure payment.';
 return <div className="min-h-full bg-slate-50 px-4 py-6 sm:px-8"><div className="mx-auto max-w-5xl">
  <button onClick={()=>setActiveTab('billing')} className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4"/>Back to Billing & Usage</button>
  <header className="mb-7"><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Secure checkout</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{heading}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></header>
  <ol aria-label="Checkout progress" className="mb-7 flex flex-wrap gap-4 text-xs font-semibold text-slate-500">{['Choose plan','Secure payment','Plan activation'].map((label,i)=><li key={label} className="inline-flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${i===0||paid?'bg-emerald-100 text-emerald-700':'bg-indigo-100 text-indigo-700'}`}>{i===0||paid?<Check className="h-3.5 w-3.5"/>:i+1}</span>{label}</li>)}</ol>
  {(cfg?.mode==='sandbox'||order?.environment==='sandbox')&&<div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Test environment</strong><p className="mt-1">Use Cashfree test payment details. Test payments do not activate a live paid plan.</p></div>}
  <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_.85fr]">
   <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
   {orderId||order?<div role="status" aria-live="polite" className="py-5 text-center">
     <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${paid?'bg-emerald-50 text-emerald-600':expired?'bg-rose-50 text-rose-600':'bg-indigo-50 text-indigo-600'}`}>{paid?<CheckCircle2 className="h-8 w-8"/>:expired?<XCircle className="h-8 w-8"/>:<Loader2 className={`h-8 w-8 ${busy?'animate-spin':''}`}/>}</span>
     <h2 className="mt-5 text-lg font-bold text-slate-900">{heading}</h2>
     {order&&<dl className="mt-6 space-y-3 rounded-xl bg-slate-50 p-4 text-left text-xs"><div><dt className="font-semibold text-slate-500">Order reference</dt><dd className="mt-1 break-all font-mono text-slate-800">{order.orderId}</dd></div>{order.paymentId&&<div><dt className="text-slate-500">Payment reference</dt><dd>{order.paymentId}</dd></div>}{order.expiresAt&&<div><dt className="text-slate-500">Access until</dt><dd className="font-semibold text-slate-900">{new Date(order.expiresAt).toLocaleString()}</dd></div>}</dl>}
     {waiting&&!paid&&<p className="mt-4 text-sm text-slate-500">Confirmation is taking longer than usual. You can safely return later using your payment history.</p>}
     {!paid&&!expired&&<button type="button" disabled={busy} onClick={check} className="mt-5 min-h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-60">{busy?'Checking payment…':'Check payment status'}</button>}
     {(!paid&&order)&&<button type="button" disabled={busy||expired} onClick={async()=>{setBusy(true);try{const p=await billingRequest('status',undefined,order.orderId);if(p.paymentSessionId)await openCashfreeCheckout(p.paymentSessionId,p.mode);else if(p.order.status==='creating')window.location.assign('/billing/checkout?plan='+encodeURIComponent(order.planId));else await check();}catch(e:any){setError(e.message);}finally{setBusy(false);}}} className="mt-3 block w-full min-h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-50">Continue existing checkout</button>}
     {(paid||expired)&&<button onClick={()=>setActiveTab('billing')} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white">{active?'Go to your workspace':'View billing history'}<ArrowRight className="h-4 w-4"/></button>}
    </div>:<form onSubmit={e=>{e.preventDefault();void pay();}}>
     <div className="flex items-center gap-3"><CreditCard className="h-5 w-5 text-indigo-600"/><h2 className="text-lg font-bold text-slate-950">Billing details</h2></div><p className="mt-2 text-sm text-slate-500">These details are shared with Cashfree for your payment.</p>
     <div className="mt-6 space-y-4">{[{label:'Full name',type:'text',value:name,set:setName,autocomplete:'name'},{label:'Email address',type:'email',value:email,set:setEmail,autocomplete:'email'},{label:'Mobile number',type:'tel',value:phone,set:setPhone,autocomplete:'tel'}].map(field=><label key={field.label} className="block text-sm font-semibold text-slate-700">{field.label}<input required type={field.type} value={field.value} onChange={e=>field.set(e.target.value)} autoComplete={field.autocomplete} maxLength={field.type==='tel'?16:200} placeholder={field.type==='tel'?'10-digit Indian mobile number':undefined} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"/></label>)}</div>
     <label className="mt-6 flex items-start gap-3 text-xs leading-6 text-slate-500"><input required checked={agreed} onChange={e=>setAgreed(e.target.checked)} type="checkbox" className="mt-1.5 h-4 w-4 shrink-0"/><span>I agree to the <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-indigo-600">Terms</a>, <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-indigo-600">Privacy Policy</a> and <a href="/refunds" target="_blank" rel="noreferrer" className="font-semibold text-indigo-600">Refund & Cancellation Policy</a>. This is a one-time payment. No automatic renewal.</span></label>
     {!cfg?.configured&&<p role="status" className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">Payments are being set up. Checkout will become available when the payment gateway is configured.</p>}
     <button disabled={busy||!agreed||!cfg?.configured||plan.id==='free'} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<LockKeyhole className="h-4 w-4"/>}{busy?'Preparing secure checkout…':`Continue to payment · ${plan.price}`}</button>
     <p className="mt-3 text-center text-xs text-slate-400">Secure payment powered by Cashfree</p>
    </form>}
    {error&&<div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
   </section>
   <aside className="space-y-4"><div className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm"><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600">{plan.name} plan</span><h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-950">{order?'₹'+order.amount.toLocaleString('en-IN'):plan.price}<span className="ml-1 text-sm font-normal text-slate-400">/ 30 days</span></h2><p className="mt-2 text-xs text-slate-500">INR · Total payable · One-time payment</p><div className="my-5 h-px bg-slate-100"/><ul className="space-y-3 text-sm text-slate-600">{[plan.messages.toLocaleString()+' total messages / calendar month',plan.ai.toLocaleString()+' AI replies included',(plan.automations===null?'Unlimited':plan.automations)+' automations',plan.accounts+' Instagram account'+(plan.accounts>1?'s':'')].map(x=><li className="flex gap-2" key={x}><Check className="h-4 w-4 shrink-0 text-emerald-600"/>{x}</li>)}</ul><p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Access starts after payment verification. Renewing the same active plan extends access by 30 days. Changing a plan starts a new 30-day period; unused paid time is not credited. Usage is not reset by a purchase.</p></div>
    <div className="rounded-2xl border border-slate-200 p-5 text-sm text-slate-500"><div className="flex items-center gap-2 font-semibold text-slate-700"><ShieldCheck className="h-4 w-4 text-emerald-600"/>Choose your payment method</div><p className="mt-2 text-xs leading-6">Cashfree shows available UPI, QR, card and other payment options in its secure checkout. Your plan activates after server verification.</p></div>
    <div className="flex flex-wrap gap-4 px-2 text-xs text-slate-500"><a href="/contact">Contact support</a><a href="/refunds">Refunds & cancellation</a><a href="/terms">Paid plan terms</a></div>
   </aside>
  </div>
 </div></div>;
};
