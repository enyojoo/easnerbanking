-- Grid provider: customer ids on users/businesses, transfer orchestration, FX rates.

alter table if exists public.users
  add column if not exists grid_customer_id text;

alter table if exists public.users
  add column if not exists grid_beneficial_owner_id text;

alter table if exists public.businesses
  add column if not exists grid_customer_id text;

create index if not exists users_grid_customer_id_idx on public.users (grid_customer_id);
create index if not exists users_grid_beneficial_owner_id_idx on public.users (grid_beneficial_owner_id)
  where grid_beneficial_owner_id is not null;
create index if not exists businesses_grid_customer_id_idx on public.businesses (grid_customer_id);

create table if not exists public.grid_transfers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions(id) on delete set null,
  user_id uuid not null,
  business_id uuid,
  mode text not null check (mode in ('fund_balance', 'balance_payout', 'cross_border_send')),
  status text not null default 'pending',
  pay_in_currency text,
  receive_currency text,
  quoted_pay_in numeric,
  quoted_receive numeric,
  customer_rate numeric,
  grid_quote_id text,
  grid_transaction_id text,
  external_account_id text,
  grid_customer_id text,
  settlement_info jsonb,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grid_transfers_user_id_idx on public.grid_transfers (user_id);
create index if not exists grid_transfers_quote_id_idx on public.grid_transfers (grid_quote_id);
create index if not exists grid_transfers_transaction_id_idx on public.grid_transfers (transaction_id);
create index if not exists grid_transfers_status_idx on public.grid_transfers (status);

comment on table public.grid_transfers is
  'Grid product orchestration: fund_balance, balance_payout, cross_border_send.';

create table if not exists public.grid_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null,
  country_code text,
  grid_mid numeric,
  rate numeric not null default 0,
  margin_bps integer not null default 50,
  source text not null default 'grid_rates_sync',
  as_of timestamptz not null default now(),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_currency, to_currency)
);

create index if not exists grid_rates_status_idx on public.grid_rates (status);
create index if not exists grid_rates_to_currency_idx on public.grid_rates (to_currency);

comment on table public.grid_rates is
  'Grid customer rates: USD→local (payout), local→USD (pay-in), local→local (cross).';

-- Extend payout lock sessions for Grid provider.
alter table if exists public.payout_lock_sessions
  drop constraint if exists payout_lock_sessions_provider_check;

alter table if exists public.payout_lock_sessions
  add constraint payout_lock_sessions_provider_check
  check (provider in ('noah', 'yellowcard', 'grid'));
