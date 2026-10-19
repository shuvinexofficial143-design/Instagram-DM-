-- Synthetic administrator/customer integration. Always rollback; no network requests.
begin;
do $$
declare
 actor uuid:='00000000-0000-4000-8000-000000000071';
 customer text:='00000000-0000-4000-8000-000000000072';
 w text:='guest_00000000-0000-4000-8000-000000000073';
 ownw text:='guest_00000000-0000-4000-8000-000000000074';
 cid uuid:='00000000-0000-4000-8000-000000000075';
 a jsonb:='{"id":"auto_admin_fixture","name":"Fixture rule","status":"paused","trigger_type":"dm_ai_conversation","trigger_config":{"data_capture_enabled":true,"data_fields":["Name","Phone"]},"actions":[{"type":"ai_chatbot","ai_system_instruction":"Original prompt"},{"type":"send_dm","message_text":"Please wait"}]}'::jsonb;
 r jsonb; v uuid; job jsonb; preserved integer;
begin
 insert into public.autoreply_profiles(user_id,email) values(customer,'customer-fixture@example.test'),(actor::text,'admin-fixture@example.test');
 insert into public.autoreply_instagram_memberships(workspace_id,owner_user_id,ig_user_id,profile) values(w,customer,'__admin_customer_ig__','{"username":"fixture_customer"}'),(ownw,actor::text,'__admin_own_ig__','{"username":"fixture_admin"}');
 insert into public.autoreply_instagram_tokens(user_id,account) values(ownw,'{"ig_user_id":"__admin_own_ig__","username":"fixture_admin","access_token":"not-real-fixture"}');
 perform public.autoreply_admin_edit_automation(actor,'admin-fixture@example.test',w,'save',a,false);
 if not exists(select 1 from public.autoreply_documents where user_id=w and collection='automations' and id=a->>'id' and data->>'admin_change'='created') then raise exception 'Admin create missing from customer documents';end if;
 if not exists(select 1 from public.autoreply_documents where user_id=w and collection='workspace_notices') then raise exception 'Customer update notice missing';end if;
 perform public.autoreply_admin_edit_automation(actor,'admin-fixture@example.test',w,'save',jsonb_set(a,'{actions,0,ai_system_instruction}','"Updated prompt"'),false);
 select id into v from public.autoreply_admin_automation_versions where workspace_id=w and operation='save' and before_data is not null order by created_at desc limit 1;
 perform public.autoreply_admin_edit_automation(actor,'admin-fixture@example.test',w,'restore',jsonb_build_object('id',a->>'id','version_id',v),false);
 if (select data#>>'{actions,0,ai_system_instruction}' from public.autoreply_documents where user_id=w and collection='automations' and id=a->>'id')<>'Original prompt' then raise exception 'History did not restore prior prompt';end if;
 perform public.autoreply_admin_edit_automation(actor,'admin-fixture@example.test',w,'status',jsonb_build_object('id',a->>'id','status','active'),false);
 perform public.autoreply_admin_edit_automation(actor,'admin-fixture@example.test',w,'save',a||'{"id":"auto_admin_other","name":"Other AI","status":"active"}',true);
 if (select data->>'status' from public.autoreply_documents where user_id=w and collection='automations' and id=a->>'id')<>'paused' then raise exception 'Multiple AI catch-all rules active';end if;
 select count(*) into preserved from public.autoreply_data_collections where workspace_id=w;
 perform public.autoreply_admin_edit_automation(actor,'admin-fixture@example.test',w,'delete',jsonb_build_object('id',a->>'id'),false);
 if (select count(*) from public.autoreply_data_collections where workspace_id=w)<>preserved then raise exception 'Customer tables lost on delete';end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values
 (ownw,'contacts','770000000000071','{"ig_user_id":"770000000000071","ig_username":"ready_fixture"}'),
 (ownw,'contacts','770000000000072','{"ig_user_id":"770000000000072","ig_username":"expired_fixture"}'),
 (ownw,'contacts','770000000000073','{"ig_user_id":"770000000000073","ig_username":"outbound_only_fixture"}'),
 (ownw,'inbox_messages','__admin_recent_in__',jsonb_build_object('from_ig_id','770000000000071','direction','in','timestamp',now()::text)),
 (ownw,'inbox_messages','__admin_old_in__',jsonb_build_object('from_ig_id','770000000000072','direction','in','timestamp',(now()-interval '25 hours')::text)),
 (ownw,'inbox_messages','__admin_recent_out__',jsonb_build_object('from_ig_id','770000000000073','direction','out','timestamp',now()::text)),
 (ownw,'automations','auto_global_paused','{"name":"Stay OFF","status":"paused","trigger_type":"dm_ai_conversation","actions":[]}');
 r:=public.autoreply_campaign_eligibility(ownw,array['ready_fixture','770000000000071','expired_fixture','outbound_only_fixture','unknown_fixture']);
 if r#>>'{0,eligible}'<>'true' or r#>>'{1,reason}'<>'Duplicate recipient' or r#>>'{2,eligible}'='true' or r#>>'{3,eligible}'='true' or r#>>'{4,eligible}'='true' then raise exception 'Recipient eligibility failed: %',r;end if;
 begin
  perform public.autoreply_create_campaign(actor,cid,w,'Forbidden','Hello','Help',true,array['ready_fixture']);
  raise exception 'Foreign sender accepted';
 exception when others then if sqlerrm='Foreign sender accepted' then raise;end if;end;
 perform public.autoreply_create_campaign(actor,cid,ownw,'Fixture campaign','Hello','Help customers',true,array['ready_fixture','expired_fixture']);
 perform public.autoreply_create_campaign(actor,cid,ownw,'Fixture campaign','Hello','Help customers',true,array['ready_fixture']);
 if (select count(*) from public.autoreply_campaign_recipients where campaign_id=cid)<>2 then raise exception 'Idempotent campaign create duplicated recipients';end if;
 update public.autoreply_campaigns set status='running' where id=cid;
 r:=public.autoreply_claim_campaign_batch();
 select x into job from jsonb_array_elements(r)x where x->>'campaign_id'=cid::text;
 if job is null then raise exception 'Eligible campaign not claimed';end if;
 r:=public.autoreply_claim_campaign_batch();
 if exists(select 1 from jsonb_array_elements(r)x where x->>'campaign_id'=cid::text) then raise exception 'Claim duplicated an in-flight recipient';end if;
 perform public.autoreply_finish_campaign_recipient((job->>'id')::uuid,(job->>'lease_id')::uuid,'sent','__admin_sent_confirmation__','');
 if not exists(select 1 from public.autoreply_documents where user_id=ownw and collection='inbox_messages' and id='__admin_sent_confirmation__' and data->>'direction'='out') then raise exception 'Confirmed campaign missing from Inbox';end if;
 r:=public.autoreply_campaign_followup(ownw,'770000000000071');
 if r->>'id'<>'campaign_'||cid::text then raise exception 'Recipient AI follow-up missing';end if;
 if (select data->>'status' from public.autoreply_documents where user_id=ownw and collection='automations' and id='auto_global_paused')<>'paused' then raise exception 'Campaign resumed global automation';end if;
 insert into public.autoreply_documents(user_id,collection,id,data) values(ownw,'ai_thread_controls','770000000000071','{"paused":true}');
 r:=public.autoreply_reserve_automation_delivery(ownw,'__admin_fixture_takeover__',true,'campaign_'||cid::text,'770000000000071');
 if r->>'reason'<>'conversation_ai_paused' then raise exception 'Campaign ignored human takeover';end if;
 update public.autoreply_campaigns set followup_enabled=false where id=cid;
 if public.autoreply_campaign_followup(ownw,'770000000000071') is not null then raise exception 'OFF campaign follow-up still active';end if;
 update public.autoreply_campaigns set followup_enabled=true,status='stopped' where id=cid;
 r:=public.autoreply_reserve_automation_delivery(ownw,'__admin_fixture_stopped__',true,'campaign_'||cid::text,'770000000000071');
 if r->>'reason'<>'campaign_followup_stopped' then raise exception 'Stopped campaign can dispatch';end if;
 if has_table_privilege('authenticated','public.autoreply_campaigns','SELECT') or has_table_privilege('anon','public.autoreply_admin_automation_versions','SELECT') or has_function_privilege('authenticated','public.autoreply_admin_edit_automation(uuid,text,text,text,jsonb,boolean)','execute') or has_function_privilege('anon','public.autoreply_claim_campaign_batch()','execute') then raise exception 'Private administrator storage exposed';end if;
 -- Verify the customer's real authenticated RLS reads the admin-created records only in their workspace.
 perform set_config('request.jwt.claim.sub',customer,true);
 set local role authenticated;
 if not exists(select 1 from public.autoreply_documents where user_id=w and collection='automations' and id='auto_admin_other') then raise exception 'Customer cannot see administrator edit';end if;
 if exists(select 1 from public.autoreply_documents where user_id=ownw) then raise exception 'Customer can read another workspace';end if;
 reset role;
end $$;
rollback;
