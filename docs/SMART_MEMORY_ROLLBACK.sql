-- Non-destructive emergency switch (run as migration owner):
update public.autoreply_memory_runtime set enabled=false,dispatch_enabled=false where id=1;
-- Existing messages, summaries and facts are retained. To restore the legacy context RPC if needed:
create or replace function public.autoreply_conversation_context(p_workspace text,p_sender text,p_exclude_message text default '')
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

