-- Additive memory: original message documents remain the source of truth.
create sequence public.autoreply_memory_sequence;
alter table public.autoreply_documents add column memory_seq bigint;
alter table public.autoreply_documents add column message_time timestamptz generated always as
 (coalesce(public.autoreply_campaign_message_time(data->>'timestamp'),created_at)) stored;
with ordered as (select user_id,collection,id,nextval('public.autoreply_memory_sequence') seq
 from public.autoreply_documents where collection='inbox_messages' order by message_time,id)
update public.autoreply_documents d set memory_seq=o.seq from ordered o
 where (d.user_id,d.collection,d.id)=(o.user_id,o.collection,o.id);
create index memory_message_incremental on public.autoreply_documents(user_id,(data->>'from_ig_id'),memory_seq) where collection='inbox_messages';
create index memory_message_timeline on public.autoreply_documents(user_id,(data->>'from_ig_id'),message_time desc,id desc) where collection='inbox_messages';
create index memory_inbox_page on public.autoreply_documents(user_id,message_time desc,id desc) where collection='inbox_messages';
create index memory_message_search on public.autoreply_documents using gin(to_tsvector('simple',coalesce(data->>'message_text',''))) where collection='inbox_messages';

create table public.autoreply_memory_settings (
 workspace_id text primary key, enabled boolean not null default true,
 recent_limit integer not null default 12 check(recent_limit between 6 and 20),
 summary_threshold integer not null default 10 check(summary_threshold between 8 and 12),
 input_token_budget integer not null default 32768 check(input_token_budget between 8192 and 65536),
 summary_max_chars integer not null default 1600 check(summary_max_chars between 400 and 2400),
 updated_at timestamptz not null default now()
);
create table public.autoreply_customer_memory (
 workspace_id text not null, account_id text not null, conversation_id text not null,
 summary text not null default '' check(length(summary)<=2400), facts jsonb not null default '{}' check(jsonb_typeof(facts)='object'),
 lead_state jsonb not null default '{}' check(jsonb_typeof(lead_state)='object'),
 summary_checkpoint bigint not null default 0, version bigint not null default 0,
 summary_at timestamptz, updated_at timestamptz not null default now(),
 primary key(workspace_id,account_id,conversation_id)
);
create table public.autoreply_memory_jobs (
 workspace_id text not null, account_id text not null, conversation_id text not null,
 sender_id text not null, requested_seq bigint not null, processed_seq bigint not null default 0,
 status text not null default 'pending' check(status in ('pending','processing','idle','dead')),
 lease_id uuid, locked_until timestamptz, attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(), last_error text, updated_at timestamptz not null default now(),
 input_tokens bigint not null default 0, output_tokens bigint not null default 0, provider_calls bigint not null default 0,
 last_processing_ms integer, primary key(workspace_id,account_id,conversation_id)
);
create index memory_jobs_due on public.autoreply_memory_jobs(next_attempt_at) where status in ('pending','processing');
alter table public.autoreply_memory_settings enable row level security;
alter table public.autoreply_customer_memory enable row level security;
alter table public.autoreply_memory_jobs enable row level security;
revoke all on public.autoreply_memory_settings,public.autoreply_customer_memory,public.autoreply_memory_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.autoreply_memory_settings,public.autoreply_customer_memory,public.autoreply_memory_jobs to service_role;
grant select,insert,update on public.autoreply_memory_settings to authenticated;
grant select on public.autoreply_customer_memory,public.autoreply_memory_jobs to authenticated;
create function public.autoreply_memory_can_access(p_workspace text) returns boolean language sql stable security invoker set search_path='' as $$
 select (select auth.uid()) is not null and (p_workspace=(select auth.uid())::text or p_workspace in
  (select workspace_id from public.autoreply_instagram_memberships where owner_user_id=(select auth.uid())::text));
$$;
create policy memory_settings_read on public.autoreply_memory_settings for select to authenticated using(public.autoreply_memory_can_access(workspace_id));
create policy memory_settings_insert on public.autoreply_memory_settings for insert to authenticated with check(public.autoreply_memory_can_access(workspace_id));
create policy memory_settings_update on public.autoreply_memory_settings for update to authenticated using(public.autoreply_memory_can_access(workspace_id)) with check(public.autoreply_memory_can_access(workspace_id));
create policy customer_memory_read on public.autoreply_customer_memory for select to authenticated using(public.autoreply_memory_can_access(workspace_id));
create policy memory_jobs_read on public.autoreply_memory_jobs for select to authenticated using(public.autoreply_memory_can_access(workspace_id));

