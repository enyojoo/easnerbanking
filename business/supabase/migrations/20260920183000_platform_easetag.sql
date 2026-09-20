-- Receive by Easetag onto a platform customer.

alter table public.platform_customers
  add column if not exists easetag text;

create unique index if not exists platform_customers_easetag_uidx
  on public.platform_customers (easetag)
  where easetag is not null;
