-- B2B customers ledger (Office /business/customers, GET /api/admin/business/customers,
-- Business /customers via GET /api/b2b/demo). PostgREST returns "Could not find the table
-- ... in the schema cache" until this exists.
--
-- Idempotent: safe if the table is already present.

begin;

create extension if not exists pgcrypto;

-- If an older revision created `easner_b2b_customers`, rename once (avoids duplicate tables).
do $$
begin
  if to_regclass('public.easner_b2b_customers') is not null
     and to_regclass('public.b2b_customers') is null then
    alter table public.easner_b2b_customers rename to b2b_customers;
    alter index if exists public.easner_b2b_customers_org_id_idx rename to b2b_customers_org_id_idx;
    alter index if exists public.easner_b2b_customers_created_at_idx rename to b2b_customers_created_at_idx;
    if exists (
      select 1 from pg_constraint
      where conname = 'easner_b2b_customers_organization_id_fkey'
        and conrelid = 'public.b2b_customers'::regclass
    ) then
      alter table public.b2b_customers
        rename constraint easner_b2b_customers_organization_id_fkey to b2b_customers_organization_id_fkey;
    end if;
  end if;
end $$;

create table if not exists public.b2b_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  email text,
  name text,
  phone text,
  created_at timestamptz not null default now()
);

create index if not exists b2b_customers_org_id_idx
  on public.b2b_customers (organization_id);

create index if not exists b2b_customers_created_at_idx
  on public.b2b_customers (created_at desc);

do $$
begin
  if to_regclass('public.organizations') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'b2b_customers_organization_id_fkey'
     ) then
    alter table public.b2b_customers
      add constraint b2b_customers_organization_id_fkey
      foreign key (organization_id) references public.organizations (id) on delete cascade;
  end if;
end $$;

alter table public.b2b_customers enable row level security;

commit;
