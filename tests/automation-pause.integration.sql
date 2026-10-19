-- Production-schema checks. Synthetic data and claims are always rolled back.
begin;
do $$
declare
 w text:='guest_00000000-0000-4000-8000-000000000041';
 w2 text:='guest_00000000-0000-4000-8000-000000000042';
 a text:='auto_pause_fixture_one'; b text:='auto_pause_fixture_two';
 r jsonb; d jsonb; config_time text;
begin
 insert into public.autoreply_instagram_tokens(user_id,account) values
 (w,'{"ig_user_id":"__pause_fixture_ig__","username":"pause_fixture","access_token":"fixture-not-real"}'::jsonb),
 (w2,'{"ig_user_id":"__pause_fixture_ig2__","username":"pause_fixture2","access_token":"fixture-not-real"}'::jsonb);
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w,'automations',a,'{"name":"Pause fixture","trigger_type":"dm_ai_conversation","status":"active","actions":[{"type":"ai_chatbot","ai_system_instruction":"original"}],"stats":{"runs":3,"dms_sent":4,"unique_users":2},"updated_at":"2026-10-01T00:00:00Z"}'::jsonb),
 (w,'automations',b,'{"name":"Other rule","trigger_type":"dm_ai_conversation","status":"paused","actions":[]}'::jsonb),
 (w2,'automations',a,'{"name":"Second account","trigger_type":"dm_ai_conversation","status":"active","actions":[]}'::jsonb);
 r:=public.autoreply_set_automation_status(w,a,'paused');
 if r->'ok'<>'true'::jsonb then raise exception 'Pause was not saved'; end if;
 config_time:=r#>>'{automation,updated_at}';
 update public.autoreply_documents set data=data||'{"new_field":"keep me","actions":[{"type":"ai_chatbot","ai_system_instruction":"edited while paused"}]}'::jsonb where user_id=w and collection='automations' and id=a;
 perform public.autoreply_increment_automation_stats(w,a);
 select data into d from public.autoreply_documents where user_id=w and collection='automations' and id=a;
 if d->>'status'<>'paused' or d->>'new_field'<>'keep me' or d#>>'{actions,0,ai_system_instruction}'<>'edited while paused'
   or d#>>'{stats,runs}'<>'4' or d#>>'{stats,dms_sent}'<>'5' or d#>>'{stats,unique_users}'<>'2'
   or d->>'updated_at'<>config_time then raise exception 'Stats changed configuration or lost counters'; end if;
 if exists(select 1 from public.autoreply_active_automations where user_id=w) then raise exception 'Paused rule still in runtime'; end if;
 r:=public.autoreply_reserve_automation_delivery(w,'pause-fixture-blocked',true,a,'fixture-sender');
 if r->>'reason'<>'automation_paused_or_deleted' then raise exception 'Paused rule can dispatch'; end if;
 r:=public.autoreply_set_automation_status(w,a,'active');
 insert into public.autoreply_documents(user_id,collection,id,data) values(w,'ai_thread_controls','fixture-sender','{"paused":true,"username":"customer"}'::jsonb);
 r:=public.autoreply_reserve_automation_delivery(w,'pause-fixture-takeover',true,a,'fixture-sender');
 if r->>'reason'<>'conversation_ai_paused' then raise exception 'Human takeover can dispatch'; end if;
 r:=public.autoreply_prepare_automation_event(array['__pause_fixture_ig__'],'__pause_fixture_message__','fixture-sender');
 if r->'thread_ai_paused'<>'true'::jsonb then raise exception 'New incoming DM lost human takeover'; end if;
 r:=public.autoreply_set_automation_status(w,b,'active');
 if not (r->'pausedAutomationIds' @> to_jsonb(array[a])) then raise exception 'Activating another AI rule did not pause the previous rule'; end if;
 if (select data->>'status' from public.autoreply_documents where user_id=w2 and collection='automations' and id=a)<>'active' then raise exception 'Another Instagram workspace was changed'; end if;
 delete from public.autoreply_instagram_tokens where user_id=w;
 r:=public.autoreply_reserve_automation_delivery(w,'pause-fixture-disconnected',true,b,'fixture-sender');
 if r->>'reason'<>'instagram_disconnected' then raise exception 'Disconnected account can dispatch'; end if;
 if not exists(select 1 from public.autoreply_runtime_context where user_id=w2) then raise exception 'Another account lost runtime'; end if;
 delete from public.autoreply_documents where user_id=w and collection='automations' and id=a;
 perform public.autoreply_increment_automation_stats(w,a);
 if exists(select 1 from public.autoreply_documents where user_id=w and collection='automations' and id=a) then raise exception 'Late stats recreated a deleted rule'; end if;
 if has_function_privilege('authenticated','public.autoreply_set_automation_status(text,text,text)','execute')
   or has_function_privilege('anon','public.autoreply_increment_automation_stats(text,text)','execute')
   or has_function_privilege('authenticated','public.autoreply_reserve_automation_delivery(text,text,boolean,text,text)','execute') then raise exception 'Private RPC is exposed'; end if;
end;
$$;
rollback;
