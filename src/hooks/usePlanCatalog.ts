import { useEffect, useState } from 'react';
import { PLAN_CATALOG, PlanConfig } from '../lib/planUsage';

/** Public plan prices and limits are owned by Supabase, never client constants. */
export function usePlanCatalog() {
  const [plans,setPlans] = useState<PlanConfig[]>(PLAN_CATALOG);
  const [synced,setSynced] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    fetch('/api/billing?action=plans', {cache:'no-store',signal:controller.signal})
      .then(async response => {
        const data = await response.json();
        if(!response.ok || !data?.ok || !Array.isArray(data.plans)) throw new Error('Plan prices are temporarily unavailable.');
        const parsed:PlanConfig[] = data.plans.filter((p:any)=>p.is_active).map((p:any)=>({
          id: String(p.id) as PlanConfig['id'],
          name: String(p.name),
          price: '₹' + Number(p.price_inr).toLocaleString('en-IN'),
          messages: Number(p.total_messages),
          ai: Number(p.ai_replies),
          accounts: Number(p.instagram_accounts),
          automations: p.automations_limit===null ? null : Number(p.automations_limit),
          billingDays: Number(p.billing_days),
        }));
        if(!parsed.length || parsed.some(p=>!Number.isFinite(p.messages)||!Number.isFinite(p.ai))) throw new Error('Plan catalog invalid.');
        if(alive){setPlans(parsed);setSynced(true);setError('');}
      }).catch((err:Error)=>{if(alive && err.name!=='AbortError'){setSynced(false);setError(err.message);}});
    return ()=>{alive=false;controller.abort();};
  },[]);
  return {plans,synced,error};
}
