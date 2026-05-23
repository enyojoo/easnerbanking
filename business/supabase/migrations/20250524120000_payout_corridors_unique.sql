-- Prefer (rail, country_code, currency_code) when no legacy constraint exists.
-- Many environments already have payout_corridors_rail_country_key on (rail, country_code) only;
-- seed uses lib/payout-corridors-upsert.ts which matches that shape.
create unique index if not exists payout_corridors_rail_country_currency_uq
  on public.payout_corridors (rail, country_code, currency_code);

-- Crypto catalog: one row per asset (send flows are asset + networks, not country-scoped)
drop index if exists crypto_destinations_asset_country_uq;

create unique index if not exists crypto_destinations_asset_code_uq
  on public.crypto_destinations (asset_code);
