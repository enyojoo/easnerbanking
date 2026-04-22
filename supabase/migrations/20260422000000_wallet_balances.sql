-- Wallet balances: DB-backed snapshot for realtime dashboards.
-- This table is the source-of-truth snapshot for UI balances (USD/EUR),
-- updated by Turnkey webhook ingestion + periodic reconciliation.

create extension if not exists "pgcrypto";

create table if not exists public.wallet_balances (
  id uuid primary key default gen_random_uuid(),
  -- Business scope: org/business id (`businesses.id`), consistent with `transactions.business_id`.
  business_id uuid,
  -- Personal scope: user id.
  user_id uuid,
  currency text not null check (currency in ('USD','EUR')),
  -- Display amount in major units (stablecoin-as-fiat UX).
  available_balance numeric not null default 0,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- At least one scope column must be present.
  constraint wallet_balances_scope_chk check ((business_id is not null) or (user_id is not null))
);

-- Upgrade path: if the table existed before this migration (older schema),
-- add missing columns + refresh the scope constraint before creating indexes.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_balances'
      and column_name = 'business_id'
  ) then
    alter table public.wallet_balances add column business_id uuid;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_balances'
      and column_name = 'user_id'
  ) then
    alter table public.wallet_balances add column user_id uuid;
  end if;

  -- Recreate scope check constraint to reference the canonical columns.
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'wallet_balances'
      and constraint_name = 'wallet_balances_scope_chk'
  ) then
    alter table public.wallet_balances drop constraint wallet_balances_scope_chk;
  end if;

  alter table public.wallet_balances
    add constraint wallet_balances_scope_chk check ((business_id is not null) or (user_id is not null));
exception
  when duplicate_object then
    -- Constraint already exists in the desired form.
    null;
end
$$;

-- Drop legacy indexes if a previous iteration created them.
drop index if exists wallet_balances_entity_currency_uidx;
drop index if exists wallet_balances_entity_idx;

create unique index if not exists wallet_balances_entity_currency_uidx
  on public.wallet_balances (business_id, currency)
  where business_id is not null;

create unique index if not exists wallet_balances_user_currency_uidx
  on public.wallet_balances (user_id, currency)
  where user_id is not null;

create index if not exists wallet_balances_entity_idx on public.wallet_balances (business_id);
create index if not exists wallet_balances_user_idx on public.wallet_balances (user_id);

comment on table public.wallet_balances is 'DB snapshot of USD/EUR balances used by realtime dashboards; never call Turnkey on every render.';

-- Realtime + RLS -------------------------------------------------------------
-- Supabase Realtime only emits changes for tables in the `supabase_realtime` publication.
-- Also: Realtime respects RLS, so we must allow authenticated users to select their rows.

alter table public.wallet_balances enable row level security;

-- Individual user can read their own snapshot rows.
drop policy if exists "wallet_balances_select_own_user" on public.wallet_balances;
create policy "wallet_balances_select_own_user"
  on public.wallet_balances
  for select
  to authenticated
  using (user_id = auth.uid());

-- Business users can read snapshot rows for their business.
-- NOTE: this assumes `users.easner_business_id` is populated for business members.
drop policy if exists "wallet_balances_select_own_business" on public.wallet_balances;
create policy "wallet_balances_select_own_business"
  on public.wallet_balances
  for select
  to authenticated
  using (
    business_id is not null
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.easner_business_id = wallet_balances.business_id
    )
  );

-- Best-effort: add table to realtime publication (works in SQL editor).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.wallet_balances';
  end if;
exception
  when duplicate_object then
    null; -- already in publication
  when undefined_object then
    null; -- publication doesn't exist in this environment
end
$$;

