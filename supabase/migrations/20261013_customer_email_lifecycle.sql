-- Lifecycle email profile. Read/writes restricted to server service-role only.
-- Never infer marketing consent from signing in or purchasing.
create table if not exists public.autoreply_customer_email_lifecycle (
 user_id uuid primary key,
 email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 display_name text not null default 'Customer',
 marketing_opt_in boolean not null default false,
 unsubscribe_token uuid not null default gen_random_uuid() unique,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 welcome_sent_at timestamptz,
 welcome_claimed_at timestamptz,
 onboarding_stage smallint not null default 0 check (onboarding_stage between 0 and 4),
 onboarding_sent_at timestamptz,
 onboarding_claimed_at timestamptz,
 onboarding_attempts smallint not null default 0,
 updated_at timestamptz not null default now()
);
create index if not exists autoreply_customer_email_lifecycle_due_idx
 on public.autoreply_customer_email_lifecycle(last_seen_at)
 where marketing_opt_in=true and onboarding_stage<4;
alter table public.autoreply_customer_email_lifecycle enable row level security;
revoke all on public.autoreply_customer_email_lifecycle from public,anon,authenticated;
grant select,insert,update,delete on public.autoreply_customer_email_lifecycle to service_role;

-- Atomic touch does not reset onboarding sequence or consent.
create or replace function public.autoreply_touch_email_lifecycle(p_user_id uuid,p_email text,p_name text)
returns public.autoreply_customer_email_lifecycle
language plpgsql security invoker set search_path=public
as $$
declare profile public.autoreply_customer_email_lifecycle;
begin
 if length(trim(p_email))>200 or length(trim(p_email))<5 then
   raise exception 'Invalid email';
 end if;
 insert into public.autoreply_customer_email_lifecycle(user_id,email,display_name)
 values (p_user_id,lower(trim(p_email)),left(coalesce(nullif(trim(p_name),''),'Customer'),100))
 on conflict (user_id) do update
   set email=excluded.email,display_name=excluded.display_name,
   last_seen_at=now(),updated_at=now();
 select * into profile from public.autoreply_customer_email_lifecycle where user_id=p_user_id;
 return profile;
end $$;
revoke all on function public.autoreply_touch_email_lifecycle(uuid,text,text) from public,anon,authenticated;
grant execute on function public.autoreply_touch_email_lifecycle(uuid,text,text) to service_role;

create or replace function public.autoreply_claim_welcome_email(p_user_id uuid)
returns boolean language plpgsql security invoker set search_path=public
as $$
declare changed integer;
begin
 update public.autoreply_customer_email_lifecycle set welcome_claimed_at=now()
 where user_id=p_user_id and welcome_sent_at is null
   and (welcome_claimed_at is null or welcome_claimed_at<now()-interval '30 minutes');
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.autoreply_claim_welcome_email(uuid) from public,anon,authenticated;
grant execute on function public.autoreply_claim_welcome_email(uuid) to service_role;

-- 4 messages: 3, 6, 9, 12 days of inactivity, in order.
-- Each send requires explicit marketing_opt_in and a durable lock.
create or replace function public.autoreply_claim_onboarding_emails(p_limit integer default 10)
returns table(user_id uuid,email text,display_name text,unsubscribe_token uuid,onboarding_stage smallint)
language plpgsql security invoker set search_path=public
as $$
begin
 return query
 with due as (
   select l.user_id from public.autoreply_customer_email_lifecycle l
   where l.marketing_opt_in and l.onboarding_stage<4
     and l.last_seen_at <= now()-make_interval(days:=3*(l.onboarding_stage+1))
     and (l.onboarding_sent_at is null or l.onboarding_sent_at<=now()-interval '48 hours')
     and (l.onboarding_claimed_at is null or l.onboarding_claimed_at<=now()-interval '30 minutes')
     and l.onboarding_attempts < 5
   order by l.last_seen_at asc
   limit least(greatest(p_limit,1),10)
   for update skip locked
 )
 update public.autoreply_customer_email_lifecycle l
 set onboarding_claimed_at=now(),onboarding_attempts=l.onboarding_attempts+1
 from due d where l.user_id=d.user_id
 returning l.user_id,l.email,l.display_name,l.unsubscribe_token,l.onboarding_stage;
end $$;
revoke all on function public.autoreply_claim_onboarding_emails(integer) from public,anon,authenticated;
grant execute on function public.autoreply_claim_onboarding_emails(integer) to service_role;

-- Do not send a claimed campaign if a customer has visited/opted out since claim.
create or replace function public.autoreply_complete_onboarding_email(
 p_user_id uuid,p_stage smallint,p_claimed_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public
as $$
declare changed integer;
begin
 update public.autoreply_customer_email_lifecycle l
 set onboarding_stage=l.onboarding_stage+1,onboarding_sent_at=now(),
     onboarding_claimed_at=null,onboarding_attempts=0,updated_at=now()
 where l.user_id=p_user_id and l.marketing_opt_in and l.onboarding_stage=p_stage
 and l.onboarding_claimed_at=p_claimed_at;
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.autoreply_complete_onboarding_email(uuid,smallint,timestamptz) from public,anon,authenticated;
grant execute on function public.autoreply_complete_onboarding_email(uuid,smallint,timestamptz) to service_role;