create function public.autoreply_memory_identity(p_workspace text,p_sender text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare account text; c record; aliases text[];
begin
 select ig_user_id into account from public.autoreply_instagram_memberships where workspace_id=p_workspace;
 select id,data into c from public.autoreply_documents where user_id=p_workspace and collection='contacts'
  and (id=p_sender or data->>'ig_user_id'=p_sender or coalesce(data->'ig_user_ids','[]'::jsonb) ? p_sender)
  order by created_at,id limit 1;
 select array_agg(distinct value) into aliases from jsonb_array_elements_text(
  jsonb_build_array(p_sender,c.id,c.data->>'ig_user_id')||coalesce(c.data->'ig_user_ids','[]'::jsonb)) value where nullif(value,'') is not null;
 return jsonb_build_object('account_id',account,'conversation_id',coalesce(c.id,p_sender),'aliases',to_jsonb(coalesce(aliases,array[p_sender])));
end $$;
create function public.autoreply_enqueue_memory(p_workspace text,p_sender text,p_seq bigint) returns void language plpgsql security invoker set search_path='' as $$
declare identity jsonb;
begin
 if not coalesce((select enabled from public.autoreply_memory_runtime where id=1),true) then return;end if;
 if p_seq is null or coalesce((select not enabled from public.autoreply_memory_settings where workspace_id=p_workspace),false) then return;end if;
 identity:=public.autoreply_memory_identity(p_workspace,p_sender);
 if identity->>'account_id' is null then return;end if;
 insert into public.autoreply_memory_jobs(workspace_id,account_id,conversation_id,sender_id,requested_seq)
 values(p_workspace,identity->>'account_id',identity->>'conversation_id',p_sender,p_seq)
 on conflict(workspace_id,account_id,conversation_id) do update set requested_seq=greatest(autoreply_memory_jobs.requested_seq,excluded.requested_seq),
  sender_id=excluded.sender_id,status=case when autoreply_memory_jobs.status in ('processing','dead') then autoreply_memory_jobs.status else 'pending' end,
  next_attempt_at=case when autoreply_memory_jobs.status in ('processing','dead') then autoreply_memory_jobs.next_attempt_at else now() end,updated_at=now();
end $$;
-- Sequence assignment occurs AFTER the per-conversation lock, so a later committed
-- message cannot move a checkpoint past an earlier uncommitted insert.
create function public.autoreply_memory_message_before() returns trigger language plpgsql security definer set search_path='' as $$
declare identity jsonb;
begin
 if new.collection<>'inbox_messages' then return new;end if;
 if tg_op='UPDATE' and old.memory_seq is not null and
  (old.data->>'message_text',old.data->>'direction',coalesce(old.data->>'delivery_status','sent')) is not distinct from
  (new.data->>'message_text',new.data->>'direction',coalesce(new.data->>'delivery_status','sent')) then new.memory_seq:=old.memory_seq;return new;end if;
 identity:=public.autoreply_memory_identity(new.user_id,new.data->>'from_ig_id');
 perform pg_advisory_xact_lock(hashtextextended('memory:'||new.user_id||':'||coalesce(identity->>'conversation_id',''),0));
 new.memory_seq:=nextval('public.autoreply_memory_sequence');return new;
end $$;
create function public.autoreply_memory_message_after() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.collection='inbox_messages' and (tg_op='INSERT' or new.memory_seq is distinct from old.memory_seq)
  and coalesce(new.data->>'is_test','false')<>'true' and coalesce(new.data->>'delivery_status','sent')='sent'
  and new.data->>'direction' in ('in','out') and nullif(new.data->>'from_ig_id','') is not null then
  begin perform public.autoreply_enqueue_memory(new.user_id,new.data->>'from_ig_id',new.memory_seq);
  exception when others then raise log 'autoreply_memory_enqueue_failed SQLSTATE=%',sqlstate;end;
 end if;
 return new;
end $$;
create trigger memory_message_before before insert or update on public.autoreply_documents for each row execute function public.autoreply_memory_message_before();
create trigger memory_message_after after insert or update on public.autoreply_documents for each row execute function public.autoreply_memory_message_after();

create function public.autoreply_claim_memory_jobs(p_limit integer default 3) returns setof public.autoreply_memory_jobs language plpgsql security invoker set search_path='' as $$
begin
 update public.autoreply_memory_jobs set status='dead',last_error='lease_expired',lease_id=null where status='processing' and locked_until<now() and attempts>=5;
 return query with candidates as (select j.workspace_id,j.account_id,j.conversation_id from public.autoreply_memory_jobs j
  where ((j.status='pending' and j.next_attempt_at<=now()) or (j.status='processing' and j.locked_until<now())) and j.attempts<5
   and coalesce((select enabled from public.autoreply_memory_settings where workspace_id=j.workspace_id),true)
  order by j.next_attempt_at for update skip locked limit least(greatest(p_limit,1),5))
 update public.autoreply_memory_jobs j set status='processing',lease_id=gen_random_uuid(),locked_until=now()+interval '90 seconds',attempts=j.attempts+1
 from candidates c where (j.workspace_id,j.account_id,j.conversation_id)=(c.workspace_id,c.account_id,c.conversation_id) returning j.*;
end $$;
create function public.autoreply_memory_batch(p_workspace text,p_account text,p_conversation text,p_lease uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.autoreply_memory_jobs; m public.autoreply_customer_memory; identity jsonb; aliases text[]; batch jsonb; latest jsonb; cfg jsonb;
begin
 select * into j from public.autoreply_memory_jobs where (workspace_id,account_id,conversation_id)=(p_workspace,p_account,p_conversation)
  and status='processing' and lease_id=p_lease and locked_until>now();
 if not found then return null;end if;
 identity:=public.autoreply_memory_identity(p_workspace,j.sender_id);
 if identity->>'account_id' is distinct from p_account or identity->>'conversation_id' is distinct from p_conversation then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('memory:'||p_workspace||':'||p_conversation,0));
 select array_agg(value) into aliases from jsonb_array_elements_text(identity->'aliases') value;
 select * into m from public.autoreply_customer_memory where (workspace_id,account_id,conversation_id)=(p_workspace,p_account,p_conversation);
 select to_jsonb(s) into cfg from public.autoreply_memory_settings s where workspace_id=p_workspace;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'seq',memory_seq,'text',left(data->>'message_text',6000),'direction',data->>'direction',
  'is_automated',data->'is_automated','timestamp',message_time) order by memory_seq),'[]') into batch from (
   select * from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages' and data->>'from_ig_id'=any(aliases)
    and memory_seq>coalesce(m.summary_checkpoint,0) and memory_seq<=j.requested_seq and coalesce(data->>'delivery_status','sent')='sent'
    and coalesce(data->>'is_test','false')<>'true' order by memory_seq limit 30) b;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'seq',memory_seq,'text',left(data->>'message_text',6000),'direction',data->>'direction',
  'is_automated',data->'is_automated','timestamp',message_time) order by memory_seq),'[]') into latest from (
   select * from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages' and data->>'from_ig_id'=any(aliases)
    and memory_seq<=j.requested_seq and coalesce(data->>'delivery_status','sent')='sent' and coalesce(data->>'is_test','false')<>'true'
    order by memory_seq desc limit 12) b;
 return jsonb_build_object('job',to_jsonb(j),'memory',coalesce(to_jsonb(m),'{}'),'settings',coalesce(cfg,'{}'),'messages',batch,'latest',latest);
