-- Immutable-ish paid order snapshot for customer downloadable payment invoices.
-- Distinct from a GST tax invoice until legal/tax profile is configured.
create table if not exists public.autoreply_billing_invoices(
  order_id text primary key references public.autoreply_billing_orders(order_id) on delete restrict,
  serial_number bigint generated always as identity unique,
  owner_user_id text not null,
  issued_at timestamptz not null default now(),
  customer_name text not null,
  customer_email text not null,
  plan_id text not null,
  amount_inr integer not null check(amount_inr>0),
  billing_days integer not null,
  paid_at timestamptz not null,
  payment_id text not null,
  email_sent_at timestamptz,
  email_claimed_at timestamptz,
  email_provider_id text
);
create index if not exists autoreply_billing_invoices_owner_idx
on public.autoreply_billing_invoices(owner_user_id,issued_at desc);
alter table public.autoreply_billing_invoices enable row level security;
revoke all on public.autoreply_billing_invoices from public,anon,authenticated;
grant select,insert,update,delete on public.autoreply_billing_invoices to service_role;
grant usage,select on sequence public.autoreply_billing_invoices_serial_number_seq to service_role;
comment on table public.autoreply_billing_invoices is
  'Private customer payment invoices. No GST tax invoice is represented unless statutory configuration is completed.';

create or replace function public.autoreply_claim_invoice_email(p_order_id text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare changed integer;
begin
  update public.autoreply_billing_invoices
  set email_claimed_at=now()
  where order_id=p_order_id and email_sent_at is null
  and (email_claimed_at is null or email_claimed_at<now()-interval '15 minutes');
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke all on function public.autoreply_claim_invoice_email(text) from public,anon,authenticated;
grant execute on function public.autoreply_claim_invoice_email(text) to service_role;
