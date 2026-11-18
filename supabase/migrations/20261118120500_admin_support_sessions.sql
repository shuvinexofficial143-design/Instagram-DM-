-- Scoped administrator customer-workspace sessions; additive and non-destructive.
-- Grants are only issued/revoked by the trusted Vercel server after checking ADMIN_EMAILS.
create table if not exists public.autoreply_admin_support_sessions (
  admin_user_id uuid primary key,
  customer_owner_id text not null,
  initial_workspace_id text not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.autoreply_admin_support_sessions enable row level security;
revoke all on public.autoreply_admin_support_sessions from public, anon, authenticated;
grant select,insert,update,delete on public.autoreply_admin_support_sessions to service_role;
create index if not exists autoreply_admin_support_expiry_idx on public.autoreply_admin_support_sessions(expires_at);

-- RLS always evaluates the authenticated administrator's UID. The support
-- session is checked against the actual owner of each Instagram workspace.
create or replace function public.autoreply_support_access(p_workspace text)
returns boolean language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists (
  select 1 from public.autoreply_admin_support_sessions s
  where s.admin_user_id = (select auth.uid())
    and s.expires_at > now()
    and (
      s.customer_owner_id = p_workspace or
      exists (select 1 from public.autoreply_instagram_memberships m
              where m.workspace_id = p_workspace and m.owner_user_id = s.customer_owner_id)
    )
 );
$$;
revoke all on function public.autoreply_support_access(text) from public,anon;
grant execute on function public.autoreply_support_access(text) to authenticated,service_role;

drop policy if exists autoreply_admin_support_read_documents on public.autoreply_documents;
create policy autoreply_admin_support_read_documents on public.autoreply_documents
for select to authenticated using (public.autoreply_support_access(user_id));
drop policy if exists autoreply_admin_support_insert_documents on public.autoreply_documents;
create policy autoreply_admin_support_insert_documents on public.autoreply_documents
for insert to authenticated with check (collection <> 'automations' and public.autoreply_support_access(user_id));
drop policy if exists autoreply_admin_support_update_documents on public.autoreply_documents;
create policy autoreply_admin_support_update_documents on public.autoreply_documents
for update to authenticated using (collection <> 'automations' and public.autoreply_support_access(user_id))
with check (collection <> 'automations' and public.autoreply_support_access(user_id));
drop policy if exists autoreply_admin_support_delete_documents on public.autoreply_documents;
create policy autoreply_admin_support_delete_documents on public.autoreply_documents
for delete to authenticated using (collection <> 'automations' and public.autoreply_support_access(user_id));

drop policy if exists autoreply_admin_support_read_memberships on public.autoreply_instagram_memberships;
create policy autoreply_admin_support_read_memberships on public.autoreply_instagram_memberships
for select to authenticated using (public.autoreply_support_access(workspace_id));

drop policy if exists autoreply_admin_support_read_profiles on public.autoreply_profiles;
create policy autoreply_admin_support_read_profiles on public.autoreply_profiles
for select to authenticated using (public.autoreply_support_access(user_id));

-- Metadata-only audit: do not duplicate messages, personal records, or tokens.
create or replace function public.autoreply_audit_support_document_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare scope_id text; record_id text; category text; actual_owner text;
begin
 scope_id := case when TG_OP='DELETE' then old.user_id else new.user_id end;
 record_id := case when TG_OP='DELETE' then old.id else new.id end;
 category := case when TG_OP='DELETE' then old.collection else new.collection end;
 actual_owner := public.autoreply_usage_owner(scope_id);
 if (select auth.uid()) is not null
    and actual_owner <> (select auth.uid())::text
    and public.autoreply_support_access(scope_id) then
   insert into public.autoreply_admin_audit_logs(admin_user_id,action,entity_type,entity_id,after_data)
   values ((select auth.uid()),'support_'||lower(TG_OP),'customer_'||category,scope_id||':'||record_id,
     jsonb_build_object('workspace_id',scope_id,'collection',category));
 end if;
 return case when TG_OP='DELETE' then old else new end;
end;
$$;
revoke all on function public.autoreply_audit_support_document_change() from public,anon,authenticated;
drop trigger if exists autoreply_support_document_audit on public.autoreply_documents;
create trigger autoreply_support_document_audit after insert or update or delete
on public.autoreply_documents for each row execute function public.autoreply_audit_support_document_change();
