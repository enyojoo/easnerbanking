-- Express deposits (Stripe Embedded Components onramp) payer persistence + sessions.

alter table public.users
  add column if not exists stripe_crypto_customer_id text,
  add column if not exists stripe_express_deposits_status text,
  add column if not exists stripe_express_kyc_tier text,
  add column if not exists stripe_express_payment_token_id text;

create unique index if not exists users_stripe_crypto_customer_id_uidx
  on public.users (stripe_crypto_customer_id)
  where stripe_crypto_customer_id is not null;

create table if not exists public.stripe_onramp_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  business_id uuid null,
  stripe_session_id text not null,
  crypto_customer_id text not null,
  status text not null default 'created',
  payment_method text null,
  source_amount numeric null,
  usd_credit numeric null,
  wallet_address text null,
  chain_tx_hash text null,
  ledger_transaction_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stripe_onramp_sessions_stripe_session_id_uidx
  on public.stripe_onramp_sessions (stripe_session_id);

create index if not exists stripe_onramp_sessions_user_id_idx
  on public.stripe_onramp_sessions (user_id, created_at desc);

create index if not exists stripe_onramp_sessions_business_id_idx
  on public.stripe_onramp_sessions (business_id, created_at desc)
  where business_id is not null;

alter table public.stripe_onramp_sessions enable row level security;
