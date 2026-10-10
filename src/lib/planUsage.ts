import { Automation, InboxMessage, UserProfile } from '../types';

export type PlanId = 'free' | 'starter' | 'pro' | 'business';

export type PlanConfig = {
  id: PlanId;
  name: string;
  price: string;
  messages: number;
  ai: number;
  accounts: number;
  automations: number | null;
  billingDays?: number;
};

export const PLAN_CATALOG: PlanConfig[] = [
  { id: 'free', name: 'Free', price: '₹0', messages: 1500, ai: 1500, accounts: 1, automations: 5 },
  { id: 'starter', name: 'Starter', price: '₹299', messages: 7500, ai: 5000, accounts: 1, automations: null },
  { id: 'pro', name: 'Pro', price: '₹599', messages: 25000, ai: 15000, accounts: 2, automations: null },
  { id: 'business', name: 'Business', price: '₹1,299', messages: 75000, ai: 40000, accounts: 5, automations: null },
];

export const getPlanConfig = (value?: string | null, catalog: PlanConfig[] = PLAN_CATALOG): PlanConfig => {
  const key = String(value || 'free').toLowerCase();
  return catalog.find((plan) => plan.id === key) || PLAN_CATALOG.find((plan) => plan.id === key) || PLAN_CATALOG[0];
};

export const usagePercent = (used: number, limit: number | null): number => {
  if (limit === null || limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
};

export const usageLevel = (pct: number): 'safe' | 'warning' | 'critical' => {
  if (pct >= 90) return 'critical';
  if (pct >= 70) return 'warning';
  return 'safe';
};

export const getFallbackWorkspaceUsage = (
  user: UserProfile | undefined,
  automations: Automation[],
  inboxMessages: InboxMessage[]
) => {
  const plan = getPlanConfig(user?.plan);
  const expiry = Date.parse(String(user?.carry_forward_expires_at || ''));
  const carryActive = Number.isFinite(expiry) && expiry > Date.now();
  const messageLimit = plan.messages + (carryActive ? Number(user?.carry_forward_messages || 0) : 0);
  const aiLimit = plan.ai + (carryActive ? Number(user?.carry_forward_ai_replies || 0) : 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthlyAutomated = (inboxMessages || []).filter(
    (message) =>
      message.direction === 'out' &&
      message.is_automated &&
      new Date(message.timestamp || 0).getTime() >= monthStart.getTime()
  );

  const aiIds = new Set(
    (automations || [])
      .filter((automation) => automation.trigger_type === 'dm_ai_conversation')
      .map((automation) => automation.id)
  );
  const monthlyAi = monthlyAutomated.filter(
    (message) => Boolean(message.automation_id && aiIds.has(message.automation_id))
  );

  return {
    plan,
    messageUsed: Math.max(0, monthlyAutomated.length - monthlyAi.length),
    messageLimit,
    aiUsed: monthlyAi.length,
    aiLimit,
    automationUsed: (automations || []).length,
    automationLimit: plan.automations,
    source: 'fallback' as const,
  };
};
