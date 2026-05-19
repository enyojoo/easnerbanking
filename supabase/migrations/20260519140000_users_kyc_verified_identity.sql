-- KYC verified identity columns on users; drop unused Noah metadata / per-user KYB columns.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS kyc_id_type text,
  ADD COLUMN IF NOT EXISTS kyc_id_number text,
  ADD COLUMN IF NOT EXISTS kyc_id_issuing_country text,
  ADD COLUMN IF NOT EXISTS kyc_address_street text,
  ADD COLUMN IF NOT EXISTS kyc_address_city text,
  ADD COLUMN IF NOT EXISTS kyc_address_state text,
  ADD COLUMN IF NOT EXISTS kyc_address_post_code text,
  ADD COLUMN IF NOT EXISTS kyc_address_country text,
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS noah_kyc_metadata,
  DROP COLUMN IF EXISTS noah_kyb_customer_id,
  DROP COLUMN IF EXISTS noah_kyb_status;

COMMENT ON COLUMN public.users.kyc_id_type IS 'Raw Noah Identities[0].IDType (e.g. TaxID).';
COMMENT ON COLUMN public.users.kyc_id_number IS 'Full ID number from Noah; mask in API/UI only.';
COMMENT ON COLUMN public.users.kyc_id_issuing_country IS 'ISO-3166-1 alpha-2 issuing country.';
COMMENT ON COLUMN public.users.kyc_verified_at IS 'When Noah Customer verification was approved.';
