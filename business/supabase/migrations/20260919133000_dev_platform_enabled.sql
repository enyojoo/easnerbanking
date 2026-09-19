alter table public.businesses
  add column if not exists dev_platform_enabled boolean not null default false;

comment on column public.businesses.dev_platform_enabled is
  'Office-gated access to Easner Platform (Checkout, Developers). Default off.';
