-- Yellowcard rates: canonical pairs only (Noah-parity product labels).
--
-- Pair types:
--   USD → local fiat   balance payout (product); chain settles USDC 1:1
--   local → USDC       local pay-in / fund balance + cross leg refs
--   local → local      cross-border customer rate
--
-- Do not store USDC → local or stablecoin/crypto codes from YC /rates.

create table if not exists public.yellowcard_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null,
  country_code text,
  yc_buy numeric,
  yc_sell numeric,
  easner_buy numeric,
  easner_sell numeric,
  yc_cross_mid numeric,
  rate numeric not null default 0,
  margin_bps integer not null default 50,
  source text not null default 'yc_rates_sync',
  as_of timestamptz not null default now(),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_currency, to_currency)
);

create index if not exists yellowcard_rates_status_idx
  on public.yellowcard_rates (status);

create index if not exists yellowcard_rates_to_currency_idx
  on public.yellowcard_rates (to_currency);

comment on table public.yellowcard_rates is
  'YC customer rates: USD→local (payout), local→USDC (pay-in), local→local (cross). Product uses USD; chain settles USDC. Excludes USDC→local and crypto codes.';
