import React from 'react';
import { Check, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usePlanCatalog } from '../../hooks/usePlanCatalog';
import { useWorkspaceUsage } from '../../hooks/useWorkspaceUsage';

export const PlanRenewModal: React.FC = () => {
  const { isRenewModalOpen, setIsRenewModalOpen, user, renewPlan } = useApp();
  const catalog=usePlanCatalog();
  const usage=useWorkspaceUsage();
  if (!isRenewModalOpen) return null;
  const current = String(user?.plan || 'free').toLowerCase();
  const freeMessagesLeft = Math.max(0, usage.messageLimit - usage.messageUsed);
  const freeAiLeft = Math.max(0, usage.aiLimit - usage.aiUsed);

  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#110b2b]/70 p-3 backdrop-blur-md sm:p-6">
    <div className="flex min-h-full items-center justify-center">
      <section className="relative w-full max-w-6xl overflow-hidden rounded-[30px] border border-white bg-[#f6f5fb] p-4 shadow-[0_32px_90px_rgba(16,12,45,.4)] sm:p-7">
        <button aria-label="Close" onClick={() => setIsRenewModalOpen(false)} className="absolute right-5 top-5 z-10 rounded-xl bg-white/10 p-2 text-white hover:bg-white/20"><X className="h-5 w-5" /></button>
        <header className="-mx-4 -mt-4 mb-6 rounded-t-[30px] bg-gradient-to-br from-[#25164d] to-[#6646bf] px-7 py-9 text-center text-white sm:-mx-7 sm:-mt-7">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white"><Sparkles className="h-5 w-5" /></span>
          <h2 className="text-2xl font-black text-white sm:text-4xl">Choose your plan</h2>
          <p className="mt-2 text-sm font-semibold text-indigo-100">Upgrade your Instagram automation with clear monthly limits.</p>
        </header>

        {current === 'free' && <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-800">
          Your unused Free allowance carries forward on your first paid upgrade: {freeMessagesLeft.toLocaleString()} standard replies and {freeAiLeft.toLocaleString()} independent AI replies.
        </div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {catalog.plans.map(plan => {
            const active = current === plan.id;
            return <article key={plan.id} className={`relative flex min-h-[330px] flex-col rounded-[24px] border bg-white p-5 shadow-[0_15px_35px_rgba(38,23,84,.07)] ${(plan.id==='pro') ? 'border-violet-400 ring-2 ring-violet-100' : 'border-slate-200'}`}>
              {plan.id==='pro' && <span className="absolute right-4 top-4 rounded-full bg-[#6e44d5] px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">Most Popular</span>}
              <h3 className="text-lg font-black text-slate-950">{plan.name}</h3>
              <div className="mt-2"><span className="text-3xl font-black text-[#26144f]">{plan.price}</span><span className="text-xs font-bold text-slate-500"> / month</span></div>
              <div className="my-5 h-px bg-slate-200" />
              <div className="flex-1 space-y-3 text-sm font-semibold text-slate-700">
                {[plan.messages.toLocaleString() + ' standard replies', plan.ai.toLocaleString() + ' AI replies', (plan.automations===null?'Unlimited':plan.automations) + ' automations', plan.accounts + ' Instagram account' + (plan.accounts === 1 ? '' : 's')].map(item =>
                  <div key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{item}</span></div>
                )}
              </div>
              <button disabled={!catalog.synced || plan.id === 'free'} onClick={() => renewPlan(plan.id)} className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold transition ${plan.id === 'free' ? 'cursor-default bg-slate-100 text-slate-500' : 'bg-gradient-to-r from-violet-700 to-indigo-600 text-white shadow-lg shadow-violet-500/15 hover:opacity-95'}`}>
                {active ? (plan.id === 'free' ? 'Current Plan' : 'Renew current plan') : plan.id === 'free' ? 'Use Free Plan' : `Choose ${plan.name}`}
              </button>
            </article>;
          })}
        </div>
        <footer className="mt-6 flex items-center justify-center gap-2 text-center text-xs font-bold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />Standard DM, comment and story replies have a separate monthly limit from AI replies.</footer>
      </section>
    </div>
  </div>;
};
