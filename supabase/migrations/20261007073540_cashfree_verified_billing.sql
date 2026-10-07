-- Billing is issued by the server only; profile JSON and browser redirects are never entitlements.
create table public.autoreply_billing_orders (
 order_id text primary key,
 request_id uuid not null,
 owner_user_id text not null,
 plan_id text not null references public.autoreply_plans(id),
 environment text not null check (environment in ('sandbox','production')),
 amount_inr integer not null check (amount_inr > 0),
 currency text not null default 'INR' check (currency = 'INR'),
 billing_days integer not null check (billing_days between 1 and 366),
 status text not null default 'creating' check (status in ('creating','pending','paid','expired')),
 payment_session_id text,
 cf_payment_id text,
 activation_status text not null default 'pending' check (activation_status in ('pending','active','test','review')),
 created_at timestamptz not null default now(),
 paid_at timestamptz,
 activated_at timestamptz,
 access_expires_at timestamptz,
 unique(owner_user_id,environment,request_id),
 unique(environment,cf_payment_id)
);
create index billing_orders_owner_created on public.autoreply_billing_orders(owner_user_id,created_at desc);
create unique index billing_one_pending_order on public.autoreply_billing_orders(owner_user_id,environment) where status in ('creating','pending');
create table public.autoreply_billing_subscriptions (
 owner_user_id text primary key,
 plan_id text not null references public.autoreply_plans(id),
 activated_at timestamptz not null,
 expires_at timestamptz not null,
 last_order_id text not null references public.autoreply_billing_orders(order_id),
 last_order_created_at timestamptz not null,
 carry_messages integer not null default 0,
 carry_ai integer not null default 0,
 carry_expires_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.autoreply_billing_orders enable row level security;
alter table public.autoreply_billing_subscriptions enable row level security;
revoke all on public.autoreply_billing_orders, public.autoreply_billing_subscriptions from public,anon,authenticated;
-- Application API returns a redacted receipt: payment sessions remain server-side.
grant all on public.autoreply_billing_orders,public.autoreply_billing_subscriptions to service_role;

create or replace function public.autoreply_reserve_billing_order(p_order_id text,p_request_id uuid,p_owner_id text,p_plan_id text,p_environment text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.autoreply_billing_orders%rowtype; p public.autoreply_plans%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('billing:'||p_owner_id,0));
 select * into o from public.autoreply_billing_orders where owner_user_id=p_owner_id and environment=p_environment and request_id=p_request_id;
 if found then
   if o.plan_id<>p_plan_id then raise exception 'Existing checkout has another plan'; end if;
   return to_jsonb(o);
 end if;
 select * into o from public.autoreply_billing_orders where owner_user_id=p_owner_id and environment=p_environment and status in ('creating','pending');
 if found then
   if o.plan_id<>p_plan_id then raise exception 'Finish your existing checkout before choosing another plan'; end if;
   return to_jsonb(o);
 end if;
 select * into p from public.autoreply_plans where id=p_plan_id and is_active and price_inr>0;
 if not found or p_environment not in ('sandbox','production') then raise exception 'Invalid paid plan'; end if;
 insert into public.autoreply_billing_orders(order_id,request_id,owner_user_id,plan_id,environment,amount_inr,billing_days)
 values(p_order_id,p_request_id,p_owner_id,p.id,p_environment,p.price_inr,p.billing_days) returning * into o;
 return to_jsonb(o);
end $$;

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
   m:=greatest(0,free_plan.total_messages-coalesce((usage->>'total_messages')::integer,0));
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

create or replace function public.autoreply_billing_entitlement(p_workspace_id text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare owner_id text:=public.autoreply_usage_owner(p_workspace_id); s public.autoreply_billing_subscriptions%rowtype;
 p public.autoreply_plans%rowtype; usage jsonb; carry boolean:=false;
begin
 select * into s from public.autoreply_billing_subscriptions where owner_user_id=owner_id and expires_at>now();
 select * into p from public.autoreply_plans where id=coalesce(s.plan_id,'free');
 if not found then raise exception 'Plan configuration unavailable'; end if;
 usage:=public.autoreply_get_usage(owner_id);
 carry:=coalesce(s.carry_expires_at>now(),false);
 return jsonb_build_object('plan',p.id,'totalUsed',coalesce((usage->>'total_messages')::integer,0),'aiUsed',coalesce((usage->>'ai_replies')::integer,0),
 'totalLimit',p.total_messages+case when carry then s.carry_messages else 0 end,'aiLimit',p.ai_replies+case when carry then s.carry_ai else 0 end,
 'accounts',p.instagram_accounts,'automationLimit',p.automations_limit,'expiresAt',s.expires_at,'renewal','manual','source','database');
end $$;
revoke all on function public.autoreply_reserve_billing_order(text,uuid,text,text,text),public.autoreply_confirm_billing_order(text,text,numeric,text,text),public.autoreply_billing_entitlement(text) from public,anon,authenticated;
grant execute on function public.autoreply_reserve_billing_order(text,uuid,text,text,text),public.autoreply_confirm_billing_order(text,text,numeric,text,text),public.autoreply_billing_entitlement(text) to service_role;

-- Keep the existing single-roundtrip, duplicate-safe webhook path, with verified paid quotas.
create or replace function public.autoreply_prepare_automation_event(p_candidates text[],p_message_id text,p_sender_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_context jsonb; v_rules jsonb; v_quota jsonb; v_user_id text;
begin
 if coalesce(array_length(p_candidates,1),0)=0 then
   perform public.autoreply_billing_entitlement('__billing_health__');
   return jsonb_build_object('runtime_ready',true);
 end if;
 v_context:=public.autoreply_claim_dm_context_v4(p_candidates,p_message_id,'',p_sender_id,true);
 v_user_id:=v_context->>'user_id';
 if v_user_id is null then return null; end if;
 if v_context->>'message_state'<>'new' then return v_context; end if;
 select coalesce(jsonb_agg(d.data||jsonb_build_object('id',d.id) order by d.updated_at desc),'[]'::jsonb)
 into v_rules from public.autoreply_documents d where d.user_id=v_user_id and d.collection='automations';
 v_quota:=public.autoreply_billing_entitlement(v_user_id);
 if v_quota is null then raise exception 'Message allowance unavailable'; end if;
 return v_context||jsonb_build_object('automations',v_rules,'quota',v_quota);
end $$;
revoke all on function public.autoreply_prepare_automation_event(text[],text,text) from public,anon,authenticated;
grant execute on function public.autoreply_prepare_automation_event(text[],text,text) to service_role;
