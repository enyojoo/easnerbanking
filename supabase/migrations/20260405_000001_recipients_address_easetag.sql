-- Recipient address fields for Noah US bank prepare; optional Easenet W2W handle
ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS payee_easetag text;

COMMENT ON COLUMN public.recipients.payee_easetag IS 'Easenet user @handle for Noah wallet-to-wallet sends (optional alternative to bank details).';
