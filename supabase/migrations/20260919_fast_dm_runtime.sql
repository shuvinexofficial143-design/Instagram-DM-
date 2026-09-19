-- Supabase-only fast path for Instagram DM automation.
-- Keeps hot account + active automation context in one row and uses small,
-- indexed tables for dedupe, conversation history, and exact reply caching.

create table if not exists public.autoreply_runtime_context (
  ig_user_id text primary key,
  user_id text not null unique,
  account jsonb not null default '{}'::jsonb,
  automation_id text,
  automation jsonb,
  updated_at timestamptz not null default now()
);

alter table public.autoreply_runtime_context enable row level security;
create index if not exists autoreply_runtime_context_user_idx
  on public.autoreply_runtime_context(user_id);

create table if not exists public.autoreply_pending_outbound (
  user_id text not null,
  text_key text not null,
  recipient_id text not null,
  expires_at timestamptz not null default (now() + interval '10 seconds'),
  created_at timestamptz not null default now(),
  primary key (user_id, text_key, recipient_id)
);

alter table public.autoreply_pending_outbound enable row level security;
create index if not exists autoreply_pending_outbound_lookup_idx
  on public.autoreply_pending_outbound(user_id, text_key, expires_at desc);
create index if not exists autoreply_pending_outbound_expiry_idx
  on public.autoreply_pending_outbound(expires_at);

