-- Outgoing Instagram app messages are conversation data, never AI triggers.
-- Called only after the webhook's Meta signature or private relay is verified.
create function public.autoreply_record_instagram_outbound(
 p_business_id text,p_sender_id text,p_recipient_id text,p_message_id text,
 p_text text,p_timestamp timestamptz,p_is_echo boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare workspace text; account jsonb; username text; inserted integer;
begin
 if nullif(p_business_id,'') is null or p_recipient_id is null or p_recipient_id !~ '^\d{5,30}$'
    or nullif(p_message_id,'') is null or length(p_message_id)>2000 or nullif(trim(p_text),'') is null
    or p_timestamp is null or p_timestamp>now()+interval '5 minutes' then
   return jsonb_build_object('recorded',false,'reason','invalid_outgoing_message');
 end if;
 -- Resolve ONLY the verified event's business entry, never the recipient or a
 -- single-account fallback. This keeps two connected accounts' chats separate.
 select r.user_id,t.account into workspace,account
 from public.autoreply_runtime_context r join public.autoreply_instagram_tokens t on t.user_id=r.user_id
 where r.ig_user_id=p_business_id and nullif(t.account->>'access_token','') is not null limit 1;
 if workspace is null then return jsonb_build_object('recorded',false,'reason','connected_account_not_found');end if;
 if p_recipient_id in (p_business_id,account->>'ig_user_id',account->>'id',account->>'user_id')
    or coalesce(account->'own_sender_ids','[]'::jsonb) ? p_recipient_id then
   return jsonb_build_object('recorded',false,'reason','self_message');
 end if;
 if not coalesce(p_is_echo,false) and p_sender_id is distinct from p_business_id
    and p_sender_id is distinct from account->>'ig_user_id'
    and not(coalesce(account->'own_sender_ids','[]'::jsonb) ? coalesce(p_sender_id,'')) then
   return jsonb_build_object('recorded',false,'reason','not_business_outgoing');
 end if;
 perform pg_advisory_xact_lock(hashtextextended('handoff:'||workspace||':'||p_recipient_id,0));
 select data->>'ig_username' into username from public.autoreply_documents
 where user_id=workspace and collection='contacts' and id=p_recipient_id;
 insert into public.autoreply_documents(user_id,collection,id,data) values(workspace,'inbox_messages',p_message_id,
   jsonb_build_object('from_ig_id',p_recipient_id,'from_username',coalesce(nullif(username,''),p_recipient_id),
     'message_text',left(p_text,6000),'direction','out','is_automated',false,'is_read',true,
     'delivery_status','sent','source','instagram_echo','timestamp',to_char(p_timestamp at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 on conflict(user_id,collection,id) do nothing;
 get diagnostics inserted=row_count;
 -- Preserve API/campaign attribution if Meta echoes a message already saved by
 -- our sender. Retried echoes cannot duplicate or overwrite it.
 insert into public.autoreply_documents(user_id,collection,id,data) values(workspace,'contacts',p_recipient_id,
   jsonb_build_object('id',p_recipient_id,'ig_user_id',p_recipient_id,'ig_username',coalesce(nullif(username,''),p_recipient_id),
     'created_at',to_char(p_timestamp at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 on conflict(user_id,collection,id) do nothing;
 return jsonb_build_object('recorded',true,'duplicate',inserted=0);
end $$;

create function public.autoreply_outbound_context_version(p_workspace text,p_sender text)
returns text language sql stable security invoker set search_path='' as $$
 select md5(coalesce(string_agg(id||':'||coalesce(data->>'message_text',''),E'\n' order by id),''))
 from (select id,data from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
   and data->>'from_ig_id'=p_sender and data->>'direction'='out' and coalesce(data->>'is_test','false')<>'true'
   and coalesce(data->>'delivery_status','sent')='sent'
   order by coalesce(public.autoreply_campaign_message_time(data->>'timestamp'),created_at) desc,id desc limit 20) recent;
$$;

create function public.autoreply_conversation_context(p_workspace text,p_sender text,p_exclude_message text default '')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare history jsonb; opening jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'role',case when data->>'direction'='out' then 'assistant' else 'user' end,
   'content',left(data->>'message_text',6000),'at',extract(epoch from message_time)*1000) order by message_time,id),'[]'::jsonb)
 into history from (select id,data,coalesce(public.autoreply_campaign_message_time(data->>'timestamp'),created_at) as message_time
   from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages' and id<>coalesce(p_exclude_message,'')
   and data->>'from_ig_id'=p_sender and data->>'direction' in ('in','out') and nullif(trim(data->>'message_text'),'') is not null
   and coalesce(data->>'is_test','false')<>'true' and coalesce(data->>'delivery_status','sent')='sent'
   order by message_time desc,id desc limit 12) recent;
 if jsonb_array_length(history)=0 then
   select messages into history from public.autoreply_dm_history where user_id=p_workspace and sender_id=p_sender;
 end if;
 -- Keep the latest human-provided message available beyond the recent-turn
 -- window. It is transcript data with assistant role, never system instructions.
 select jsonb_build_object('id',id,'role','assistant','content',left(data->>'message_text',6000),
   'at',extract(epoch from coalesce(public.autoreply_campaign_message_time(data->>'timestamp'),created_at))*1000)
 into opening from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
   and data->>'from_ig_id'=p_sender and data->>'direction'='out' and data->'is_automated'='false'::jsonb
   and coalesce(data->>'is_test','false')<>'true' and coalesce(data->>'delivery_status','sent')='sent' and nullif(trim(data->>'message_text'),'') is not null
   order by coalesce(public.autoreply_campaign_message_time(data->>'timestamp'),created_at) desc,id desc limit 1;
 return jsonb_build_object('history',coalesce(history,'[]'::jsonb),'manual_context',opening,
   'thread_outbound_version',public.autoreply_outbound_context_version(p_workspace,p_sender));
end $$;

-- Extend the existing billing/campaign/handoff preparation without changing
-- its ownership checks, claims, pause state or quota calculations.
do $$declare definition text;begin
 select pg_get_functiondef('public.autoreply_prepare_automation_event(text[],text,text)'::regprocedure) into definition;
 execute replace(definition,'FUNCTION public.autoreply_prepare_automation_event(', 'FUNCTION public.autoreply_prepare_automation_event_before_context(');
end $$;
create or replace function public.autoreply_prepare_automation_event(p_candidates text[],p_message_id text,p_sender_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare context jsonb;
begin
 context:=public.autoreply_prepare_automation_event_before_context(p_candidates,p_message_id,p_sender_id);
 if context->>'user_id' is null or context->>'message_state'<>'new' then return context;end if;
 return context||public.autoreply_conversation_context(context->>'user_id',p_sender_id,p_message_id);
end $$;

create function public.autoreply_reserve_context_delivery(p_workspace_id text,p_delivery_key text,p_is_ai boolean,
 p_automation_id text,p_sender_id text,p_control_version text,p_context_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('handoff:'||p_workspace_id||':'||p_sender_id,0));
 if p_context_version is distinct from public.autoreply_outbound_context_version(p_workspace_id,p_sender_id) then
   return jsonb_build_object('allowed',false,'reason','conversation_context_changed');
 end if;
 return public.autoreply_reserve_thread_delivery(p_workspace_id,p_delivery_key,p_is_ai,p_automation_id,p_sender_id,p_control_version);
end $$;

revoke all on function public.autoreply_record_instagram_outbound(text,text,text,text,text,timestamptz,boolean),
 public.autoreply_outbound_context_version(text,text),public.autoreply_conversation_context(text,text,text),
 public.autoreply_prepare_automation_event_before_context(text[],text,text),
 public.autoreply_reserve_context_delivery(text,text,boolean,text,text,text,text) from public,anon,authenticated;
grant execute on function public.autoreply_record_instagram_outbound(text,text,text,text,text,timestamptz,boolean),
 public.autoreply_outbound_context_version(text,text),public.autoreply_conversation_context(text,text,text),
 public.autoreply_prepare_automation_event_before_context(text[],text,text),
 public.autoreply_reserve_context_delivery(text,text,boolean,text,text,text,text) to service_role;
notify pgrst,'reload schema';
