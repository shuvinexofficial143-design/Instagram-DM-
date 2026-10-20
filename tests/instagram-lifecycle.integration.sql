-- Synthetic connections only. No Meta calls. Every write rolls back.
begin;
set local plpgsql.check_asserts=on;
do $$
declare
 a text:='00000000-0000-4000-8000-000000000091';
 b text:='00000000-0000-4000-8000-000000000092';
 w text:='00000000-0000-4000-8000-000000000093';
 x text:='00000000-0000-4000-8000-000000000094';
 y text:='00000000-0000-4000-8000-000000000095';
 account1 jsonb:=jsonb_build_object('ig_user_id','17841999999999091','ig_scoped_id','27707999999999091','username','lifecycle_fixture_one','access_token','not-a-real-token','status','connected','connected_at',clock_timestamp());
 account2 jsonb:=jsonb_build_object('ig_user_id','17841999999999092','ig_scoped_id','27707999999999092','username','lifecycle_fixture_two','access_token','not-a-real-token','status','connected','connected_at',clock_timestamp());
 r jsonb; old_start timestamptz:=clock_timestamp();
begin
 insert into public.autoreply_profiles(user_id,email) values(a,'lifecycle-a@example.test'),(b,'lifecycle-b@example.test');
 r:=public.autoreply_connect_instagram_account(a,w,account1,clock_timestamp(),false);
 assert r->>'ok'='true',r::text;
 insert into public.autoreply_documents(user_id,collection,id,data) values(w,'contacts','fixture-customer','{"full_name":"Original owner customer"}');
 assert (select count(*) from public.autoreply_instagram_tokens where user_id=w)=1;
 update public.autoreply_instagram_memberships set ig_user_id=account1->>'ig_scoped_id' where workspace_id=w;
 r:=public.autoreply_connect_instagram_account(a,w,account1,clock_timestamp(),true);
 assert r->>'workspaceId'=w,r::text;
 assert (select ig_user_id from public.autoreply_instagram_memberships where workspace_id=w)=account1->>'ig_user_id';
 assert not (r->'account' ? 'access_token');
 r:=public.autoreply_connect_instagram_account(b,y,account1,clock_timestamp(),false);
 assert r->>'code'='INSTAGRAM_ACCOUNT_IN_USE',r::text;
 r:=public.autoreply_connect_instagram_account(a,x,account2,clock_timestamp(),false);
 assert r->>'code'='INSTAGRAM_ACCOUNT_LIMIT_REACHED',r::text;
 perform public.autoreply_disconnect_instagram_connection(w);
 assert not exists(select 1 from public.autoreply_instagram_tokens where user_id=w);
 assert not exists(select 1 from public.autoreply_documents where user_id=w and collection='instagram_account');
 assert exists(select 1 from public.autoreply_instagram_memberships where workspace_id=w and connection_archived);
 assert exists(select 1 from public.autoreply_documents where user_id=w and collection='contacts');
 r:=public.autoreply_connect_instagram_account(a,w,account1,old_start,true);
 assert r->>'code'='INSTAGRAM_CONNECTION_CANCELLED',r::text;
 r:=public.autoreply_connect_instagram_account(a,w,account1,clock_timestamp(),true);
 assert r->>'code'='RECONNECT_ACCOUNT_NOT_FOUND',r::text;
 -- Full unlink frees the plan slot for a DIFFERENT Instagram identity.
 r:=public.autoreply_connect_instagram_account(a,x,account2,clock_timestamp(),false);
 assert r->>'ok'='true',r::text;
 -- Fresh OAuth under another login creates its own isolated workspace.
 r:=public.autoreply_connect_instagram_account(b,y,account1,clock_timestamp(),false);
 assert r->>'ok'='true' and r->>'workspaceId'=y,r::text;
 assert not exists(select 1 from public.autoreply_documents where user_id=y and collection='contacts');
 assert (select owner_user_id from public.autoreply_instagram_memberships where workspace_id=w)=a;
 assert exists(select 1 from public.autoreply_instagram_tokens where user_id=x);
 perform public.autoreply_disconnect_instagram_connection(y);
 -- Returning archived connections must still obey the CURRENT plan allowance.
 r:=public.autoreply_connect_instagram_account(a,w,account1,clock_timestamp(),false);
 assert r->>'code'='INSTAGRAM_ACCOUNT_LIMIT_REACHED',r::text;
 perform public.autoreply_disconnect_instagram_connection(x);
 r:=public.autoreply_connect_instagram_account(a,y,account1,clock_timestamp(),false);
 assert r->>'ok'='true' and r->>'workspaceId'=w,r::text;
 assert exists(select 1 from public.autoreply_documents where user_id=w and collection='contacts');
 assert not exists(select 1 from public.autoreply_instagram_tokens where user_id=x or user_id=y);
 -- Earlier authorization remains cancelled even AFTER a fresh reconnection.
 r:=public.autoreply_connect_instagram_account(a,w,account1,old_start,false);
 assert r->>'code'='INSTAGRAM_CONNECTION_CANCELLED',r::text;
 assert not has_function_privilege('anon','public.autoreply_connect_instagram_account(text,text,jsonb,timestamp with time zone,boolean)','execute');
 assert not has_function_privilege('authenticated','public.autoreply_disconnect_instagram_connection(text)','execute');
 assert has_function_privilege('service_role','public.autoreply_disconnect_instagram_connection(text)','execute');
end $$;
-- An injected profile-cleanup failure must roll back token AND membership writes.
create function pg_temp.reject_fixture_profile_delete() returns trigger language plpgsql as $$
begin if old.user_id='00000000-0000-4000-8000-000000000093' and old.collection='instagram_account' then raise exception 'injected disconnect cleanup failure';end if;return old;end $$;
create trigger reject_fixture_profile_delete before delete on public.autoreply_documents for each row execute function pg_temp.reject_fixture_profile_delete();
do $$begin
 begin perform public.autoreply_disconnect_instagram_connection('00000000-0000-4000-8000-000000000093');raise exception 'Expected cleanup failure';
 exception when others then assert sqlerrm='injected disconnect cleanup failure',sqlerrm;end;
 assert exists(select 1 from public.autoreply_instagram_tokens where user_id='00000000-0000-4000-8000-000000000093');
 assert exists(select 1 from public.autoreply_instagram_memberships where workspace_id='00000000-0000-4000-8000-000000000093' and not connection_archived);
end $$;
drop trigger reject_fixture_profile_delete on public.autoreply_documents;
-- RLS retains the historical owner and never exposes its chats to the new login.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
do $$begin
 assert not exists(select 1 from public.autoreply_documents where user_id='00000000-0000-4000-8000-000000000093');
 assert not exists(select 1 from public.autoreply_instagram_memberships where workspace_id='00000000-0000-4000-8000-000000000093');
end $$;
reset role;
rollback;
