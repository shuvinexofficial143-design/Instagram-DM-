import React, { useState } from 'react';
import { BarChart3, Bot, Check, CreditCard, Instagram, Plus, Zap, ArrowUpRight, ShieldCheck, ReceiptText, XCircle, CalendarClock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BillingHistory } from './BillingHistory';
import { PLAN_CATALOG } from '../../lib/planUsage';
import { useWorkspaceUsage } from '../../hooks/useWorkspaceUsage';

const plans=PLAN_CATALOG.map((plan)=>({...plan,popular:plan.id==='pro',special:plan.id==='business'}));
const comparisonRows = [
  { label: 'Monthly price', value: (p: typeof PLAN_CATALOG[number]) => p.price },
  { label: 'Total messages / month', value: (p: typeof PLAN_CATALOG[number]) => p.messages.toLocaleString() },
  { label: 'AI replies / month', value: (p: typeof PLAN_CATALOG[number]) => p.ai.toLocaleString() },
  { label: 'Active automations', value: (p: typeof PLAN_CATALOG[number]) => p.automations === null ? 'Unlimited' : String(p.automations) },
  { label: 'Instagram accounts', value: (p: typeof PLAN_CATALOG[number]) => String(p.accounts) },
];


const Usage=({icon:Icon,label,used,limit,note}:{icon:any,label:string,used:number,limit:number,note:string})=>{
  const pct=Math.min(100,Math.round(used/Math.max(limit,1)*100));
  return <div className="rounded-[18px] border border-slate-200/80 bg-white p-4 shadow-[0_5px_18px_rgba(15,23,42,.035)] sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="h-4.5 w-4.5"/></span>
      <span className="text-xs font-bold text-slate-500">{pct}% used</span>
    </div>
    <p className="mt-4 text-xs font-semibold text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-bold tracking-tight text-slate-950">{used.toLocaleString()} <span className="text-sm font-semibold text-slate-400">/ {limit.toLocaleString()}</span></p>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{width:`${pct}%`}}/></div>
    <p className="mt-2 min-h-8 text-xs leading-4 text-slate-500">{note}</p>
  </div>
};

