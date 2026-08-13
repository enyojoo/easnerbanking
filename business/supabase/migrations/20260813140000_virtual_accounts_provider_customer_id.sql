-- Rename virtual_accounts.noah_customer_id → provider_customer_id.
-- Column holds the provider customer id for the row (Noah eind_/ebiz_ or Grid Customer:…).
-- Interpret alongside virtual_accounts.provider ('noah' | 'grid').

alter table public.virtual_accounts
  rename column noah_customer_id to provider_customer_id;

comment on column public.virtual_accounts.provider_customer_id is
  'Provider customer id for this VA row (Noah eind_/ebiz_ or Grid Customer:…). Use with provider.';
