-- Yellowcard rates: per-currency legs + cross pairs (Noah-parity customer rates).

create table if not exists public.yellowcard_rates (
  id uuid primary key default gen_random_uuid(),
  -- Per-currency row: from_currency = local, to_currency = 'USDC' (or leave cross nulls)
  -- Cross-pair row: from_currency / to_currency both local (e.g. NGN, KES)
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
  'YC fiat customer rates: local↔USD/USDC legs + fiat cross pairs. Excludes stablecoin/crypto codes (CUSD, ETH, SOL, etc.).';
