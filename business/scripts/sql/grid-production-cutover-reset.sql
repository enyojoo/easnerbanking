-- Grid sandbox → production cutover (full reset)
--
-- Resets every Grid SoR org to a clean production starting state.
-- KEEP: external_customer_id (eb_*), verification_provider, verification_status columns.
--
-- Run after migration 20260813143000_businesses_drop_noah_kyb_columns.sql
-- Run entire script in Supabase SQL editor.

begin;

select
  b.id,
  b.name,
  b.external_customer_id,
  b.grid_customer_id,
  b.verification_status,
  b.kyb_verified_at
from public.businesses b
where b.verification_provider = 'grid'
order by b.verification_status desc, b.name;

update public.businesses
set
  grid_customer_id = null,
  verification_status = 'not_started',
  verification_rejection_reasons = null,
  kyb_verified_at = null,
  updated_at = now()
where verification_provider = 'grid';

delete from public.virtual_accounts
where provider = 'grid';

update public.users
set
  grid_customer_id = null,
  updated_at = now()
where grid_customer_id is not null;

update public.users u
set
  grid_end_user_terms_synced_at = null,
  updated_at = now()
from public.businesses b
where u.easner_business_id = b.id
  and b.verification_provider = 'grid'
  and u.grid_end_user_terms_synced_at is not null;

select
  b.id,
  b.name,
  b.external_customer_id,
  b.grid_customer_id,
  b.verification_status,
  b.kyb_verified_at
from public.businesses b
where b.verification_provider = 'grid'
order by b.name;

commit;
