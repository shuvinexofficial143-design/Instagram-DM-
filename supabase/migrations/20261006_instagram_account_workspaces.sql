-- Each Instagram connection keeps its own workspace, inbox and automation rules.
-- Login identity and billing usage remain attached to the owning user.
create table if not exists public.autoreply_instagram_memberships (
  workspace_id text primary key,
  owner_user_id text not null,
  ig_user_id text not null unique,
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists instagram_memberships_owner_idx on public.autoreply_instagram_memberships(owner_user_id);
alter table public.autoreply_instagram_memberships enable row level security;
revoke all on public.autoreply_instagram_memberships from anon, authenticated;
grant select on public.autoreply_instagram_memberships to authenticated;
grant all on public.autoreply_instagram_memberships to service_role;
create policy instagram_memberships_owner_read on public.autoreply_instagram_memberships for select to authenticated
  using (owner_user_id=auth.uid()::text);
insert into public.autoreply_instagram_memberships(workspace_id,owner_user_id,ig_user_id,profile)
select t.user_id,t.user_id,t.account->>'ig_user_id',t.account-'access_token'
from public.autoreply_instagram_tokens t join auth.users u on u.id::text=t.user_id
where coalesce(t.account->>'ig_user_id','')<>''
on conflict do nothing;
create policy instagram_member_read_documents on public.autoreply_documents for select to authenticated
  using (exists(select 1 from public.autoreply_instagram_memberships m where m.workspace_id=user_id and m.owner_user_id=auth.uid()::text));
create policy instagram_member_insert_documents on public.autoreply_documents for insert to authenticated
  with check (exists(select 1 from public.autoreply_instagram_memberships m where m.workspace_id=user_id and m.owner_user_id=auth.uid()::text));
create policy instagram_member_update_documents on public.autoreply_documents for update to authenticated
  using (exists(select 1 from public.autoreply_instagram_memberships m where m.workspace_id=user_id and m.owner_user_id=auth.uid()::text))
  with check (exists(select 1 from public.autoreply_instagram_memberships m where m.workspace_id=user_id and m.owner_user_id=auth.uid()::text));
create policy instagram_member_delete_documents on public.autoreply_documents for delete to authenticated
  using (exists(select 1 from public.autoreply_instagram_memberships m where m.workspace_id=user_id and m.owner_user_id=auth.uid()::text));
create or replace function public.autoreply_usage_owner(p_workspace_id text) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select owner_user_id from public.autoreply_instagram_memberships where workspace_id=p_workspace_id),p_workspace_id)
$$;
revoke all on function public.autoreply_usage_owner(text) from public,anon,authenticated;
grant execute on function public.autoreply_usage_owner(text) to service_role;
create or replace function public.autoreply_get_usage(p_user_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m text:=to_char(now() at time zone 'utc','YYYY-MM'); r public.autoreply_usage_monthly%rowtype; owner_id text:=public.autoreply_usage_owner(p_user_id);
begin
 select * into r from public.autoreply_usage_monthly where user_id=owner_id and month_key=m;
 return jsonb_build_object('month_key',m,'total_messages',coalesce(r.total_messages,0),'ai_replies',coalesce(r.ai_replies,0));
end $$;
create or replace function public.autoreply_increment_usage(p_user_id text,p_is_ai boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m text:=to_char(now() at time zone 'utc','YYYY-MM'); r public.autoreply_usage_monthly%rowtype; owner_id text:=public.autoreply_usage_owner(p_user_id);
begin
 insert into public.autoreply_usage_monthly(user_id,month_key,total_messages,ai_replies,updated_at)
 values(owner_id,m,1,case when p_is_ai then 1 else 0 end,now())
 on conflict(user_id,month_key) do update set total_messages=autoreply_usage_monthly.total_messages+1,
 ai_replies=autoreply_usage_monthly.ai_replies+case when p_is_ai then 1 else 0 end,updated_at=now() returning * into r;
 return jsonb_build_object('month_key',m,'total_messages',r.total_messages,'ai_replies',r.ai_replies);
end $$;
