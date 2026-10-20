-- Move only a disconnected connection after fresh, verified Instagram OAuth.
-- Historical workspaces retain their original owner and all customer data.
alter table public.autoreply_instagram_memberships add column connection_archived boolean not null default false;
alter table public.autoreply_instagram_memberships add column connection_archived_at timestamptz;
alter table public.autoreply_instagram_memberships drop constraint autoreply_instagram_memberships_ig_user_id_key;
create unique index instagram_current_identity_unique on public.autoreply_instagram_memberships(ig_user_id) where not connection_archived;
create table public.autoreply_instagram_connection_moves(
 id uuid primary key default gen_random_uuid(),ig_user_id text not null,
 previous_workspace_id text not null,previous_owner_id text not null,
 new_workspace_id text not null,new_owner_id text not null,created_at timestamptz not null default now()
);
alter table public.autoreply_instagram_connection_moves enable row level security;
revoke all on public.autoreply_instagram_connection_moves from public,anon,authenticated;
grant select,insert on public.autoreply_instagram_connection_moves to service_role;
create policy connection_move_service_only on public.autoreply_instagram_connection_moves for all to service_role using(true) with check(true);
create function public.autoreply_register_instagram_connection(p_owner_id text,p_workspace_id text,p_account jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
   select count(*) into saved_count from public.autoreply_instagram_memberships where owner_user_id=p_owner_id and not connection_archived;
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
 on conflict(workspace_id) do update set ig_user_id=excluded.ig_user_id,profile=excluded.profile,connection_archived=false,connection_archived_at=null
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
end $$;
revoke all on function public.autoreply_register_instagram_connection(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.autoreply_register_instagram_connection(text,text,jsonb) to service_role;
-- Suppress queued old outgoing echoes before a connection's new login boundary.
do $$declare definition text;needle text:=$match$ perform pg_advisory_xact_lock(hashtextextended('handoff:'||workspace||':'||p_recipient_id,0));$match$;begin
 select pg_get_functiondef('public.autoreply_record_instagram_outbound(text,text,text,text,text,timestamptz,boolean)'::regprocedure) into definition;
 if position(needle in definition)=0 then raise exception 'Outgoing context guard location not found';end if;
 execute replace(definition,needle,$guard$ if public.autoreply_campaign_message_time(account->>'connection_history_start_at')>p_timestamp then
   return jsonb_build_object('recorded',false,'reason','before_connection_history_boundary');
 end if;
$guard$||needle);
end $$;
notify pgrst,'reload schema';

