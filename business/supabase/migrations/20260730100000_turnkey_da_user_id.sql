-- Custodial Turnkey DA user id per wallet owner (set at sub-org bootstrap or migration).
alter table public.wallet_owners
  add column if not exists turnkey_da_user_id text;

comment on column public.wallet_owners.turnkey_da_user_id is
  'Turnkey non-root easner-da user id in the owner sub-org; when set, sends auto-use DA if TURNKEY_DA_* keys configured.';

create index if not exists wallet_owners_turnkey_da_user_id_idx
  on public.wallet_owners (turnkey_da_user_id)
  where turnkey_da_user_id is not null;
