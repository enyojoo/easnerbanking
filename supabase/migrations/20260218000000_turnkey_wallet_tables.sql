-- Turnkey BYOW + payment intents + webhook event inbox (Easner go-live plan §3)
-- Apply via Supabase SQL editor or `supabase db push` when linked.

create extension if not exists "pgcrypto";

-- Logical wallet owner (individual or business), aligned with Noah customer
create table if not exists public.wallet_owners (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('individual', 'business')),
  owner_ref uuid not null,
  kyc_status text,
  noah_customer_id text,
  turnkey_sub_organization_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_ref)
);

create index if not exists wallet_owners_noah_customer_id_idx on public.wallet_owners (noah_customer_id);

-- One row per Turnkey wallet account (chain + asset + ledger currency bucket)
create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  wallet_owner_id uuid not null references public.wallet_owners(id) on delete cascade,
  provider text not null default 'turnkey' check (provider = 'turnkey'),
  turnkey_sub_organization_id text,
  turnkey_wallet_id text,
  chain text not null,
  asset text not null,
  ledger_currency text not null,
  address text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'failed')),
  is_primary boolean not null default true,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_owner_id, chain, asset, ledger_currency)
);

create index if not exists wallet_accounts_owner_status_idx
  on public.wallet_accounts (wallet_owner_id, status);

create table if not exists public.wallet_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  wallet_owner_id uuid not null references public.wallet_owners(id) on delete cascade,
  chain text not null,
  asset text not null,
  ledger_currency text not null,
  state text not null default 'pending',
  error text,
  attempt_count int not null default 0,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_provisioning_jobs_state_retry_idx
  on public.wallet_provisioning_jobs (state, next_retry_at);

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  wallet_owner_id uuid references public.wallet_owners(id) on delete set null,
  user_id uuid,
  business_id uuid,
  quote_id uuid,
  flow_type text not null check (flow_type in ('onramp', 'offramp')),
  source_currency text,
  destination_currency text,
  amount numeric,
  network text,
  chain text,
  noah_workflow_id text,
  noah_transaction_id text,
  intent_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_intents_user_idx on public.payment_intents (user_id);
create index if not exists payment_intents_status_idx on public.payment_intents (status);

-- Provider webhook dedupe / replay (Noah, Turnkey, future rails)
create table if not exists public.event_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('noah', 'turnkey', 'yellowcard', 'other')),
  event_id text not null,
  event_type text,
  payload_hash text,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  error text,
  unique (provider, event_id)
);

create index if not exists event_inbox_status_idx on public.event_inbox (status, received_at);

comment on table public.wallet_owners is 'Turnkey / BYOW owner mapping; sub-org id set after embedded signup or ops';
comment on table public.wallet_accounts is 'Per vault: chain + asset + ledger_currency (e.g. Solana USDC for USD)';
comment on table public.event_inbox is 'Cross-provider webhook dedupe; complements webhook_deliveries for Noah';
