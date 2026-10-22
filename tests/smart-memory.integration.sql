-- Synthetic fixtures and rollback only. No network or real customer mutations.
begin;
do $$
declare w text:=gen_random_uuid()::text; otherw text:=gen_random_uuid()::text; account text:='test-account-'||w; customer text:='77000009999111'; alias text:='77000009999112';
 j public.autoreply_memory_jobs; batch jsonb; r jsonb; before_seq bigint; ids text[]; checkpoint bigint; facts jsonb; blocked boolean;
begin
 insert into public.autoreply_instagram_memberships(workspace_id,owner_user_id,ig_user_id,profile) values(w,w,account,'{}'),(otherw,otherw,'other-'||account,'{}');
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w,'contacts',customer,jsonb_build_object('ig_user_id',alias,'ig_user_ids',jsonb_build_array(customer,alias),'ig_username','memory_customer')),
 (otherw,'contacts',customer,jsonb_build_object('ig_user_id',customer,'ig_username','foreign_customer'));
 insert into public.autoreply_documents(user_id,collection,id,data)
 select w,'inbox_messages','mem-'||g,jsonb_build_object('from_ig_id',case when g<5 then customer else alias end,
  'from_username','memory_customer','message_text',case when g=1 then 'My budget is 5000 INR. I run a gift business and need Instagram DM automation.'
   when g=2 then 'Our manual introduction explains the demo.' else 'Conversation turn '||g end,
  'direction',case when g%2=0 then 'out' else 'in' end,'is_automated',false,'timestamp',now()-interval '3 months'+g*interval '1 minute')
 from generate_series(1,10)g;
 select max(memory_seq) into before_seq from public.autoreply_documents where user_id=w and collection='inbox_messages';
 if (select count(*) from public.autoreply_memory_jobs where workspace_id=w)<>1 then raise exception 'Aliases produced duplicate jobs';end if;
 insert into public.autoreply_documents(user_id,collection,id,data)
 select user_id,collection,id,data||jsonb_build_object('from_username','updated_handle') from public.autoreply_documents where user_id=w and id='mem-10'
 on conflict(user_id,collection,id) do update set data=excluded.data;
 if (select requested_seq from public.autoreply_memory_jobs where workspace_id=w)<>before_seq then raise exception 'Profile echo created extra processing';end if;
 update public.autoreply_memory_jobs set next_attempt_at='2000-01-01' where workspace_id=w;
 select * into j from public.autoreply_claim_memory_jobs(1);
 if j.workspace_id<>w then raise exception 'Fixture claim did not select isolated job';end if;
 batch:=public.autoreply_memory_batch(w,account,customer,j.lease_id);
 if jsonb_array_length(batch->'messages')<>10 then raise exception 'Incremental batch missing aliases';end if;
 if public.autoreply_memory_batch(otherw,account,customer,j.lease_id) is not null then raise exception 'Foreign workspace loaded batch';end if;
 facts:=jsonb_build_object('budget',jsonb_build_object('value','5000 INR','source_message_id','mem-1'),
  'customer_name',jsonb_build_object('value','Invented','source_message_id','mem-1'));
 select array_agg(id order by memory_seq) into ids from public.autoreply_documents where user_id=w and collection='inbox_messages';
 r:=public.autoreply_finish_memory_job(w,account,customer,j.lease_id,0,facts,'Customer needs gift-business Instagram DM automation; budget 5000 INR.',ids);
 if r->'ok'<>'true'::jsonb or (select cm.facts ? 'customer_name' from public.autoreply_customer_memory cm where workspace_id=w) then raise exception 'Unverified fact accepted or valid save failed: %',r;end if;
 checkpoint:=(r->>'checkpoint')::bigint;
 r:=public.autoreply_finish_memory_job(w,account,customer,j.lease_id,1,facts,'Overwrite by stale lease',ids);
 if r->>'reason'<>'stale_lease' then raise exception 'Duplicate completion overwrote memory';end if;
 r:=public.autoreply_conversation_context(w,alias,'');
 if r->'memory'->'facts'->'budget'->>'value'<>'5000 INR' or jsonb_array_length(r->'history')<>10 then raise exception 'Long-term alias recognition failed: %',r;end if;
 if public.autoreply_conversation_context(otherw,customer,'')->'memory' is distinct from 'null'::jsonb then raise exception 'Memory crossed workspace';end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values(w,'inbox_messages','correction',jsonb_build_object('from_ig_id',alias,'message_text','My budget is now 8000 INR. Show the demo.','direction','in','timestamp',now()));
 update public.autoreply_memory_jobs set next_attempt_at='2000-01-01' where workspace_id=w;
 select * into j from public.autoreply_claim_memory_jobs(1);
 insert into public.autoreply_documents(user_id,collection,id,data) values(w,'inbox_messages','late-message',jsonb_build_object('from_ig_id',alias,'message_text','Show the demo please.','direction','in','timestamp',now()));
 r:=public.autoreply_finish_memory_job(w,account,customer,j.lease_id,1,jsonb_build_object('budget',jsonb_build_object('value','8000 INR','source_message_id','correction')),p_usage=>jsonb_build_object('observed_seq',j.requested_seq));
 if not exists(select 1 from public.autoreply_memory_jobs where workspace_id=w and status='pending' and next_attempt_at<=now() and requested_seq>processed_seq) then raise exception 'Concurrent message was hidden behind an old snapshot';end if;
 if r->'ok'<>'true'::jsonb then raise exception 'Explicit correction did not save';end if;
 update public.autoreply_memory_jobs set next_attempt_at='2000-01-01' where workspace_id=w;
 select * into j from public.autoreply_claim_memory_jobs(1);
 r:=public.autoreply_finish_memory_job(w,account,customer,j.lease_id,2,facts,null,'{}','provider_unavailable');
 if (select cm.facts->'budget'->>'value' from public.autoreply_customer_memory cm where workspace_id=w)<>'8000 INR' then raise exception 'Older summary rolled back correction';end if;
 if (select summary_checkpoint from public.autoreply_customer_memory where workspace_id=w)<>checkpoint then raise exception 'Failed summary advanced checkpoint';end if;
 if not exists(select 1 from public.autoreply_memory_jobs where workspace_id=w and status='pending' and attempts>0 and next_attempt_at>now() and last_error='provider_unavailable') then raise exception 'Background retry was not durable';end if;
 r:=public.autoreply_search_conversation(w,alias,'5000');if jsonb_array_length(r)<>1 then raise exception 'Scoped history retrieval failed';end if;
 if jsonb_array_length(public.autoreply_search_conversation(otherw,customer,'5000'))<>0 then raise exception 'Historical search leaked data';end if;
 r:=public.autoreply_mark_inbox_read(w,alias,true);
 if exists(select 1 from public.autoreply_documents where user_id=w and collection='inbox_messages' and data->>'direction'='in' and data->'is_read'<>'true') then raise exception 'Unread history aliases were left behind';end if;
 update public.autoreply_memory_jobs set next_attempt_at='2000-01-01' where workspace_id=w;
 select * into j from public.autoreply_claim_memory_jobs(1);
 blocked:=false;
 begin perform public.autoreply_finish_memory_job(w,account,customer,j.lease_id,3,'{}','Summary that skipped a message',array['late-message']);
 exception when others then blocked:=sqlerrm='Summary checkpoint gap';end;
 if not blocked then raise exception 'A checkpoint skipped an unsummarized message';end if;
 r:=public.autoreply_finish_memory_job(w,account,customer,j.lease_id,999,'{}',null);
 if r->>'reason'<>'version_conflict' then raise exception 'CAS did not reject stale memory snapshot';end if;
 if has_function_privilege('authenticated','public.autoreply_finish_memory_job(text,text,text,uuid,bigint,jsonb,text,text[],text,jsonb)','execute')
  or has_table_privilege('anon','public.autoreply_customer_memory','select') then raise exception 'Internal memory processing exposed';end if;
 perform set_config('autoreply.test_workspace',w,true);perform set_config('autoreply.test_other',otherw,true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('autoreply.test_workspace'),true);
set local role authenticated;
do $$declare blocked boolean:=false;begin
 if (select count(*) from public.autoreply_customer_memory)<>1 then raise exception 'Memory RLS leaked or hid own rows';end if;
 begin perform public.autoreply_inbox_page(current_setting('autoreply.test_other'));
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Inbox allowed foreign workspace';end if;
end $$;
reset role;
do $$declare w text:=current_setting('autoreply.test_workspace');begin
 delete from public.autoreply_documents where user_id=w and collection='inbox_messages' and id='mem-1';
 if exists(select 1 from public.autoreply_customer_memory where workspace_id=w) then raise exception 'Removing a source retained derived memory';end if;
 if exists(select 1 from public.autoreply_memory_jobs where workspace_id=w and lease_id is not null) then raise exception 'Source deletion retained a stale lease';end if;
end $$;
rollback;
