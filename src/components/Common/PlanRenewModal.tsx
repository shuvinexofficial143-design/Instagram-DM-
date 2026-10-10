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

  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
    <div className="flex min-h-full items-center justify-center">
      <section className="relative w-full max-w-6xl rounded-[30px] border border-indigo-100 bg-[#F7FAFF] p-5 shadow-2xl sm:p-8">
        <button aria-label="Close" onClick={() => setIsRenewModalOpen(false)} className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 hover:bg-white"><X className="h-5 w-5" /></button>
        <header className="mx-auto mb-6 max-w-2xl text-center">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700"><Sparkles className="h-5 w-5" /></span>
          <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">Choose your plan</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">Upgrade your Instagram automation with clear monthly limits.</p>
        </header>

        {current === 'free' && <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-800">
          Your unused Free allowance carries forward on your first paid upgrade: {freeMessagesLeft.toLocaleString()} standard replies and {freeAiLeft.toLocaleString()} independent AI replies.
        </div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {catalog.plans.map(plan => {
            const active = current === plan.id;
            return <article key={plan.id} className={`relative flex min-h-[330px] flex-col rounded-3xl border bg-white/80 p-5 shadow-sm ${(plan.id==='pro') ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
              {plan.id==='pro' && <span className="absolute right-4 top-4 rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">Most Popular</span>}
              <h3 className="text-lg font-bold text-slate-950">{plan.name}</h3>
              <div className="mt-2"><span className="text-3xl font-bold text-slate-950">{plan.price}</span><span className="text-xs font-bold text-slate-500"> / month</span></div>
              <div className="my-5 h-px bg-slate-200" />
              <div className="flex-1 space-y-3 text-sm font-semibold text-slate-700">
                {[plan.messages.toLocaleString() + ' standard replies', plan.ai.toLocaleString() + ' AI replies', (plan.automations===null?'Unlimited':plan.automations) + ' automations', plan.accounts + ' Instagram account' + (plan.accounts === 1 ? '' : 's')].map(item =>
                  <div key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{item}</span></div>
                )}
              </div>
              <button disabled={!catalog.synced || (active && plan.id === 'free')} onClick={() => renewPlan(plan.id)} className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold transition ${active && plan.id === 'free' ? 'cursor-default bg-slate-100 text-slate-500' : 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-indigo-500/15 hover:opacity-95'}`}>
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
