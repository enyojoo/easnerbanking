-- One checkout website per origin. Return URLs live on the site; keys/webhook stay on settings.

create table if not exists public.business_checkout_sites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  origin text not null,
  success_url text,
  cancel_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_checkout_sites_origin_unique unique (business_id, origin)
);

comment on table public.business_checkout_sites is
  'Merchant websites allowed to use Checkout keys, with optional per-site return URLs.';

insert into public.business_checkout_sites (business_id, origin, success_url, cancel_url)
select
  s.business_id,
  trim(origin.origin),
  s.default_success_url,
  s.default_cancel_url
from public.business_checkout_settings s
cross join lateral unnest(coalesce(s.allowed_origins, '{}'::text[])) as origin(origin)
where trim(origin.origin) <> ''
on conflict (business_id, origin) do nothing;

alter table public.business_checkout_sites enable row level security;

create policy business_checkout_sites_select_member
  on public.business_checkout_sites
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = business_checkout_sites.business_id
    )
  );
