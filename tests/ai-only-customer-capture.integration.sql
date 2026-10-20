-- No network calls. All fixture writes and trigger effects roll back.
begin;
set local plpgsql.check_asserts=on;
do $$
declare
 w text:='00000000-0000-4000-8000-000000000096';
 kind text; rule jsonb; saved uuid; row_id uuid;
begin
 foreach kind in array array['comment','story_reply','dm','dm_ai_conversation'] loop
  rule:=jsonb_build_object('name',kind||' fixture','trigger_type',kind,'status','active','trigger_config',jsonb_build_object('data_capture_enabled',true,'data_fields',jsonb_build_array('Name','Phone'),'keywords',jsonb_build_array('PRICE')));
  insert into public.autoreply_documents(user_id,collection,id,data) values(w,'automations','auto_fixture_'||kind,rule);
  if kind='dm_ai_conversation' then
   assert exists(select 1 from public.autoreply_data_collections where workspace_id=w and automation_id='auto_fixture_'||kind and active);
   saved:=public.autoreply_capture_customer(w,'auto_fixture_'||kind,'["Name","Phone"]','fixture-customer','fixture','{"Name":"Asha","Phone":"9876543210"}','fixture-message',now(),'{}');
   assert saved is not null;
   row_id:=saved;
  else
   assert not exists(select 1 from public.autoreply_data_collections where workspace_id=w and automation_id='auto_fixture_'||kind and active);
   assert (select data#>>'{trigger_config,data_capture_enabled}' from public.autoreply_documents where user_id=w and collection='automations' and id='auto_fixture_'||kind)='false';
   assert not (select data->'trigger_config' ? 'data_fields' from public.autoreply_documents where user_id=w and collection='automations' and id='auto_fixture_'||kind);
   saved:=public.autoreply_capture_customer(w,'auto_fixture_'||kind,'["Phone"]','fixture-customer','fixture','{"Phone":"9876543210"}','fixture-message',now(),'{}');
   assert saved is null;
   assert (select data#>>'{trigger_config,keywords,0}' from public.autoreply_documents where user_id=w and collection='automations' and id='auto_fixture_'||kind)='PRICE';
  end if;
 end loop;
 -- Editing an AI rule into a fixed reply deactivates capture and preserves data.
 update public.autoreply_documents set data=jsonb_set(data,'{trigger_type}','"dm"') where user_id=w and collection='automations' and id='auto_fixture_dm_ai_conversation';
 assert not exists(select 1 from public.autoreply_data_collections where workspace_id=w and automation_id='auto_fixture_dm_ai_conversation' and active);
 assert exists(select 1 from public.autoreply_customer_records where id=row_id and data->>'Name'='Asha');
 -- Even a stale/incorrect active collection cannot bypass the RPC type guard.
 update public.autoreply_data_collections set active=true where workspace_id=w and automation_id='auto_fixture_dm_ai_conversation';
 saved:=public.autoreply_capture_customer(w,'auto_fixture_dm_ai_conversation','["Name"]','another-customer','fixture','{"Name":"Must not save"}','blocked',now(),'{}');
 assert saved is null;
 assert not exists(select 1 from public.autoreply_customer_records where customer_key='another-customer' and workspace_id=w);
 -- Disabling capture on the AI type also blocks capture at storage level.
 update public.autoreply_documents set data=jsonb_set(jsonb_set(data,'{trigger_type}','"dm_ai_conversation"'),'{trigger_config,data_capture_enabled}','false') where user_id=w and collection='automations' and id='auto_fixture_dm_ai_conversation';
 saved:=public.autoreply_capture_customer(w,'auto_fixture_dm_ai_conversation','["Name"]','another-customer','fixture','{"Name":"Must not save"}','blocked',now(),'{}');
 assert saved is null;
 assert not has_function_privilege('authenticated','public.autoreply_capture_customer(text,text,jsonb,text,text,jsonb,text,timestamptz,jsonb)','execute');
end $$;
rollback;
