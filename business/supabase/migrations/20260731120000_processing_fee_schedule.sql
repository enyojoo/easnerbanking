-- Office-editable Easner processing fee schedule (pay-in / pay-out / cross-border bps).
create table if not exists public.processing_fee_schedule (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('fiat_bank', 'fiat_mobile_money', 'crypto')),
  country_code text,
  currency_code text,
  asset_code text,
  pay_in_bps int not null default 100 check (pay_in_bps >= 0),
  pay_out_bps int not null default 100 check (pay_out_bps >= 0),
  cross_border_bps int not null default 100 check (cross_border_bps >= 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.processing_fee_schedule is
  'Easner processing fee bps by fiat rail/country or crypto asset; quotes resolve with fallback to DEFAULT_PAYOUT_PROCESSING_FEE_BPS.';

create unique index if not exists processing_fee_schedule_fiat_unique
  on public.processing_fee_schedule (scope, country_code, currency_code)
  where scope in ('fiat_bank', 'fiat_mobile_money');

create unique index if not exists processing_fee_schedule_crypto_unique
  on public.processing_fee_schedule (scope, asset_code)
  where scope = 'crypto';

create index if not exists processing_fee_schedule_scope_idx
  on public.processing_fee_schedule (scope);
