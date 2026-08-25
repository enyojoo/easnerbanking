-- Collections Phase 0: atomic payment-link counter + durable merchant webhook deliveries.

-- payment_count guards the "amount locked once paid" rule, so increments must be
-- atomic instead of the read-then-write the webhook handler used to do.
create or replace function public.increment_payment_link_payment_count(
  p_link_id uuid,
  p_paid_at timestamptz default now()
) returns void
language sql
security definer
set search_path = public
as $$
  update public.payment_links
  set payment_count = coalesce(payment_count, 0) + 1,
      updated_at = greatest(coalesce(updated_at, p_paid_at), p_paid_at)
  where id = p_link_id;
$$;

-- Outbound merchant webhooks (checkout.completed etc.) used to be single-attempt
-- fire-and-forget. Every send is now recorded here and retried on a backoff
-- schedule by /api/internal/checkout/retry-webhooks until delivered or exhausted.
create table if not exists public.merchant_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  event text not null,
  payload jsonb not null,
  url text not null,
  status text not null default 'pending', -- pending | delivered | failed
  attempts integer not null default 0,
  last_attempt_at timestamptz null,
  next_retry_at timestamptz null,
  response_status integer null,
  last_error text null,
  delivered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchant_webhook_deliveries_business_idx
  on public.merchant_webhook_deliveries (business_id, created_at desc);

create index if not exists merchant_webhook_deliveries_retry_idx
  on public.merchant_webhook_deliveries (next_retry_at)
  where status = 'pending';

alter table public.merchant_webhook_deliveries enable row level security;
