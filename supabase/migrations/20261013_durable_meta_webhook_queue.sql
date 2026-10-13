-- Durable Meta webhook event envelope; securely write before acknowledging.
-- All payload data is private; no browser/Data API grants. Automated retries are
-- authenticated server-to-server and use a leased Postgres queue.
create table if not exists public.autoreply_webhook_queue (
  event_hash text primary key check (event_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','processed','dead')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 32),
  lease_id uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists autoreply_webhook_queue_pending_idx on public.autoreply_webhook_queue(next_attempt_at,received_at)
where status in ('pending','processing');
alter table public.autoreply_webhook_queue enable row level security;
revoke all on public.autoreply_webhook_queue from public,anon,authenticated;
grant select,insert,update,delete on public.autoreply_webhook_queue to service_role;

create or replace function public.autoreply_claim_webhook_queue(p_limit integer default 1)
returns table(event_hash text,payload jsonb,lease_id uuid,attempts integer)
language plpgsql security invoker set search_path=public
as $$
begin
  return query
  with candidate as (
    select q.event_hash from public.autoreply_webhook_queue q
    where (q.status='pending' and q.next_attempt_at<=now())
       or (q.status='processing' and q.claimed_at<now()-interval '120 seconds')
    order by q.received_at asc
    for update skip locked limit least(greatest(p_limit,1),3)
  )
  update public.autoreply_webhook_queue q
  set status='processing',lease_id=gen_random_uuid(),claimed_at=now(),attempts=q.attempts+1
  from candidate c where q.event_hash=c.event_hash
  returning q.event_hash,q.payload,q.lease_id,q.attempts;
end $$;
revoke all on function public.autoreply_claim_webhook_queue(integer) from public,anon,authenticated;
grant execute on function public.autoreply_claim_webhook_queue(integer) to service_role;
