-- Business fiat VAs live in virtual_accounts (provider grid|noah). Drop legacy PM id mirrors on businesses.

alter table public.businesses
  drop column if exists noah_usd_virtual_account_id,
  drop column if exists noah_eur_virtual_account_id,
  drop column if exists noah_gbp_virtual_account_id;

comment on table public.businesses is
  'Business org profile. Fiat receive rails: public.virtual_accounts (not denormalized VA ids on this row).';
