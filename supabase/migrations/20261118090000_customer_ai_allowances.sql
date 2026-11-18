create table public.autoreply_ai_allowance_history (
 id bigint generated always as identity primary key,
 owner_id text not null,
 actor_id uuid not null,
 mode text not null check (mode in ('plan','custom','once','extra','unlimited','off')),
 reply_limit integer,
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 check ((mode in ('custom','once','extra') and reply_limit is not null and reply_limit >= 0)
     or (mode not in ('custom','once','extra') and reply_limit is null))
);
create index on public.autoreply_ai_allowance_history(owner_id,id desc);
alter table public.autoreply_ai_allowance_history enable row level security;
revoke all on public.autoreply_ai_allowance_history from public,anon,authenticated;
grant insert,select on public.autoreply_ai_allowance_history to service_role;

alter function public.autoreply_billing_entitlement(text) rename to autoreply_plan_entitlement;
create function public.autoreply_billing_entitlement(p_workspace_id text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 base jsonb := public.autoreply_plan_entitlement(p_workspace_id);
 adjustment public.autoreply_ai_allowance_history%rowtype;
begin
 select * into adjustment from public.autoreply_ai_allowance_history
 where owner_id=public.autoreply_usage_owner(p_workspace_id) and (mode<>'extra' or expires_at>now()) order by id desc limit 1;
 if not found or adjustment.mode='plan' or adjustment.expires_at <= now() then return base; end if;
 if adjustment.mode='once' then
  base:=base || jsonb_build_object('aiUsed',(select count(*) from public.autoreply_delivery_quota_reservations
   where owner_user_id=adjustment.owner_id and is_ai and state in ('sent','reserved') and created_at>=adjustment.created_at));
 end if;
 return base || jsonb_build_object('aiAllowanceMode',adjustment.mode,'aiAllowanceExpiresAt',adjustment.expires_at,
 'aiLimit',case when adjustment.mode='off' then 0 else adjustment.reply_limit end);
end $$;
revoke all on function public.autoreply_billing_entitlement(text) from public,anon,authenticated;
grant execute on function public.autoreply_billing_entitlement(text) to service_role;
notify pgrst,'reload schema';
create function public.autoreply_support_change(p_workspace text,p_actor uuid,p_email text,p_collection text,p_record jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if p_collection in ('catalogs','catalog_products') then
  insert into public.autoreply_documents(user_id,collection,id,data)
  values(p_workspace,p_collection,p_record->>'id',p_record)
  on conflict(user_id,collection,id) do update set data=excluded.data,updated_at=now();
 elsif p_collection <> 'note' then raise exception 'Invalid collection'; end if;
 insert into public.autoreply_admin_audit_logs(admin_user_id,admin_email,action,entity_type,entity_id,after_data)
 values(p_actor,p_email,p_collection,'support_workspace',p_workspace,case when p_collection='note' then p_record else jsonb_build_object('id',p_record->>'id','name',p_record->>'name') end);
 return '{"ok":true}'::jsonb;
end $$;
revoke all on function public.autoreply_support_change(text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.autoreply_support_change(text,uuid,text,text,jsonb) to service_role;

create function public.autoreply_set_ai_allowance(p_workspace text,p_actor uuid,p_mode text,p_limit integer,p_expires timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner text:=public.autoreply_usage_owner(p_workspace); entitlement jsonb; amount integer:=p_limit;
begin
 perform pg_advisory_xact_lock(hashtextextended('quota:'||owner,0));
 if p_mode='extra' then
  entitlement:=public.autoreply_billing_entitlement(owner);
  if entitlement->>'aiLimit' is null then raise exception 'Current allowance is unlimited';end if;
  if entitlement->>'aiAllowanceMode'='once' then raise exception 'Choose a new one-time allowance or a monthly limit';end if;
  if p_limit is null or p_limit<1 then raise exception 'Enter a positive top-up';end if;
  amount:=greatest((entitlement->>'aiLimit')::integer,(entitlement->>'aiUsed')::integer)+p_limit;

  p_expires:=least(coalesce(p_expires,'infinity'),(date_trunc('month',now() at time zone 'UTC')+interval '1 month') at time zone 'UTC');
 end if;
 insert into public.autoreply_ai_allowance_history(owner_id,actor_id,mode,reply_limit,expires_at)
 values(owner,p_actor,p_mode,amount,p_expires);
 return '{"ok":true}'::jsonb;
end $$;
revoke all on function public.autoreply_set_ai_allowance(text,uuid,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.autoreply_set_ai_allowance(text,uuid,text,integer,timestamptz) to service_role;
