begin;
set local request.jwt.claim.role='service_role';
do $test$
declare a jsonb;b jsonb;w text:='test_dm_burst_20261115';sender text:='synthetic_customer';
begin
 a:=public.autoreply_dm_turn(w,sender,'register','synthetic_first');
 b:=public.autoreply_dm_turn(w,sender,'register','synthetic_second');
 if (b->>'revision')::bigint<>(a->>'revision')::bigint+1 then raise exception 'Revision did not advance';end if;
 if (public.autoreply_dm_turn(w,sender,'observe','',(a->>'revision')::bigint)->>'latest')::boolean then raise exception 'Stale worker remained current';end if;
 if (public.autoreply_dm_turn(w,sender,'claim','',(b->>'revision')::bigint)->>'claimed')::boolean then raise exception 'Reply was allowed before source persistence';end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w,'inbox_messages','synthetic_first',jsonb_build_object('from_ig_id',sender,'direction','in','message_text','My name is Arun Sharma','timestamp',now())),
 (w,'inbox_messages','synthetic_second',jsonb_build_object('from_ig_id',sender,'direction','in','message_text','Flat 12, Lake Road, Mohan Colony, Tarana, Ujjain, MP 456665','timestamp',now()));
 update public.autoreply_documents set data=jsonb_set(data,'{quiet_until}',to_jsonb(clock_timestamp()-interval '1 second')) where user_id=w and collection='dm_reply_turns' and id=sender;
 a:=public.autoreply_dm_turn(w,sender,'claim','',(b->>'revision')::bigint);
 if not (a->>'claimed')::boolean then raise exception 'Latest ready turn was not allowed';end if;
 if (public.autoreply_dm_turn(w,sender,'claim','',(b->>'revision')::bigint)->>'claimed')::boolean then raise exception 'Same revision claimed twice';end if;
 perform public.autoreply_dm_turn(w,sender,'finish','',(b->>'revision')::bigint);
 a:=public.autoreply_dm_turn(w,sender,'register','synthetic_third');
 if a->'pending_ids'<>'["synthetic_third"]'::jsonb then raise exception 'Sent sources were replayed into the next batch';end if;
 b:=public.autoreply_dm_turn('other_synthetic_workspace',sender,'register','other_message');
 if not (public.autoreply_dm_turn(w,sender,'observe','',(a->>'revision')::bigint)->>'latest')::boolean then raise exception 'Another workspace superseded this customer';end if;
 if has_function_privilege('anon','public.autoreply_dm_turn(text,text,text,text,bigint)','execute') or has_function_privilege('authenticated','public.autoreply_dm_turn(text,text,text,text,bigint)','execute') then raise exception 'Internal coordinator exposed';end if;
 perform public.autoreply_merge_customer_facts(w,sender,jsonb_build_object('road',jsonb_build_object('value','Lake Road','evidence','Lake Road','source_message_id','synthetic_second'),'area',jsonb_build_object('value','Mohan Colony','evidence','Mohan Colony','source_message_id','synthetic_second'),'house_number',jsonb_build_object('value','Flat 12','evidence','Flat 12','source_message_id','synthetic_second')));
 if not exists(select 1 from public.autoreply_documents where user_id=w and collection='customer_facts' and data#>>'{facts,road,value}'='Lake Road' and data#>>'{facts,area,value}'='Mohan Colony') then raise exception 'Structured address parts missing';end if;
end;
$test$;
select 'burst revision, single send claim, persisted sources, isolation and address parts passed' as result;
rollback;
