-- Accounts are VAs issued to a customer. Business-level rows stay customer_id null.

alter table public.platform_accounts
  add column if not exists customer_id text references public.platform_customers (id) on delete cascade;

alter table public.platform_accounts
  drop constraint if exists platform_accounts_business_id_livemode_currency_key;

create unique index if not exists platform_accounts_issued_currency_idx
  on public.platform_accounts (business_id, livemode, customer_id, currency)
  where customer_id is not null;

create unique index if not exists platform_accounts_treasury_currency_idx
  on public.platform_accounts (business_id, livemode, currency)
  where customer_id is null;

create index if not exists platform_accounts_customer_idx
  on public.platform_accounts (customer_id)
  where customer_id is not null;
