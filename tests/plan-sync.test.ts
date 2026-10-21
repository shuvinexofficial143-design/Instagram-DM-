import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlanConfig, getFallbackWorkspaceUsage, planFromEntitlement, PLAN_CATALOG, PlanConfig } from '../src/lib/planUsage';

const catalog: PlanConfig[] = [
  {id:'free', name:'Free', price:'₹0', messages:1500, ai:1500, accounts:1, automations:5, billingDays:30},
  {id:'pro', name:'Pro', price:'₹399', messages:3000, ai:2500, accounts:2, automations:null, billingDays:30},
];

test('without a verified catalog there are no fabricated prices or monthly allowances', () => {
  assert.deepEqual(PLAN_CATALOG, []);
  const missing = getPlanConfig('pro');
  assert.equal(missing.price, '—');
  assert.equal(missing.messages, 0);
  const fallback = getFallbackWorkspaceUsage({plan:'pro'} as any, [], []);
  assert.equal(fallback.source, 'fallback');
  assert.equal(fallback.plan.price, '—');
});

test('new plan catalog values control the displayed prices and quotas', () => {
  const live = getPlanConfig('pro', catalog);
  assert.equal(live.price, '₹399');
  assert.equal(live.messages, 3000);
  assert.equal(live.ai, 2500);
});

test('verified entitlement overrides an outdated public catalog for existing customers', () => {
  const old: PlanConfig[] = [{...catalog[1], price:'₹599', messages:1500, ai:1000}];
  const current = planFromEntitlement({
    plan:'pro', planName:'Pro Plus', priceInr:399, baseMessageLimit:3000,
    baseAiLimit:2500, accounts:3, automationLimit:null, billingDays:45,
  }, old);
  assert.equal(current.name, 'Pro Plus');
  assert.equal(current.price, '₹399');
  assert.equal(current.messages, 3000);
  assert.equal(current.ai, 2500);
  assert.equal(current.accounts, 3);
  assert.equal(current.automations, null);
  assert.equal(current.billingDays, 45);
});

test('an unverified administrator profile never grants unlimited access', () => {
  const fallback = getFallbackWorkspaceUsage({plan:'administrator',role:'admin'} as any, [], []);
  assert.equal(fallback.plan.id, 'free');
  assert.ok(Number.isFinite(fallback.messageLimit));
});
