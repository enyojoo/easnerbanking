-- Drop legacy Noah custodial wallet ids (Turnkey handles on-chain deposits).
alter table public.users
  drop column if exists noah_wallet_id;

alter table public.businesses
  drop column if exists noah_wallet_id;

-- Mirror users.noah_gbp_virtual_account_id on businesses for GBP VAs.
alter table public.businesses
  add column if not exists noah_gbp_virtual_account_id text;

comment on column public.businesses.noah_gbp_virtual_account_id is
  'Noah payment method id for the business GBP virtual account (mirrors virtual_accounts.noah_virtual_account_id).';
