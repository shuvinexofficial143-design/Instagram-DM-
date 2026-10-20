-- Atomic save, allowance checks and error rollback. No network calls; rollback all fixtures.
begin;
set local plpgsql.check_asserts=on;
do $$
declare
 w text:='00000000-0000-4000-8000-000000000098'; r jsonb; rule jsonb; i integer;
begin
 insert into public.autoreply_profiles(user_id,email) values(w,'automation-save-fixture@example.test');
 rule:='{"id":"auto_fixture_ai_one","name":"First AI","trigger_type":"dm_ai_conversation","trigger_config":{},"status":"active","actions":[{"type":"ai_chatbot","ai_system_instruction":"Fixture prompt"}],"stats":{"runs":900}}';
 r:=public.autoreply_save_automation(w,rule);assert r->>'ok'='true',r::text;
 assert r#>>'{automation,stats,runs}'='0';
 update public.autoreply_documents set data=jsonb_set(data,'{stats,runs}','12') where user_id=w and collection='automations' and id='auto_fixture_ai_one';
 r:=public.autoreply_save_automation(w,rule);assert r#>>'{automation,stats,runs}'='12';
 r:=public.autoreply_save_automation(w,rule||'{"id":"auto_fixture_ai_two","name":"Second AI"}');assert r->>'ok'='true';assert r->'pausedAutomationIds' ? 'auto_fixture_ai_one';
 assert (select data->>'status' from public.autoreply_documents where user_id=w and collection='automations' and id='auto_fixture_ai_one')='paused';
 r:=public.autoreply_save_automation(w,rule||'{"id":"auto_fixture_duplicate","name":"  SECOND ai "}');assert r->>'code'='AUTOMATION_NAME_EXISTS';
 for i in 3..5 loop
  r:=public.autoreply_save_automation(w,jsonb_build_object('id','auto_fixture_static_'||i,'name','Static '||i,'trigger_type','dm','trigger_config','{}'::jsonb,'status','paused','actions','[{"type":"send_dm","message_text":"Fixture"}]'::jsonb));
  assert r->>'ok'='true',r::text;
 end loop;
 r:=public.autoreply_save_automation(w,rule||'{"id":"auto_fixture_six","name":"Sixth"}');assert r->>'code'='AUTOMATION_LIMIT_REACHED';
 assert (select count(*) from public.autoreply_documents where user_id=w and collection='automations')=5;
 assert not has_function_privilege('authenticated','public.autoreply_save_automation(text,jsonb)','execute');
end $$;
-- Fail the new AI write after pausing the old AI; both changes must roll back.
create function pg_temp.reject_fixture_save() returns trigger language plpgsql as $$
begin if NEW.user_id='00000000-0000-4000-8000-000000000098' and NEW.id='auto_fixture_static_3' and NEW.data->>'trigger_type'='dm_ai_conversation' then raise exception 'injected automation save failure';end if;return NEW;end $$;
create trigger reject_fixture_save before insert or update on public.autoreply_documents for each row execute function pg_temp.reject_fixture_save();
do $$declare w text:='00000000-0000-4000-8000-000000000098';begin
 begin
  perform public.autoreply_save_automation(w,'{"id":"auto_fixture_static_3","name":"Replacement AI","trigger_type":"dm_ai_conversation","trigger_config":{},"status":"active","actions":[{"type":"ai_chatbot","ai_system_instruction":"Fixture"}]}');
  raise exception 'Expected save failure';
 exception when others then assert sqlerrm='injected automation save failure',sqlerrm;end;
 assert (select data->>'status' from public.autoreply_documents where user_id=w and collection='automations' and id='auto_fixture_ai_two')='active';
 assert (select data->>'trigger_type' from public.autoreply_documents where user_id=w and collection='automations' and id='auto_fixture_static_3')='dm';
end $$;
rollback;
