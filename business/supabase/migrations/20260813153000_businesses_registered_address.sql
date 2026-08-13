-- KYB registered address (synced from Grid) vs operational business address (manual, invoices/statements).
alter table public.businesses
  add column if not exists registered_address_line1 text,
  add column if not exists registered_address_city text,
  add column if not exists registered_address_state text,
  add column if not exists registered_address_postal_code text;

comment on column public.businesses.registered_address_line1 is
  'Legal registered address line 1 from KYB verification (Grid businessInfo.address).';
comment on column public.businesses.registered_address_city is
  'Legal registered address city from KYB verification.';
comment on column public.businesses.registered_address_state is
  'Legal registered address state/region from KYB verification.';
comment on column public.businesses.registered_address_postal_code is
  'Legal registered address postal code from KYB verification.';

-- Backfill from legacy sync that wrote KYB address into operational columns.
update public.businesses
set
  registered_address_line1 = coalesce(registered_address_line1, address_line1),
  registered_address_city = coalesce(registered_address_city, city),
  registered_address_state = coalesce(registered_address_state, state),
  registered_address_postal_code = coalesce(registered_address_postal_code, postal_code)
where registered_address_line1 is null
  and address_line1 is not null
  and (
    verification_provider = 'grid'
    or verification_status in ('pending', 'hold', 'approved')
  );
