-- Collections Phase 2: product catalog, disputes, customer linkage, subscription portal, tax capture.

-- Product catalog: define once, sell through links, website checkout, and invoices.
create table if not exists public.business_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  name text not null,
  description text null,
  image_url text null,
  tax_category text null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_products_business_idx
  on public.business_products (business_id, created_at desc);

create table if not exists public.business_product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.business_products (id),
  business_id uuid not null,
  currency text not null,
  unit_amount_cents integer not null,
  mode text not null default 'one_time', -- one_time | subscription
  billing_interval text null,            -- month | year (subscription only)
  trial_days integer null,
  stripe_price_id text null,             -- platform recurring Price, created lazily
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_product_prices_product_idx
  on public.business_product_prices (product_id, created_at asc);

-- Disputes become first-class instead of a log line: recorded from webhooks,
-- listed in the Payments hub, evidence submitted through the dashboard.
create table if not exists public.checkout_disputes (
  id text primary key, -- Stripe dispute id
  business_id uuid not null,
  settlement_table text null,
  settlement_id uuid null,
  stripe_charge_id text not null,
  stripe_payment_intent_id text null,
  amount_cents integer not null,
  currency text not null,
  reason text null,
  status text not null,
  evidence_due_by timestamptz null,
  evidence_submitted_at timestamptz null,
  stripe_event_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checkout_disputes_business_idx
  on public.checkout_disputes (business_id, created_at desc);

-- Every collection attaches to a customer record, giving one revenue view per buyer.
alter table public.checkout_stripe_settlements
  add column if not exists customer_id uuid null,
  add column if not exists tax_cents integer null;

alter table public.online_checkout_sessions
  add column if not exists customer_id uuid null;

-- Buyer self-serve subscription portal: links carry a hashed token, never an id.
create table if not exists public.subscription_portal_tokens (
  token_hash text primary key,
  business_id uuid not null,
  stripe_subscription_id text not null,
  stripe_customer_id text null,
  customer_email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists subscription_portal_tokens_subscription_idx
  on public.subscription_portal_tokens (stripe_subscription_id);

alter table public.business_products enable row level security;
alter table public.business_product_prices enable row level security;
alter table public.checkout_disputes enable row level security;
alter table public.subscription_portal_tokens enable row level security;
