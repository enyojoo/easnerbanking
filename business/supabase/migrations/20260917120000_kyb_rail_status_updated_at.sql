alter table if exists public.businesses
  add column if not exists grid_kyb_status_updated_at timestamptz,
  add column if not exists bridge_kyc_status_updated_at timestamptz;
