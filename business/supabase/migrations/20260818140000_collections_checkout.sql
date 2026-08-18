-- Collections checkout rail: source-agnostic sessions, Payment Links, checkout settings,
-- office fee overrides, merchant API keys, and checkout settlements.

create table if not exists public.business_checkout_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  fee_mode text not null default 'merchant_net'
    check (fee_mode in ('merchant_net', 'buyer_surcharge')),
  allowed_origins text[] not null default '{}',
  default_success_url text,
  default_cancel_url text,
  appearance jsonb not null default '{}'::jsonb,
  webhook_url text,
  webhook_secret_ciphertext text,
  webhook_secret_key_id text,
  webhook_secret_last4 text,
  live_mode_enabled boolean not null default false,
  test_payment_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_checkout_settings is
  'Per-business Online Checkout configuration: fee mode, website origins, return URLs, merchant webhook.';

-- Office-only fee policy. Supersedes the business fee_mode above when present.
create table if not exists public.business_checkout_fee_overrides (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  fee_mode text not null
    check (fee_mode in ('merchant_net', 'buyer_surcharge', 'easner_absorbs')),
  reason text,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_checkout_fee_overrides is
  'Ops-set checkout fee mode per business. Overrides business_checkout_settings.fee_mode.';

create table if not exists public.business_api_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  mode text not null check (mode in ('test', 'live')),
  publishable_key text not null unique,
  secret_key_hash text not null,
  secret_key_last4 text not null,
  scopes text[] not null default '{checkout}',
  created_by uuid references public.users (id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_api_keys is
  'Checkout-scoped merchant keys (easner_pk_* / easner_sk_*). Secret stored as sha256 hash only.';

create unique index if not exists business_api_keys_active_mode_key
  on public.business_api_keys (business_id, mode)
  where revoked_at is null;

create index if not exists business_api_keys_secret_hash_idx
  on public.business_api_keys (secret_key_hash)
  where revoked_at is null;

create table if not exists public.payment_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  slug text not null,
  label text not null,
  description text,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD',
  rail text not null default 'card_bank' check (rail in ('card_bank', 'stablecoin')),
  mode text not null default 'one_time' check (mode in ('one_time', 'subscription')),
  billing_interval text check (billing_interval in ('month', 'year')),
  trial_days integer check (trial_days is null or trial_days >= 0),
  redirect_url text,
  stripe_price_id text,
  autopayout_config_id uuid references public.autopayout_configs (id) on delete set null,
  payment_count integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Typed public id used when the business has no @easetag (pay.easner.com/plink_…).
  public_id text generated always as ('plink_' || replace(id::text, '-', '')) stored,
  constraint payment_links_subscription_interval
    check (mode <> 'subscription' or billing_interval is not null)
);

comment on table public.payment_links is
  'No-code collection links: one-time or recurring card/bank, or stablecoin (placard) rail.';

create unique index if not exists payment_links_business_slug_key
  on public.payment_links (business_id, lower(slug))
  where archived_at is null;

create unique index if not exists payment_links_public_id_key
  on public.payment_links (public_id);

create table if not exists public.online_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  source text not null check (source in ('invoice', 'payment_link', 'embed')),
  invoice_id uuid references public.invoices (id) on delete set null,
  payment_link_id uuid references public.payment_links (id) on delete set null,
  mode text not null default 'payment' check (mode in ('payment', 'subscription')),
  status text not null default 'open' check (status in ('open', 'complete', 'expired', 'failed')),
  fee_mode text not null default 'merchant_net'
    check (fee_mode in ('merchant_net', 'buyer_surcharge', 'easner_absorbs')),
  easner_settlement_id uuid not null unique,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  stripe_connected_account_id text,
  idempotency_key text,
  listed_amount_cents bigint not null default 0,
  gross_cents bigint not null default 0,
  application_fee_cents bigint not null default 0,
  fee_cents bigint,
  net_cents bigint,
  currency text not null default 'USD',
  customer_email text,
  payment_method_type text,
  return_url text,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.online_checkout_sessions is
  'Source-agnostic checkout sessions (payment_link | embed today; invoice keeps invoice_checkout_sessions until backfill).';

create index if not exists online_checkout_sessions_business_status_idx
  on public.online_checkout_sessions (business_id, status, created_at desc);

create index if not exists online_checkout_sessions_payment_link_idx
  on public.online_checkout_sessions (payment_link_id)
  where payment_link_id is not null;

-- Mirrors invoice_stripe_settlements for non-invoice collections so payout matching
-- and Grid credit run through one settlement machine.
create table if not exists public.checkout_stripe_settlements (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  checkout_session_id uuid references public.online_checkout_sessions (id) on delete set null,
  payment_link_id uuid references public.payment_links (id) on delete set null,
  source text not null check (source in ('payment_link', 'embed')),
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  stripe_connected_account_id text,
  stripe_transfer_id text,
  stripe_payout_id text,
  stripe_balance_transaction_id text,
  stripe_subscription_id text,
  gross_cents bigint not null default 0,
  fee_cents bigint not null default 0,
  net_cents bigint not null default 0,
  currency text not null default 'USD',
  phase text not null default 'payment_received'
    check (phase in ('payment_received', 'payout_sent', 'credited', 'failed')),
  settlement_rail text,
  grid_transfer_id uuid,
  ledger_transaction_id uuid,
  stripe_event_ids text[] not null default '{}',
  stripe_refund_id text,
  refunded_at timestamptz,
  expected_arrival_at timestamptz,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checkout_stripe_settlements_pending_account_idx
  on public.checkout_stripe_settlements (stripe_connected_account_id, phase, created_at);

create index if not exists checkout_stripe_settlements_charge_idx
  on public.checkout_stripe_settlements (stripe_charge_id)
  where stripe_charge_id is not null;

-- Grid settlement expectations can now carry checkout settlements alongside invoice ones.
alter table public.grid_transfers
  add column if not exists checkout_settlement_ids uuid[] not null default '{}';

-- Invoice sessions share the fee-mode wiring so margin reporting covers every collection.
alter table public.invoice_checkout_sessions
  add column if not exists fee_mode text,
  add column if not exists listed_amount_cents bigint,
  add column if not exists application_fee_cents bigint;

alter table public.invoice_stripe_settlements
  add column if not exists fee_mode text,
  add column if not exists application_fee_cents bigint;

alter table public.business_checkout_settings enable row level security;
alter table public.business_checkout_fee_overrides enable row level security;
alter table public.business_api_keys enable row level security;
alter table public.payment_links enable row level security;
alter table public.online_checkout_sessions enable row level security;
alter table public.checkout_stripe_settlements enable row level security;

create policy business_checkout_settings_select_member
  on public.business_checkout_settings
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = business_checkout_settings.business_id
    )
  );

create policy payment_links_select_member
  on public.payment_links
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = payment_links.business_id
    )
  );

create policy online_checkout_sessions_select_member
  on public.online_checkout_sessions
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = online_checkout_sessions.business_id
    )
  );

create policy checkout_stripe_settlements_select_member
  on public.checkout_stripe_settlements
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = checkout_stripe_settlements.business_id
    )
  );
