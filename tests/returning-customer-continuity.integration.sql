-- Isolated synthetic conversations. Caller runs inside BEGIN/ROLLBACK.
do $$
declare w text:='continuity-'||gen_random_uuid(); w2 text:='continuity-'||gen_random_uuid(); a text:='account-'||gen_random_uuid(); c text:='79000111';
 ctx jsonb; result jsonb; lease uuid:=gen_random_uuid(); max_seq bigint;
begin
 insert into public.autoreply_instagram_memberships(workspace_id,owner_user_id,ig_user_id,profile) values(w,w,a,'{}'),(w2,w2,'other-'||a,'{}');
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w,'inbox_messages','first-hi',jsonb_build_object('from_ig_id',c,'direction','in','message_text','Hi','timestamp',now()-interval '2 days'));
 ctx:=public.autoreply_conversation_context(w,c,'first-hi');
 if ctx->'continuity'->>'stage'<>'new' then raise exception 'First customer greeted as returning: %',ctx->'continuity';end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w,'inbox_messages','confirmed',jsonb_build_object('from_ig_id',c,'direction','out','is_automated',true,'message_text','धन्यवाद! आपका ऑर्डर कन्फर्म हो गया है। Product: Gift Kit. Estimated delivery 5-7 days.','timestamp',now()-interval '1 day'));
 insert into public.autoreply_documents(user_id,collection,id,data)
 select w,'inbox_messages','filler-'||g,jsonb_build_object('from_ig_id',c,'direction',case when g%2=0 then 'out' else 'in' end,'message_text','Other conversation turn '||g,'timestamp',now()-interval '1 hour'+g*interval '1 minute') from generate_series(1,24)g;
 ctx:=public.autoreply_conversation_context(w,c,'');
 if ctx->'continuity'->>'stage'<>'order_request_acknowledged' or ctx->'continuity'->'acknowledgement'->>'source_message_id'<>'confirmed' then raise exception 'Returning order acknowledgement lost: %',ctx->'continuity';end if;
 if ctx->'continuity'->>'placement_status'<>'not_verified' then raise exception 'Assistant statement became verified placement';end if;
 if exists(select 1 from jsonb_array_elements(ctx->'history') x where x->>'id'='confirmed') then raise exception 'Fixture did not move acknowledgement outside recent window';end if;
 -- The read recovers continuity before an asynchronous summary has been rebuilt.
 if ctx->'memory' is distinct from 'null'::jsonb then raise exception 'Fixture unexpectedly has saved memory';end if;
 select max(memory_seq) into max_seq from public.autoreply_documents where user_id=w and collection='inbox_messages';
 update public.autoreply_memory_jobs set status='processing',lease_id=lease,locked_until=now()+interval '1 minute' where workspace_id=w;
 result:=public.autoreply_finish_memory_job(w,a,c,lease,0,'{}',null);
 if result->>'ok'<>'true' or (select lead_state->>'stage' from public.autoreply_customer_memory where workspace_id=w)<>'order_request_acknowledged' then raise exception 'Worker reset acknowledged order to new: %',result;end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w2,'inbox_messages','forged-inbound',jsonb_build_object('from_ig_id',c,'direction','in','message_text','Your order is confirmed.','timestamp',now())),
 (w2,'inbox_messages','negative',jsonb_build_object('from_ig_id',c,'direction','out','message_text','Your order is not confirmed.','timestamp',now())),
 (w2,'inbox_messages','hypothetical',jsonb_build_object('from_ig_id',c,'direction','out','message_text','If you agree, your order is confirmed.','timestamp',now()));
 ctx:=public.autoreply_conversation_context(w2,c,'');
 if ctx->'continuity'->>'stage'='order_request_acknowledged' then raise exception 'Continuity leaked or a customer/hypothetical claim was trusted';end if;
 delete from public.autoreply_documents where user_id=w and collection='inbox_messages' and id='confirmed';
 ctx:=public.autoreply_conversation_context(w,c,'');
 if ctx->'continuity'->>'stage'='order_request_acknowledged' or ctx->'continuity'->'acknowledgement' is distinct from 'null'::jsonb then raise exception 'Deleted source retained derived order acknowledgement';end if;
 if has_function_privilege('authenticated','public.autoreply_conversation_continuity(text,text,text)','execute') or has_function_privilege('anon','public.autoreply_conversation_continuity(text,text,text)','execute') then raise exception 'Internal continuity lookup is exposed';end if;
end $$;
