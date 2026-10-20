CREATE OR REPLACE FUNCTION public.autoreply_register_instagram_connection(p_owner_id text, p_workspace_id text, p_account jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 identity_id text:=p_account->>'ig_user_id'; scoped_id text:=p_account->>'ig_scoped_id';
 existing public.autoreply_instagram_memberships%rowtype; destination public.autoreply_instagram_memberships%rowtype;
 target_workspace text; previous_workspace text; previous_owner text; previous_token jsonb;
 account jsonb:=p_account; safe jsonb; limits jsonb; identity_matches integer; saved_count integer; lock_id text;
 moved boolean:=false; already_counted boolean:=false; restored_archive boolean:=false;
begin
 -- Service only: callback verifies the signed website identity; Edge verifies
 -- this access token's canonical and scoped profile IDs directly with Meta.
 if p_owner_id is null or p_owner_id !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 or p_workspace_id is null or p_workspace_id !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 or identity_id is null or identity_id !~ '^\d{5,30}$' or scoped_id is null or scoped_id !~ '^\d{5,30}$'
 or coalesce(p_account->>'username','') !~ '^[a-zA-Z0-9._]{1,30}$' or nullif(trim(p_account->>'access_token'),'') is null then
   return jsonb_build_object('ok',false,'status',400,'code','INVALID_INSTAGRAM_REGISTRATION','error','A verified Instagram profile and website login are required.');
 end if;
 for lock_id in select distinct value from unnest(array[identity_id,scoped_id]) value order by value loop
   perform pg_advisory_xact_lock(hashtextextended('instagram-registration:'||lock_id,0));
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('instagram-registration-owner:'||p_owner_id,0));
 select count(*) into identity_matches from public.autoreply_instagram_memberships m where not m.connection_archived
   and (m.ig_user_id in (identity_id,scoped_id) or m.profile->>'ig_scoped_id' in (identity_id,scoped_id));
 if identity_matches>1 then return jsonb_build_object('ok',false,'status',409,'code','INSTAGRAM_IDENTITY_CONFLICT','error','This Instagram identity needs support review before it can be connected.');end if;
 select m.* into existing from public.autoreply_instagram_memberships m where not m.connection_archived
   and (m.ig_user_id in (identity_id,scoped_id) or m.profile->>'ig_scoped_id' in (identity_id,scoped_id)) for update;
 if existing.workspace_id is not null then
   select t.account into previous_token from public.autoreply_instagram_tokens t where t.user_id=existing.workspace_id for update;
   if existing.owner_user_id<>p_owner_id then
     if nullif(previous_token->>'access_token','') is not null then
       return jsonb_build_object('ok',false,'status',409,'code','INSTAGRAM_ACCOUNT_IN_USE',
         'error','This Instagram account is still connected to another Auto Replys login. Disconnect it there first, then connect it here. Previous chats and automations stay with the original login.');
     end if;
     moved:=true;previous_workspace:=existing.workspace_id;previous_owner:=existing.owner_user_id;
   else target_workspace:=existing.workspace_id;already_counted:=true;
   end if;
 end if;
 if target_workspace is null then
   -- Returning Google logins can recover only THEIR OWN historical workspace.
   select m.* into destination from public.autoreply_instagram_memberships m where m.owner_user_id=p_owner_id and m.connection_archived
     and (m.ig_user_id in (identity_id,scoped_id) or m.profile->>'ig_scoped_id' in (identity_id,scoped_id)) order by m.created_at limit 1 for update;
   if destination.workspace_id is not null then target_workspace:=destination.workspace_id;restored_archive:=true;
   else
     target_workspace:=p_workspace_id;
     if exists(select 1 from public.autoreply_instagram_memberships where workspace_id=target_workspace)
        or exists(select 1 from public.autoreply_instagram_tokens where user_id=target_workspace)
        or (target_workspace<>p_owner_id and exists(select 1 from public.autoreply_documents where user_id=target_workspace)) then
       target_workspace:=gen_random_uuid()::text;
     end if;
   end if;
 end if;
 if not already_counted then
   limits:=public.autoreply_billing_entitlement(p_owner_id);
   if limits is null then raise exception 'Account allowance unavailable';end if;
   select count(*) into saved_count from public.autoreply_instagram_memberships m join public.autoreply_instagram_tokens t on t.user_id=m.workspace_id where m.owner_user_id=p_owner_id and not m.connection_archived and nullif(t.account->>'access_token','') is not null;
   if limits->'unlimited' is distinct from 'true'::jsonb and saved_count>=coalesce((limits->>'accounts')::integer,0) then
     return jsonb_build_object('ok',false,'status',403,'code','INSTAGRAM_ACCOUNT_LIMIT_REACHED','error','Your plan''s Instagram account limit is reached. Upgrade to connect more accounts.');
   end if;
 end if;
 -- Only business sender aliases cross the boundary, never customers or rules.
 if jsonb_typeof(coalesce(previous_token->'own_sender_ids',existing.profile->'own_sender_ids'))='array' then
   account:=account||jsonb_build_object('own_sender_ids',coalesce(previous_token->'own_sender_ids',existing.profile->'own_sender_ids'));
 end if;
 if moved or restored_archive then
   account:=account||jsonb_build_object('connection_history_start_at',to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 elsif previous_token ? 'connection_history_start_at' then
   account:=account||jsonb_build_object('connection_history_start_at',previous_token->'connection_history_start_at');
 end if;
 account:=account-'connection_moved';safe:=account-'access_token';
 if moved then
   update public.autoreply_instagram_memberships set connection_archived=true,connection_archived_at=now(),
     profile=(profile-'access_token')||'{"status":"disconnected","connection_moved":true}'::jsonb where workspace_id=previous_workspace;
   delete from public.autoreply_instagram_tokens where user_id=previous_workspace;
   delete from public.autoreply_documents where user_id=previous_workspace and collection='instagram_account';
 end if;
 insert into public.autoreply_instagram_memberships(workspace_id,owner_user_id,ig_user_id,profile,connection_archived,connection_archived_at)
 values(target_workspace,p_owner_id,identity_id,safe,false,null)
 on conflict(workspace_id) do update set ig_user_id=excluded.ig_user_id,profile=excluded.profile,connection_archived=false,connection_archived_at=autoreply_instagram_memberships.connection_archived_at
 where autoreply_instagram_memberships.owner_user_id=p_owner_id;
 get diagnostics saved_count=row_count;
 if saved_count<>1 then raise exception 'Instagram workspace ownership changed; retry authorization';end if;
 insert into public.autoreply_instagram_tokens(user_id,account) values(target_workspace,account)
 on conflict(user_id) do update set account=excluded.account;
 insert into public.autoreply_documents(user_id,collection,id,data) values(target_workspace,'instagram_account','primary',safe)
 on conflict(user_id,collection,id) do update set data=excluded.data;
 if moved then
   insert into public.autoreply_instagram_connection_moves(ig_user_id,previous_workspace_id,previous_owner_id,new_workspace_id,new_owner_id)
   values(identity_id,previous_workspace,previous_owner,target_workspace,p_owner_id);
   insert into public.autoreply_documents(user_id,collection,id,data) values(previous_workspace,'workspace_notices','instagram_connection_moved_'||identity_id,
     jsonb_build_object('type','instagram_connection_moved','title','Instagram connection moved','message','A new Instagram authorization connected this account to another login. Your saved chats, customer data and automations remain here.','created_at',now()))
   on conflict(user_id,collection,id) do update set data=excluded.data;
 end if;
 return jsonb_build_object('ok',true,'workspaceId',target_workspace,'account',safe,'connectionMoved',moved);
end $function$;

-- Explicit unlink releases the identity while retaining owner-isolated history.
-- Archive old tokenless connections so previous incomplete disconnects self-heal.
update public.autoreply_instagram_memberships m
set connection_archived=true,connection_archived_at=coalesce(connection_archived_at,clock_timestamp()),
    profile=(profile-'access_token')||'{"status":"disconnected"}'::jsonb
where not m.connection_archived and not exists(
 select 1 from public.autoreply_instagram_tokens t where t.user_id=m.workspace_id
 and nullif(t.account->>'access_token','') is not null);
delete from public.autoreply_documents d using public.autoreply_instagram_memberships m
where d.user_id=m.workspace_id and d.collection='instagram_account' and m.connection_archived;

create or replace function public.autoreply_disconnect_instagram_connection(p_workspace_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('instagram-connection-lifecycle',0));
 update public.autoreply_instagram_memberships
 set connection_archived=true,connection_archived_at=clock_timestamp(),
     profile=(profile-'access_token')||'{"status":"disconnected"}'::jsonb
 where workspace_id=p_workspace_id and not connection_archived;
 delete from public.autoreply_instagram_tokens where user_id=p_workspace_id;
 delete from public.autoreply_documents where user_id=p_workspace_id and collection='instagram_account';
 return jsonb_build_object('ok',true,'account',null);
end $$;

create or replace function public.autoreply_connect_instagram_account(
 p_owner_id text,p_workspace_id text,p_account jsonb,p_started_at timestamptz,p_reconnect boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; workspace text;
begin
 perform pg_advisory_xact_lock(hashtextextended('instagram-connection-lifecycle',0));
 if p_started_at is null or p_started_at<clock_timestamp()-interval '15 minutes'
 or p_started_at>clock_timestamp()+interval '1 minute' then
   return jsonb_build_object('ok',false,'status',409,'code','INSTAGRAM_AUTH_EXPIRED',
     'error','This connection request expired. Choose Connect Instagram again.');
 end if;
 if exists(select 1 from public.autoreply_instagram_memberships m
   where (m.ig_user_id in (p_account->>'ig_user_id',p_account->>'ig_scoped_id')
     or m.profile->>'ig_scoped_id' in (p_account->>'ig_user_id',p_account->>'ig_scoped_id'))
   and m.connection_archived_at>=p_started_at) then
   return jsonb_build_object('ok',false,'status',409,'code','INSTAGRAM_CONNECTION_CANCELLED',
     'error','This account was disconnected after authorization started. Choose Connect Instagram again.');
 end if;
 if p_reconnect and not exists(select 1 from public.autoreply_instagram_memberships m
   where m.workspace_id=p_workspace_id and m.owner_user_id=p_owner_id and not m.connection_archived
   and (m.ig_user_id in (p_account->>'ig_user_id',p_account->>'ig_scoped_id')
     or m.profile->>'ig_scoped_id' in (p_account->>'ig_user_id',p_account->>'ig_scoped_id'))) then
   return jsonb_build_object('ok',false,'status',409,'code','RECONNECT_ACCOUNT_NOT_FOUND',
     'error','This account was disconnected. Choose Connect Instagram to connect it again.');
 end if;
 result:=public.autoreply_register_instagram_connection(p_owner_id,p_workspace_id,p_account);
 if result->>'ok'='true' then
   workspace:=result->>'workspaceId';
   -- Ignore delayed outgoing events from before this account joined the login.
   update public.autoreply_instagram_tokens
     set account=account||jsonb_build_object('connection_history_start_at',coalesce(account->>'connection_history_start_at',p_account->>'connected_at'))
     where user_id=workspace;
 end if;
 return result;
end $$;
revoke all on function public.autoreply_disconnect_instagram_connection(text) from public,anon,authenticated;
revoke all on function public.autoreply_connect_instagram_account(text,text,jsonb,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.autoreply_disconnect_instagram_connection(text) to service_role;
grant execute on function public.autoreply_connect_instagram_account(text,text,jsonb,timestamptz,boolean) to service_role;
notify pgrst,'reload schema';

