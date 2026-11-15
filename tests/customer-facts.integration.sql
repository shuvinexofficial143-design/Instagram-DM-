begin;
set local request.jwt.claim.role='service_role';
insert into public.autoreply_documents(user_id,collection,id,data) values
('test_luna_facts','inbox_messages','synthetic-in',jsonb_build_object('from_ig_id','synthetic-sender','direction','in','message_text','My name is Arun Sharma. Phone 9876543210','timestamp','2026-11-15T00:00:00Z')),
('test_luna_facts','inbox_messages','synthetic-out',jsonb_build_object('from_ig_id','synthetic-sender','direction','out','message_text','Name is Someone Else','timestamp','2026-11-15T00:01:00Z')),
('test_luna_facts','inbox_messages','synthetic-chatter',jsonb_build_object('from_ig_id','synthetic-sender','direction','in','message_text','Kr Diya bro','timestamp','2026-11-15T00:02:00Z'));
do $test$
declare result jsonb;
begin
 result:=public.autoreply_merge_customer_facts('test_luna_facts','synthetic-sender','{"name":{"value":"Arun Sharma","evidence":"Arun Sharma","source_message_id":"synthetic-in"},"phone":{"value":"9876543210","evidence":"9876543210","source_message_id":"synthetic-in"}}');
 if result#>>'{facts,name,value}'<>'Arun Sharma' or result#>>'{facts,phone,value}'<>'9876543210' then raise exception 'Customer details were not preserved';end if;
 result:=public.autoreply_merge_customer_facts('test_luna_facts','synthetic-sender','{"name":{"value":"Diya","evidence":"Diya","source_message_id":"synthetic-chatter"},"city":{"value":"Someone Else","evidence":"Someone Else","source_message_id":"synthetic-out"}}');
 if result#>>'{facts,name,value}'<>'Arun Sharma' or result#>'{facts,city}' is not null then raise exception 'Chatter or owner details overwrote customer facts';end if;
 result:=public.autoreply_merge_customer_facts('test_luna_facts','foreign-sender','{"phone":{"value":"9876543210","evidence":"9876543210","source_message_id":"synthetic-in"}}');
 if result#>'{facts,phone}' is not null then raise exception 'Foreign conversation facts were accepted';end if;
 if has_function_privilege('authenticated','public.autoreply_merge_customer_facts(text,text,jsonb,jsonb)','execute') or has_function_privilege('anon','public.autoreply_merge_customer_facts(text,text,jsonb,jsonb)','execute') then raise exception 'Internal customer merge RPC is exposed';end if;
end;
$test$;
select 'customer evidence, overwrite protection, conversation isolation and RPC access passed' as result;
rollback;
