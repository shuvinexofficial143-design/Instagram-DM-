-- Merchant-approved Cashfree refund reservations. Browser access disabled.
create table if not exists public.autoreply_support_refunds (
  ticket_id uuid primary key references public.autoreply_support_tickets(id) on delete restrict,
  order_id text not null references public.autoreply_billing_orders(order_id),
  owner_user_id text not null,
  refund_id text not null unique,
  amount_inr integer not null check (amount_inr>0),
  state text not null default 'reserved' check (state in ('reserved','initiated','success','requires_review')),
  provider_status text,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists autoreply_support_refunds_order_idx on public.autoreply_support_refunds(order_id);
alter table public.autoreply_support_refunds enable row level security;
revoke all on public.autoreply_support_refunds from public,anon,authenticated;
grant select,insert,update,delete on public.autoreply_support_refunds to service_role;
-- At most one whole-order refund. This intentionally blocks double returns.
create unique index if not exists autoreply_support_refunds_one_per_order on public.autoreply_support_refunds(order_id);
