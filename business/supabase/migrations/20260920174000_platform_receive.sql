-- Receive wrap: customer verification + deposit instruction cache + onramp sessions.

alter table public.platform_customers
  add column if not exists verification_status text not null default 'unverified';

alter table public.platform_customers
  drop constraint if exists platform_customers_verification_status_check;

alter table public.platform_customers
  add constraint platform_customers_verification_status_check
  check (verification_status in ('unverified', 'pending', 'approved', 'rejected'));

create index if not exists platform_customers_verification_idx
  on public.platform_customers (business_id, livemode, verification_status);

create table if not exists public.platform_deposit_instructions (
  id text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  account_id text not null references public.platform_accounts (id) on delete cascade,
  customer_id text references public.platform_customers (id) on delete cascade,
  livemode boolean not null default false,
  rail text not null check (rail in ('bank', 'chain')),
  currency text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, rail, currency)
);

create index if not exists platform_deposit_instructions_business_idx
  on public.platform_deposit_instructions (business_id, livemode, created_at desc);

alter table public.platform_deposit_instructions enable row level security;

create table if not exists public.platform_onramp_sessions (
  id text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  account_id text not null references public.platform_accounts (id) on delete cascade,
  customer_id text references public.platform_customers (id) on delete set null,
  livemode boolean not null default false,
  amount_cents bigint not null,
  currency text not null default 'USD',
  status text not null default 'open',
  return_url text,
  stripe_session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_onramp_sessions_business_idx
  on public.platform_onramp_sessions (business_id, livemode, created_at desc);

alter table public.platform_onramp_sessions enable row level security;
