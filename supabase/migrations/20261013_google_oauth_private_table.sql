-- Server-only Google OAuth credentials. A signed-in customer must never be able
-- to select refresh/access tokens through the browser Data API.
create table if not exists public.autoreply_google_connections_secure (
  workspace_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.autoreply_google_connections_secure enable row level security;
revoke all on public.autoreply_google_connections_secure from public,anon,authenticated;
grant select,insert,update,delete on public.autoreply_google_connections_secure to service_role;
-- Non-destructive backfill: legacy documents remain readable until Vercel
-- and the live Edge function both use this table.
insert into public.autoreply_google_connections_secure(workspace_id,data,updated_at)
select user_id,data,now() from public.autoreply_documents
where collection='google_sheets_connections' and id='primary'
on conflict(workspace_id) do nothing;
