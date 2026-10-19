import React, { useState } from 'react';
import { BarChart3, Bot, Check, CreditCard, Instagram, Plus, Zap, ArrowUpRight, ShieldCheck, ReceiptText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BillingHistory } from './BillingHistory';
import { InvoiceCenter } from './InvoiceCenter';
import { PlanConfig } from '../../lib/planUsage';
import { usePlanCatalog } from '../../hooks/usePlanCatalog';
import { useWorkspaceUsage } from '../../hooks/useWorkspaceUsage';

const comparisonRows = [
  { label: 'One-time plan price / 30 days', value: (p: PlanConfig) => p.price },
  { label: 'Standard DM/comment/story replies / month', value: (p: PlanConfig) => p.messages.toLocaleString() },
  { label: 'AI replies / month', value: (p: PlanConfig) => p.ai.toLocaleString() },
  { label: 'Active automations', value: (p: PlanConfig) => p.automations === null ? 'Unlimited' : String(p.automations) },
  { label: 'Instagram accounts', value: (p: PlanConfig) => String(p.accounts) },
];


export const FreeBonus=({amount}:{amount:number})=>amount>0?<span title="Unused Free credits carried into your first paid plan" className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"><Plus className="h-3 w-3" aria-hidden="true"/>{amount.toLocaleString()} Free bonus</span>:null;
const Usage=({icon:Icon,label,used,limit,note,bonus=0,unlimited=false}:{icon:any,label:string,used:number,limit:number,note:string,bonus?:number,unlimited?:boolean})=>{
  const pct=Math.min(100,Math.round(used/Math.max(limit,1)*100));
  return <div className="rounded-[24px] border border-white bg-white p-4 shadow-[0_16px_42px_rgba(31,23,76,.06)] sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ede8ff] text-[#6844d1]"><Icon className="h-4.5 w-4.5"/></span>
      <span className="text-xs font-bold text-slate-500">{unlimited?'Unlimited':`${pct}% used`}</span>
    </div>
    <p className="mt-4 text-xs font-semibold text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">{used.toLocaleString()} <span className="text-sm font-semibold text-slate-400">{unlimited?'used':`/ ${(limit-bonus).toLocaleString()}`}</span>{bonus>0&&<span className="ml-2 inline-block align-middle"><FreeBonus amount={bonus}/></span>}</p>
    {!unlimited&&<div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-700 to-indigo-500 transition-all" style={{width:`${pct}%`}}/></div>}
    <p className="mt-2 min-h-8 text-xs leading-4 text-slate-500">{note}</p>
  </div>
};

export const BillingUsagePage:React.FC=()=>{
  const{instagramAccount,instagramAccounts,setIsRenewModalOpen}=useApp();
  const usage=useWorkspaceUsage();
  const catalog=usePlanCatalog();
  const plans=catalog.plans.map(p=>({...p,popular:p.id==='pro',special:p.id==='business'}));
  const [showTopUps,setShowTopUps]=useState(false);
  const plan=usage.plan;
  const usageVerified=usage.source==='server';
  const autoLimit=usage.automationLimit===null?Math.max(usage.automationUsed,1):usage.automationLimit;

  if (usage.unlimited) return <div className="min-h-full bg-[#f5f6fc] px-4 py-6 sm:px-7 lg:px-8"><div className="mx-auto max-w-[1380px] space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-widest text-violet-700">YOUR WORKSPACE</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Billing & Usage</h1><p className="mt-2 text-sm text-slate-500">Administrator access and workspace activity.</p></header>
    <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><ShieldCheck className="h-6 w-6 shrink-0 text-violet-700"/><div><h2 className="text-xl font-bold text-slate-950">Administrator · Unlimited</h2><p className="mt-2 text-sm leading-6 text-slate-600">No plan purchase or renewal is required. Standard messages, AI replies, automations and connected Instagram accounts have no website plan limits.</p><p className="mt-2 text-xs leading-5 text-slate-500">Usage is still recorded. Instagram messaging permissions and platform rate limits apply.</p></div></div></section>
    <section aria-label="Administrator usage" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Usage icon={BarChart3} label="Standard replies" used={usage.messageUsed} limit={Infinity} unlimited note="No monthly plan limit"/>
      <Usage icon={Bot} label="AI Replies" used={usage.aiUsed} limit={Infinity} unlimited note="No monthly plan limit"/>
      <Usage icon={Zap} label="Automations" used={usage.automationUsed} limit={Infinity} unlimited note="No plan count limit"/>
      <Usage icon={Instagram} label="Instagram Accounts" used={instagramAccounts.filter(({account})=>account?.status==='connected').length} limit={Infinity} unlimited note="No plan count limit"/>
    </section>
    <BillingHistory/>
  </div></div>;

  return <div className="min-h-full bg-[#f5f6fc] px-4 py-6 sm:px-7 lg:px-8">
    <div className="mx-auto max-w-[1380px] space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[11px] font-black uppercase tracking-[.16em] text-violet-700">YOUR WORKSPACE</p><h1 className="mt-1 text-[28px] font-black tracking-tight text-[#1f1749] sm:text-[38px]">Billing & Usage</h1><p className="mt-1 text-sm text-slate-500">Stay in control of your subscription, usage and upcoming upgrades.</p></div>
        <button onClick={()=>setIsRenewModalOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-2xl bg-[#6e45dc] px-5 text-xs font-black text-white shadow-lg shadow-violet-200 transition hover:bg-[#5531c0] sm:self-auto">Upgrade Plan <ArrowUpRight className="h-4 w-4"/></button>
      </header>

      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white text-slate-950 shadow-[0_8px_30px_rgba(15,23,42,.04)]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {usageVerified
                ? <><span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-violet-700">{plan.name} plan</span><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5"/>Subscription verified</span></>
                : <span className="h-7 w-36 animate-pulse rounded-full bg-slate-100" aria-hidden="true"/>}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              {usageVerified
                ? <><span className="text-[34px] font-black tracking-tight text-slate-950 sm:text-[40px]">{plan.price}</span><span className="text-xs font-semibold text-slate-500">{plan.id==='free'?'Free plan':'one-time / 30 days'}</span></>
                : <span className="mt-1 h-11 w-40 animate-pulse rounded-xl bg-slate-100" aria-hidden="true"/>}
              {usageVerified&&usage.expiresAt&&<span className="text-xs text-slate-500">· Active until {new Date(usage.expiresAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>}
            </div>
          </div>
          <button type="button" onClick={()=>setShowTopUps(value=>!value)} aria-expanded={showTopUps} aria-controls="reply-top-ups" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50"><Plus className="h-4 w-4"/>Add Money</button>
        </div>
      </section>
      {showTopUps&&<section id="reply-top-ups" className="rounded-2xl border border-indigo-200 bg-white p-5 sm:p-6" aria-labelledby="top-up-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="top-up-heading" className="text-lg font-bold text-slate-950">Extra reply packs</h2><p className="mt-1 text-sm text-slate-600">Add more replies to your current subscription when your monthly allowance runs out.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Coming soon · payments unavailable</span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><Zap className="h-5 w-5 text-indigo-600"/><h3 className="mt-3 font-semibold text-slate-900">Standard reply pack</h3><p className="mt-1 text-sm leading-6 text-slate-600">Extra capacity for keyword and fixed-message automations.</p><p className="mt-3 text-xs font-medium text-slate-500">Pack sizes and prices will be available before launch.</p></article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><Bot className="h-5 w-5 text-indigo-600"/><h3 className="mt-3 font-semibold text-slate-900">AI reply pack</h3><p className="mt-1 text-sm leading-6 text-slate-600">AI replies have their own allowance, separate from standard replies.</p><p className="mt-3 text-xs font-medium text-slate-500">Pack sizes and prices will be available before launch.</p></article>
        </div>
        <div className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-950"><strong>How top-ups are planned to work</strong><p>One subscription stays active. A one-time pack adds reply capacity without starting a second subscription or changing your renewal date. Final prices, expiry and payment options will be shown before purchase.</p></div>
        <p className="mt-3 text-xs text-slate-500">This is a preview. No payment is taken and no balance or reply allowance changes here.</p>
      </section>}

      <section>
        <div className="mb-3"><h2 className="text-base font-bold text-slate-950">Monthly usage</h2><p className="mt-0.5 text-xs text-slate-500">Your current workspace limits and consumption.</p></div>
        {usageVerified ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Usage icon={BarChart3} label="Standard replies" used={usage.messageUsed} limit={usage.messageLimit} bonus={usage.freeBonusMessages} note={usage.source==='server'?"Monthly automation messages":"Monthly outgoing automation messages"}/>
          <Usage icon={Bot} label="AI Replies" used={usage.aiUsed} limit={usage.aiLimit} bonus={usage.freeBonusAi} note="Independent AI allowance"/>
          <Usage icon={Zap} label="Automations" used={usage.automationUsed} limit={autoLimit} note={usage.automationLimit===null?"Unlimited on this plan":"Workspace automations"}/>
          <Usage icon={Instagram} label="Instagram Accounts" used={Math.max(instagramAccounts.filter(({account})=>account?.status==='connected').length,instagramAccount?1:0)} limit={plan.accounts} note="Connected Instagram accounts"/>
        </div> : <div role="status" aria-label={usage.error?'Usage data is unavailable':'Loading your plan usage'} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({length:4},(_,index)=><div key={index} className="min-h-[196px] rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm" aria-hidden="true">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100"/>
            <div className="mt-5 h-4 w-28 animate-pulse rounded-md bg-slate-100"/>
            <div className="mt-4 h-8 w-36 animate-pulse rounded-lg bg-slate-100"/>
            <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-slate-100"/>
          </div>)}
          {usage.error&&<div className="col-span-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            <span>Usage data is temporarily unavailable.</span>
            <button type="button" onClick={usage.retry} className="min-h-10 rounded-lg border border-slate-200 px-4 font-semibold text-slate-800 hover:bg-slate-50">Retry</button>
          </div>}
        </div>}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-base font-bold text-slate-950">Plans & pricing</h2><p className="mt-0.5 text-xs text-slate-500">Choose the capacity that fits your workspace.</p></div><CreditCard className="h-5 w-5 text-slate-300"/></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {!catalog.synced&&<p role="status" className="col-span-full text-sm text-slate-500">{catalog.error?'Live plan prices are temporarily unavailable. Please refresh later.':'Loading current prices…'}</p>}
          {plans.map(p=>{const active=p.id===plan.id;return <article key={p.name} className={`relative flex flex-col rounded-[24px] border bg-white p-6 shadow-[0_16px_40px_rgba(32,24,83,.06)] transition-transform hover:-translate-y-1 ${p.special?'billing-special-plan border-amber-300 bg-gradient-to-b from-amber-50 via-white to-white':p.popular?'border-violet-400 ring-2 ring-violet-100':'border-slate-200/80'}`}>
            <div className="flex items-start justify-between gap-2"><div><h3 className="text-lg font-black text-slate-950">{p.name}{active&&<span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Current plan</span>}</h3><div className="mt-2"><span className="text-[32px] font-black tracking-tight text-[#211748]">{p.price}</span><span className="text-xs font-semibold text-slate-400">{p.id==='free'?' / free':' / 30 days'}</span></div></div>{p.special&&<span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Top tier</span>}{p.popular&&<span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">Popular</span>}</div>
            <div className="my-4 h-px bg-slate-100"/>
            <div className="flex-1 space-y-2.5 text-xs font-medium text-slate-600">{[p.messages.toLocaleString()+' standard replies',p.ai.toLocaleString()+' AI replies',(p.automations===null?'Unlimited':p.automations.toLocaleString())+' automations',p.accounts+' Instagram account'+(p.accounts===1?'':'s')].map(x=><div key={x} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"/><span>{x}</span></div>)}</div>
            <button disabled={!catalog.synced||(active&&p.id==='free')} onClick={()=>p.id==='free'?window.location.assign('/refunds'):window.location.assign('/billing/checkout?plan='+p.id)} className={`mt-6 min-h-12 w-full rounded-2xl px-4 text-sm font-extrabold transition ${active&&p.id==='free'?'cursor-default border border-slate-200 bg-slate-50 text-slate-500':p.special?'bg-amber-500 text-slate-950 hover:bg-amber-400':'bg-[#6843d4] text-white shadow-md shadow-violet-100 hover:bg-[#5631c0]'}`}>{active?(p.id==='free'?'Current Plan':'Renew for 30 days'):(p.name==='Free'?'Use Free Plan':'Choose plan')}</button>
          </article>})}
        </div>
      </section>

      <section aria-labelledby="plan-comparison-heading">
        <h2 id="plan-comparison-heading" className="text-base font-bold text-slate-950">Compare plans in detail</h2><p className="mt-1 text-sm text-slate-500">One-time 30-day prices and calendar-month reply limits, side by side.</p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm" tabIndex={0} role="region" aria-label="Plan comparison, scroll horizontally on small screens">
          <table className="billing-comparison w-full text-left text-sm"><caption className="sr-only">One-time plan prices and monthly reply allowances</caption><thead><tr><th scope="col">Feature</th>{plans.map(p=><th key={p.id} scope="col" className={p.special?'is-special':p.id===plan.id?'is-current':''}>{p.name}{p.id===plan.id&&<small>Current plan</small>}{p.special&&<small>Top tier</small>}</th>)}</tr></thead>
            <tbody>{comparisonRows.map(row=><tr key={row.label}><th scope="row">{row.label}</th>{plans.map(p=><td key={p.id} className={p.special?'is-special':p.id===plan.id?'is-current':''}>{row.value(p)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[24px] border border-indigo-100 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="manage-requests-heading">
        <h2 id="manage-requests-heading" className="text-lg font-bold text-slate-950">Manage plan & support requests</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Paid access is a one-time 30-day purchase with no automatic renewal. You can request early cancellation or a refund; submitting a request never automatically terminates your plan or sends a payout.</p>
        <div className="mt-4 flex flex-wrap gap-3"><a href="/contact?type=cancellation" className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-800">Request cancellation</a><a href="/contact?type=refund" className="inline-flex min-h-12 items-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white">Request refund</a><a href="/contact?type=payment" className="inline-flex min-h-12 items-center rounded-xl border border-indigo-200 px-5 text-sm font-semibold text-indigo-700">Payment issue</a></div>
        <a href="/refunds" className="mt-4 inline-block text-xs font-semibold text-indigo-600 underline">Read refund & cancellation policy</a>
      </section>
      <section className="rounded-[24px] border border-white bg-white p-5 shadow-[0_15px_35px_rgba(31,23,76,.05)] sm:p-7" aria-labelledby="billing-history-heading">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600"><ReceiptText className="h-5 w-5"/></span><div><h2 id="billing-history-heading" className="text-base font-bold text-slate-900">Billing history</h2><p className="mt-1 text-sm text-slate-500">Your payment records, confirmation status and plan activation details.</p></div></div>
        <BillingHistory />
      </section>
      <InvoiceCenter />
    </div>
  </div>;
};
