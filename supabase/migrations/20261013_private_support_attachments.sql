-- Private images for support ticket evidence; never served from public bucket.
-- Images are uploaded only after authenticated ticket ownership checks in Vercel.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('autoreply-support-private','autoreply-support-private',false,2097152,ARRAY['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=false,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.autoreply_support_attachments(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.autoreply_support_tickets(id) on delete cascade,
  owner_user_id text not null,
  object_path text not null unique,
  filename text not null check (length(filename) between 1 and 120),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  byte_size integer not null check (byte_size between 1 and 2097152),
  created_at timestamptz not null default now()
);
create index if not exists autoreply_support_attachments_ticket_idx on public.autoreply_support_attachments(ticket_id,created_at);
alter table public.autoreply_support_attachments enable row level security;
revoke all on public.autoreply_support_attachments from public,anon,authenticated;
grant select,insert,update,delete on public.autoreply_support_attachments to service_role;
-- No storage.objects policies for anon/authenticated: all Storage access uses
-- service-role on our server following ticket/role verification.
