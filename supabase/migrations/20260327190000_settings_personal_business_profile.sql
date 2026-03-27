begin;

-- Users table: full name + personal settings
alter table public.users
add column if not exists full_name text null,
add column if not exists phone text null,
add column if not exists date_of_birth date null,
add column if not exists easner_role text not null default 'individual'::text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_easner_role_check'
  ) then
    alter table public.users
    add constraint users_easner_role_check
    check (easner_role in ('business', 'individual'));
  end if;
end $$;

-- Organizations table: business settings fields
alter table public.easner_organizations
add column if not exists country text null,
add column if not exists logo_url text null,
add column if not exists business_type text null,
add column if not exists registration_number text null,
add column if not exists tax_id text null,
add column if not exists base_currency text null default 'USD'::text,
add column if not exists description text null,
add column if not exists website text null,
add column if not exists support_email text null,
add column if not exists support_phone text null,
add column if not exists address_line1 text null,
add column if not exists city text null,
add column if not exists state text null,
add column if not exists postal_code text null;

commit;
