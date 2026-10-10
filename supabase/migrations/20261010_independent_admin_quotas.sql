-- Admin-managed independent monthly quotas: standard comment/story/DM sends vs AI replies.
-- total_messages retains its historical *aggregate* accounting for compatibility;
-- standard used = max(0, total_messages - ai_replies). New quota reservations are
-- atomic BEFORE send, with rollback on a confirmed send failure.
-- Safe to apply before the new Edge Function is deployed.

update public.autoreply_plans set ai_replies = 1500, updated_at = now()
where id = 'free' and ai_replies = 1000;

create table if not exists public.autoreply_delivery_quota_reservations (
  owner_user_id text not null,
  delivery_key text not null,
  month_key text not null,
  is_ai boolean not null,
  state text not null default 'reserved' check (state in ('reserved','sent','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, delivery_key)
);
create index if not exists autoreply_delivery_quota_reservations_month
on public.autoreply_delivery_quota_reservations(owner_user_id, month_key, state);
alter table public.autoreply_delivery_quota_reservations enable row level security;
revoke all on public.autoreply_delivery_quota_reservations from public, anon, authenticated;
grant select, insert, update on public.autoreply_delivery_quota_reservations to service_role;

create or replace function public.autoreply_billing_entitlement(p_workspace_id text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 owner_id text := public.autoreply_usage_owner(p_workspace_id);
 s public.autoreply_billing_subscriptions%rowtype;
 p public.autoreply_plans%rowtype;
 usage jsonb; carry boolean := false;
 normal_used integer; ai_used integer; normal_limit integer; ai_limit integer;
begin
 select * into s from public.autoreply_billing_subscriptions
 where owner_user_id = owner_id and expires_at > now();
 select * into p from public.autoreply_plans where id = coalesce(s.plan_id,'free');
 if not found then raise exception 'Plan configuration unavailable'; end if;
 usage := public.autoreply_get_usage(owner_id);
 ai_used := greatest(0, coalesce((usage->>'ai_replies')::integer,0));
 normal_used := greatest(0, coalesce((usage->>'total_messages')::integer,0) - ai_used);
 carry := coalesce(s.carry_expires_at > now(), false);
 normal_limit := p.total_messages + case when carry then s.carry_messages else 0 end;
 ai_limit := p.ai_replies + case when carry then s.carry_ai else 0 end;
 return jsonb_build_object(
  'plan',p.id, 'planName',p.name, 'priceInr',p.price_inr, 'billingDays',p.billing_days,
  'normalUsed',normal_used,'normalLimit',normal_limit,
  'totalUsed',normal_used,'totalLimit',normal_limit,
  'aiUsed',ai_used,'aiLimit',ai_limit,
  'accounts',p.instagram_accounts,'automationLimit',p.automations_limit,
  'expiresAt',s.expires_at,'renewal','manual','source','database'
 );
end $$;

-- Reserve atomically; one canonical owner lock serializes all concurrent
-- category checks (Meta sends can run in parallel across multiple workers).
create or replace function public.autoreply_reserve_delivery_quota(
 p_workspace_id text, p_delivery_key text, p_is_ai boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 owner_id text := public.autoreply_usage_owner(p_workspace_id);
 month_id text := to_char(now() at time zone 'utc','YYYY-MM');
 existing public.autoreply_delivery_quota_reservations%rowtype;
 limit_info jsonb; usage_info jsonb;
 used_count integer; max_count integer;
begin
 if owner_id is null or owner_id = '' or
    length(coalesce(p_delivery_key,'')) < 4 or length(p_delivery_key) > 250 or p_is_ai is null then
    raise exception 'Invalid delivery reservation';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('quota:'||owner_id,0));
 select * into existing from public.autoreply_delivery_quota_reservations
 where owner_user_id=owner_id and delivery_key=p_delivery_key;
 if found then
   return jsonb_build_object('allowed',false,'reason','already_claimed','state',existing.state);
 end if;
 limit_info := public.autoreply_billing_entitlement(owner_id);
 if p_is_ai then
    used_count := (limit_info->>'aiUsed')::integer;
    max_count := (limit_info->>'aiLimit')::integer;
 else
    used_count := (limit_info->>'normalUsed')::integer;
    max_count := (limit_info->>'normalLimit')::integer;
 end if;
 if used_count >= max_count then
    return jsonb_build_object('allowed',false,'reason',case when p_is_ai then 'ai_limit_reached' else 'normal_limit_reached' end,'used',used_count,'limit',max_count);
 end if;
 insert into public.autoreply_delivery_quota_reservations
 (owner_user_id,delivery_key,month_key,is_ai)
 values(owner_id,p_delivery_key,month_id,p_is_ai);
 insert into public.autoreply_usage_monthly (user_id,month_key,total_messages,ai_replies,updated_at)
 values(owner_id,month_id,1,case when p_is_ai then 1 else 0 end,now())
 on conflict (user_id,month_key) do update
 set total_messages=public.autoreply_usage_monthly.total_messages+1,
     ai_replies=public.autoreply_usage_monthly.ai_replies+case when p_is_ai then 1 else 0 end,
     updated_at=now();
 return jsonb_build_object('allowed',true,'reason','reserved','used',used_count+1,'limit',max_count);
end $$;

-- A confirmed provider send marks the reservation sent; a confirmed send
-- failure releases the slot. A worker crash remains reserved: fail closed,
-- never silently grant more DMs than the purchased allowance.
create or replace function public.autoreply_finish_delivery_quota(
 p_workspace_id text, p_delivery_key text, p_sent boolean
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare owner_id text := public.autoreply_usage_owner(p_workspace_id);
 r public.autoreply_delivery_quota_reservations%rowtype;
begin
 if p_sent is null then raise exception 'Delivery result required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('quota:'||owner_id,0));
 select * into r from public.autoreply_delivery_quota_reservations
 where owner_user_id=owner_id and delivery_key=p_delivery_key for update;
 if not found then return false; end if;
 if r.state <> 'reserved' then return r.state = 'sent'; end if;
 update public.autoreply_delivery_quota_reservations
 set state=case when p_sent then 'sent' else 'released' end,updated_at=now()
 where owner_user_id=owner_id and delivery_key=p_delivery_key;
 if not p_sent then
   update public.autoreply_usage_monthly
   set total_messages=greatest(0,total_messages-1),
       ai_replies=greatest(0,ai_replies-case when r.is_ai then 1 else 0 end),
       updated_at=now()
   where user_id=owner_id and month_key=r.month_key;
 end if;
 return p_sent;
end $$;

revoke all on function
 public.autoreply_reserve_delivery_quota(text,text,boolean),
 public.autoreply_finish_delivery_quota(text,text,boolean)
 from public, anon, authenticated;
grant execute on function
 public.autoreply_reserve_delivery_quota(text,text,boolean),
 public.autoreply_finish_delivery_quota(text,text,boolean)
 to service_role;

-- Paid activation should carry unused STANDARD and unused AI allowances separately.
create or replace function public.autoreply_confirm_billing_order(p_order_id text,p_payment_id text,p_amount numeric,p_currency text,p_environment text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.autoreply_billing_orders%rowtype; s public.autoreply_billing_subscriptions%rowtype;
 e timestamptz; m integer:=0; a integer:=0; c timestamptz; usage jsonb; free_plan public.autoreply_plans%rowtype;
begin
 select * into o from public.autoreply_billing_orders where order_id=p_order_id;
 if not found then raise exception 'Unknown billing order'; end if;
 perform pg_advisory_xact_lock(hashtextextended('billing:'||o.owner_user_id,0));
 select * into o from public.autoreply_billing_orders where order_id=p_order_id for update;
 if p_amount<>o.amount_inr or p_currency<>o.currency or p_environment<>o.environment or p_payment_id !~ '^[0-9]+$' then raise exception 'Unverified payment'; end if;
 if o.status='paid' then
   if o.cf_payment_id<>p_payment_id then raise exception 'Payment identity mismatch'; end if;
   return to_jsonb(o);
 end if;
 if o.environment='sandbox' then
   update public.autoreply_billing_orders set status='paid',cf_payment_id=p_payment_id,paid_at=now(),activation_status='test' where order_id=p_order_id returning * into o;
   return to_jsonb(o);
 end if;
 select * into s from public.autoreply_billing_subscriptions where owner_user_id=o.owner_user_id for update;
 if found and s.last_order_created_at>o.created_at then
   -- A late older payment must never replace a more recent purchase; keep its receipt for support reconciliation.
   update public.autoreply_billing_orders set status='paid',cf_payment_id=p_payment_id,paid_at=now(),activation_status='review' where order_id=p_order_id returning * into o;
   return to_jsonb(o);
 end if;
 if s.owner_user_id is null then
   usage:=public.autoreply_get_usage(o.owner_user_id);
   select * into free_plan from public.autoreply_plans where id='free';
   m:=greatest(0,free_plan.total_messages-greatest(0,coalesce((usage->>'total_messages')::integer,0)-coalesce((usage->>'ai_replies')::integer,0)));
   a:=greatest(0,free_plan.ai_replies-coalesce((usage->>'ai_replies')::integer,0));
   c:=now()+interval '30 days';
 else m:=s.carry_messages; a:=s.carry_ai; c:=s.carry_expires_at; end if;
 e:=(case when s.plan_id=o.plan_id and s.expires_at>now() then s.expires_at else now() end)+make_interval(days=>o.billing_days);
 insert into public.autoreply_billing_subscriptions(owner_user_id,plan_id,activated_at,expires_at,last_order_id,last_order_created_at,carry_messages,carry_ai,carry_expires_at)
 values(o.owner_user_id,o.plan_id,now(),e,o.order_id,o.created_at,m,a,c)
 on conflict(owner_user_id) do update set plan_id=excluded.plan_id,activated_at=excluded.activated_at,expires_at=excluded.expires_at,
 last_order_id=excluded.last_order_id,last_order_created_at=excluded.last_order_created_at,carry_messages=excluded.carry_messages,carry_ai=excluded.carry_ai,carry_expires_at=excluded.carry_expires_at,updated_at=now();
 update public.autoreply_billing_orders set status='paid',cf_payment_id=p_payment_id,paid_at=now(),activated_at=now(),access_expires_at=e,activation_status='active' where order_id=p_order_id returning * into o;
 return to_jsonb(o);
end $$;


