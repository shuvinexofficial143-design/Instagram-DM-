create or replace function public.autoreply_reserve_automation_delivery(
 p_workspace_id text,p_delivery_key text,p_is_ai boolean,p_automation_id text,p_sender_id text
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.autoreply_instagram_tokens t where t.user_id=p_workspace_id
   and nullif(t.account->>'access_token','') is not null) then
   return jsonb_build_object('allowed',false,'reason','instagram_disconnected');
 end if;
 if p_automation_id like 'campaign_%' then
   if public.autoreply_campaign_followup(p_workspace_id,p_sender_id)->>'id' is distinct from p_automation_id then
     return jsonb_build_object('allowed',false,'reason','campaign_followup_stopped');
   end if;
 elsif not exists(select 1 from public.autoreply_documents d where d.user_id=p_workspace_id
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
 update public.autoreply_campaign_recipients r set replied_at=now() from public.autoreply_campaigns c where c.id=r.campaign_id and c.workspace_id=v_user_id and r.sender_id=p_sender_id and r.status='sent';
 return v_context||jsonb_build_object('automations',v_rules,'quota',v_quota,'thread_ai_paused',v_paused,'campaign_automation',public.autoreply_campaign_followup(v_user_id,p_sender_id));
end;
$$;
revoke all on function public.autoreply_prepare_automation_event(text[],text,text) from public,anon,authenticated;
grant execute on function public.autoreply_prepare_automation_event(text[],text,text) to service_role;
notify pgrst,'reload schema';
