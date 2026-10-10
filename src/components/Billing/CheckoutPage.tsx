import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BadgeCheck,Bot,Check,CheckCircle2,ChevronRight,CreditCard,FileText,Headphones,Landmark,Loader2,LockKeyhole,MessageCircle,ReceiptText,RefreshCw,ShieldCheck,Sparkles,TriangleAlert,XCircle,Wallet,Zap,QrCode} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {getPlanConfig} from '../../lib/planUsage';
import {usePlanCatalog} from '../../hooks/usePlanCatalog';
import {billingRequest,openCashfreeCheckout,mountCashfreeCheckout,BillingConfiguration,BillingOrder} from '../../lib/billing';

const fmt=(n:number)=>Number(n||0).toLocaleString('en-IN');
const pill='inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold';
const btn='inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50';
const input='mt-2 block min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100';
const fieldLabel='block text-xs font-bold uppercase tracking-[.07em] text-slate-600';

export const CheckoutPage:React.FC=()=>{
 const {user,firebaseUser,setActiveTab}=useApp();
 const params=new URLSearchParams(window.location.search);
 const requested=params.get('plan')||'starter', initialOrderId=params.get('order_id')||'';
 const catalog=usePlanCatalog();
 const [cfg,setCfg]=useState<BillingConfiguration|null>(null);
 const [order,setOrder]=useState<BillingOrder|null>(null);
 const [pending,setPending]=useState<BillingOrder|null>(null);
 const [session,setSession]=useState('');
 const [stage,setStage]=useState<'details'|'payment'|'result'>(initialOrderId?'result':'details');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[initializing,setInitializing]=useState(true),[inlineError,setInlineError]=useState('');
 const [name,setName]=useState(user.name||''),[email,setEmail]=useState(firebaseUser?.email||user.email||''),[phone,setPhone]=useState(''),[agreed,setAgreed]=useState(false);
 const target=useRef<HTMLDivElement|null>(null),rendered=useRef('');
 const requestId=useRef(crypto.randomUUID());
 const plan=getPlanConfig(order?.planId||requested,catalog.plans);
 const planAvailable=catalog.synced&&catalog.plans.some(p=>p.id===plan.id);
 const conflicting=stage==='details'&&pending && pending.planId!==requested;
 const appOrigin=cfg?.appUrl?new URL(cfg.appUrl).origin:'';
 const otherDomain=Boolean(appOrigin&&appOrigin!==window.location.origin);
 const paid=order?.status==='paid',active=paid&&order.activationStatus==='active',test=paid&&order.activationStatus==='test',expired=order?.status==='expired';
 const awaitingPayment=stage==='payment'&&!paid&&!expired;
 const effectiveAmount=order?'₹'+fmt(order.amount):plan.price;
 const secureMode=cfg?.mode==='sandbox'||order?.environment==='sandbox';

 const remember=(o:BillingOrder)=>{window.history.replaceState(null,'','/billing/checkout?order_id='+encodeURIComponent(o.orderId));setOrder(o);};
 const refresh=async(id?:string)=>{
  const key=id||order?.orderId||initialOrderId;
  if(!key)return;
  setBusy(true);setError('');
  try{
   const p=await billingRequest('status',undefined,key);
   setOrder(p.order);
   if(p.order.status==='paid'||p.order.status==='expired'){setStage('result');setSession('');return;}
   if(p.paymentSessionId){setSession(p.paymentSessionId);setStage('payment');}
   else setStage('result');
  }catch(e:any){setError(e?.message||'Could not verify payment.');}
  finally{setBusy(false);}
 };
 useEffect(()=>{let live=true;(async()=>{
  try {
   const config=await billingRequest('config');if(live)setCfg(config);
   if(initialOrderId){const status=await billingRequest('status',undefined,initialOrderId);
    if(!live)return;setOrder(status.order);
    if(status.order.status==='paid'||status.order.status==='expired')setStage('result');
    else if(status.paymentSessionId){setSession(status.paymentSessionId);setStage('payment');}
   }else{
    const response=await billingRequest('pending');
    if(live)setPending(response.order||null);
   }
  }catch(e:any){if(live)setError(e?.message||'Could not load checkout.');}
  finally{if(live)setInitializing(false);}
 })();return()=>{live=false;};},[initialOrderId]);
 useEffect(()=>{
  if(!awaitingPayment||!session||!target.current)return;
  const key=(order?.orderId||'')+':'+session;
  if(rendered.current===key)return;
  rendered.current=key;
  const element=target.current;
  setInlineError('');
  let cancelled=false;
  void mountCashfreeCheckout(session,order?.environment||cfg?.mode||'production',element).then(async(result:any)=>{
    if(cancelled)return;
    if(result?.error) {setInlineError('The secure payment window was closed or payment failed. Check your status before trying again.');return;}
    await refresh(order?.orderId);
  }).catch((err:any)=>{
    if(!cancelled)setInlineError(err?.message||'Inline payment could not load. Use secure checkout instead.');
  });
  return()=>{cancelled=true;};
 },[awaitingPayment,session,order?.orderId,order?.environment,cfg?.mode]);
 const pay=async()=>{
  if(busy||!agreed||!planAvailable||!cfg?.configured)return;
  setBusy(true);setError('');
  try {
    const response=await billingRequest('create',{planId:plan.id,name,email,phone,requestId:requestId.current});
    if(response.order.status==='paid'){remember(response.order);setStage('result');return;}
    remember(response.order);setPending(null);
    if(!response.paymentSessionId)throw new Error('Your payment session is preparing. Check its status before retrying.');
    setSession(response.paymentSessionId);setStage('payment');
  }catch(err:any){
    setError(err.message||'Payment setup failed. No new payment was taken.');
    // The backend's unique pending-order constraint is intentional:
    // reconcile the original checkout rather than creating a second charge.
    try{const response=await billingRequest('pending');setPending(response.order||null);}catch{}
  }finally{setBusy(false);}
 };
 const cancelPending=async()=>{
  if(!pending||busy)return;
  if(!window.confirm('Cancel the unfinished '+pending.planId+' checkout with Cashfree? Any payment already completed will be preserved.'))return;
  setBusy(true);setError('');
  try {
    await billingRequest('cancel',{orderId:pending.orderId});
    setPending(null);requestId.current=crypto.randomUUID();
  }catch(e:any){setError(e.message||'Cashfree is still confirming that the previous checkout is closed.');}
  finally{setBusy(false);}
 };
 const resume=()=>{if(pending)window.location.assign('/billing/checkout?order_id='+encodeURIComponent(pending.orderId));};
 const choose=(id:string)=>{
  if(id===requested&&stage==='details')return;
  window.location.assign('/billing/checkout?plan='+encodeURIComponent(id));
 };
 const heading=active?'Your plan is now active':test?'Sandbox checkout completed':paid?'Payment received':expired?'Checkout expired':awaitingPayment?'Complete your secure payment':stage==='result'?'Confirming your payment':'Almost there. Make it official.';
 return <div className="relative min-h-screen overflow-hidden bg-[#f5f6fc] text-slate-900">
  <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-60 h-[560px] w-[560px] rounded-full bg-violet-200/45 blur-3xl"/>
  <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-[450px] h-[460px] w-[460px] rounded-full bg-sky-100/80 blur-3xl"/>
  <div className="relative mx-auto max-w-[1190px] px-4 pb-12 pt-6 sm:px-7 sm:pt-10 xl:px-8">
   <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
    <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900" onClick={()=>setActiveTab('billing')}><ArrowLeft className="h-4 w-4"/>Back to billing</button>
    <div className={pill+' border border-emerald-100 bg-white/90 text-emerald-700 shadow-sm'}><ShieldCheck className="h-4 w-4"/>Protected by Cashfree</div>
   </div>
   <section className="relative mb-7 overflow-hidden rounded-[28px] bg-[#211848] px-6 py-7 text-white shadow-[0_24px_65px_rgba(36,25,85,.16)] sm:px-9 sm:py-9">
    <div aria-hidden="true" className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-violet-500/25 blur-3xl"/>
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
     <div>
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.13em] text-violet-100"><Sparkles className="h-3.5 w-3.5 text-amber-300"/>Auto Replies Premium</div>
      <h1 className="max-w-xl text-[26px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{heading}</h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-indigo-100/85">{awaitingPayment?'Select UPI, scan the real bank-generated QR or pay with your preferred method below.':paid?'Cashfree verification determines your access. Your plan is never activated from a screenshot or browser redirect.':'A smarter inbox starts here. A beautifully simple upgrade, with secure payments and transparent limits.'}</p>
     </div>
     <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm"><div className="grid h-12 w-12 place-items-center rounded-xl bg-white/15"><LockKeyhole className="h-6 w-6"/></div><div><p className="text-[11px] uppercase tracking-[.12em] text-indigo-200">Secure checkout</p><p className="text-sm font-extrabold">Encrypted payment flow</p><p className="mt-1 text-[11px] text-indigo-200">Powered by Cashfree Payments</p></div></div>
    </div>
   </section>
   {!initialOrderId&&stage==='details'&&catalog.synced&&<div className="mb-6">
    <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-extrabold text-slate-900">Choose your plan</h2><span className="text-xs text-slate-500">All prices in INR</span></div>
    <div className="grid grid-cols-3 gap-2.5 sm:gap-4">{catalog.plans.filter(p=>p.id!=='free').map(p=><button key={p.id} type="button" onClick={()=>choose(p.id)} className={'relative min-w-0 rounded-2xl border p-3 text-left transition-all sm:p-4 '+(requested===p.id?'border-violet-500 bg-violet-50 shadow-[0_8px_20px_rgba(110,72,210,.13)] ring-1 ring-violet-300':'border-slate-200 bg-white hover:border-violet-200')}>
      {p.id==='pro'&&<span className="absolute -top-2 right-2 rounded-full bg-[#6e45df] px-2 py-0.5 text-[9px] font-bold text-white">POPULAR</span>}
      <strong className="block truncate text-xs font-extrabold sm:text-base">{p.name}</strong><span className="mt-1 block text-lg font-black tracking-tight sm:text-2xl">{p.price}</span><span className="mt-1 block text-[10px] font-medium text-slate-500 sm:text-xs">{p.billingDays||30} days</span>
     </button>)}</div>
   </div>}
   <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-white bg-white/80 p-3 shadow-sm sm:gap-4 sm:p-4">
    {[['01','Your details'],['02','Secure payment'],['03','Activation']].map(([n,label],i)=><div key={n} className="flex items-center gap-2 sm:gap-3"><span className={'grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[11px] font-black sm:h-9 sm:w-9 '+(i===(stage==='details'?0:stage==='payment'?1:2)?'bg-violet-600 text-white':i<(stage==='details'?0:stage==='payment'?1:2)?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-400')}>{i<(stage==='details'?0:stage==='payment'?1:2)?<Check className="h-4 w-4"/>:n}</span><span className="text-[10px] font-bold text-slate-700 sm:text-sm">{label}</span></div>)}
   </div>
   {secureMode&&<div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Sandbox mode: test payments do not activate live subscriptions.</div>}
   {error&&<div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0"/>{error}</div>}
   <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="min-w-0">
     {conflicting?<section className="rounded-[25px] border border-amber-200 bg-white p-6 shadow-sm sm:p-8"><div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Wallet className="h-6 w-6"/></div><h2 className="text-xl font-black">An earlier checkout is still open</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your {pending.planId} plan payment is pending. To prevent double charges, finish that order or securely cancel it at Cashfree before starting the {requested} plan.</p><p className="mt-4 break-all rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-500">{pending.orderId}</p><button onClick={resume} className={btn+' mt-5 w-full bg-violet-600 text-white hover:bg-violet-700'}><CreditCard className="h-4 w-4"/>Continue existing {pending.planId} checkout<ArrowRight className="h-4 w-4"/></button><button disabled={busy} onClick={()=>void cancelPending()} className={btn+' mt-3 w-full border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<XCircle className="h-4 w-4"/>}Cancel unpaid checkout and choose {requested}</button><p className="mt-4 text-xs leading-5 text-slate-500">Cancellation is only confirmed after Cashfree terminates the earlier order. Any successful or uncertain payment is preserved for verification.</p></section>:
     stage==='details'?<section className="rounded-[25px] border border-white bg-white p-5 shadow-[0_15px_45px_rgba(38,31,91,.055)] sm:p-8">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-100 text-violet-700"><FileText className="h-5 w-5"/></div><div><h2 className="text-xl font-black">Billing information</h2><p className="mt-1 text-xs text-slate-500">A few details and you're ready to pay.</p></div></div>
      {pending&&pending.planId===requested&&<div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900"><strong>You already started this checkout.</strong><p className="mt-1 text-xs">Continue your existing order to avoid duplicates.</p><button onClick={resume} className="mt-3 font-bold underline">Continue existing payment →</button></div>}
      <form className="mt-7 space-y-5" onSubmit={e=>{e.preventDefault();void pay();}}>
       <label className={fieldLabel}>Full name<input required className={input} autoComplete="name" maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label>
       <label className={fieldLabel}>Email address<input required className={input} autoComplete="email" type="email" maxLength={200} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
       <label className={fieldLabel}>Mobile number<input required className={input} autoComplete="tel" inputMode="numeric" type="tel" maxLength={16} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="10-digit Indian mobile number"/></label>
       <div className="pt-2"><h3 className="text-sm font-extrabold">Pay your way</h3><p className="mt-1 text-xs leading-5 text-slate-500">The official Cashfree checkout will show real options available to your bank and device.</p><div className="mt-3 grid grid-cols-3 gap-2.5">{[{Icon:QrCode,name:'UPI / QR',note:'Scan & pay'},{Icon:CreditCard,name:'Cards',note:'Debit & credit'},{Icon:Landmark,name:'Net banking',note:'All major banks'}].map(({Icon,name, note})=><div key={name} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3"><Icon className="h-5 w-5 text-violet-600"/><p className="mt-3 text-[11px] font-extrabold sm:text-xs">{name}</p><p className="mt-1 text-[10px] text-slate-500">{note}</p></div>)}</div></div>
       <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-xs leading-5 text-slate-600"><input required type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-violet-600"/><span>I agree to the <a className="font-bold text-violet-700 underline" href="/terms" target="_blank" rel="noreferrer">Terms</a>, <a className="font-bold text-violet-700 underline" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and <a className="font-bold text-violet-700 underline" href="/refunds" target="_blank" rel="noreferrer">Refund Policy</a>. This is a one-time payment, not an automatic renewal.</span></label>
       {otherDomain&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">Please pay from your configured domain: <a className="font-bold underline" href={cfg!.appUrl+'/billing/checkout?plan='+encodeURIComponent(plan.id)}>{appOrigin}</a></div>}
       <button className={btn+' w-full bg-gradient-to-r from-violet-700 to-indigo-600 text-white shadow-lg shadow-violet-200 hover:brightness-110'} disabled={busy||initializing||!agreed||!cfg?.configured||!planAvailable||otherDomain||Boolean(pending)||plan.id==='free'}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<LockKeyhole className="h-4 w-4"/>}{busy?'Preparing your secure payment…':'Continue securely · '+plan.price}<ArrowRight className="h-4 w-4"/></button>
       {!catalog.synced&&<p role="status" className="text-xs text-amber-800">Confirming live plan prices…</p>}
       {!cfg?.configured&&<p className="text-xs text-amber-700">Payment gateway setup is unavailable. No payment has started.</p>}
       <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400"><LockKeyhole className="h-3.5 w-3.5"/>Powered by Cashfree · Encrypted checkout</div>
      </form>
     </section>:
     stage==='payment'?<section className="overflow-hidden rounded-[25px] border border-white bg-white shadow-[0_15px_45px_rgba(38,31,91,.055)]"><div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:px-7"><span className={pill+' w-max bg-emerald-50 text-emerald-700'}><BadgeCheck className="h-4 w-4"/>Verified payment partner</span><h2 className="text-xl font-black">Select how you'd like to pay</h2><p className="text-xs leading-5 text-slate-500">UPI, real QR code, bank and card options appear below directly from Cashfree. We never collect your card number or UPI PIN.</p></div><div className="flex min-h-[650px] flex-col items-center justify-center px-2 py-5 sm:px-4"><div ref={target} className="w-full max-w-[425px] min-h-[630px]" aria-label="Cashfree secure inline payment checkout" /></div>{inlineError&&<div role="alert" className="mx-5 mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{inlineError}</div>}<div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 p-5 sm:flex-row"><button type="button" disabled={busy} onClick={()=>void refresh()} className={btn+' flex-1 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}><RefreshCw className="h-4 w-4"/>Check payment status</button><button type="button" disabled={busy||!session} onClick={()=>void openCashfreeCheckout(session,order?.environment||cfg?.mode||'production').catch(e=>setInlineError(e.message))} className={btn+' flex-1 bg-violet-700 text-white hover:bg-violet-800'}>Open full-screen payment<ArrowRight className="h-4 w-4"/></button></div><p className="px-5 pb-5 text-center text-[11px] leading-5 text-slate-500">Already paid? Check status first. Do not submit the payment twice.</p></section>:
     <section className="rounded-[25px] border border-white bg-white p-6 text-center shadow-sm sm:p-9"><span className={'mx-auto grid h-16 w-16 place-items-center rounded-3xl '+(paid?'bg-emerald-100 text-emerald-700':expired?'bg-rose-100 text-rose-700':'bg-violet-100 text-violet-700')}>{paid?<CheckCircle2 className="h-8 w-8"/>:expired?<XCircle className="h-8 w-8"/>:<Loader2 className="h-7 w-7 animate-spin"/>}</span><h2 className="mt-5 text-2xl font-black">{heading}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{active?'Your payment was verified on the server and your plan is active.':test?'A test payment was confirmed. Live access is unchanged.':expired?'This payment session has expired. You can review your payment history.':'We are checking your bank and Cashfree. Your plan changes only after verified payment.'}</p>{order&&<p className="mt-6 break-all rounded-2xl bg-slate-50 p-4 text-xs font-medium text-slate-600">Order reference · {order.orderId}</p>}<button onClick={()=>void refresh()} disabled={busy||paid||expired} className={btn+' mt-6 w-full bg-violet-700 text-white disabled:opacity-50'}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}Check latest payment status</button>{order&&!paid&&!expired&&<button onClick={()=>void refresh()} className={btn+' mt-2 w-full border border-slate-200 text-slate-800'}>Continue existing checkout</button>}<button onClick={()=>setActiveTab('billing')} className="mt-5 text-sm font-extrabold text-violet-700 underline">Back to billing history</button></section>}
    </div>
    <aside className="min-w-0 space-y-4 lg:sticky lg:top-5">
     <section className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_15px_35px_rgba(38,31,91,.05)]"><div className="border-b border-slate-100 p-5 sm:p-6"><div className="flex items-center justify-between gap-2"><span className={pill+' bg-violet-50 text-violet-700'}><Zap className="h-3.5 w-3.5"/> {plan.name} plan</span><span className="text-xs font-bold text-slate-400">{plan.billingDays||30} days</span></div><p className="mt-5 text-xs font-bold uppercase tracking-widest text-slate-500">Order summary</p><p className="mt-2 text-4xl font-black tracking-tight">{effectiveAmount}<span className="ml-2 text-sm font-semibold text-slate-400">INR</span></p><p className="mt-2 text-xs text-slate-500">One-time payment · No auto-renewal</p></div>
     <div className="space-y-5 p-5 sm:p-6"><h3 className="text-sm font-extrabold">What's included</h3>{[{Icon:MessageCircle,title:'Standard automation',value:fmt(plan.messages)+' replies',desc:'DMs, comments & story replies'},{Icon:Bot,title:'AI conversations',value:fmt(plan.ai)+' replies',desc:'Separate monthly AI allowance'},{Icon:Zap,title:'Active automations',value:plan.automations===null?'Unlimited':fmt(plan.automations),desc:'Your automated workflows'},{Icon:CreditCard,title:'Instagram accounts',value:String(plan.accounts),desc:'Connected professional accounts'}].map(({Icon,title,value,desc})=><div className="flex items-start gap-3" key={title}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-violet-700"><Icon className="h-4 w-4"/></span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700">{title}</p><p className="mt-0.5 text-sm font-extrabold">{value}</p><p className="mt-1 text-[11px] text-slate-500">{desc}</p></div><Check className="h-4 w-4 text-emerald-600"/></div>)}<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800"><ShieldCheck className="h-4 w-4"/>Server-verified activation</div><p className="mt-2 text-[11px] leading-5 text-emerald-700">Plans activate only after Cashfree confirms the payment. AI and standard reply limits stay separate.</p></div></div></section>
     <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-500"><a href="/contact" className="inline-flex items-center gap-1 hover:text-violet-700"><Headphones className="h-3.5 w-3.5"/>Support</a><a href="/refunds" className="inline-flex items-center gap-1 hover:text-violet-700"><ReceiptText className="h-3.5 w-3.5"/>Refund policy</a><a href="/terms" className="inline-flex items-center gap-1 hover:text-violet-700"><ChevronRight className="h-3.5 w-3.5"/>Terms</a></div>
    </aside>
   </div>
  </div>
 </div>;
};
