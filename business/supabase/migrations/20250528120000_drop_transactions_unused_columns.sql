-- fx_rate / fx_rate_as_of: written by upsertLedgerTransaction but never read (FX lives in metadata).
-- amount_minor: written for Turnkey rows but never selected; webhooks use payload/metadata instead.

alter table public.transactions
  drop column if exists fx_rate,
  drop column if exists fx_rate_as_of,
  drop column if exists amount_minor;
