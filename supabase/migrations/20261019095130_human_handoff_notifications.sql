create table public.autoreply_human_handoffs(
 id uuid primary key default gen_random_uuid(), workspace_id text not null, sender_id text not null,
 username text not null default '', automation_id text not null default '', automation_name text not null default '',
 reason text not null, summary text not null, source_message_id text not null,
 status text not null default 'waiting' check(status in ('waiting','in_progress','resumed')),
 assigned_to uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resumed_at timestamptz
);
create unique index handoff_one_open_thread on public.autoreply_human_handoffs(workspace_id,sender_id) where status<>'resumed';
create unique index handoff_source_event on public.autoreply_human_handoffs(workspace_id,source_message_id);
create index handoff_queue_status on public.autoreply_human_handoffs(status,created_at desc);
create index handoff_inbox_thread on public.autoreply_documents(user_id,(data->>'from_ig_id'),created_at desc) where collection='inbox_messages';
alter table public.autoreply_human_handoffs enable row level security;
revoke all on public.autoreply_human_handoffs from public,anon,authenticated;
grant select,insert,update on public.autoreply_human_handoffs to service_role;
create policy handoff_service_only on public.autoreply_human_handoffs for all to service_role using(true) with check(true);

-- Owner controls stay writable through existing workspace authorization. This
-- private trigger preserves handoff metadata during manual replies and closes
-- notifications only on an explicit Resume AI. Incoming DMs never write false.
create function autoreply_private.guard_handoff_control() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
   if OLD.collection='ai_thread_controls' and OLD.data->'paused'='true'::jsonb and OLD.data->'human_handoff'='true'::jsonb then raise exception 'Resume AI explicitly before removing a human handoff control';end if;
   return OLD;
 end if;
 if NEW.collection<>'ai_thread_controls' then return NEW;end if;
 if auth.uid() is not null and public.autoreply_usage_owner(NEW.user_id)<>auth.uid()::text then raise exception 'Conversation ownership required';end if;
 if TG_OP='UPDATE' then NEW.data:=OLD.data||NEW.data;end if;
 NEW.data:=NEW.data||jsonb_build_object('updated_at',to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 if NEW.data->'paused'='false'::jsonb then
   NEW.data:=NEW.data||jsonb_build_object('human_handoff',false);
   update public.autoreply_human_handoffs set status='resumed',resumed_at=now(),updated_at=now() where workspace_id=NEW.user_id and sender_id=NEW.id and status<>'resumed';
   update public.autoreply_documents set data=data||'{"status":"resumed"}'::jsonb where user_id=NEW.user_id and collection='workspace_notices' and data->>'type'='human_handoff' and data->>'sender_id'=NEW.id;
 end if;
 return NEW;
end $$;
revoke all on function autoreply_private.guard_handoff_control() from public,anon,authenticated;
create trigger handoff_control_guard before insert or update or delete on public.autoreply_documents for each row execute function autoreply_private.guard_handoff_control();

create function public.autoreply_request_human_handoff(p_workspace text,p_sender text,p_automation_id text,p_automation_name text,p_reason text,p_summary text,p_message_id text,p_expected_version text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare control jsonb; existing public.autoreply_human_handoffs%rowtype; request_id uuid; username text;
begin
 if p_workspace is null or p_sender !~ '^\d{5,30}$' or nullif(p_message_id,'') is null or p_reason not in ('customer_requested','needs_staff','prompt_rule','ai_limit_reached') then raise exception 'Invalid handoff request';end if;
 perform pg_advisory_xact_lock(hashtextextended('handoff:'||p_workspace||':'||p_sender,0));
 select * into existing from public.autoreply_human_handoffs where workspace_id=p_workspace and (source_message_id=p_message_id or (sender_id=p_sender and status<>'resumed')) order by created_at desc limit 1;
 if found then return jsonb_build_object('ok',true,'created',false,'id',existing.id,'paused',existing.status<>'resumed');end if;
 select data into control from public.autoreply_documents where user_id=p_workspace and collection='ai_thread_controls' and id=p_sender for update;
 if p_expected_version is not null and coalesce(control->>'updated_at','')<>p_expected_version then return jsonb_build_object('ok',true,'created',false,'superseded',true);end if;
 select coalesce(data->>'ig_username',p_sender) into username from public.autoreply_documents where user_id=p_workspace and collection='contacts' and (data->>'ig_user_id'=p_sender or id=p_sender) limit 1;
 insert into public.autoreply_human_handoffs(workspace_id,sender_id,username,automation_id,automation_name,reason,summary,source_message_id)
 values(p_workspace,p_sender,coalesce(username,p_sender),left(coalesce(p_automation_id,''),150),left(coalesce(p_automation_name,''),120),p_reason,left(coalesce(nullif(p_summary,''),'Human assistance requested'),500),left(p_message_id,250)) returning id into request_id;
 insert into public.autoreply_documents(user_id,collection,id,data) values(p_workspace,'ai_thread_controls',p_sender,
 coalesce(control,'{}')||jsonb_build_object('sender_id',p_sender,'username',coalesce(username,p_sender),'paused',true,'human_handoff',true,'handoff_id',request_id,'handoff_reason',p_reason,'handoff_summary',left(coalesce(p_summary,''),500)))
 on conflict(user_id,collection,id) do update set data=excluded.data;
 insert into public.autoreply_documents(user_id,collection,id,data) values(p_workspace,'workspace_notices','handoff_'||request_id::text,
 jsonb_build_object('type','human_handoff','handoff_id',request_id,'sender_id',p_sender,'title','Human handoff requested','message',left(coalesce(p_summary,''),500),'status','waiting','created_at',now()));
 return jsonb_build_object('ok',true,'created',true,'paused',true,'id',request_id);
end $$;

create function public.autoreply_set_thread_control(p_workspace text,p_sender text,p_paused boolean,p_username text default '',p_handoff_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare control jsonb;
begin
 if p_sender !~ '^\d{5,30}$' or p_paused is null then raise exception 'Invalid conversation control';end if;
 perform pg_advisory_xact_lock(hashtextextended('handoff:'||p_workspace||':'||p_sender,0));
 if p_handoff_id is not null and not exists(select 1 from public.autoreply_human_handoffs where id=p_handoff_id and workspace_id=p_workspace and sender_id=p_sender and status<>'resumed') then raise exception 'This handoff has already been resumed';end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values(p_workspace,'ai_thread_controls',p_sender,jsonb_build_object('sender_id',p_sender,'username',left(p_username,100),'paused',p_paused))
 on conflict(user_id,collection,id) do update set data=autoreply_documents.data||excluded.data returning data into control;
 if p_paused then update public.autoreply_human_handoffs set status='in_progress',updated_at=now() where workspace_id=p_workspace and sender_id=p_sender and status<>'resumed';end if;
 return control||jsonb_build_object('id',p_sender);
end $$;

-- Preserve the current prepare implementation (including campaigns and all
-- billing checks), then add durable thread state and prompt context.
do $$declare definition text;begin
 select pg_get_functiondef('public.autoreply_prepare_automation_event(text[],text,text)'::regprocedure) into definition;
 execute replace(definition,'FUNCTION public.autoreply_prepare_automation_event(', 'FUNCTION public.autoreply_prepare_automation_event_before_handoff(');
end $$;
create or replace function public.autoreply_prepare_automation_event(p_candidates text[],p_message_id text,p_sender_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare context jsonb; control jsonb; reply_count integer;
begin
 context:=public.autoreply_prepare_automation_event_before_handoff(p_candidates,p_message_id,p_sender_id);
 if context->>'user_id' is null then return context;end if;
 select data into control from public.autoreply_documents where user_id=context->>'user_id' and collection='ai_thread_controls' and id=p_sender_id;
 select count(*) into reply_count from public.autoreply_documents where user_id=context->>'user_id' and collection='inbox_messages' and data->>'from_ig_id'=p_sender_id and data->>'direction'='out' and data->'is_automated'='true'::jsonb;
 return context||jsonb_build_object('thread_control_version',coalesce(control->>'updated_at',''),'thread_human_handoff',coalesce(control->'paused'='true'::jsonb and control->'human_handoff'='true'::jsonb,false),'thread_automated_reply_count',reply_count);
end $$;

-- A handoff also suppresses keyword/static automation in the same thread;
-- manual sends never use this automatic-delivery reservation.
do $$declare definition text;begin
 select pg_get_functiondef('public.autoreply_reserve_automation_delivery(text,text,boolean,text,text)'::regprocedure) into definition;
 execute replace(definition,'if p_is_ai and exists','if exists');
 -- The old condition now blocks all automation for manual AI pause as well:
 -- human takeover must never be interrupted by a matching keyword reply.
end $$;

revoke all on function public.autoreply_request_human_handoff(text,text,text,text,text,text,text,text),public.autoreply_set_thread_control(text,text,boolean,text,uuid),public.autoreply_prepare_automation_event_before_handoff(text[],text,text) from public,anon,authenticated;
grant execute on function public.autoreply_request_human_handoff(text,text,text,text,text,text,text,text),public.autoreply_set_thread_control(text,text,boolean,text,uuid),public.autoreply_prepare_automation_event_before_handoff(text[],text,text) to service_role;
notify pgrst,'reload schema';

create function public.autoreply_reserve_thread_delivery(p_workspace_id text,p_delivery_key text,p_is_ai boolean,p_automation_id text,p_sender_id text,p_control_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare version text;
begin
 perform pg_advisory_xact_lock(hashtextextended('handoff:'||p_workspace_id||':'||p_sender_id,0));
 select data->>'updated_at' into version from public.autoreply_documents where user_id=p_workspace_id and collection='ai_thread_controls' and id=p_sender_id;
 if coalesce(version,'') is distinct from p_control_version then return jsonb_build_object('allowed',false,'reason','conversation_control_changed');end if;
 return public.autoreply_reserve_automation_delivery(p_workspace_id,p_delivery_key,p_is_ai,p_automation_id,p_sender_id);
end $$;
create function public.autoreply_handoff_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('openCount',count(*) filter(where status<>'resumed'),'waitingCount',count(*) filter(where status='waiting')) from public.autoreply_human_handoffs;
$$;
revoke all on function public.autoreply_reserve_thread_delivery(text,text,boolean,text,text,text),public.autoreply_handoff_summary() from public,anon,authenticated;
grant execute on function public.autoreply_reserve_thread_delivery(text,text,boolean,text,text,text),public.autoreply_handoff_summary() to service_role;
notify pgrst,'reload schema';
