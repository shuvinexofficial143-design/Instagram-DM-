begin;
do $$
declare w text:=gen_random_uuid()::text; otherw text:=gen_random_uuid()::text; s text:='770000000009999'; request jsonb; again jsonb; control jsonb; v text; n integer;
begin
 insert into public.autoreply_instagram_tokens(user_id,account) values(w,'{"access_token":"not-a-real-token","ig_user_id":"17841400000099999"}');
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w,'contacts',s,jsonb_build_object('ig_user_id',s,'ig_username','handoff_customer')),
 (w,'automations','auto_handoff_fixture','{"id":"auto_handoff_fixture","name":"Handoff fixture","trigger_type":"dm_ai_conversation","status":"active","actions":[{"type":"ai_chatbot","ai_system_instruction":"Help"}]}');
 request:=public.autoreply_request_human_handoff(w,s,'auto_handoff_fixture','Handoff fixture','customer_requested','Please speak with a human','fixture-handoff-event','');
 if request->'created' is distinct from 'true'::jsonb then raise exception 'Handoff was not created';end if;
 select data into control from public.autoreply_documents where user_id=w and collection='ai_thread_controls' and id=s;
 if control->'paused' is distinct from 'true'::jsonb or control->'human_handoff' is distinct from 'true'::jsonb then raise exception 'Thread did not pause atomically';end if;
 if not exists(select 1 from public.autoreply_documents where user_id=w and collection='workspace_notices' and data->>'handoff_id'=request->>'id') then raise exception 'Owner notification missing';end if;
 again:=public.autoreply_request_human_handoff(w,s,'auto_handoff_fixture','Changed prompt','needs_staff','Repeated','fixture-handoff-event','');
 select count(*) into n from public.autoreply_human_handoffs where workspace_id=w;
 if n<>1 or again->>'id'<>request->>'id' then raise exception 'Duplicate notification created';end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values(w,'inbox_messages','fixture-next-inbound',jsonb_build_object('from_ig_id',s,'direction','in','message_text','Are you there?','timestamp',now()));
 if (select data->'paused' from public.autoreply_documents where user_id=w and collection='ai_thread_controls' and id=s) is distinct from 'true'::jsonb then raise exception 'Incoming message resumed AI';end if;
 if public.autoreply_reserve_automation_delivery(w,'handoff-ai-block',true,'auto_handoff_fixture',s)->>'reason'<>'conversation_ai_paused' then raise exception 'AI interrupted human';end if;
 if public.autoreply_reserve_automation_delivery(w,'handoff-keyword-block',false,'auto_handoff_fixture',s)->>'reason'<>'conversation_ai_paused' then raise exception 'Keyword automation interrupted human';end if;
 control:=public.autoreply_set_thread_control(w,s,true,'handoff_customer',(request->>'id')::uuid);
 if control->'human_handoff' is distinct from 'true'::jsonb then raise exception 'Manual reply removed handoff state';end if;
 if not exists(select 1 from public.autoreply_human_handoffs where id=(request->>'id')::uuid and status='in_progress') then raise exception 'Takeover did not update queue';end if;
 begin delete from public.autoreply_documents where user_id=w and collection='ai_thread_controls' and id=s;raise exception 'Paused handoff was deleted';exception when raise_exception then if SQLERRM='Paused handoff was deleted' then raise;end if;end;
 control:=public.autoreply_set_thread_control(w,s,false,'handoff_customer',(request->>'id')::uuid);
 if control->'paused' is distinct from 'false'::jsonb or control->'human_handoff' is distinct from 'false'::jsonb then raise exception 'Explicit resume failed';end if;
 if not exists(select 1 from public.autoreply_human_handoffs where id=(request->>'id')::uuid and status='resumed') then raise exception 'Resume did not close notification';end if;
 if public.autoreply_reserve_thread_delivery(w,'stale-before-human',true,'auto_handoff_fixture',s,'')->>'reason'<>'conversation_control_changed' then raise exception 'Old AI turn survived pause/resume';end if;
 v:=control->>'updated_at';
 if public.autoreply_reserve_thread_delivery(w,'fresh-after-human',true,'auto_handoff_fixture',s,v)->'allowed' is distinct from 'true'::jsonb then raise exception 'Fresh resumed turn was blocked';end if;
 again:=public.autoreply_request_human_handoff(w,s,'auto_handoff_fixture','Handoff','prompt_rule','Stale result','stale-handoff-result','');
 if again->'superseded' is distinct from 'true'::jsonb then raise exception 'Stale handoff re-paused a resumed thread';end if;
 if (select data->'paused' from public.autoreply_documents where user_id=w and collection='ai_thread_controls' and id=s) is distinct from 'false'::jsonb then raise exception 'Stale model decision re-paused AI';end if;
 again:=public.autoreply_request_human_handoff(w,s,'auto_handoff_fixture','Handoff','prompt_rule','New handoff','new-handoff-event',v);
 if again->'created' is distinct from 'true'::jsonb or again->>'id'=request->>'id' then raise exception 'New handoff lost prior history';end if;
 if exists(select 1 from public.autoreply_documents where user_id=otherw and collection='ai_thread_controls') then raise exception 'Handoff leaked across workspaces';end if;
 update public.autoreply_documents set data=data||'{"status":"paused"}'::jsonb where user_id=w and collection='automations' and id='auto_handoff_fixture';
 perform public.autoreply_set_thread_control(w,s,false,'handoff_customer',(again->>'id')::uuid);
 if public.autoreply_reserve_automation_delivery(w,'off-rule-not-resumed',true,'auto_handoff_fixture',s)->>'reason'<>'automation_paused_or_deleted' then raise exception 'Thread resume turned global automation on';end if;
 if has_table_privilege('authenticated','public.autoreply_human_handoffs','select') or has_function_privilege('authenticated','public.autoreply_request_human_handoff(text,text,text,text,text,text,text,text)','execute') or has_function_privilege('anon','public.autoreply_set_thread_control(text,text,boolean,text,uuid)','execute') then raise exception 'Handoff administration exposed to browser roles';end if;
end $$;
rollback;