end $$;

create function public.autoreply_finish_memory_job(p_workspace text,p_account text,p_conversation text,p_lease uuid,p_version bigint,
 p_facts jsonb default '{}',p_summary text default null,p_summary_ids text[] default '{}',p_error text default '',p_usage jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.autoreply_memory_jobs; m public.autoreply_customer_memory; identity jsonb; aliases text[]; item record; src record;
 next_checkpoint bigint; pending integer; stage text; cfg public.autoreply_memory_settings;
begin
 perform pg_advisory_xact_lock(hashtextextended('memory:'||p_workspace||':'||p_conversation,0));
 select * into j from public.autoreply_memory_jobs where (workspace_id,account_id,conversation_id)=(p_workspace,p_account,p_conversation)
  and lease_id=p_lease and status='processing' and locked_until>now() for update;
 if not found then return jsonb_build_object('ok',false,'reason','stale_lease');end if;
 if coalesce((select not enabled from public.autoreply_memory_settings where workspace_id=p_workspace),false)
  or not coalesce((select enabled from public.autoreply_memory_runtime where id=1),true) then
  update public.autoreply_memory_jobs set status='pending',lease_id=null,next_attempt_at=now()+interval '5 minutes' where (workspace_id,account_id,conversation_id)=(p_workspace,p_account,p_conversation);
  return jsonb_build_object('ok',false,'reason','memory_disabled');end if;
 identity:=public.autoreply_memory_identity(p_workspace,j.sender_id);
 if identity->>'account_id' is distinct from p_account or identity->>'conversation_id' is distinct from p_conversation then
  update public.autoreply_memory_jobs set status='dead',last_error='identity_changed',lease_id=null where (workspace_id,account_id,conversation_id)=(p_workspace,p_account,p_conversation);
  return jsonb_build_object('ok',false,'reason','identity_changed');end if;
 select array_agg(value) into aliases from jsonb_array_elements_text(identity->'aliases') value;
 insert into public.autoreply_customer_memory(workspace_id,account_id,conversation_id) values(p_workspace,p_account,p_conversation) on conflict do nothing;
 select * into m from public.autoreply_customer_memory where (workspace_id,account_id,conversation_id)=(p_workspace,p_account,p_conversation) for update;
 if m.version<>p_version then
  update public.autoreply_memory_jobs set status='pending',lease_id=null,next_attempt_at=now() where (workspace_id,account_id,conversation_id)=(p_workspace,p_account,p_conversation);
  return jsonb_build_object('ok',false,'reason','version_conflict');end if;
 if jsonb_typeof(p_facts)<>'object' or octet_length(p_facts::text)>16000 then raise exception 'Invalid bounded facts';end if;
 for item in select key,value from jsonb_each(p_facts) loop
  if not(item.key=any(array['customer_name','business_name','business_category','requirements','problems','product_interest','budget','discussed_pricing',
   'preferences','commitments','pending_questions','last_topic','next_action','demo_request','order_details'])) then continue;end if;
  if jsonb_typeof(item.value)<>'object' or length(coalesce(item.value->>'value','')) not between 1 and 500 then continue;end if;
  select id,data,memory_seq,message_time into src from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
   and id=item.value->>'source_message_id' and data->>'from_ig_id'=any(aliases) and memory_seq<=j.requested_seq
   and coalesce(data->>'delivery_status','sent')='sent' and coalesce(data->>'is_test','false')<>'true';
  if not found or strpos(lower(src.data->>'message_text'),lower(item.value->>'value'))=0 then continue;end if;
  if item.key in ('customer_name','business_name','business_category','requirements','problems','budget','preferences','demo_request','order_details') and src.data->>'direction'<>'in' then continue;end if;
  if src.memory_seq<coalesce((m.facts->item.key->>'source_seq')::bigint,0) then continue;end if;
  m.facts:=jsonb_set(m.facts,array[item.key],jsonb_build_object('value',item.value->>'value','source_message_id',src.id,
   'source_seq',src.memory_seq,'source_timestamp',src.message_time,'source_role',case when src.data->>'direction'='in' then 'customer' when src.data->'is_automated'='true' then 'ai' else 'owner' end));
 end loop;
 next_checkpoint:=m.summary_checkpoint;
 if p_summary is not null and nullif(trim(p_error),'') is null then
  if length(p_summary)>2400 or cardinality(p_summary_ids)>30 or cardinality(p_summary_ids)=0 then raise exception 'Invalid summary bounds';end if;
  select max(memory_seq) into next_checkpoint from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
   and data->>'from_ig_id'=any(aliases) and id=any(p_summary_ids) and memory_seq>m.summary_checkpoint and memory_seq<=j.requested_seq;
  if next_checkpoint is null or exists(select 1 from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
   and data->>'from_ig_id'=any(aliases) and memory_seq>m.summary_checkpoint and memory_seq<=next_checkpoint and not(id=any(p_summary_ids))
   and coalesce(data->>'delivery_status','sent')='sent' and coalesce(data->>'is_test','false')<>'true') then raise exception 'Summary checkpoint gap';end if;
  m.summary:=p_summary;m.summary_at:=now();
 end if;
 stage:=case when m.facts ? 'order_details' then 'order_discussed' when m.facts ? 'demo_request' then 'demo_requested'
  when m.facts ? 'budget' and m.facts ? 'requirements' then 'qualified' when m.facts ? 'requirements' then 'interested' else 'new' end;
 update public.autoreply_customer_memory set facts=m.facts,summary=m.summary,summary_checkpoint=next_checkpoint,
  lead_state=jsonb_build_object('stage',stage,'source','saved_customer_facts','updated_at',now()),summary_at=m.summary_at,version=version+1,updated_at=now()
 where (workspace_id,account_id,conversation_id)=(p_workspace,p_account,p_conversation);
 select count(*) into pending from (select 1 from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
  and data->>'from_ig_id'=any(aliases) and memory_seq>next_checkpoint and coalesce(data->>'delivery_status','sent')='sent'
  and coalesce(data->>'is_test','false')<>'true' limit 13) x;
 select * into cfg from public.autoreply_memory_settings where workspace_id=p_workspace;
 update public.autoreply_memory_jobs set processed_seq=greatest(processed_seq,coalesce((p_usage->>'observed_seq')::bigint,j.requested_seq)),lease_id=null,locked_until=null,
  status=case when nullif(p_error,'') is not null and attempts>=5 then 'dead' when requested_seq>coalesce((p_usage->>'observed_seq')::bigint,j.requested_seq) then 'pending' when pending=0 then 'idle' else 'pending' end,
  attempts=case when nullif(p_error,'') is null then 0 else attempts end,
  next_attempt_at=now()+case when nullif(p_error,'') is not null then least(1800,15*power(2,attempts)::integer)*interval '1 second'
   when requested_seq>coalesce((p_usage->>'observed_seq')::bigint,j.requested_seq) or pending>=coalesce(cfg.summary_threshold,10) then interval '0 seconds' else interval '120 seconds' end,
  last_error=nullif(left(p_error,60),''),input_tokens=input_tokens+greatest(coalesce((p_usage->>'input_tokens')::bigint,0),0),
  output_tokens=output_tokens+greatest(coalesce((p_usage->>'output_tokens')::bigint,0),0),
  provider_calls=provider_calls+greatest(coalesce((p_usage->>'calls')::bigint,0),0),last_processing_ms=(p_usage->>'processing_ms')::integer,updated_at=now()
 where (workspace_id,account_id,conversation_id)=(p_workspace,p_account,p_conversation);
 return jsonb_build_object('ok',true,'checkpoint',next_checkpoint,'version',m.version+1,'pending',pending);
end $$;

create or replace function public.autoreply_conversation_context(p_workspace text,p_sender text,p_exclude_message text default '')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare identity jsonb; aliases text[]; history jsonb; opening jsonb; memory jsonb; cfg jsonb; recent integer;
begin
 identity:=public.autoreply_memory_identity(p_workspace,p_sender);
 select array_agg(value) into aliases from jsonb_array_elements_text(identity->'aliases') value;
 select to_jsonb(s) into cfg from public.autoreply_memory_settings s where workspace_id=p_workspace;
 recent:=coalesce((cfg->>'recent_limit')::integer,12);
 if coalesce((cfg->>'enabled')::boolean,true) and coalesce((select enabled from public.autoreply_memory_runtime where id=1),true) then
  select jsonb_build_object('summary',summary,'facts',facts,'lead_state',lead_state,'version',version,'updated_at',updated_at,'checkpoint',summary_checkpoint)
  into memory from public.autoreply_customer_memory where workspace_id=p_workspace and account_id=identity->>'account_id'
   and (conversation_id=identity->>'conversation_id' or conversation_id=any(aliases))
   order by (conversation_id=identity->>'conversation_id') desc,summary_checkpoint desc limit 1;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'role',case when data->>'direction'='out' then 'assistant' else 'user' end,
  'content',left(data->>'message_text',6000),'at',extract(epoch from message_time)*1000) order by message_time,id),'[]') into history from (
  select id,data,message_time from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
   and id<>coalesce(p_exclude_message,'') and data->>'from_ig_id'=any(aliases) and data->>'direction' in ('in','out')
   and nullif(trim(data->>'message_text'),'') is not null and coalesce(data->>'is_test','false')<>'true' and coalesce(data->>'delivery_status','sent')='sent'
   order by message_time desc,id desc limit recent) r;
 if jsonb_array_length(history)=0 then select messages into history from public.autoreply_dm_history where user_id=p_workspace and sender_id=p_sender;end if;
 select jsonb_build_object('id',id,'role','assistant','content',left(data->>'message_text',6000),'at',extract(epoch from message_time)*1000)
 into opening from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages' and data->>'from_ig_id'=any(aliases)
  and data->>'direction'='out' and data->'is_automated'='false' and coalesce(data->>'is_test','false')<>'true'
  and coalesce(data->>'delivery_status','sent')='sent' and nullif(trim(data->>'message_text'),'') is not null
  and (nullif(memory->>'summary','') is null or memory_seq>coalesce((memory->>'checkpoint')::bigint,0)) order by message_time desc,id desc limit 1;
 return jsonb_build_object('history',coalesce(history,'[]'),'manual_context',opening,'memory',memory,'memory_settings',coalesce(cfg,'{}'),
  'memory_identity',identity,'thread_outbound_version',public.autoreply_outbound_context_version(p_workspace,p_sender));
