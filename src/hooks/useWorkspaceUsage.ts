import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { auth } from '../lib/supabase';
import { ADMINISTRATOR_PLAN, getFallbackWorkspaceUsage, getPlanConfig } from '../lib/planUsage';
import { usePlanCatalog } from './usePlanCatalog';

type ServerUsage = {
  ok?: boolean;
  plan?: string;
  totalUsed?: number;
  aiUsed?: number;
  totalLimit?: number | null;
  aiLimit?: number | null;
  unlimited?: boolean;
  automationLimit?: number | null;
  accounts?: number | null;
  expiresAt?: string;
  baseMessageLimit?: number;
  baseAiLimit?: number;
  freeBonusMessages?: number;
  freeBonusAi?: number;
};

// Briefly keep last verified response across route changes to avoid flashing
// 'Checking plan' or fallback limits every time Billing is opened. Scope by
// authenticated owner; never reuse one customer's usage for another.
const billingUsageCache=new Map<string,{value:ServerUsage;at:number}>();
const FRESH_CACHE_MS=2*60*1000;

export const useWorkspaceUsage = () => {
  const { user, automations, inboxMessages } = useApp();
  const catalog=usePlanCatalog();
  const fallback = useMemo(
    () => getFallbackWorkspaceUsage(user, automations || [], inboxMessages || []),
    [
      user?.plan,
      user?.carry_forward_messages,
      user?.carry_forward_ai_replies,
      user?.carry_forward_expires_at,
      automations,
      inboxMessages,
    ]
  );

  const [record,setRecord] = useState<{ownerId:string;data:ServerUsage}|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryTick,setRetryTick] = useState(0);
  const userId=user?.id;
  const cached=userId?billingUsageCache.get(userId):null;
  const serverUsage=record?.ownerId===userId
    ? record.data
    : cached&&Date.now()-cached.at<FRESH_CACHE_MS?cached.value:null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const current = auth.currentUser;
      if (!current || !userId) {
        if(!cancelled){setRecord(null);setLoading(false);}
        return;
      }
      if(!cancelled){setLoading(true);setError(false);}
      try {
        const token = await current.getIdToken();
        const response = await fetch('/api/usage', {
          method: 'GET',
          headers: token ? { Authorization: 'Bearer ' + token } : undefined,
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const payload: ServerUsage = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) throw new Error('usage_unavailable');
        if (!cancelled){
          billingUsageCache.set(userId,{value:payload,at:Date.now()});
          setRecord({ownerId:userId,data:payload});
          setError(false);
        }
      } catch {
        if (!cancelled) {
          // An expired cached response is never promoted into verified data.
          // Leave any already displayed verified response intact on a transient
          // network failure, instead of flashing false zeros or a new plan.
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [userId, user?.plan, retryTick]);

  const unlimited = serverUsage?.unlimited === true;
  const plan = unlimited ? ADMINISTRATOR_PLAN : getPlanConfig(serverUsage?.plan || fallback.plan.id,catalog.plans);
  const freeBonusMessages = plan.id === 'free' ? 0 : Math.max(0, Number(serverUsage?.freeBonusMessages ?? (fallback.messageLimit - fallback.plan.messages)));
  const freeBonusAi = plan.id === 'free' ? 0 : Math.max(0, Number(serverUsage?.freeBonusAi ?? (fallback.aiLimit - fallback.plan.ai)));
  const baseMessageLimit = Number(serverUsage?.baseMessageLimit ?? plan.messages);
  const baseAiLimit = Number(serverUsage?.baseAiLimit ?? plan.ai);
  return {
    plan, unlimited,
    messageUsed: Number(serverUsage?.totalUsed ?? fallback.messageUsed),
    messageLimit: unlimited ? Infinity : Number(serverUsage?.totalLimit ?? (baseMessageLimit + freeBonusMessages)),
    aiUsed: Number(serverUsage?.aiUsed ?? fallback.aiUsed),
    aiLimit: unlimited ? Infinity : Number(serverUsage?.aiLimit ?? (baseAiLimit + freeBonusAi)),
    baseMessageLimit, baseAiLimit, freeBonusMessages, freeBonusAi,
    automationUsed: fallback.automationUsed,
    automationLimit: unlimited ? null : serverUsage?.automationLimit === null ? null : serverUsage?.automationLimit ?? plan.automations,
    expiresAt: serverUsage?.expiresAt,
    loading,error,
    retry:()=>setRetryTick(t=>t+1),
    source: serverUsage ? ('server' as const) : ('fallback' as const),
  };
};
