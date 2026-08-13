-- Cleanup orphan businesses created by the signup bootstrap vs profile GET race.
--
-- Symptom: two rows like "Fruitful's Business" — one linked to the owner (Office shows
-- an Owner link), one ghost (Owner column is "—", empty easetag/KYB fields).
--
-- Safe to delete: businesses with NO users.easner_business_id pointer AND NO
-- business_memberships rows. Child payroll rows CASCADE on delete.
--
-- Run in Supabase SQL editor. Review every SELECT before uncommenting DELETE.

-- ---------------------------------------------------------------------------
-- 1) All orphan businesses (no user link, no membership)
-- ---------------------------------------------------------------------------
select
  b.id,
  b.name,
  b.easetag,
  b.country,
  b.business_type,
  b.grid_customer_id,
  b.verification_status,
  b.created_at,
  b.updated_at
from public.businesses b
where not exists (
  select 1 from public.users u where u.easner_business_id = b.id
)
and not exists (
  select 1 from public.business_memberships bm where bm.business_id = b.id
)
order by b.created_at desc;

-- ---------------------------------------------------------------------------
-- 2) Signup-race duplicate pairs (same owner email, created within 5 minutes)
--    Keeps the row users.easner_business_id points at; flags the orphan twin.
-- ---------------------------------------------------------------------------
with owner_links as (
  select
    b.id as business_id,
    b.name as business_name,
    b.created_at,
    u.id as owner_user_id,
    u.email as owner_email,
    u.full_name as owner_name,
    u.easner_business_id as linked_business_id,
    (u.easner_business_id = b.id) as is_linked_to_owner
  from public.businesses b
  left join public.business_memberships bm
    on bm.business_id = b.id
    and lower(coalesce(bm.role, '')) = 'owner'
    and lower(coalesce(bm.status, '')) <> 'invited'
  left join public.users u
    on u.id = bm.user_id
    or u.easner_business_id = b.id
),
paired as (
  select
    a.business_id as keep_candidate_id,
    a.business_name as keep_candidate_name,
    a.owner_email,
    a.owner_name,
    a.created_at as keep_created_at,
    b.business_id as orphan_candidate_id,
    b.business_name as orphan_candidate_name,
    b.created_at as orphan_created_at,
    a.is_linked_to_owner as keep_is_linked,
    b.is_linked_to_owner as orphan_is_linked
  from owner_links a
  join owner_links b
    on a.owner_email is not null
    and a.owner_email = b.owner_email
    and a.business_id <> b.business_id
    and abs(extract(epoch from (a.created_at - b.created_at))) <= 300
    and coalesce(a.business_name, '') = coalesce(b.business_name, '')
)
select distinct
  orphan_candidate_id as orphan_business_id,
  orphan_candidate_name,
  orphan_created_at,
  keep_candidate_id as linked_business_id,
  keep_candidate_name,
  owner_email,
  owner_name
from paired
where orphan_is_linked = false
  and keep_is_linked = true
order by orphan_created_at desc;

-- ---------------------------------------------------------------------------
-- 3) Fruitful case (adjust pattern if needed)
-- ---------------------------------------------------------------------------
select
  b.id,
  b.name,
  b.easetag,
  b.country,
  b.created_at,
  u.id as linked_owner_user_id,
  u.email as linked_owner_email,
  u.full_name as linked_owner_name,
  case
    when u.easner_business_id = b.id then 'linked'
    when u.id is null then 'orphan'
    else 'other'
  end as link_status
from public.businesses b
left join public.users u on u.easner_business_id = b.id
where b.name ilike '%fruitful%'
   or b.name ilike '%Fruitful%'
order by b.created_at;

-- ---------------------------------------------------------------------------
-- 4) DELETE orphans (only after steps 1–3 look correct)
--    Uncomment the transaction block to apply.
-- ---------------------------------------------------------------------------
-- begin;
--
-- delete from public.businesses b
-- where b.id in (
--   select b2.id
--   from public.businesses b2
--   where not exists (
--     select 1 from public.users u where u.easner_business_id = b2.id
--   )
--   and not exists (
--     select 1 from public.business_memberships bm where bm.business_id = b2.id
--   )
-- );
--
-- -- Optional: delete only Fruitful ghost if you prefer a surgical fix.
-- -- Replace <orphan_uuid> with the id from step 3 where link_status = 'orphan'.
-- -- delete from public.businesses where id = '<orphan_uuid>';
--
-- commit;
