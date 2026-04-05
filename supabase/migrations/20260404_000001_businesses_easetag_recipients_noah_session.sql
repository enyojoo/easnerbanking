-- Business public handle: align naming with consumer `users.easetag`
ALTER TABLE public.businesses RENAME COLUMN slug TO easetag;

ALTER INDEX IF EXISTS idx_easner_organizations_slug RENAME TO idx_easner_organizations_easetag;

ALTER TABLE public.businesses
  RENAME CONSTRAINT easner_organizations_slug_key TO easner_organizations_easetag_key;

-- Optional: Noah form-session sell path (must match prepare fiat amount)
ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS noah_form_session_id text null,
  ADD COLUMN IF NOT EXISTS noah_sell_crypto_authorized text null,
  ADD COLUMN IF NOT EXISTS noah_sell_crypto_currency text null;

COMMENT ON COLUMN public.recipients.noah_form_session_id IS 'Noah POST /transactions/sell FormSessionID from /transactions/sell/prepare (same fiat amount as prepare).';
COMMENT ON COLUMN public.recipients.noah_sell_crypto_authorized IS 'CryptoAuthorizedAmount from prepare; required for form-session sell.';
COMMENT ON COLUMN public.recipients.noah_sell_crypto_currency IS 'e.g. USDC_TEST / USDC; defaults from env in API if unset.';
