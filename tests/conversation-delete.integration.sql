-- Synthetic rows only; all changes roll back.
begin;
set local plpgsql.check_asserts=on;
insert into public.autoreply_documents(user_id,collection,id,data)
select '00000000-0000-4000-8000-000000000097','inbox_messages','fixture_message_'||n,
 jsonb_build_object('from_username','@Fixture_User','message_text','Synthetic history') from generate_series(1,1005) n;
insert into public.autoreply_documents(user_id,collection,id,data) values
('00000000-0000-4000-8000-000000000097','contacts','fixture_contact','{"ig_username":"Fixture_User"}'),
('00000000-0000-4000-8000-000000000097','inbox_messages','fixture_other','{"from_username":"another_user"}'),
('00000000-0000-4000-8000-000000000097','inbox_messages','fixture_id','{"from_ig_id":"123456789"}'),
('00000000-0000-4000-8000-000000000096','inbox_messages','fixture_other_workspace','{"from_username":"Fixture_User"}');
insert into public.autoreply_instagram_memberships(workspace_id,owner_user_id,ig_user_id,profile) values('audit_delete_member_workspace','00000000-0000-4000-8000-000000000097','audit_delete_ig_id','{}');
insert into public.autoreply_documents(user_id,collection,id,data) values('audit_delete_member_workspace','inbox_messages','member_fixture','{"from_username":"member_customer"}');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000097',true);
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.autoreply_delete_conversations('00000000-0000-4000-8000-000000000097',array['fixture_contact'],'{}');
 assert (r->>'messagesDeleted')::int=1005,r::text;
 assert (r->>'contactsDeleted')::int=1;
 assert r->'usernames' ? 'fixture_user';
 r:=public.autoreply_delete_conversations('00000000-0000-4000-8000-000000000097','{}',array['123456789']);
 assert (r->>'messagesDeleted')::int=1;
 r:=public.autoreply_delete_conversations('audit_delete_member_workspace','{}',array['member_customer']);
 assert (r->>'messagesDeleted')::int=1,'Membership workspace deletion must respect its owner';
 begin
  perform public.autoreply_delete_conversations('00000000-0000-4000-8000-000000000096','{}',array['fixture_user']);
  raise exception 'Expected workspace denial';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 assert (select count(*) from public.autoreply_documents where user_id='00000000-0000-4000-8000-000000000097' and collection='inbox_messages')=1;
 assert exists(select 1 from public.autoreply_documents where user_id='00000000-0000-4000-8000-000000000096' and id='fixture_other_workspace');
 assert not has_function_privilege('anon','public.autoreply_delete_conversations(text,text[],text[])','execute');
end $$;
rollback;
