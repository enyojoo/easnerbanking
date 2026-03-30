-- Optional currencies beyond default USD/EUR (GBP, NGN, …) chosen via Open Currency Account.
alter table public.easner_organizations
  add column if not exists enabled_extra_account_currencies text[] not null default '{}';

alter table public.users
  add column if not exists enabled_extra_account_currencies text[] not null default '{}';
