-- Drop legacy Noah KYB mirror columns on businesses.
-- Business verification SoR is Grid: verification_status, grid_customer_id, external_customer_id (eb_*).

alter table public.businesses
  drop column if exists noah_customer_id,
  drop column if exists noah_kyb_status,
  drop column if exists noah_kyb_rejection_reasons,
  drop column if exists compliance_cutover_at;
