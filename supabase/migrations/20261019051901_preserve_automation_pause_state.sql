-- Runtime counters must never overwrite configuration from an old webhook snapshot.
create or replace function public.autoreply_increment_automation_stats(p_user_id text,p_automation_id text)
returns void language sql security invoker set search_path='' as $$
 update public.autoreply_documents d
 set data=jsonb_set(d.data,'{stats}',
   (case when jsonb_typeof(d.data->'stats')='object' then d.data->'stats' else '{}'::jsonb end)
   || jsonb_build_object(
     'runs',(case when jsonb_typeof(d.data#>'{stats,runs}')='number' then greatest((d.data#>>'{stats,runs}')::numeric,0) else 0 end)+1,
     'dms_sent',(case when jsonb_typeof(d.data#>'{stats,dms_sent}')='number' then greatest((d.data#>>'{stats,dms_sent}')::numeric,0) else 0 end)+1
   ),true)
 where d.user_id=p_user_id and d.collection='automations' and d.id=p_automation_id;
$$;
revoke all on function public.autoreply_increment_automation_stats(text,text) from public,anon,authenticated;
grant execute on function public.autoreply_increment_automation_stats(text,text) to service_role;

-- Status changes modify the current row, retaining the latest prompt, fields and stats.
create or replace function public.autoreply_set_automation_status(p_user_id text,p_automation_id text,p_status text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_data jsonb; v_paused jsonb:='[]'::jsonb; v_now text:=to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 if p_status is null or p_status not in ('active','paused') then raise exception 'Invalid automation status'; end if;
 perform pg_advisory_xact_lock(hashtextextended('autoreply_automation_status:'||p_user_id,0));
 select data into v_data from public.autoreply_documents
 where user_id=p_user_id and collection='automations' and id=p_automation_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
 if p_status='active' and v_data->>'trigger_type'='dm_ai_conversation' then
   with changed as (
     update public.autoreply_documents d set data=d.data||jsonb_build_object('status','paused','updated_at',v_now)
     where d.user_id=p_user_id and d.collection='automations' and d.id<>p_automation_id
       and d.data->>'trigger_type'='dm_ai_conversation' and d.data->>'status'='active'
     returning d.id
   ) select coalesce(jsonb_agg(id),'[]'::jsonb) into v_paused from changed;
 end if;
 update public.autoreply_documents d set data=d.data||jsonb_build_object('status',p_status,'updated_at',v_now)
 where d.user_id=p_user_id and d.collection='automations' and d.id=p_automation_id returning data into v_data;
 return jsonb_build_object('ok',true,'automation',v_data||jsonb_build_object('id',p_automation_id),'pausedAutomationIds',v_paused);
end;
$$;
revoke all on function public.autoreply_set_automation_status(text,text,text) from public,anon,authenticated;
grant execute on function public.autoreply_set_automation_status(text,text,text) to service_role;

-- Re-check the latest switches after AI generation/delays and before quota/Meta dispatch.
create or replace function public.autoreply_reserve_automation_delivery(
 p_workspace_id text,p_delivery_key text,p_is_ai boolean,p_automation_id text,p_sender_id text
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.autoreply_instagram_tokens t where t.user_id=p_workspace_id
   and nullif(t.account->>'access_token','') is not null) then
   return jsonb_build_object('allowed',false,'reason','instagram_disconnected');
 end if;
 if not exists(select 1 from public.autoreply_documents d where d.user_id=p_workspace_id
   and d.collection='automations' and d.id=p_automation_id and d.data->>'status'='active') then
   return jsonb_build_object('allowed',false,'reason','automation_paused_or_deleted');
 end if;
 if p_is_ai and exists(select 1 from public.autoreply_documents d where d.user_id=p_workspace_id
   and d.collection='ai_thread_controls' and d.id=p_sender_id and d.data->'paused'='true'::jsonb) then
   return jsonb_build_object('allowed',false,'reason','conversation_ai_paused');
 end if;
 return public.autoreply_reserve_delivery_quota(p_workspace_id,p_delivery_key,p_is_ai);
end;
$$;
revoke all on function public.autoreply_reserve_automation_delivery(text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.autoreply_reserve_automation_delivery(text,text,boolean,text,text) to service_role;

-- Preserve the deployed billing/identity/dedupe flow, adding durable thread takeover.
create or replace function public.autoreply_prepare_automation_event(p_candidates text[],p_message_id text,p_sender_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_context jsonb; v_rules jsonb; v_quota jsonb; v_user_id text; v_paused boolean;
begin
 if coalesce(array_length(p_candidates,1),0)=0 then
   perform public.autoreply_billing_entitlement('__billing_health__');
   return jsonb_build_object('runtime_ready',true);
 end if;
 v_context:=public.autoreply_claim_dm_context_v4(p_candidates,p_message_id,'',p_sender_id,true);
 v_user_id:=v_context->>'user_id';
 if v_user_id is null then return null; end if;
 if v_context->>'message_state'<>'new' then return v_context; end if;
 select coalesce(jsonb_agg(d.data||jsonb_build_object('id',d.id) order by d.updated_at desc),'[]'::jsonb)
 into v_rules from public.autoreply_documents d where d.user_id=v_user_id and d.collection='automations';
 v_quota:=public.autoreply_billing_entitlement(v_user_id);
 if v_quota is null then raise exception 'Message allowance unavailable'; end if;
 select exists(select 1 from public.autoreply_documents d where d.user_id=v_user_id
   and d.collection='ai_thread_controls' and d.id=p_sender_id and d.data->'paused'='true'::jsonb) into v_paused;
 return v_context||jsonb_build_object('automations',v_rules,'quota',v_quota,'thread_ai_paused',v_paused);
end;
$$;
revoke all on function public.autoreply_prepare_automation_event(text[],text,text) from public,anon,authenticated;
grant execute on function public.autoreply_prepare_automation_event(text[],text,text) to service_role;
notify pgrst,'reload schema';
