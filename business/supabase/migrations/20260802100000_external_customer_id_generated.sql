-- Canonical Easner external ids for Grid platformCustomerId (computed from row UUID).

alter table public.businesses
  add column if not exists external_customer_id text
  generated always as ('eb_' || replace(id::text, '-', '')) stored;

alter table public.users
  add column if not exists external_customer_id text
  generated always as ('ei_' || replace(id::text, '-', '')) stored;

create index if not exists businesses_external_customer_id_idx
  on public.businesses (external_customer_id);

create index if not exists users_external_customer_id_idx
  on public.users (external_customer_id);

comment on column public.businesses.external_customer_id is
  'Canonical Easner external id for Grid platformCustomerId (eb_{compactUuid}).';

comment on column public.users.external_customer_id is
  'Canonical Easner external id for Grid platformCustomerId (ei_{compactUuid}).';