end $$;

create function public.autoreply_search_conversation(p_workspace text,p_sender text,p_query text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare identity jsonb; aliases text[]; result jsonb; query tsquery;
begin
 identity:=public.autoreply_memory_identity(p_workspace,p_sender);
 select array_agg(value) into aliases from jsonb_array_elements_text(identity->'aliases') value;
 query:=websearch_to_tsquery('simple',left(p_query,200));
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',left(data->>'message_text',1200),'direction',data->>'direction','timestamp',message_time) order by message_time),'[]')
 into result from (select id,data,message_time from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
  and data->>'from_ig_id'=any(aliases) and coalesce(data->>'is_test','false')<>'true' and coalesce(data->>'delivery_status','sent')='sent'
  and to_tsvector('simple',coalesce(data->>'message_text','')) @@ query order by ts_rank(to_tsvector('simple',coalesce(data->>'message_text','')),query) desc,message_time desc limit 4) r;
 return result;
end $$;

-- Cursor pagination follows the chronological timeline; no OFFSET or 1000-row ceiling.
create function public.autoreply_inbox_page(p_workspace text,p_sender text default '',p_before_time timestamptz default null,p_before_id text default null,p_limit integer default 50)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare aliases text[]; identity jsonb; rows jsonb; cursor jsonb; unreads jsonb; amount integer:=least(greatest(p_limit,1),100);
begin
 if current_user not in ('service_role','postgres') and not public.autoreply_memory_can_access(p_workspace) then raise exception 'Workspace access required' using errcode='42501';end if;
 if nullif(p_sender,'') is not null then
  identity:=public.autoreply_memory_identity(p_workspace,p_sender);
  select array_agg(value) into aliases from jsonb_array_elements_text(identity->'aliases') value;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'data',data,'message_time',message_time) order by message_time desc,id desc),'[]') into rows from (
  select id,data||jsonb_build_object('server_updated_at',updated_at) data,message_time from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
   and (aliases is null or data->>'from_ig_id'=any(aliases))
   and (p_before_time is null or (message_time,id)<(p_before_time,coalesce(p_before_id,'')))
   order by message_time desc,id desc limit amount+1) r;
 if jsonb_array_length(rows)>amount then
  select jsonb_agg(value order by ordinality) into rows from jsonb_array_elements(rows) with ordinality where ordinality<=amount;
  cursor:=jsonb_build_object('time',rows->(amount-1)->>'message_time','id',rows->(amount-1)->>'id');
 end if;
 if aliases is null then
  select coalesce(jsonb_object_agg(sender,amount),'{}') into unreads from (select data->>'from_ig_id' sender,count(*) amount
   from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages' and data->>'direction'='in'
    and coalesce(data->>'is_read','false')<>'true' and coalesce(data->>'is_test','false')<>'true' and nullif(data->>'from_ig_id','') is not null group by 1) u;
 end if;
 return jsonb_build_object('unread_counts',unreads,'messages',(select coalesce(jsonb_agg((value->'data')||jsonb_build_object('id',value->>'id')),'[]') from jsonb_array_elements(rows)),
  'next_cursor',cursor,'has_more',cursor is not null);
