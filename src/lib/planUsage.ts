import { Automation, InboxMessage, UserProfile } from '../types';

export type PlanId = 'free' | 'starter' | 'pro' | 'business' | 'administrator';

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

/** Display only after a server-verified unlimited entitlement. Never sold in the catalog. */
export const ADMINISTRATOR_PLAN: PlanConfig = {
  id: 'administrator', name: 'Administrator', price: '₹0', messages: Infinity,
  ai: Infinity, accounts: Infinity, automations: null,
};

/** No hardcoded prices or quotas: these values come from Supabase. */
export const PLAN_CATALOG: PlanConfig[] = [];

export const getPlanConfig = (value?: string | null, catalog: PlanConfig[] = []): PlanConfig => {
  const key = String(value || 'free').toLowerCase();
  const found = catalog.find((plan) => plan.id === key);
  if (found) return found;
  // Fail closed while the live catalog is unavailable, instead of showing stale prices.
  const id = (['free', 'starter', 'pro', 'business'] as string[]).includes(key) ? key as PlanId : 'free';
  return { id, name: 'Plan unavailable', price: '—', messages: 0, ai: 0, accounts: 0, automations: 0 };
};

export type PlanEntitlement = {
  plan?: string;
  planName?: string;
  priceInr?: number;
  billingDays?: number;
  baseMessageLimit?: number;
  baseAiLimit?: number;
  accounts?: number | null;
  automationLimit?: number | null;
};

/** An authenticated entitlement overrides stale public catalog data. */
export const planFromEntitlement = (entitlement: PlanEntitlement, catalog: PlanConfig[] = []): PlanConfig => {
  const listed = getPlanConfig(entitlement.plan, catalog);
  const count = (value: number | null | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  return {
    ...listed,
    name: entitlement.planName || listed.name,
    price: typeof entitlement.priceInr === 'number' && Number.isFinite(entitlement.priceInr)
      ? '₹' + entitlement.priceInr.toLocaleString('en-IN') : listed.price,
    messages: count(entitlement.baseMessageLimit, listed.messages),
    ai: count(entitlement.baseAiLimit, listed.ai),
    accounts: count(entitlement.accounts, listed.accounts),
    automations: entitlement.automationLimit === null
      ? null : count(entitlement.automationLimit, listed.automations ?? 0),
    billingDays: count(entitlement.billingDays, listed.billingDays ?? 0) || undefined,
  };
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
  inboxMessages: InboxMessage[],
  catalog: PlanConfig[] = []
) => {
  const plan = getPlanConfig(user?.plan, catalog);
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
