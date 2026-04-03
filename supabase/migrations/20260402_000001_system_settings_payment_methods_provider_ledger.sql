-- Creates missing operational config tables and upgrades transactions for provider-ledger usage.
-- Idempotent: uses IF NOT EXISTS so it can be safely re-run.

begin;

-- UUID helper (for payment_methods.id default).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- system_settings (used for currency overrides + platform settings)
-- ---------------------------------------------------------------------------
create table if not exists public.system_settings (
  key text primary key,
  value text,
  data_type text not null default 'string', -- string|number|boolean|json
  category text not null default 'general',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists system_settings_category_idx on public.system_settings (category);
create index if not exists system_settings_is_active_idx on public.system_settings (is_active);

-- ---------------------------------------------------------------------------
-- payment_methods (manual instructions + provider-backed payout methods)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  currency text not null,
  type text not null, -- bank_account|mobile_money|qr_code|provider
  name text not null,

  -- bank_account fields (nullable)
  account_name text,
  account_number text,
  bank_name text,
  routing_number text,
  sort_code text,
  iban text,
  swift_bic text,

  -- mobile_money fields (nullable)
  mobile_money_provider text,
  phone_number text,

  -- qr_code fields (nullable)
  qr_code_data text,

  -- shared instructions/config blob (manual instructions OR provider JSON config)
  instructions text,

  completion_timer_seconds integer not null default 3600,
  is_default boolean not null default false,
  status text not null default 'active', -- active|inactive

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_methods_currency_idx on public.payment_methods (currency);
create index if not exists payment_methods_currency_default_idx on public.payment_methods (currency, is_default);
create index if not exists payment_methods_status_idx on public.payment_methods (status);
create index if not exists payment_methods_type_idx on public.payment_methods (type);

-- ---------------------------------------------------------------------------
-- transactions: provider-ledger columns (keeps existing legacy columns intact)
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists provider text,
  add column if not exists noah_transaction_id text,
  add column if not exists provider_transaction_id text,
  add column if not exists amount numeric,
  add column if not exists currency text,
  add column if not exists direction text, -- 'in'|'out'
  add column if not exists status text,
  add column if not exists payload jsonb,
  add column if not exists metadata jsonb,
  add column if not exists updated_at timestamptz;

create index if not exists transactions_provider_idx on public.transactions (provider);
create index if not exists transactions_noah_transaction_id_idx on public.transactions (noah_transaction_id);
create index if not exists transactions_provider_transaction_id_idx on public.transactions (provider_transaction_id);
create index if not exists transactions_currency_idx on public.transactions (currency);

commit;