end $$;

-- Removing a source invalidates its derived memory and cancels in-flight leases.
create function public.autoreply_memory_message_deleted() returns trigger language plpgsql security definer set search_path='' as $$
declare identity jsonb; aliases text[]; latest bigint;
begin
 if old.collection<>'inbox_messages' then return old;end if;
 identity:=public.autoreply_memory_identity(old.user_id,old.data->>'from_ig_id');
 perform pg_advisory_xact_lock(hashtextextended('memory:'||old.user_id||':'||coalesce(identity->>'conversation_id',''),0));
 select array_agg(value) into aliases from jsonb_array_elements_text(identity->'aliases') value;
 delete from public.autoreply_customer_memory where workspace_id=old.user_id and account_id=identity->>'account_id'
  and (conversation_id=identity->>'conversation_id' or conversation_id=any(aliases));
 delete from public.autoreply_memory_jobs where workspace_id=old.user_id and account_id=identity->>'account_id'
  and (conversation_id=identity->>'conversation_id' or conversation_id=any(aliases));
 select max(memory_seq) into latest from public.autoreply_documents where user_id=old.user_id and collection='inbox_messages' and data->>'from_ig_id'=any(aliases);
 if latest is not null then perform public.autoreply_enqueue_memory(old.user_id,old.data->>'from_ig_id',latest);end if;
 return old;
