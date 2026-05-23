-- Send destinations: provider routing on fiat corridors + crypto destinations catalog

alter table public.payout_corridors
  add column if not exists provider_routing jsonb not null default '[]'::jsonb,
  add column if not exists fields_schema jsonb;

comment on column public.payout_corridors.provider_routing is
  'Ordered provider adapters, e.g. [{"provider":"noah","priority":1,"settlement_asset":"USDC"}]';
comment on column public.payout_corridors.fields_schema is
  'Optional per-corridor form hints for recipient UI';

create table if not exists public.crypto_destinations (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null,
  asset_name text not null,
  networks jsonb not null default '[]'::jsonb,
  country_code text,
  enabled boolean not null default false,
  sort_order integer,
  provider_routing jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create unique index if not exists crypto_destinations_asset_country_uq
  on public.crypto_destinations (asset_code, coalesce(country_code, ''));

create index if not exists crypto_destinations_enabled_sort_idx
  on public.crypto_destinations (enabled, sort_order nulls last);

comment on table public.crypto_destinations is
  'Office-controlled catalog of crypto/stablecoin send-to destinations';
