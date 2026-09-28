import React from 'react';
import { BarChart3, Bot, Check, CreditCard, Instagram, Sparkles, Zap, ArrowUpRight, ShieldCheck, ReceiptText } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const plans=[
  {name:'Free',price:'₹0',messages:1500,ai:1000,accounts:1,automations:'5'},
  {name:'Starter',price:'₹299',messages:7500,ai:5000,accounts:1,automations:'Unlimited'},
  {name:'Pro',price:'₹599',messages:25000,ai:15000,accounts:2,automations:'Unlimited',popular:true},
  {name:'Business',price:'₹1,299',messages:75000,ai:40000,accounts:5,automations:'Unlimited'}
];

const Usage=({icon:Icon,label,used,limit,note}:{icon:any,label:string,used:number,limit:number,note:string})=>{
  const pct=Math.min(100,Math.round(used/Math.max(limit,1)*100));
  return <div className="rounded-[18px] border border-slate-200/80 bg-white p-4 shadow-[0_5px_18px_rgba(15,23,42,.035)] sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="h-4.5 w-4.5"/></span>
      <span className="text-[11px] font-bold text-slate-500">{pct}% used</span>
    </div>
    <p className="mt-4 text-xs font-semibold text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-bold tracking-tight text-slate-950">{used.toLocaleString()} <span className="text-sm font-semibold text-slate-400">/ {limit.toLocaleString()}</span></p>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{width:`${pct}%`}}/></div>
    <p className="mt-2 min-h-8 text-[11px] leading-4 text-slate-500">{note}</p>
  </div>
};

export const BillingUsagePage:React.FC=()=>{
  const{user,automations,instagramAccount,setIsRenewModalOpen}=useApp();
  const key=String(user?.plan||'free').toLowerCase();
  const plan=plans.find(p=>p.name.toLowerCase()===key)||plans[0];
  const carryMessages=Number(user?.carry_forward_messages||0);
  const carryAi=Number(user?.carry_forward_ai_replies||0);
  const autoLimit=plan.automations==='Unlimited'?Math.max(automations.length,1):Number(plan.automations);

  return <div className="min-h-full bg-[radial-gradient(circle_at_85%_0%,rgba(224,231,255,.55),transparent_28%),#F8FAFD] px-4 py-5 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1380px] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-indigo-600">Workspace billing</p><h1 className="mt-1 text-[24px] font-bold tracking-tight text-slate-950 sm:text-[28px]">Billing & Usage</h1><p className="mt-1 text-sm text-slate-500">Manage your plan, limits and monthly workspace usage.</p></div>
        <button onClick={()=>setIsRenewModalOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-slate-950 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 sm:self-auto">Upgrade Plan <ArrowUpRight className="h-4 w-4"/></button>
      </header>

      <section className="overflow-hidden rounded-[20px] border border-indigo-200/70 bg-gradient-to-br from-blue-50/90 via-white to-violet-50/80 shadow-[0_8px_30px_rgba(76,88,160,.07)]">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{plan.name} plan</span><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5"/>Current subscription</span></div>
            <div className="mt-3 flex items-end gap-2"><span className="text-[30px] font-bold tracking-tight text-slate-950">{plan.price}</span><span className="pb-1 text-xs font-semibold text-slate-500">/ month</span></div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">Usage resets monthly. AI replies count inside your total message limit.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-7 gap-y-2 rounded-2xl border border-white/90 bg-white/75 px-5 py-4 text-xs shadow-sm">
            <div><p className="text-slate-400">Messages</p><p className="mt-1 font-bold text-slate-800">{(plan.messages+carryMessages).toLocaleString()}</p></div>
            <div><p className="text-slate-400">AI replies</p><p className="mt-1 font-bold text-slate-800">{(plan.ai+carryAi).toLocaleString()}</p></div>
            <div><p className="text-slate-400">Automations</p><p className="mt-1 font-bold text-slate-800">{plan.automations}</p></div>
            <div><p className="text-slate-400">IG accounts</p><p className="mt-1 font-bold text-slate-800">{plan.accounts}</p></div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3"><h2 className="text-base font-bold text-slate-950">Monthly usage</h2><p className="mt-0.5 text-xs text-slate-500">Your current workspace limits and consumption.</p></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Usage icon={BarChart3} label="Total Messages" used={0} limit={plan.messages+carryMessages} note={carryMessages>0?`Includes ${carryMessages.toLocaleString()} Free carry-forward`:"Monthly outgoing automation messages"}/>
          <Usage icon={Bot} label="AI Replies" used={0} limit={plan.ai+carryAi} note={carryAi>0?`Includes ${carryAi.toLocaleString()} Free carry-forward`:"Included inside total messages"}/>
          <Usage icon={Zap} label="Automations" used={automations.length} limit={autoLimit} note={plan.automations==='Unlimited'?'Unlimited on this plan':'Workspace automations'}/>
          <Usage icon={Instagram} label="Instagram Accounts" used={instagramAccount?1:0} limit={plan.accounts} note="Connected Instagram accounts"/>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-base font-bold text-slate-950">Plans & pricing</h2><p className="mt-0.5 text-xs text-slate-500">Choose the capacity that fits your workspace.</p></div><CreditCard className="h-5 w-5 text-slate-300"/></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map(p=>{const active=p.name===plan.name;return <article key={p.name} className={`relative flex flex-col rounded-[18px] border bg-white p-5 shadow-[0_5px_20px_rgba(15,23,42,.035)] ${p.popular?'border-indigo-300 ring-1 ring-indigo-100':'border-slate-200/80'}`}>
            <div className="flex items-start justify-between gap-2"><div><h3 className="text-base font-bold text-slate-950">{p.name}</h3><div className="mt-2"><span className="text-[26px] font-bold tracking-tight text-slate-950">{p.price}</span><span className="text-[11px] font-semibold text-slate-400"> / month</span></div></div>{p.popular&&<span className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-indigo-700">Popular</span>}</div>
            <div className="my-4 h-px bg-slate-100"/>
            <div className="flex-1 space-y-2.5 text-xs font-medium text-slate-600">{[p.messages.toLocaleString()+' total messages',p.ai.toLocaleString()+' max AI replies',p.automations+' automations',p.accounts+' Instagram account'+(p.accounts===1?'':'s')].map(x=><div key={x} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"/><span>{x}</span></div>)}</div>
            <button disabled={active} onClick={()=>setIsRenewModalOpen(true)} className={`mt-5 min-h-10 w-full rounded-xl px-3 text-xs font-bold transition ${active?'cursor-default border border-slate-200 bg-slate-50 text-slate-500':'bg-slate-950 text-white hover:bg-slate-800'}`}>{active?'Current Plan':(p.name==='Free'?'Use Free Plan':'Upgrade')}</button>
          </article>})}
        </div>
      </section>

      <section className="rounded-[18px] border border-slate-200/80 bg-white p-5 shadow-[0_5px_20px_rgba(15,23,42,.035)]">
        <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-600"><ReceiptText className="h-4.5 w-4.5"/></span><div><h2 className="text-sm font-bold text-slate-900">Billing history</h2><p className="mt-0.5 text-xs text-slate-500">No payments yet. Invoices and subscription payments will appear here.</p></div></div>
      </section>
    </div>
  </div>;
};
