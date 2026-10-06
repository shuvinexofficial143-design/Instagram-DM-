-- One service-only round trip: durable claim, history, fresh rules and allowance.
create or replace function public.autoreply_prepare_automation_event(
  p_candidates text[], p_message_id text, p_sender_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_context jsonb; v_rules jsonb; v_plan record; v_usage jsonb; v_user_id text;
begin
  select total_messages,ai_replies into v_plan from public.autoreply_plans where id='free';
  if not found or v_plan.total_messages is null or v_plan.ai_replies is null then
    raise exception 'Message allowance configuration unavailable';
  end if;
  if coalesce(array_length(p_candidates,1),0)=0 then
    return jsonb_build_object('runtime_ready',true);
  end if;
  if not exists(select 1 from public.autoreply_runtime_context r where r.ig_user_id=any(p_candidates)) then
    return null;
  end if;
  v_context := public.autoreply_claim_dm_context_v4(p_candidates,p_message_id,'',p_sender_id,true);
  v_user_id := v_context->>'user_id';
  if v_user_id is null then return null; end if;
  if v_context->>'message_state' <> 'new' then return v_context; end if;
  select coalesce(jsonb_agg(d.data || jsonb_build_object('id',d.id) order by d.updated_at desc),'[]'::jsonb)
    into v_rules from public.autoreply_documents d
    where d.user_id=v_user_id and d.collection='automations';
  v_usage := public.autoreply_get_usage(v_user_id);
  if v_usage is null then raise exception 'Message usage unavailable'; end if;
  return v_context || jsonb_build_object('automations',v_rules,'quota',jsonb_build_object(
    'plan','free','totalUsed',coalesce((v_usage->>'total_messages')::integer,0),
    'aiUsed',coalesce((v_usage->>'ai_replies')::integer,0),
    'totalLimit',v_plan.total_messages,'aiLimit',v_plan.ai_replies));
end;
$$;
revoke all on function public.autoreply_prepare_automation_event(text[],text,text) from public,anon,authenticated;
grant execute on function public.autoreply_prepare_automation_event(text[],text,text) to service_role;
