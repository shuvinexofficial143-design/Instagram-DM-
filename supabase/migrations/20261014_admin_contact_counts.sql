-- Owner-scoped exact contact count, across all member Instagram workspaces.
-- Only called by the service-role Admin Edge endpoint after JWT admin checks.
create or replace function public.autoreply_admin_contact_counts()
returns table(owner_user_id text,contact_count bigint)
language sql stable security invoker
set search_path=public
as $$
 select coalesce(m.owner_user_id,d.user_id)::text owner_user_id,
        count(*)::bigint contact_count
 from public.autoreply_documents d
 left join public.autoreply_instagram_memberships m
   on m.workspace_id=d.user_id
 where d.collection='contacts'
 group by coalesce(m.owner_user_id,d.user_id)
$$;
revoke all on function public.autoreply_admin_contact_counts()
  from public,anon,authenticated;
grant execute on function public.autoreply_admin_contact_counts() to service_role;
