-- Private admin changes operate on the SAME automation documents read by customers.
create table public.autoreply_admin_automation_versions(
 id uuid primary key default gen_random_uuid(),workspace_id text not null,automation_id text not null,
 admin_user_id uuid not null,operation text not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now()
);
alter table public.autoreply_admin_automation_versions enable row level security;
revoke all on public.autoreply_admin_automation_versions from public,anon,authenticated;
grant all on public.autoreply_admin_automation_versions to service_role;
create index admin_automation_versions_workspace on public.autoreply_admin_automation_versions(workspace_id,automation_id,created_at desc);

create or replace function public.autoreply_admin_edit_automation(p_actor uuid,p_email text,p_workspace text,p_operation text,p_automation jsonb,p_override boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id text:=p_automation->>'id'; v_before jsonb; v_after jsonb; v_saved jsonb; v_limit jsonb; v_other record; v_now text:=to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 if not exists(select 1 from public.autoreply_instagram_memberships where workspace_id=p_workspace)
 and not exists(select 1 from public.autoreply_profiles where user_id=p_workspace) then raise exception 'Workspace not found'; end if;
 if v_id is null or v_id !~ '^auto_[a-zA-Z0-9_-]{4,}$' or p_operation not in ('save','status','delete','restore') then raise exception 'Invalid automation operation'; end if;
 perform pg_advisory_xact_lock(hashtextextended('autoreply_automation_status:'||p_workspace,0));
 select data into v_before from public.autoreply_documents where user_id=p_workspace and collection='automations' and id=v_id for update;
 if p_operation='delete' then
   if v_before is null then raise exception 'Automation not found'; end if;
   delete from public.autoreply_documents where user_id=p_workspace and collection='automations' and id=v_id;
   v_after:=null;
 else
   if p_operation='status' then
     if v_before is null then raise exception 'Automation not found'; end if;
     v_after:=v_before||jsonb_build_object('status',p_automation->>'status');
   elsif p_operation='restore' then
     select before_data into v_after from public.autoreply_admin_automation_versions
       where id=(p_automation->>'version_id')::uuid and workspace_id=p_workspace and automation_id=v_id;
     if v_after is null then raise exception 'This version has no earlier configuration to restore'; end if;
   else v_after:=p_automation-'id'; end if;
   if length(trim(coalesce(v_after->>'name','')))<1 or length(v_after->>'name')>120
      or coalesce(v_after->>'status','') not in ('active','paused')
      or coalesce(v_after->>'trigger_type','') not in ('dm','comment','story_reply','dm_ai_conversation')
      or jsonb_typeof(v_after->'actions') is distinct from 'array' or octet_length(v_after::text)>100000 then raise exception 'Invalid automation configuration'; end if;
   if exists(select 1 from public.autoreply_documents where user_id=p_workspace and collection='automations' and id<>v_id and lower(trim(data->>'name'))=lower(trim(v_after->>'name'))) then raise exception 'Automation name already exists in this account'; end if;
   v_limit:=public.autoreply_billing_entitlement(p_workspace);
   if v_before is null and not p_override and v_limit->>'automationLimit' is not null and
     (select count(*) from public.autoreply_documents where user_id=p_workspace and collection='automations') >= (v_limit->>'automationLimit')::integer then raise exception 'Automation limit reached. An explicit administrator override is required'; end if;
   if v_after->>'trigger_type'='dm_ai_conversation' and v_after->>'status'='active' then
     for v_other in select id,data from public.autoreply_documents where user_id=p_workspace and collection='automations' and id<>v_id and data->>'trigger_type'='dm_ai_conversation' and data->>'status'='active' for update loop
       update public.autoreply_documents set data=v_other.data||jsonb_build_object('status','paused','updated_at',v_now,'admin_updated_at',v_now,'admin_change','paused') where user_id=p_workspace and collection='automations' and id=v_other.id;
       insert into public.autoreply_admin_automation_versions(workspace_id,automation_id,admin_user_id,operation,before_data,after_data) values(p_workspace,v_other.id,p_actor,'auto_pause',v_other.data,v_other.data||'{"status":"paused"}'::jsonb);
     end loop;
   end if;
   v_after:=v_after||jsonb_build_object('updated_at',v_now,'created_at',coalesce(v_before->>'created_at',v_after->>'created_at',v_now),
     'stats',coalesce(v_before->'stats','{"runs":0,"dms_sent":0,"unique_users":0,"open_rate":-1}'::jsonb),
     'admin_updated_at',v_now,'admin_change',case when v_before is null then 'created' else p_operation end);
   insert into public.autoreply_documents(user_id,collection,id,data) values(p_workspace,'automations',v_id,v_after)
     on conflict(user_id,collection,id) do update set data=excluded.data;
 end if;
 insert into public.autoreply_admin_automation_versions(workspace_id,automation_id,admin_user_id,operation,before_data,after_data) values(p_workspace,v_id,p_actor,p_operation,v_before,v_after);
 insert into public.autoreply_admin_audit_logs(admin_user_id,admin_email,action,entity_type,entity_id,before_data,after_data)
   values(p_actor,p_email,'automation_'||p_operation,'workspace_automation',p_workspace||':'||v_id,v_before,coalesce(v_after,'{}'::jsonb)||jsonb_build_object('limit_override',p_override));
 insert into public.autoreply_documents(user_id,collection,id,data) values(p_workspace,'workspace_notices',gen_random_uuid()::text,
   jsonb_build_object('title','Automation '||case when p_operation='delete' then 'removed' when v_before is null then 'created' else 'updated' end||' by administrator',
   'automation_name',coalesce(v_after->>'name',v_before->>'name'),'automation_id',v_id,'operation',p_operation,'created_at',v_now));
 return jsonb_build_object('ok',true,'automation',case when v_after is null then null else v_after||jsonb_build_object('id',v_id) end);
end $$;
revoke all on function public.autoreply_admin_edit_automation(uuid,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.autoreply_admin_edit_automation(uuid,text,text,text,jsonb,boolean) to service_role;