create or replace function public.autoreply_refresh_runtime_context(p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.autoreply_runtime_context
  where user_id = p_user_id;

  insert into public.autoreply_runtime_context(
    ig_user_id,user_id,account,automation_id,automation,updated_at
  )
  select
    t.account->>'ig_user_id',
    t.user_id,
    t.account,
    a.automation_id,
    a.data,
    now()
  from public.autoreply_instagram_tokens t
  left join public.autoreply_active_automations a
    on a.user_id=t.user_id
  where t.user_id=p_user_id
    and nullif(t.account->>'ig_user_id','') is not null
    and nullif(t.account->>'access_token','') is not null
  on conflict(ig_user_id) do update
  set user_id=excluded.user_id,
      account=excluded.account,
      automation_id=excluded.automation_id,
      automation=excluded.automation,
      updated_at=excluded.updated_at;
end;
$$;

create or replace function public.autoreply_runtime_context_token_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.autoreply_refresh_runtime_context(
    case when tg_op='DELETE' then old.user_id else new.user_id end
  );
  return null;
end;
$$;

create or replace function public.autoreply_runtime_context_automation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
begin
  v_user_id := case when tg_op='DELETE' then old.user_id else new.user_id end;
  delete from public.autoreply_reply_cache where user_id=v_user_id;
  perform public.autoreply_refresh_runtime_context(v_user_id);
  return null;
end;
$$;

drop trigger if exists autoreply_runtime_context_tokens_trg
  on public.autoreply_instagram_tokens;
create trigger autoreply_runtime_context_tokens_trg
after insert or update or delete on public.autoreply_instagram_tokens
for each row execute function public.autoreply_runtime_context_token_trigger();

drop trigger if exists autoreply_runtime_context_automation_trg
  on public.autoreply_active_automations;
create trigger autoreply_runtime_context_automation_trg
after insert or update or delete on public.autoreply_active_automations
for each row execute function public.autoreply_runtime_context_automation_trigger();

create or replace function public.autoreply_mark_pending_outbound(
  p_user_id text,
  p_text_key text,
  p_recipient_id text
)
returns void
language sql
security definer
set search_path=public
as $$
  insert into public.autoreply_pending_outbound(
    user_id,text_key,recipient_id,expires_at
  )
  values(
    p_user_id,p_text_key,p_recipient_id,now()+interval '10 seconds'
  )
  on conflict(user_id,text_key,recipient_id) do update
  set expires_at=excluded.expires_at;
$$;

create or replace function public.autoreply_claim_message_only(
  p_user_id text,
  p_message_id text,
  p_query_key text,
  p_sender_id text
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_inserted integer := 0;
  v_direction text;
  v_pending_recipient text;
begin
  if nullif(p_query_key,'') is not null then
    select p.recipient_id into v_pending_recipient
    from public.autoreply_pending_outbound p
    where p.user_id=p_user_id
      and p.text_key=p_query_key
      and p.expires_at>now()
      and p.recipient_id<>coalesce(p_sender_id,'')
    order by p.expires_at desc
    limit 1;
  end if;

  if v_pending_recipient is not null then
    if nullif(p_message_id,'') is not null then
      insert into public.autoreply_message_claims(
        user_id,message_id,direction,status,expires_at
      )
      values(
        p_user_id,p_message_id,'out','echo',now()+interval '30 minutes'
      )
      on conflict(user_id,message_id) do update
      set direction='out',status='echo',expires_at=excluded.expires_at;
    end if;
    return 'outbound_echo';
  end if;

  if nullif(p_message_id,'') is null then return 'new'; end if;

  insert into public.autoreply_message_claims(
    user_id,message_id,direction,status,expires_at
  )
  values(
    p_user_id,p_message_id,'in','received',now()+interval '30 minutes'
  )
  on conflict(user_id,message_id) do nothing;

  get diagnostics v_inserted=row_count;
  if v_inserted>0 then return 'new'; end if;

  select direction into v_direction
  from public.autoreply_message_claims
  where user_id=p_user_id and message_id=p_message_id;

  return case when v_direction='out' then 'outbound_echo' else 'duplicate' end;
end;
$$;

create or replace function public.autoreply_claim_dm_context_v4(
  p_candidates text[],
  p_message_id text,
  p_query_key text,
  p_sender_id text,
  p_include_history boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user_id text;
  v_account jsonb;
  v_automation_id text;
  v_automation jsonb;
  v_cached_reply text;
  v_history jsonb := '[]'::jsonb;
  v_message_state text := 'new';
begin
  select r.user_id,r.account,r.automation_id,r.automation
  into v_user_id,v_account,v_automation_id,v_automation
  from public.autoreply_runtime_context r
  where r.ig_user_id=any(p_candidates)
  limit 1;

  if v_user_id is null then
    select r.user_id,r.account,r.automation_id,r.automation
    into v_user_id,v_account,v_automation_id,v_automation
    from public.autoreply_runtime_context r
    where (select count(*) from public.autoreply_runtime_context)=1
    limit 1;
  end if;

  if v_user_id is null then return null; end if;

  v_message_state := public.autoreply_claim_message_only(
    v_user_id,p_message_id,p_query_key,p_sender_id
  );

  if v_message_state='new'
     and v_automation_id is not null
     and nullif(p_query_key,'') is not null then
    select response_text into v_cached_reply
    from public.autoreply_reply_cache
    where user_id=v_user_id
      and automation_id=v_automation_id
      and query_key=p_query_key
      and expires_at>now()
    limit 1;
  end if;

  if p_include_history
     and v_message_state='new'
     and v_cached_reply is null
     and nullif(p_sender_id,'') is not null then
    select messages into v_history
    from public.autoreply_dm_history
    where user_id=v_user_id and sender_id=p_sender_id;
    v_history := coalesce(v_history,'[]'::jsonb);
  end if;

  return jsonb_build_object(
    'user_id',v_user_id,
    'account',v_account,
    'automation',
      case when v_automation_id is null then null
           else coalesce(v_automation,'{}'::jsonb)
             || jsonb_build_object('id',v_automation_id)
      end,
    'cached_reply',v_cached_reply,
    'history',v_history,
    'message_state',v_message_state
  );
end;
$$;

revoke all on function public.autoreply_claim_dm_context_v4(text[],text,text,text,boolean) from public;
grant execute on function public.autoreply_claim_dm_context_v4(text[],text,text,text,boolean) to service_role;
revoke all on function public.autoreply_claim_message_only(text,text,text,text) from public;
grant execute on function public.autoreply_claim_message_only(text,text,text,text) to service_role;
revoke all on function public.autoreply_mark_pending_outbound(text,text,text) from public;
grant execute on function public.autoreply_mark_pending_outbound(text,text,text) to service_role;
revoke all on function public.autoreply_refresh_runtime_context(text) from public;
grant execute on function public.autoreply_refresh_runtime_context(text) to service_role;

insert into public.autoreply_runtime_context(
  ig_user_id,user_id,account,automation_id,automation,updated_at
)
select
  t.account->>'ig_user_id',
  t.user_id,
  t.account,
  a.automation_id,
  a.data,
  now()
from public.autoreply_instagram_tokens t
left join public.autoreply_active_automations a on a.user_id=t.user_id
where nullif(t.account->>'ig_user_id','') is not null
  and nullif(t.account->>'access_token','') is not null
on conflict(ig_user_id) do update
set user_id=excluded.user_id,
    account=excluded.account,
    automation_id=excluded.automation_id,
    automation=excluded.automation,
    updated_at=excluded.updated_at;