end $$;
create trigger memory_message_deleted after delete on public.autoreply_documents for each row execute function public.autoreply_memory_message_deleted();

-- Explicit browser-facing reads remain RLS protected. Processing RPCs are internal only.
revoke all on function public.autoreply_memory_identity(text,text),public.autoreply_memory_can_access(text),public.autoreply_enqueue_memory(text,text,bigint),
 public.autoreply_memory_message_before(),public.autoreply_memory_message_after(),public.autoreply_memory_message_deleted(),
 public.autoreply_claim_memory_jobs(integer),public.autoreply_memory_batch(text,text,text,uuid),
 public.autoreply_finish_memory_job(text,text,text,uuid,bigint,jsonb,text,text[],text,jsonb),public.autoreply_search_conversation(text,text,text),public.autoreply_inbox_page(text,text,timestamptz,text,integer)
 from public,anon,authenticated;
grant execute on function public.autoreply_memory_can_access(text),public.autoreply_memory_identity(text,text),public.autoreply_inbox_page(text,text,timestamptz,text,integer) to authenticated,service_role;
grant execute on function public.autoreply_enqueue_memory(text,text,bigint),public.autoreply_memory_message_before(),public.autoreply_memory_message_after(),public.autoreply_memory_message_deleted(),
 public.autoreply_claim_memory_jobs(integer),public.autoreply_memory_batch(text,text,text,uuid),
 public.autoreply_finish_memory_job(text,text,text,uuid,bigint,jsonb,text,text[],text,jsonb),public.autoreply_search_conversation(text,text,text) to service_role;
