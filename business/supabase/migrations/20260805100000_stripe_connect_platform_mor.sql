-- Stripe Connect Platform MoR: per-business connected accounts + settlement columns.

-- 1. Connected accounts (one per business)
create table if not exists public.business_stripe_connect_accounts (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  stripe_account_id text not null unique,
  onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'active', 'restricted', 'disabled')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  transfers_enabled boolean not null default false,
  details_submitted boolean not null default false,
  default_settlement_rail text
    check (
      default_settlement_rail is null
      or default_settlement_rail in ('grid_va', 'turnkey_stablecoin')
    ),
  stripe_external_account_id text,
  stripe_payout_schedule jsonb,
  requirements_currently_due jsonb not null default '[]'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_stripe_connect_accounts_stripe_account_idx
  on public.business_stripe_connect_accounts (stripe_account_id);

comment on table public.business_stripe_connect_accounts is
  'Stripe Connect connected accounts for platform-MoR invoice settlement (destination charges → VA payout).';

-- 2. Settlement + checkout session Connect columns
alter table if exists public.invoice_stripe_settlements
  add column if not exists stripe_connected_account_id text;

alter table if exists public.invoice_stripe_settlements
  add column if not exists stripe_transfer_id text;

create index if not exists invoice_stripe_settlements_connected_account_idx
  on public.invoice_stripe_settlements (stripe_connected_account_id);

alter table if exists public.invoice_checkout_sessions
  add column if not exists stripe_connected_account_id text;

comment on column public.invoice_stripe_settlements.stripe_connected_account_id is
  'Connected account that received the destination-charge transfer.';

comment on column public.invoice_stripe_settlements.stripe_transfer_id is
  'Stripe Transfer id created by destination charge (for reverse_transfer refunds).';
