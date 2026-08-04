-- Stripe invoice payments (platform MoR, no Connect):
-- checkout sessions, settlements, grid_transfers stripe_settlement mode, event_inbox stripe provider.

-- 1. Checkout sessions
create table if not exists public.invoice_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  easner_settlement_id uuid not null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'open'
    check (status in ('open', 'complete', 'expired', 'failed')),
  gross_cents bigint,
  fee_cents bigint,
  net_cents bigint,
  currency text not null,
  payment_method_type text,
  customer_email text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists invoice_checkout_sessions_idempotency_key_uidx
  on public.invoice_checkout_sessions (idempotency_key);

create index if not exists invoice_checkout_sessions_invoice_status_idx
  on public.invoice_checkout_sessions (invoice_id, status);

create index if not exists invoice_checkout_sessions_pi_idx
  on public.invoice_checkout_sessions (stripe_payment_intent_id);

create index if not exists invoice_checkout_sessions_settlement_idx
  on public.invoice_checkout_sessions (easner_settlement_id);

comment on table public.invoice_checkout_sessions is
  'Stripe Checkout Sessions for public invoice Pay online (platform account).';

-- 2. Settlements (linking hub across payment → payout → inbound credit)
create table if not exists public.invoice_stripe_settlements (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  stripe_payment_intent_id text not null,
  stripe_charge_id text,
  stripe_payout_id text,
  stripe_balance_transaction_id text,
  gross_cents bigint not null default 0,
  fee_cents bigint not null default 0,
  net_cents bigint not null default 0,
  currency text not null,
  settlement_rail text
    check (settlement_rail is null or settlement_rail in ('grid_va', 'turnkey_stablecoin')),
  phase text not null default 'payment_received'
    check (phase in ('payment_received', 'payout_sent', 'credited', 'failed')),
  grid_transfer_id uuid,
  ledger_transaction_id uuid,
  expected_arrival_at timestamptz,
  credited_at timestamptz,
  stripe_event_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoice_stripe_settlements_pi_uidx
  on public.invoice_stripe_settlements (stripe_payment_intent_id);

create index if not exists invoice_stripe_settlements_incoming_idx
  on public.invoice_stripe_settlements (business_id, currency, phase);

create index if not exists invoice_stripe_settlements_invoice_idx
  on public.invoice_stripe_settlements (invoice_id);

create index if not exists invoice_stripe_settlements_payout_idx
  on public.invoice_stripe_settlements (stripe_payout_id);

comment on table public.invoice_stripe_settlements is
  'Stripe invoice settlement tracker: payment_received → payout_sent → credited.';

-- 3. grid_transfers: add stripe_settlement mode + settlement columns
alter table if exists public.grid_transfers
  drop constraint if exists grid_transfers_mode_check;

alter table if exists public.grid_transfers
  add constraint grid_transfers_mode_check
  check (mode in ('fund_balance', 'balance_payout', 'cross_border_send', 'stripe_settlement'));

alter table if exists public.grid_transfers
  add column if not exists stripe_payout_id text;

alter table if exists public.grid_transfers
  add column if not exists settlement_rail text;

alter table if exists public.grid_transfers
  add column if not exists destination_ref text;

alter table if exists public.grid_transfers
  add column if not exists expected_amount_cents bigint;

alter table if exists public.grid_transfers
  add column if not exists invoice_settlement_ids jsonb not null default '[]'::jsonb;

create index if not exists grid_transfers_stripe_payout_idx
  on public.grid_transfers (stripe_payout_id);

create index if not exists grid_transfers_stripe_settlement_pending_idx
  on public.grid_transfers (mode, status, settlement_rail, business_id)
  where mode = 'stripe_settlement';

comment on table public.grid_transfers is
  'Grid product orchestration: fund_balance, balance_payout, cross_border_send, stripe_settlement.';

-- 4. event_inbox: allow stripe provider
alter table public.event_inbox
  drop constraint if exists event_inbox_provider_check;

alter table public.event_inbox
  add constraint event_inbox_provider_check check (
    provider = any (
      array[
        'noah'::text,
        'turnkey'::text,
        'yellowcard'::text,
        'grid'::text,
        'stripe'::text,
        'other'::text
      ]
    )
  );

comment on column public.event_inbox.provider is
  'Webhook source: noah | turnkey | yellowcard | grid | stripe | other';
