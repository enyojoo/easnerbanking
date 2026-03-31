-- Noah schema alignment for GBP go-live readiness

create table if not exists public.noah_virtual_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  noah_customer_id text,
  noah_payment_method_id text not null,
  currency text not null,
  account_name text,
  account_number text,
  bank_name text,
  routing_number text,
  sort_code text,
  iban text,
  swift_bic text,
  source_type text default 'virtual_account',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.noah_virtual_accounts add column if not exists user_id uuid;
alter table public.noah_virtual_accounts add column if not exists noah_customer_id text;
alter table public.noah_virtual_accounts add column if not exists noah_payment_method_id text;
alter table public.noah_virtual_accounts add column if not exists currency text;
alter table public.noah_virtual_accounts add column if not exists account_name text;
alter table public.noah_virtual_accounts add column if not exists account_number text;
alter table public.noah_virtual_accounts add column if not exists bank_name text;
alter table public.noah_virtual_accounts add column if not exists routing_number text;
alter table public.noah_virtual_accounts add column if not exists sort_code text;
alter table public.noah_virtual_accounts add column if not exists iban text;
alter table public.noah_virtual_accounts add column if not exists swift_bic text;
alter table public.noah_virtual_accounts add column if not exists source_type text default 'virtual_account';
alter table public.noah_virtual_accounts add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.noah_virtual_accounts add column if not exists created_at timestamptz not null default now();
alter table public.noah_virtual_accounts add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_noah_virtual_accounts_pm_unique
  on public.noah_virtual_accounts(noah_payment_method_id);
create index if not exists idx_noah_virtual_accounts_user_currency
  on public.noah_virtual_accounts(user_id, currency);

create table if not exists public.noah_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  noah_customer_id text,
  noah_wallet_id text not null,
  currency text,
  liquidation_address text,
  liquidation_memo text,
  source_liquidation_address_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.noah_wallets add column if not exists user_id uuid;
alter table public.noah_wallets add column if not exists noah_customer_id text;
alter table public.noah_wallets add column if not exists noah_wallet_id text;
alter table public.noah_wallets add column if not exists currency text;
alter table public.noah_wallets add column if not exists liquidation_address text;
alter table public.noah_wallets add column if not exists liquidation_memo text;
alter table public.noah_wallets add column if not exists source_liquidation_address_id text;
alter table public.noah_wallets add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.noah_wallets add column if not exists created_at timestamptz not null default now();
alter table public.noah_wallets add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_noah_wallets_wallet_unique
  on public.noah_wallets(noah_wallet_id);
create index if not exists idx_noah_wallets_user
  on public.noah_wallets(user_id);

create table if not exists public.noah_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  noah_transaction_id text not null,
  status text,
  amount numeric(18, 2),
  currency text,
  direction text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.noah_transactions add column if not exists user_id uuid;
alter table public.noah_transactions add column if not exists noah_transaction_id text;
alter table public.noah_transactions add column if not exists status text;
alter table public.noah_transactions add column if not exists amount numeric(18, 2);
alter table public.noah_transactions add column if not exists currency text;
alter table public.noah_transactions add column if not exists direction text;
alter table public.noah_transactions add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.noah_transactions add column if not exists created_at timestamptz not null default now();
alter table public.noah_transactions add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_noah_transactions_txid_unique
  on public.noah_transactions(noah_transaction_id);
create index if not exists idx_noah_transactions_user
  on public.noah_transactions(user_id);

create table if not exists public.noah_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_type text not null,
  noah_environment text,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

alter table public.noah_webhook_deliveries add column if not exists event_id text;
alter table public.noah_webhook_deliveries add column if not exists event_type text;
alter table public.noah_webhook_deliveries add column if not exists noah_environment text;
alter table public.noah_webhook_deliveries add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.noah_webhook_deliveries add column if not exists processed boolean not null default false;
alter table public.noah_webhook_deliveries add column if not exists processed_at timestamptz;
alter table public.noah_webhook_deliveries add column if not exists error text;
alter table public.noah_webhook_deliveries add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_noah_webhook_deliveries_event_unique
  on public.noah_webhook_deliveries(event_id);

alter table public.users add column if not exists noah_wallet_id text;
alter table public.users add column if not exists noah_usd_virtual_account_id text;
alter table public.users add column if not exists noah_eur_virtual_account_id text;
alter table public.users add column if not exists noah_gbp_virtual_account_id text;

