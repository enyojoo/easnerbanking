-- Dev Platform book (isolated from Banking transactions) + webhook subscribe flags.

alter table public.business_checkout_settings
  add column if not exists webhook_events jsonb not null default
    '["checkout.completed","checkout.async_succeeded","checkout.failed","payment.available","subscription.updated","subscription.canceled"]'::jsonb;

comment on column public.business_checkout_settings.webhook_events is
  'Merchant-subscribed Easner webhook events. Existing checkout events stay on; new catalog events are opt-in.';

create table if not exists public.platform_customers (
  id text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  livemode boolean not null default false,
  email text,
  name text,
  external_id text,
  wallet_owner_id uuid,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_customers_business_idx
  on public.platform_customers (business_id, livemode, created_at desc);

create table if not exists public.platform_accounts (
  id text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  livemode boolean not null default false,
  currency text not null,
  available_cents bigint not null default 0,
  pending_cents bigint not null default 0,
  wallet_owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, livemode, currency)
);

create table if not exists public.platform_destinations (
  id text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  livemode boolean not null default false,
  customer_id text references public.platform_customers (id) on delete set null,
  type text not null check (type in ('bank', 'mobile_money', 'wallet', 'easetag')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_destinations_business_idx
  on public.platform_destinations (business_id, livemode, created_at desc);

create table if not exists public.platform_quotes (
  id text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  livemode boolean not null default false,
  source_account_id text,
  destination_id text,
  send_cents bigint not null,
  receive_cents bigint not null,
  send_currency text not null,
  receive_currency text not null,
  expires_at timestamptz not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.platform_transfers (
  id text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  livemode boolean not null default false,
  quote_id text,
  source_account_id text,
  destination_id text,
  amount_cents bigint not null,
  currency text not null,
  status text not null default 'pending',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_transfers_idempotency_idx
  on public.platform_transfers (business_id, livemode, idempotency_key)
  where idempotency_key is not null;

create index if not exists platform_transfers_business_idx
  on public.platform_transfers (business_id, livemode, created_at desc);

create table if not exists public.platform_transactions (
  id text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  livemode boolean not null default false,
  type text not null,
  amount_cents bigint not null,
  currency text not null,
  direction text not null check (direction in ('in', 'out')),
  status text not null,
  account_id text,
  customer_id text,
  transfer_id text,
  checkout_session_id text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_transactions_business_idx
  on public.platform_transactions (business_id, livemode, created_at desc);

create table if not exists public.platform_api_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  livemode boolean not null default false,
  method text not null,
  path text not null,
  status integer,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists platform_api_logs_business_idx
  on public.platform_api_logs (business_id, created_at desc);

alter table public.platform_customers enable row level security;
alter table public.platform_accounts enable row level security;
alter table public.platform_destinations enable row level security;
alter table public.platform_quotes enable row level security;
alter table public.platform_transfers enable row level security;
alter table public.platform_transactions enable row level security;
alter table public.platform_api_logs enable row level security;
