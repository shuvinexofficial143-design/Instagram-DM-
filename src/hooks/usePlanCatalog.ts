import { useEffect, useState } from 'react';
import { PlanConfig } from '../lib/planUsage';

/** Live Supabase catalog only: prices and allowances are never client constants. */
export function usePlanCatalog() {
  const [plans,setPlans] = useState<PlanConfig[]>([]);
  const [synced,setSynced] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {
    let alive = true;
    let controller: AbortController | undefined;
    let generation = 0;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const current = ++generation;
      try {
        const response = await fetch('/api/billing?action=plans', {cache:'no-store',signal:controller.signal});
        const data = await response.json();
        if (!response.ok || !data?.ok || !Array.isArray(data.plans))
          throw new Error('Plan prices are temporarily unavailable.');
        const parsed: PlanConfig[] = data.plans.filter((p:any) => p.is_active).map((p:any) => ({
          id: String(p.id) as PlanConfig['id'],
          name: String(p.name),
          price: '₹' + Number(p.price_inr).toLocaleString('en-IN'),
          messages: Number(p.total_messages),
          ai: Number(p.ai_replies),
          accounts: Number(p.instagram_accounts),
          automations: p.automations_limit === null ? null : Number(p.automations_limit),
          billingDays: Number(p.billing_days),
        }));
        if (!parsed.length || parsed.some(p => !p.name || p.price.includes('NaN') ||
            !Number.isFinite(p.messages) || !Number.isFinite(p.ai) ||
            !Number.isFinite(p.accounts) || !Number.isFinite(p.billingDays)))
          throw new Error('Plan catalog invalid.');
        if (alive && current === generation) { setPlans(parsed); setSynced(true); setError(''); }
      } catch (err: any) {
        if (alive && current === generation && err?.name !== 'AbortError') {
          // Do not keep displaying an old plan price as if it were verified.
          setPlans([]); setSynced(false); setError(err?.message || 'Plan catalog unavailable.');
        }
      }
    };
    const onFocus = () => void load();
    const onVisible = () => { if (!document.hidden) void load(); };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('autoreply:plan-updated', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('autoreply:plan-updated', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return {plans,synced,error};
}
