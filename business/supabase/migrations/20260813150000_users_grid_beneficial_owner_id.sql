-- Grid BUSINESS KYB: link org owner users row to Grid BeneficialOwner resource.
-- businesses.grid_customer_id holds Customer:… for the org; this holds BeneficialOwner:… for the UBO.

alter table public.users
  add column if not exists grid_beneficial_owner_id text;

comment on column public.users.grid_beneficial_owner_id is
  'Grid BeneficialOwner id (BeneficialOwner:…) for business org owners verified via KYB. Parent business Customer id lives on businesses.grid_customer_id.';

create index if not exists users_grid_beneficial_owner_id_idx
  on public.users (grid_beneficial_owner_id)
  where grid_beneficial_owner_id is not null;
