-- Synthetic accounts only; no external requests or real messages. Entire test rolls back.
begin;
do $$
declare w text:=gen_random_uuid()::text; otherw text:=gen_random_uuid()::text;
 business text:='17841400999112233'; scoped text:='280000099911223'; customer text:='770000099911223'; alias text:='770000099911224'; r jsonb;
begin
 insert into public.autoreply_instagram_tokens(user_id,account) values(w,jsonb_build_object('access_token','test-only','ig_user_id',business,'ig_scoped_id',scoped));
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w,'contacts',customer,jsonb_build_object('ig_user_id',alias,'ig_user_ids',jsonb_build_array(customer,alias),'ig_username','customer_handle')),
 (otherw,'contacts',customer,jsonb_build_object('ig_user_id',customer,'ig_username','foreign_handle'));
 r:=public.autoreply_claim_dm_context_v4(array['unconnected-entry'],'bad-scope','','123456789',false);
 if r is not null then raise exception 'Unknown business inherited another workspace';end if;
 r:=public.autoreply_claim_dm_context_v4(array[scoped],'scoped-event','',customer,false);
 if r->>'user_id' is distinct from w then raise exception 'Verified scoped entry stopped resolving';end if;
 r:=public.autoreply_record_instagram_outbound(business,business,alias,'alias-intro','Hello from Instagram',now(),true);
 if r->'recorded' is distinct from 'true'::jsonb then raise exception 'Outbound was not saved: %',r;end if;
 if (select data->>'from_username' from public.autoreply_documents where user_id=w and collection='inbox_messages' and id='alias-intro')<>'customer_handle' then raise exception 'Alias lost verified username';end if;
 if (select count(*) from public.autoreply_documents where user_id=w and collection='contacts')<>1 then raise exception 'Echo created duplicate contact';end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w,'inbox_messages','old-number',jsonb_build_object('from_ig_id',customer,'from_username',customer,'message_text','Earlier message','is_read',true,'direction','in','timestamp',now())),
 (otherw,'inbox_messages','foreign-number',jsonb_build_object('from_ig_id',customer,'from_username','foreign_handle','message_text','Private foreign history'));
 r:=public.autoreply_enrich_instagram_contact(w,alias,'new_handle','');
 if r->>'messagesUpdated'<>'2' then raise exception 'Old alias messages not enriched: %',r;end if;
 if not exists(select 1 from public.autoreply_documents where user_id=w and id='old-number' and data->>'from_username'='new_handle' and data->>'message_text'='Earlier message' and data->'is_read'='true'::jsonb) then raise exception 'Enrichment lost transcript or read status';end if;
 if (select data->>'from_username' from public.autoreply_documents where user_id=otherw and id='foreign-number')<>'foreign_handle' then raise exception 'Enrichment crossed workspace';end if;
 r:=public.autoreply_enrich_instagram_contact(w,alias,alias,'');
 if r->'ok' is distinct from 'false'::jsonb then raise exception 'Numeric fallback overwrote handle';end if;
 r:=public.autoreply_record_instagram_outbound(business,business,scoped,'self-alias','Self',now(),true);
 if r->>'reason'<>'self_message' then raise exception 'Own scoped ID became a customer';end if;
 if has_function_privilege('authenticated','public.autoreply_enrich_instagram_contact(text,text,text,text)','execute') then raise exception 'Profile mutation exposed to clients';end if;
 perform set_config('request.jwt.claim.sub',w,true);
 r:=public.autoreply_delete_conversations(w,'{}',array[alias]);
 if r->>'messagesDeleted'<>'2' then raise exception 'Deleting current alias left historical conversation messages: %',r;end if;
 if not exists(select 1 from public.autoreply_documents where user_id=otherw and id='foreign-number') then raise exception 'Alias deletion touched another workspace';end if;
end $$;
rollback;
