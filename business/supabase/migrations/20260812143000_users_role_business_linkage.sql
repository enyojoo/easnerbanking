-- Enforce mutual exclusivity between consumer and business account shape on public.users.
-- individual  => no linked org (mobile / consumer)
-- business    => must have easner_business_id (business web)

-- 1) Repair known-safe drift before adding constraints.
update public.users
set
  role = 'business',
  updated_at = timezone('utc', now())
where easner_business_id is not null
  and role is distinct from 'business';

update public.users
set
  role = 'individual',
  updated_at = timezone('utc', now())
where role is null
  and easner_business_id is null;

-- 2) Fail fast on rows that cannot be auto-repaired.
do $$
begin
  if exists (
    select 1
    from public.users
    where role = 'business'
      and easner_business_id is null
  ) then
    raise exception
      'users_role_business_linkage: cannot add constraint — role=business without easner_business_id';
  end if;

  if exists (
    select 1
    from public.users
    where easner_business_id is not null
      and role is distinct from 'business'
  ) then
    raise exception
      'users_role_business_linkage: cannot add constraint — easner_business_id set but role is not business';
  end if;
end $$;

-- 3) Normalize role column.
alter table public.users
  alter column role set default 'individual';

update public.users
set role = 'individual'
where role is null;

alter table public.users
  alter column role set not null;

-- 4) Allowed values + linkage invariant.
alter table public.users
  drop constraint if exists users_role_allowed_chk;

alter table public.users
  add constraint users_role_allowed_chk
  check (role in ('individual', 'business'));

alter table public.users
  drop constraint if exists users_role_business_linkage_chk;

alter table public.users
  add constraint users_role_business_linkage_chk
  check (
    (role = 'individual' and easner_business_id is null)
    or
    (role = 'business' and easner_business_id is not null)
  );

comment on constraint users_role_business_linkage_chk on public.users is
  'Consumer accounts (individual) must not be linked to a business; business accounts must have easner_business_id.';
