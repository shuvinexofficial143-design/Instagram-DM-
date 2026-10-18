-- Run as postgres/service role against the deployed schema. Fully rolled back.
begin;
insert into public.autoreply_documents(user_id,collection,id,data) values
('11111111-1111-4111-8111-111111111111','automations','auto_data_test1','{"name":"Data test A","trigger_type":"dm_ai_conversation","status":"paused","trigger_config":{"data_fields":["Name","Phone"]}}'),
('11111111-1111-4111-8111-111111111111','automations','auto_data_test2','{"name":"Data test B","trigger_type":"dm_ai_conversation","status":"paused","trigger_config":{"data_fields":["Name","Phone"]}}');
select public.autoreply_capture_customer('11111111-1111-4111-8111-111111111111','auto_data_test1','["Name","Phone"]','customer-a','test_customer','{"Name":"Asha","unapproved":"ignored"}','m1',now()-interval '5 seconds');
select public.autoreply_capture_customer('11111111-1111-4111-8111-111111111111','auto_data_test1','["Name","Phone"]','customer-a','test_customer','{"Name":"","Phone":"9876543210"}','m2',now());
select public.autoreply_capture_customer('11111111-1111-4111-8111-111111111111','auto_data_test1','["Name","Phone"]','customer-a','test_customer','{"Phone":"older-number"}','m0',now()-interval '10 seconds');
do $$ begin
 if (select count(*) from public.autoreply_customer_records where workspace_id='11111111-1111-4111-8111-111111111111')<>1 then raise exception 'duplicate customer'; end if;
 if not exists(select 1 from public.autoreply_customer_records where workspace_id='11111111-1111-4111-8111-111111111111' and data='{"Name":"Asha","Phone":"9876543210"}'::jsonb) then raise exception 'merge or stale task failed'; end if;
end $$;
-- Rename/prompt changes retain the current version; schema changes rotate.
update public.autoreply_documents set data=jsonb_set(data,'{name}','"Renamed test A"') where user_id='11111111-1111-4111-8111-111111111111' and id='auto_data_test1';
do $$ begin if (select count(*) from public.autoreply_data_collections where workspace_id='11111111-1111-4111-8111-111111111111' and automation_id='auto_data_test1')<>1 then raise exception 'rename rotated table'; end if;end $$;
update public.autoreply_documents set data=jsonb_set(data,'{trigger_config,data_fields}','["Name","Email"]') where user_id='11111111-1111-4111-8111-111111111111' and id='auto_data_test1';
select public.autoreply_capture_customer('11111111-1111-4111-8111-111111111111','auto_data_test1','["Name","Email"]','customer-a','test_customer','{"Email":"test@example.test"}','m3',now());
select public.autoreply_capture_customer('11111111-1111-4111-8111-111111111111','auto_data_test2','["Name","Phone"]','customer-a','test_customer','{"Name":"Separate table"}','m4',now());
do $$ begin
 if (select count(*) from public.autoreply_data_collections where workspace_id='11111111-1111-4111-8111-111111111111')<>3 then raise exception 'version rotation failed';end if;
 if (select count(*) from public.autoreply_customer_records where workspace_id='11111111-1111-4111-8111-111111111111')<>3 then raise exception 'automation isolation failed';end if;
end $$;
delete from public.autoreply_documents where user_id='11111111-1111-4111-8111-111111111111' and id='auto_data_test1';
do $$ begin
 if (select count(*) from public.autoreply_customer_records where workspace_id='11111111-1111-4111-8111-111111111111')<>3 then raise exception 'delete lost customer data';end if;
 if exists(select 1 from public.autoreply_data_collections where workspace_id='11111111-1111-4111-8111-111111111111' and automation_id='auto_data_test1' and (active or automation_deleted_at is null)) then raise exception 'missing deleted marker';end if;
 if has_function_privilege('authenticated','public.autoreply_capture_customer(text,text,jsonb,text,text,jsonb,text,timestamptz)','execute') then raise exception 'browser can capture arbitrary records';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.autoreply_customer_records where workspace_id='11111111-1111-4111-8111-111111111111')<>3 then raise exception 'owner cannot read records';end if;end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.autoreply_customer_records where workspace_id='11111111-1111-4111-8111-111111111111') then raise exception 'cross tenant data leak';end if;
 if exists(select 1 from public.autoreply_data_collections where workspace_id='11111111-1111-4111-8111-111111111111') then raise exception 'cross tenant table leak';end if;
 if has_table_privilege('authenticated','public.autoreply_customer_records','insert') then raise exception 'untrusted browser can write';end if;
end $$;
reset role;
select 'passed: merge, stale correction, automation isolation, versions, deletion retention, owner access and cross-tenant isolation' as customer_data_checks;
rollback;
