-- Rename virtual_accounts.noah_virtual_account_id → provider_virtual_account_id.
-- Column holds the provider's canonical VA id (Noah Bank/… PM id or Grid InternalAccount composite key).
-- Interpret alongside virtual_accounts.provider ('noah' | 'grid').

alter table public.virtual_accounts
  rename column noah_virtual_account_id to provider_virtual_account_id;

comment on column public.virtual_accounts.provider_virtual_account_id is
  'Provider canonical virtual account id (Noah Bank/… PM id or Grid InternalAccount composite key). Use with provider.';
