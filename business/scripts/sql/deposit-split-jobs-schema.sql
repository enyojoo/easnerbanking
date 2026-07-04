-- Deposit omnibus split jobs (idempotent on rule_execution_id)
-- Apply via Supabase SQL editor or migration pipeline.

create table if not exists public.deposit_split_jobs (
  id uuid primary key default gen_random_uuid(),
  rule_execution_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  pay_in_transaction_id uuid references public.transactions(id) on delete set null,
  fiat_amount numeric not null,
  fiat_currency text not null default 'USD',
  noah_channel_fee numeric,
  customer_fee numeric not null,
  easner_margin numeric,
  user_net numeric not null,
  omnibus_received numeric,
  ledger_currency text not null default 'USD',
  status text not null default 'pending',
  omnibus_inbound_tx_hash text,
  user_vault_send_id text,
  margin_send_id text,
  user_vault_tx_hash text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deposit_split_jobs_rule_execution_id_key unique (rule_execution_id)
);

create index if not exists deposit_split_jobs_status_updated_idx
  on public.deposit_split_jobs (status, updated_at);

create index if not exists deposit_split_jobs_user_id_idx
  on public.deposit_split_jobs (user_id);