export const BillingUsagePage:React.FC=()=>{
  const{instagramAccount,setIsRenewModalOpen}=useApp();
  const usage=useWorkspaceUsage();
  const [showTopUps,setShowTopUps]=useState(false);
  const plan=usage.plan;
  const autoLimit=usage.automationLimit===null?Math.max(usage.automationUsed,1):usage.automationLimit;

  return <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1380px] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Workspace billing</p><h1 className="mt-1 text-[24px] font-bold tracking-tight text-slate-950 sm:text-[28px]">Billing & Usage</h1><p className="mt-1 text-sm text-slate-500">Manage your plan, limits and monthly workspace usage.</p></div>
        <button onClick={()=>setIsRenewModalOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-slate-950 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 sm:self-auto">Upgrade Plan <ArrowUpRight className="h-4 w-4"/></button>
      </header>

      <section className="overflow-hidden rounded-[20px] border border-indigo-200/70 bg-gradient-to-br from-blue-50/90 via-white to-violet-50/80 shadow-[0_8px_30px_rgba(76,88,160,.07)]">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">{plan.name} plan</span><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5"/>Current subscription</span></div>
            <div className="mt-3 flex items-end gap-2"><span className="text-[30px] font-bold tracking-tight text-slate-950">{plan.price}</span><span className="pb-1 text-xs font-semibold text-slate-500">/ month</span></div>
            <button type="button" onClick={()=>setShowTopUps(value=>!value)} aria-expanded={showTopUps} aria-controls="reply-top-ups" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"><Plus className="h-4 w-4"/>Add Money</button>
            <p className="mt-2 text-xs text-slate-500">Need more replies? Explore extra capacity for your current plan.</p>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">Usage is measured for the calendar month. AI replies count inside your total message limit.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-7 gap-y-2 rounded-2xl border border-white/90 bg-white/75 px-5 py-4 text-xs shadow-sm">
            <div><p className="text-slate-400">Messages</p><p className="mt-1 font-bold text-slate-800">{usage.messageLimit.toLocaleString()}</p></div>
            <div><p className="text-slate-400">AI replies</p><p className="mt-1 font-bold text-slate-800">{usage.aiLimit.toLocaleString()}</p></div>
            <div><p className="text-slate-400">Automations</p><p className="mt-1 font-bold text-slate-800">{plan.automations===null?'Unlimited':plan.automations}</p></div>
            <div><p className="text-slate-400">IG accounts</p><p className="mt-1 font-bold text-slate-800">{plan.accounts}</p></div>
          </div>
        </div>
      </section>

      {showTopUps&&<section id="reply-top-ups" className="rounded-2xl border border-indigo-200 bg-white p-5 sm:p-6" aria-labelledby="top-up-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="top-up-heading" className="text-lg font-bold text-slate-950">Extra reply packs</h2><p className="mt-1 text-sm text-slate-600">Add more replies to your current subscription when your monthly allowance runs out.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Coming soon · payments unavailable</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><Zap className="h-5 w-5 text-indigo-600"/><h3 className="mt-3 font-semibold text-slate-900">Standard reply pack</h3><p className="mt-1 text-sm leading-6 text-slate-600">Extra capacity for keyword and fixed-message automations.</p><p className="mt-3 text-xs font-medium text-slate-500">Pack sizes and prices will be available before launch.</p></article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><Bot className="h-5 w-5 text-indigo-600"/><h3 className="mt-3 font-semibold text-slate-900">AI reply pack</h3><p className="mt-1 text-sm leading-6 text-slate-600">Extra AI replies together with the total message capacity they need.</p><p className="mt-3 text-xs font-medium text-slate-500">Pack sizes and prices will be available before launch.</p></article>
        </div>
        <div className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-950"><strong>How top-ups are planned to work</strong><p>One subscription stays active. A one-time pack adds reply capacity without starting a second subscription or changing your renewal date. Final prices, expiry and payment options will be shown before purchase.</p></div>
        <p className="mt-3 text-xs text-slate-500">This is a preview. No payment is taken and no balance or reply allowance changes here.</p>
      </section>}

      <section id="manage-subscription" className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_5px_18px_rgba(15,23,42,.035)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><CalendarClock className="h-5 w-5"/></span><div><h2 className="text-base font-bold text-slate-950">Manage subscription</h2><p className="mt-1 text-sm leading-6 text-slate-600">Paid access lasts 30 days per purchase. Renew manually when you need it; no automatic charges.</p>{usage.expiresAt&&<p className="mt-2 text-xs font-semibold text-slate-500">Access until {new Date(usage.expiresAt).toLocaleString()}</p>}</div></div></div>
          <a href="/refunds" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Refund & cancellation policy</a>
        </div>
      </section>

      <section>
        <div className="mb-3"><h2 className="text-base font-bold text-slate-950">Monthly usage</h2><p className="mt-0.5 text-xs text-slate-500">Your current workspace limits and consumption.</p></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Usage icon={BarChart3} label="Total Messages" used={usage.messageUsed} limit={usage.messageLimit} note={usage.source==='server'?"Monthly automation messages":"Monthly outgoing automation messages"}/>
          <Usage icon={Bot} label="AI Replies" used={usage.aiUsed} limit={usage.aiLimit} note="Included inside total messages"/>
          <Usage icon={Zap} label="Automations" used={usage.automationUsed} limit={autoLimit} note={usage.automationLimit===null?"Unlimited on this plan":"Workspace automations"}/>
          <Usage icon={Instagram} label="Instagram Accounts" used={instagramAccount?1:0} limit={plan.accounts} note="Connected Instagram accounts"/>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-base font-bold text-slate-950">Plans & pricing</h2><p className="mt-0.5 text-xs text-slate-500">Choose the capacity that fits your workspace.</p></div><CreditCard className="h-5 w-5 text-slate-300"/></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map(p=>{const active=p.id===plan.id;return <article key={p.name} className={`relative flex flex-col rounded-[18px] border bg-white p-5 shadow-[0_5px_20px_rgba(15,23,42,.035)] ${p.special?'billing-special-plan border-amber-200':p.popular?'border-indigo-300 ring-1 ring-indigo-100':'border-slate-200/80'}`}>
            <div className="flex items-start justify-between gap-2"><div><h3 className="text-base font-bold text-slate-950">{p.name}</h3><div className="mt-2"><span className="text-[26px] font-bold tracking-tight text-slate-950">{p.price}</span><span className="text-xs font-semibold text-slate-400"> / month</span></div></div>{p.special&&<span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Top tier</span>}{p.popular&&<span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">Popular</span>}</div>
            <div className="my-4 h-px bg-slate-100"/>
            <div className="flex-1 space-y-2.5 text-xs font-medium text-slate-600">{[p.messages.toLocaleString()+' total messages',p.ai.toLocaleString()+' max AI replies',(p.automations===null?'Unlimited':p.automations.toLocaleString())+' automations',p.accounts+' Instagram account'+(p.accounts===1?'':'s')].map(x=><div key={x} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"/><span>{x}</span></div>)}</div>
            <button disabled={active&&p.id==='free'} onClick={()=>p.id==='free'?window.location.assign('/refunds'):window.location.assign('/billing/checkout?plan='+p.id)} className={`mt-5 min-h-10 w-full rounded-xl px-3 text-xs font-bold transition ${active&&p.id==='free'?'cursor-default border border-slate-200 bg-slate-50 text-slate-500':p.special?'bg-amber-500 text-slate-950 hover:bg-amber-400':'bg-indigo-600 text-white hover:bg-indigo-700'}`}>{active?(p.id==='free'?'Current Plan':'Renew for 30 days'):(p.name==='Free'?'Use Free Plan':'Choose plan')}</button>
          </article>})}
        </div>
      </section>

      <section aria-labelledby="plan-comparison-heading">
        <h2 id="plan-comparison-heading" className="text-base font-bold text-slate-950">Compare plans in detail</h2><p className="mt-1 text-sm text-slate-500">Monthly prices and limits, side by side. AI replies are included within total messages.</p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white" tabIndex={0} role="region" aria-label="Plan comparison, scroll horizontally on small screens">
          <table className="billing-comparison w-full text-left text-sm"><caption className="sr-only">Monthly subscription prices and included limits</caption><thead><tr><th scope="col">Feature</th>{plans.map(p=><th key={p.id} scope="col" className={p.special?'is-special':p.id===plan.id?'is-current':''}>{p.name}{p.id===plan.id&&<small>Current plan</small>}{p.special&&<small>Top tier</small>}</th>)}</tr></thead>
            <tbody>{comparisonRows.map(row=><tr key={row.label}><th scope="row">{row.label}</th>{plans.map(p=><td key={p.id} className={p.special?'is-special':p.id===plan.id?'is-current':''}>{row.value(p)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="billing-history-heading">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600"><ReceiptText className="h-5 w-5"/></span><div><h2 id="billing-history-heading" className="text-base font-bold text-slate-900">Billing history</h2><p className="mt-1 text-sm text-slate-500">Your payment records, confirmation status and plan activation details.</p></div></div>
        <BillingHistory />
      </section>
    </div>
  </div>;
};
