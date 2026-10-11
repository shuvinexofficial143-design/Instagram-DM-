import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { auth } from '../lib/supabase';
import { getFallbackWorkspaceUsage, getPlanConfig } from '../lib/planUsage';
import { usePlanCatalog } from './usePlanCatalog';

type ServerUsage = {
  ok?: boolean;
  plan?: string;
  totalUsed?: number;
  aiUsed?: number;
  totalLimit?: number;
  aiLimit?: number;
  expiresAt?: string;
  baseMessageLimit?: number;
  baseAiLimit?: number;
  freeBonusMessages?: number;
  freeBonusAi?: number;
};

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

  const [serverUsage, setServerUsage] = useState<ServerUsage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const current = auth.currentUser;
      if (!current) {
        setServerUsage(null);
        return;
      }
      setLoading(true);
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
        if (!cancelled) setServerUsage(payload);
      } catch {
        if (!cancelled) setServerUsage(null);
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
  }, [user?.id, user?.plan]);

  const plan = getPlanConfig(serverUsage?.plan || fallback.plan.id,catalog.plans);
  const freeBonusMessages = plan.id === 'free' ? 0 : Math.max(0, Number(serverUsage?.freeBonusMessages ?? (fallback.messageLimit - fallback.plan.messages)));
  const freeBonusAi = plan.id === 'free' ? 0 : Math.max(0, Number(serverUsage?.freeBonusAi ?? (fallback.aiLimit - fallback.plan.ai)));
  const baseMessageLimit = Number(serverUsage?.baseMessageLimit ?? plan.messages);
  const baseAiLimit = Number(serverUsage?.baseAiLimit ?? plan.ai);
  return {
    plan,
    messageUsed: Number(serverUsage?.totalUsed ?? fallback.messageUsed),
    messageLimit: Number(serverUsage?.totalLimit ?? (baseMessageLimit + freeBonusMessages)),
    aiUsed: Number(serverUsage?.aiUsed ?? fallback.aiUsed),
    aiLimit: Number(serverUsage?.aiLimit ?? (baseAiLimit + freeBonusAi)),
    baseMessageLimit, baseAiLimit, freeBonusMessages, freeBonusAi,
    automationUsed: fallback.automationUsed,
    automationLimit: plan.automations,
    expiresAt: serverUsage?.expiresAt,
    loading,
    source: serverUsage ? ('server' as const) : ('fallback' as const),
  };
};
