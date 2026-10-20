-- Save a rule, enforce the allowance, and pause the previous AI in one transaction.
create function public.autoreply_save_automation(p_user_id text,p_automation jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 rule_id text:=p_automation->>'id'; name text:=btrim(p_automation->>'name'); kind text:=p_automation->>'trigger_type';
 current_data jsonb; saved jsonb; limits jsonb; paused jsonb:='[]'; total integer;
 stamp text:=to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 if rule_id is null or rule_id !~ '^auto_[a-zA-Z0-9_-]{4,}$' or coalesce(name,'')='' or length(name)>120
 or kind is null or kind not in ('dm','comment','story_reply','dm_ai_conversation')
 or coalesce(p_automation->>'status','') not in ('active','paused')
 or jsonb_typeof(p_automation->'actions') is distinct from 'array'
 then return jsonb_build_object('ok',false,'status',400,'error','Enter a valid automation name, type, status and actions.');end if;
 if length(p_automation::text)>100000 or jsonb_array_length(p_automation->'actions') not between 1 and 20 then
  return jsonb_build_object('ok',false,'status',400,'error','Use between 1 and 20 actions within the automation size limit.');end if;
 if exists(select 1 from jsonb_array_elements(p_automation->'actions') a
 where coalesce(a->>'type','') not in ('send_dm','reply_comment','ai_chatbot','add_delay','add_tag','auto_like_comment')) then
  return jsonb_build_object('ok',false,'status',400,'error','Unsupported automation action.');end if;
 perform pg_advisory_xact_lock(hashtextextended('autoreply_automation_status:'||p_user_id,0));
 select data into current_data from public.autoreply_documents where user_id=p_user_id and collection='automations' and id=rule_id for update;
 if exists(select 1 from public.autoreply_documents d where d.user_id=p_user_id and d.collection='automations' and d.id<>rule_id and lower(btrim(d.data->>'name'))=lower(name)) then
  return jsonb_build_object('ok',false,'status',409,'code','AUTOMATION_NAME_EXISTS','error','Another automation already uses this name. Choose a different name.');end if;
 limits:=public.autoreply_billing_entitlement(p_user_id);
 if limits is null then raise exception 'Automation allowance unavailable';end if;
 if current_data is null and limits->'automationLimit' is distinct from 'null'::jsonb then
  select count(*) into total from public.autoreply_documents where user_id=p_user_id and collection='automations';
  if total>=coalesce((limits->>'automationLimit')::integer,0) then
   return jsonb_build_object('ok',false,'status',403,'code','AUTOMATION_LIMIT_REACHED','error','This plan''s automation limit has been reached. Upgrade to add more automations.');end if;
 end if;
 -- Delivery counters and initial creation time belong to the server, not an old editor snapshot.
 saved:=(p_automation-'id'-'stats'-'created_at'-'updated_at')||jsonb_build_object('name',name,'created_at',coalesce(current_data->>'created_at',stamp),'updated_at',stamp,
  'stats',coalesce(current_data->'stats','{"runs":0,"dms_sent":0,"unique_users":0,"open_rate":-1}'::jsonb));
 if kind='dm_ai_conversation' and saved->>'status'='active' then
  with changed as (update public.autoreply_documents d set data=d.data||jsonb_build_object('status','paused','updated_at',stamp)
   where d.user_id=p_user_id and d.collection='automations' and d.id<>rule_id and d.data->>'trigger_type'='dm_ai_conversation' and d.data->>'status'='active'
   returning d.id) select coalesce(jsonb_agg(id),'[]'::jsonb) into paused from changed;
 end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values(p_user_id,'automations',rule_id,saved)
 on conflict(user_id,collection,id) do update set data=excluded.data returning data into saved;
 return jsonb_build_object('ok',true,'automation',saved||jsonb_build_object('id',rule_id),'pausedAutomationIds',paused);
end $$;
revoke all on function public.autoreply_save_automation(text,jsonb) from public,anon,authenticated;
grant execute on function public.autoreply_save_automation(text,jsonb) to service_role;
notify pgrst,'reload schema';
