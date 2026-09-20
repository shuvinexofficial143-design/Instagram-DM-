import React from 'react';
import { X, Check, Zap, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PlanRenewModal: React.FC = () => {
  const { isRenewModalOpen, setIsRenewModalOpen, user, renewPlan } = useApp();
  if (!isRenewModalOpen) return null;
  const plans = [
    { id:'free', name:'Free', price:'₹0', messages:'1,500', ai:'1,000', automations:'5', accounts:'1' },
    { id:'starter', name:'Starter', price:'₹299', messages:'7,500', ai:'5,000', automations:'Unlimited', accounts:'1' },
    { id:'pro', name:'Pro', price:'₹599', messages:'25,000', ai:'15,000', automations:'Unlimited', accounts:'2', popular:true },
    { id:'business', name:'Business', price:'₹1,299', messages:'75,000', ai:'40,000', automations:'Unlimited', accounts:'5' },
  ] as const;
  const current=String(user?.plan||'free').toLowerCase();
  const freeLeft=Math.max(0,1500-Number(user?.message_usage||0));
  const freeAiLeft=Math.max(0,1000-Number(user?.ai_reply_usage||0));
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]">
    <div className="relative my-auto w-full max-w-6xl rounded-[28px] border border-blue-100 bg-[#F7FAFF] p-5 shadow-2xl sm:p-7">
      <button onClick={()=>setIsRenewModalOpen(false)} className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 hover:bg-white"><X className="h-5 w-5"/></button>
      <div className="mx-auto mb-7 max-w-2xl text-center"><span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Zap className="h-5 w-5"/></span><h2 className="text-2xl font-black tracking-tight text-slate-950">Choose your AutoReply plan</h2><p className="mt-1 text-sm font-medium text-slate-600">Simple monthly plans for Instagram automation and AI replies.</p></div>
      {current==='free'&&<div className="mx-auto mb-5 max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-center text-sm font-semibold text-emerald-800">Upgrade now and your unused Free allowance carries forward: <b>{freeLeft.toLocaleString()} messages</b> and up to <b>{freeAiLeft.toLocaleString()} AI replies</b>.</div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{plans.map(p=>{const active=current===p.id;return <div key={p.id} className={`relative flex flex-col rounded-3xl border bg-[#FCFDFF] p-5 shadow-sm ${p.popular?'border-indigo-300 ring-2 ring-indigo-100':'border-blue-100'}`}>
        {p.popular&&<span className="absolute right-4 top-4 rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase text-white">Most Popular</span>}
        <h3 className="text-lg font-black text-slate-950">{p.name}</h3><div className="mt-2"><span className="text-3xl font-black text-slate-950">{p.price}</span><span className="text-xs font-semibold text-slate-500"> / month</span></div>
        <div className="my-5 h-px bg-slate-100"/><div className="flex-1 space-y-3 text-sm font-semibold text-slate-700">{[p.messages+' total messages',p.ai+' max AI replies',p.automations+' automations',p.accounts+' Instagram account'+(p.accounts==='1'?'':'s')].map(v=><div key={v} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600"/><span>{v}</span></div>)}</div>
        <button disabled={active} onClick={()=>renewPlan(p.id)} className={`mt-6 rounded-xl px-4 py-3 text-sm font-bold ${active?'cursor-default bg-slate-100 text-slate-500':'bg-gradient-to-r from-blue-600 to-violet-600 text-white'}`}>{active?'Current Plan':p.id==='free'?'Use Free Plan':`Choose ${p.name}`}</button>
      </div>})}</div>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600"/>AI replies count inside the total message allowance. Unused Free allowance is carried only on the first paid upgrade.</p>
    </div>
  </div>;
};
