-- Run as the migration owner; all fixtures are rolled back, no Meta calls.
begin;
do $$
declare w text:=gen_random_uuid()::text; otherw text:=gen_random_uuid()::text;
 business text:='17841400999112233'; otherbusiness text:='17841400999112234'; sender text:='770000099911223';
 result jsonb; context jsonb; old_version text; control jsonb; message_count integer;
begin
 insert into public.autoreply_instagram_tokens(user_id,account) values
 (w,jsonb_build_object('access_token','not-a-real-token','ig_user_id',business,'own_sender_ids',jsonb_build_array('280000099911223'))),
 (otherw,jsonb_build_object('access_token','not-a-real-token','ig_user_id',otherbusiness));
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (w,'automations','auto_context_fixture','{"id":"auto_context_fixture","name":"Context fixture","trigger_type":"dm_ai_conversation","status":"active","actions":[{"type":"ai_chatbot","ai_system_instruction":"Follow this business prompt"}]}'),
 (w,'contacts',sender,jsonb_build_object('ig_user_id',sender,'ig_username','context_customer'));

 result:=public.autoreply_record_instagram_outbound(business,business,sender,'context-intro','Our demo includes a five-day trial.',now()-interval '10 minutes',true);
 if result->'recorded' is distinct from 'true'::jsonb then raise exception 'Native outgoing message not recorded: %',result;end if;
 if exists(select 1 from public.autoreply_documents where user_id=w and collection='ai_thread_controls') then raise exception 'Outgoing capture changed AI control';end if;
 result:=public.autoreply_record_instagram_outbound(business,business,sender,'context-intro','Duplicate must not overwrite original.',now(),true);
 if result->'duplicate' is distinct from 'true'::jsonb then raise exception 'Echo retry was not idempotent';end if;
 if (select data->>'message_text' from public.autoreply_documents where user_id=w and collection='inbox_messages' and id='context-intro')<>'Our demo includes a five-day trial.' then raise exception 'Duplicate overwrote original context';end if;

 insert into public.autoreply_documents(user_id,collection,id,data) values(w,'inbox_messages','context-customer-reply',
 jsonb_build_object('from_ig_id',sender,'direction','in','message_text','How can I set it up?','timestamp',now()));
 context:=public.autoreply_conversation_context(w,sender,'context-customer-reply');
 if jsonb_array_length(context->'history')<>1 or context->'history'->0->>'role'<>'assistant' or context->'history'->0->>'content'<>'Our demo includes a five-day trial.' then raise exception 'Manual introduction was not supplied as assistant transcript data: %',context;end if;
 if context->'manual_context'->>'id'<>'context-intro' then raise exception 'Manual introduction anchor missing';end if;
 if jsonb_array_length(public.autoreply_conversation_context(otherw,sender,'')->'history')<>0 then raise exception 'History leaked to another account';end if;

 context:=public.autoreply_prepare_automation_event(array[business],'context-prepare-event',sender);
 if context->'manual_context'->>'id'<>'context-intro' or jsonb_array_length(context->'automations')<>1 or context->'quota' is null then raise exception 'Prepare lost context, prompt or entitlement';end if;
 if context->>'message_state'<>'new' or context->'thread_human_handoff'<>'false'::jsonb then raise exception 'Preparation changed message claim or handoff';end if;
 old_version:=context->>'thread_outbound_version';

 result:=public.autoreply_record_instagram_outbound(business,'280000099911223',sender,'context-alias','This message uses a verified business sender alias.',now(),false);
 if result->'recorded' is distinct from 'true'::jsonb then raise exception 'Verified sender alias was not accepted';end if;
 if public.autoreply_reserve_context_delivery(w,'context-stale',true,'auto_context_fixture',sender,'',old_version)->>'reason'<>'conversation_context_changed' then raise exception 'Stale AI reply survived a new manual message';end if;
 result:=public.autoreply_record_instagram_outbound('280000099911223','280000099911223',sender,'context-scoped-entry','A native app message addressed through the scoped business entry.',now(),true);
 if result->'recorded' is distinct from 'true'::jsonb then raise exception 'Scoped business entry failed to resolve its own account';end if;
 result:=public.autoreply_record_instagram_outbound(business,'770000000009999',sender,'context-forged','Wrong sender.',now(),false);
 if result->'recorded' is distinct from 'false'::jsonb then raise exception 'Foreign sender was treated as business';end if;
 result:=public.autoreply_record_instagram_outbound('unconnected',business,sender,'context-unknown','Wrong business.',now(),true);
 if result->'recorded' is distinct from 'false'::jsonb then raise exception 'Unknown entry used single-account fallback';end if;
 result:=public.autoreply_record_instagram_outbound(business,business,business,'context-self','Self message.',now(),true);
 if result->'recorded' is distinct from 'false'::jsonb then raise exception 'Self message was stored as customer';end if;

 control:=public.autoreply_set_thread_control(w,sender,true,'context_customer');
 perform public.autoreply_record_instagram_outbound(business,business,sender,'context-human','A human is helping now.',now(),true);
 if (select data->'paused' from public.autoreply_documents where user_id=w and collection='ai_thread_controls' and id=sender) is distinct from 'true'::jsonb then raise exception 'Outgoing message resumed paused AI';end if;
 if public.autoreply_reserve_context_delivery(w,'context-paused',true,'auto_context_fixture',sender,control->>'updated_at',public.autoreply_outbound_context_version(w,sender))->>'reason'<>'conversation_ai_paused' then raise exception 'Fresh transcript bypassed pause';end if;
 perform public.autoreply_request_human_handoff(w,sender,'auto_context_fixture','Context','customer_requested','Please speak with a human','context-handoff',control->>'updated_at');
 perform public.autoreply_record_instagram_outbound(business,business,sender,'context-after-handoff','We are still handling this manually.',now(),true);
 if not exists(select 1 from public.autoreply_human_handoffs where workspace_id=w and sender_id=sender and status<>'resumed') then raise exception 'Outgoing context closed handoff';end if;

 insert into public.autoreply_documents(user_id,collection,id,data) values(w,'inbox_messages','context-confirmed-ai',
 jsonb_build_object('from_ig_id',sender,'direction','out','is_automated',true,'message_text','Confirmed automated reply','timestamp',now()));
 perform public.autoreply_record_instagram_outbound(business,business,sender,'context-confirmed-ai','Confirmed automated reply',now(),true);
 if (select data->'is_automated' from public.autoreply_documents where user_id=w and collection='inbox_messages' and id='context-confirmed-ai') is distinct from 'true'::jsonb then raise exception 'Echo overwrote automated attribution';end if;

 -- Do not truncate a manual opening just because twelve newer turns exist.
 for message_count in 1..15 loop
   insert into public.autoreply_documents(user_id,collection,id,data) values(w,'inbox_messages','context-recent-'||message_count,
     jsonb_build_object('from_ig_id',sender,'direction','in','message_text','Newer customer message '||message_count,'timestamp',now()+message_count*interval '1 second'));
 end loop;
 context:=public.autoreply_conversation_context(w,sender,'');
 if jsonb_array_length(context->'history')<>12 or context->'manual_context'->>'id' not in ('context-after-handoff','context-human','context-alias','context-scoped-entry') then raise exception 'Recent history or manual context retention failed';end if;
 if public.autoreply_record_instagram_outbound(business,business,sender,'context-future','Invalid future timestamp',now()+interval '1 day',true)->'recorded' is distinct from 'false'::jsonb then raise exception 'Future timestamp was accepted';end if;

 if has_function_privilege('anon','public.autoreply_record_instagram_outbound(text,text,text,text,text,timestamptz,boolean)','execute')
   or has_function_privilege('authenticated','public.autoreply_conversation_context(text,text,text)','execute')
   or has_function_privilege('authenticated','public.autoreply_reserve_context_delivery(text,text,boolean,text,text,text,text)','execute') then raise exception 'Internal transcript functions exposed to browser roles';end if;
end $$;
rollback;
