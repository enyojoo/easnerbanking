-- KYB registration country (Grid businessInfo.country) vs operational businesses.country (invoices/statements).
alter table public.businesses
  add column if not exists registration_country text;

comment on column public.businesses.registration_country is
  'Country of legal registration from KYB (Grid businessInfo.country). Distinct from businesses.country used on invoices.';

update public.businesses
set registration_country = country
where registration_country is null
  and country is not null
  and (
    verification_provider = 'grid'
    or verification_status in ('pending', 'hold', 'approved')
  );
