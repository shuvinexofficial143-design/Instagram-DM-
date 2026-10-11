-- Choosing a plan supersedes earlier unpaid checkouts before payment starts.
create table public.autoreply_checkout_choices (
 id bigint generated always as identity primary key,
 owner_user_id text not null,
 environment text not null check (environment in ('sandbox','production')),
 request_id uuid not null,
 plan_id text not null references public.autoreply_plans(id),
 created_at timestamptz not null default now(),
 unique(owner_user_id,environment,request_id)
);
create index billing_choice_latest on public.autoreply_checkout_choices(owner_user_id,environment,id desc);
alter table public.autoreply_checkout_choices enable row level security;
revoke all on public.autoreply_checkout_choices from public,anon,authenticated;
grant select,insert,update,delete on public.autoreply_checkout_choices to service_role;
grant usage,select on sequence public.autoreply_checkout_choices_id_seq to service_role;

create or replace function public.autoreply_choose_billing_plan(p_owner_id text,p_environment text,p_plan_id text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare chosen public.autoreply_checkout_choices%rowtype; latest bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('billing:'||p_owner_id,0));
 if coalesce(p_owner_id,'')='' or p_environment not in ('sandbox','production') or not exists(select 1 from public.autoreply_plans where id=p_plan_id and is_active and price_inr>0) then raise exception 'Invalid plan selection'; end if;
 select * into chosen from public.autoreply_checkout_choices where owner_user_id=p_owner_id and environment=p_environment and request_id=p_request_id;
 if found then
   if chosen.plan_id<>p_plan_id then raise exception 'Checkout selection mismatch'; end if;
 else
   insert into public.autoreply_checkout_choices(owner_user_id,environment,request_id,plan_id)
   values(p_owner_id,p_environment,p_request_id,p_plan_id) returning * into chosen;
   update public.autoreply_billing_orders set checkout_state='superseded'
   where owner_user_id=p_owner_id and environment=p_environment and status<>'paid' and checkout_state not in ('closed','superseded');
 end if;
 select max(id) into latest from public.autoreply_checkout_choices where owner_user_id=p_owner_id and environment=p_environment;
 return jsonb_build_object('plan_id',chosen.plan_id,'current',latest=chosen.id);
end $$;
revoke all on function public.autoreply_choose_billing_plan(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.autoreply_choose_billing_plan(text,text,text,uuid) to service_role;

-- Keep retry identities intact, and reject new orders from obsolete tabs.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.autoreply_reserve_billing_checkout(text,uuid,text,text,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,
   ' select * into p from public.autoreply_plans',
   ' if exists(select 1 from public.autoreply_checkout_choices where owner_user_id=p_owner_id and environment=p_environment) and p_request_id<>(select request_id from public.autoreply_checkout_choices where owner_user_id=p_owner_id and environment=p_environment order by id desc limit 1) then raise exception ''A newer checkout was selected''; end if;
 select * into p from public.autoreply_plans');
 execute definition;
 -- Report actual Free carry credits separately; entitlement totals stay identical.
 select pg_get_functiondef('public.autoreply_billing_entitlement(text)'::regprocedure) into definition;
 definition:=replace(definition, '''source'',''database''',
   '''source'',''database'',''baseMessageLimit'',p.total_messages,''baseAiLimit'',p.ai_replies,''freeBonusMessages'',case when carry then s.carry_messages else 0 end,''freeBonusAi'',case when carry then s.carry_ai else 0 end,''freeBonusExpiresAt'',case when carry then s.carry_expires_at else null end');
 execute definition;
end $$;
notify pgrst,'reload schema';