notify pgrst,'reload schema';

-- A single private switch is also the non-destructive rollback mechanism.
create table public.autoreply_memory_runtime(id integer primary key check(id=1),enabled boolean not null default true,
 dispatch_enabled boolean not null default false,last_dispatch_at timestamptz not null default 'epoch');
insert into public.autoreply_memory_runtime(id) values(1);
alter table public.autoreply_memory_runtime enable row level security;
revoke all on public.autoreply_memory_runtime from public,anon,authenticated;
grant select,update on public.autoreply_memory_runtime to service_role;
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='autoreply_memory_worker_secret') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'autoreply_memory_worker_secret');end if;
end $$;
create function public.autoreply_memory_worker_authorized(p_secret text) returns boolean language sql security definer set search_path='' as $$
 select p_secret is not null and length(p_secret)=64 and exists(select 1 from vault.decrypted_secrets where name='autoreply_memory_worker_secret' and decrypted_secret=p_secret);
$$;
create function public.autoreply_reconcile_memory_jobs() returns void language plpgsql security invoker set search_path='' as $$
declare row record; identity jsonb;
begin
 if not coalesce((select enabled from public.autoreply_memory_runtime where id=1),false) then return;end if;
 for row in select user_id,data->>'from_ig_id' sender,max(memory_seq) seq from (
   select user_id,data,memory_seq from public.autoreply_documents where collection='inbox_messages' and coalesce(data->>'is_test','false')<>'true'
    and coalesce(data->>'delivery_status','sent')='sent' order by memory_seq desc limit 5000) r group by 1,2 loop
  identity:=public.autoreply_memory_identity(row.user_id,row.sender);
  if identity->>'account_id' is not null and not exists(select 1 from public.autoreply_memory_jobs where workspace_id=row.user_id
   and account_id=identity->>'account_id' and conversation_id=identity->>'conversation_id' and requested_seq>=row.seq) then
   perform public.autoreply_enqueue_memory(row.user_id,row.sender,row.seq);end if;
 end loop;
end $$;
create function public.autoreply_dispatch_memory_worker() returns void language plpgsql security definer set search_path='' as $$
begin
 -- Throttle transport only; job leases protect the actual work across invocations.
 update public.autoreply_memory_runtime set last_dispatch_at=now() where id=1 and enabled and dispatch_enabled and last_dispatch_at<now()-interval '2 seconds';
 if not found then return;end if;
 perform public.autoreply_reconcile_memory_jobs();
 if exists(select 1 from public.autoreply_memory_jobs where (status='pending' and next_attempt_at<=now()) or (status='processing' and locked_until<now())) then
  perform net.http_post(url:='https://dwgxmmftybxwpurgsxkx.supabase.co/functions/v1/instagram-memory-worker',
   headers:=jsonb_build_object('Content-Type','application/json','x-memory-cron',(select decrypted_secret from vault.decrypted_secrets where name='autoreply_memory_worker_secret')),
   body:='{}'::jsonb,timeout_milliseconds:=90000);
 end if;
end $$;
select cron.schedule('autoreply-smart-memory','* * * * *','select public.autoreply_dispatch_memory_worker()');
revoke all on function public.autoreply_memory_worker_authorized(text),public.autoreply_reconcile_memory_jobs(),public.autoreply_dispatch_memory_worker() from public,anon,authenticated;
grant execute on function public.autoreply_memory_worker_authorized(text),public.autoreply_reconcile_memory_jobs(),public.autoreply_dispatch_memory_worker() to service_role;

create index memory_unread_lookup on public.autoreply_documents(user_id,(data->>'from_ig_id'))
 where collection='inbox_messages' and data->>'direction'='in' and coalesce(data->>'is_read','false')<>'true';
