-- Server environment policy, mirrored as hashes only. No email or owner ID is
-- hardcoded here. Browser roles cannot read or change the policy.
create schema if not exists autoreply_private;
revoke all on schema autoreply_private from public, anon, authenticated;
grant usage on schema autoreply_private to service_role;
create table autoreply_private.admin_allowlist (
 singleton boolean primary key default true check(singleton),
 email_hashes text[] not null default '{}',
 updated_at timestamptz not null default now()
);
alter table autoreply_private.admin_allowlist enable row level security;
revoke all on autoreply_private.admin_allowlist from public, anon, authenticated;
grant select, insert, update on autoreply_private.admin_allowlist to service_role;

create function public.autoreply_sync_admin_allowlist(p_email_hashes text[])
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_email_hashes is null or cardinality(p_email_hashes)>1000 or
   exists(select 1 from unnest(p_email_hashes) h where h is null or h !~ '^[a-f0-9]{64}$') then
   raise exception 'Invalid administrator policy';
 end if;
 insert into autoreply_private.admin_allowlist(singleton,email_hashes)
 values(true,array(select distinct h from unnest(p_email_hashes) h order by h))
 on conflict(singleton) do update set email_hashes=excluded.email_hashes,updated_at=now();
end $$;
revoke all on function public.autoreply_sync_admin_allowlist(text[]) from public,anon,authenticated;
grant execute on function public.autoreply_sync_admin_allowlist(text[]) to service_role;

-- A narrowly privileged, non-exposed helper is needed to read verified Auth
-- identity: service_role deliberately has no SELECT access to auth.users.
-- It returns one boolean, never user data. Client-editable profile/metadata
-- and the administrator who happens to be editing a customer are irrelevant.
create function autoreply_private.owner_is_administrator(p_workspace text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from auth.users u cross join autoreply_private.admin_allowlist a
   where u.id::text=public.autoreply_usage_owner(p_workspace)
     and (auth.uid() is null or auth.uid()=u.id)
     and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
     and encode(extensions.digest(lower(btrim(u.email)),'sha256'),'hex')=any(a.email_hashes)
 );
$$;
revoke all on function autoreply_private.owner_is_administrator(text) from public,anon,authenticated;
grant execute on function autoreply_private.owner_is_administrator(text) to service_role;

-- Preserve the deployed metered implementation, including existing carry
-- credits and purchased plans. Replace the original function in place so all
-- existing message, campaign, account and automation callers keep its OID.
do $$
declare definition text;
begin
 if to_regprocedure('public.autoreply_billing_entitlement_metered(text)') is not null then
   raise exception 'Administrator entitlement migration already installed';
 end if;
 select pg_get_functiondef('public.autoreply_billing_entitlement(text)'::regprocedure) into definition;
 definition:=replace(definition,'FUNCTION public.autoreply_billing_entitlement(', 'FUNCTION public.autoreply_billing_entitlement_metered(');
 execute definition;
end $$;
revoke all on function public.autoreply_billing_entitlement_metered(text) from public,anon,authenticated;
grant execute on function public.autoreply_billing_entitlement_metered(text) to service_role;

create or replace function public.autoreply_billing_entitlement(p_workspace_id text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare usage jsonb; ai_used integer; normal_used integer;
begin
 if autoreply_private.owner_is_administrator(p_workspace_id) then
   usage:=public.autoreply_get_usage(public.autoreply_usage_owner(p_workspace_id));
   ai_used:=greatest(0,coalesce((usage->>'ai_replies')::integer,0));
   normal_used:=greatest(0,coalesce((usage->>'total_messages')::integer,0)-ai_used);
   return jsonb_build_object('plan','administrator','planName','Administrator','unlimited',true,
     'normalUsed',normal_used,'totalUsed',normal_used,'aiUsed',ai_used,
     'normalLimit',null,'totalLimit',null,'aiLimit',null,'accounts',null,'automationLimit',null,
     'priceInr',0,'billingDays',null,'expiresAt',null,'renewal','none','source','database',
     'baseMessageLimit',null,'baseAiLimit',null,'freeBonusMessages',0,'freeBonusAi',0,'freeBonusExpiresAt',null);
 end if;
 return public.autoreply_billing_entitlement_metered(p_workspace_id)||jsonb_build_object('unlimited',false);
end $$;
revoke all on function public.autoreply_billing_entitlement(text) from public,anon,authenticated;
grant execute on function public.autoreply_billing_entitlement(text) to service_role;
-- Existing atomic quota reservations interpret a NULL allowance as uncapped,
-- while still deduplicating deliveries, recording usage and releasing failures.
notify pgrst,'reload schema';
