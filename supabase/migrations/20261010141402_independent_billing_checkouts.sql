-- Checkout availability is independent of the provider's financial record.
alter table public.autoreply_billing_orders
 add column checkout_state text not null default 'active' check (checkout_state in ('active','superseded','closed','expired','complete')),
 add column payment_expires_at timestamptz,
 add column provider_status text,
 add column provider_expires_at timestamptz,
 add column last_attempt text,
 add column status_checked_at timestamptz,
 add column customer_details jsonb;
update public.autoreply_billing_orders set payment_expires_at=created_at+interval '5 minutes',
 checkout_state=case when status='paid' then 'complete' when status='expired' or created_at+interval '5 minutes'<=now() then 'expired' else 'active' end;
alter table public.autoreply_billing_orders alter column payment_expires_at set default (now()+interval '5 minutes'), alter column payment_expires_at set not null;
drop index public.billing_one_pending_order;
create index billing_checkout_owner on public.autoreply_billing_orders(owner_user_id,environment,checkout_state,created_at desc);

create or replace function public.autoreply_reserve_billing_checkout(p_order_id text,p_request_id uuid,p_owner_id text,p_plan_id text,p_environment text,p_customer jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.autoreply_billing_orders%rowtype; p public.autoreply_plans%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('billing:'||p_owner_id,0));
 select * into o from public.autoreply_billing_orders where owner_user_id=p_owner_id and environment=p_environment and request_id=p_request_id;
 if found then
   if o.plan_id<>p_plan_id then raise exception 'Existing checkout has another plan'; end if;
   return to_jsonb(o);
 end if;
 select * into p from public.autoreply_plans where id=p_plan_id and is_active and price_inr>0;
 if not found or p_environment not in ('sandbox','production') or coalesce(p_owner_id,'')='' then raise exception 'Invalid paid checkout'; end if;
 if coalesce(p_customer->>'name','')='' or coalesce(p_customer->>'email','')='' or coalesce(p_customer->>'phone','') !~ '^[6-9][0-9]{9}$' then raise exception 'Invalid billing contact'; end if;
 -- Retain old provider orders for late payment verification. Never fake termination.
 update public.autoreply_billing_orders set checkout_state='superseded'
 where owner_user_id=p_owner_id and environment=p_environment and checkout_state not in ('closed','superseded') and status<>'paid';
 insert into public.autoreply_billing_orders(order_id,request_id,owner_user_id,plan_id,environment,amount_inr,billing_days,customer_details)
 values(p_order_id,p_request_id,p_owner_id,p.id,p_environment,p.price_inr,p.billing_days,p_customer) returning * into o;
 return to_jsonb(o);
end $$;

create or replace function public.autoreply_close_billing_checkout(p_order_id text,p_owner_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.autoreply_billing_orders%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('billing:'||p_owner_id,0));
 select * into o from public.autoreply_billing_orders where order_id=p_order_id and owner_user_id=p_owner_id for update;
 if not found then raise exception 'Unknown checkout'; end if;
 if o.status<>'paid' then
   update public.autoreply_billing_orders set checkout_state='closed' where order_id=p_order_id returning * into o;
 end if;
 return to_jsonb(o);
end $$;

-- Extend the existing verified, duplicate-safe confirmation function, retaining
-- its signature, quotas, renewal and sandbox behavior.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.autoreply_confirm_billing_order(text,text,numeric,text,text)'::regprocedure) into definition;
 definition:=replace(definition,
   'if found and s.last_order_created_at>o.created_at then',
   'if o.checkout_state in (''superseded'',''closed'') or (s.owner_user_id is not null and s.last_order_created_at>o.created_at) then');
 definition:=replace(definition, 'set status=''paid'',cf_payment_id=', 'set status=''paid'',checkout_state=''complete'',cf_payment_id=');
 execute definition;
end $$;
revoke all on function public.autoreply_reserve_billing_checkout(text,uuid,text,text,text,jsonb),public.autoreply_close_billing_checkout(text,text) from public,anon,authenticated;
grant execute on function public.autoreply_reserve_billing_checkout(text,uuid,text,text,text,jsonb),public.autoreply_close_billing_checkout(text,text) to service_role;
notify pgrst,'reload schema';