create function public.autoreply_mark_inbox_read(p_workspace text,p_sender text,p_read boolean default true) returns jsonb language plpgsql security invoker set search_path='' as $$
declare identity jsonb; aliases text[]; changed integer;
begin
 if current_user not in ('postgres','service_role') and not public.autoreply_memory_can_access(p_workspace) then raise exception 'Workspace access required' using errcode='42501';end if;
 identity:=public.autoreply_memory_identity(p_workspace,p_sender);
 select array_agg(value) into aliases from jsonb_array_elements_text(identity->'aliases') value;
 update public.autoreply_documents set data=(data-'read_at')||jsonb_build_object('is_read',p_read)||
  case when p_read then jsonb_build_object('read_at',now()) else '{}'::jsonb end
 where user_id=p_workspace and collection='inbox_messages' and data->>'from_ig_id'=any(aliases) and data->>'direction'='in'
  and coalesce((data->>'is_read')::boolean,false) is distinct from p_read;
 get diagnostics changed=row_count;return jsonb_build_object('ok',true,'changed',changed);
end $$;

-- Aggregate message analytics on the server: pagination must not change totals.
create function public.autoreply_inbox_analytics(p_workspace text,p_start timestamptz,p_end timestamptz,p_timezone text default 'UTC')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user not in ('postgres','service_role') and not public.autoreply_memory_can_access(p_workspace) then raise exception 'Workspace access required' using errcode='42501';end if;
 if p_end<p_start or p_end-p_start>interval '366 days' then raise exception 'Invalid analytics period';end if;
 with messages as materialized (
  select id,data,message_time,(message_time at time zone p_timezone) local_time,
   message_time>=p_start as current_period, data->>'direction' direction,data->'is_automated'='true' ai,
   case when lower(data->>'message_text') ~ 'price|cost|rate|₹|rs\.?|rupee|कितना|कीमत' then 'Price'
    when lower(data->>'message_text') ~ 'order|buy|purchase|book|checkout|लेना|चाहिए|ऑर्डर' then 'Order'
    when lower(data->>'message_text') ~ 'delivery|shipping|cod|dispatch|courier|deliver|डिलीवरी' then 'Delivery'
    when lower(data->>'message_text') ~ 'product|detail|available|stock|size|color|photo|catalog|प्रोडक्ट' then 'Product'
    when lower(data->>'message_text') ~ 'help|issue|problem|refund|return|support|complaint|समस्या' then 'Support' else 'Other' end intent
  from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages' and coalesce(data->>'is_test','false')<>'true'
   and message_time between p_start-(p_end-p_start+interval '1 millisecond') and p_end
 ), counts as (
  select current_period,count(*) filter(where direction='in') incoming,count(*) filter(where direction='out') outgoing,
   count(*) filter(where direction='out' and ai) ai,count(*) filter(where direction='out' and not coalesce(ai,false)) manual,
   count(*) filter(where direction='out' and data->>'delivery_status'='failed') failed from messages group by current_period
 ), daily as (select to_char(local_time,'YYYY-MM-DD') as "day",count(*) filter(where direction='in') incoming,
  count(*) filter(where direction='out') outgoing,count(*) filter(where direction='out' and ai) ai from messages where current_period group by 1),
 intents as (select intent label,count(*) value from messages where current_period and direction='in' group by 1),
 heat as (select (extract(isodow from local_time)::integer-1) as "day",
  case when extract(hour from local_time)<6 then 3 when extract(hour from local_time)<12 then 0 when extract(hour from local_time)<18 then 1 else 2 end as "block",count(*) value
  from messages where current_period and direction='in' group by 1,2),
 recent as (select data||jsonb_build_object('id',id,'message_text',left(data->>'message_text',90)) data from messages where current_period order by message_time desc,id desc limit 8)
 select jsonb_build_object('current',(select to_jsonb(c)-'current_period' from counts c where current_period),
  'previous',(select to_jsonb(c)-'current_period' from counts c where not current_period),
  'daily',coalesce((select jsonb_agg(to_jsonb(d)) from daily d),'[]'),
  'intents',coalesce((select jsonb_agg(to_jsonb(i)) from intents i),'[]'),
  'heat',coalesce((select jsonb_agg(to_jsonb(h)) from heat h),'[]'),
  'uniqueIncoming',(select count(distinct data->>'from_ig_id') from messages where current_period and direction='in'),
  'uniqueAi',(select count(distinct data->>'from_ig_id') from messages where current_period and direction='out' and ai),
  'recent',coalesce((select jsonb_agg(data) from recent),'[]')) into result;
 return result;
end $$;
revoke all on function public.autoreply_mark_inbox_read(text,text,boolean),public.autoreply_inbox_analytics(text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.autoreply_mark_inbox_read(text,text,boolean),public.autoreply_inbox_analytics(text,timestamptz,timestamptz,text) to authenticated,service_role;
