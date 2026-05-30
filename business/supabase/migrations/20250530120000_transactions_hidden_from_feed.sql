-- Feed visibility denormalized for indexed list queries (PostgREST egress reduction).
alter table public.transactions
  add column if not exists hidden_from_feed boolean not null default false;

create index if not exists transactions_feed_personal_idx
  on public.transactions (user_id, occurred_at desc, created_at desc, id desc)
  where hidden_from_feed = false and business_id is null;

create index if not exists transactions_feed_business_idx
  on public.transactions (business_id, occurred_at desc, created_at desc, id desc)
  where hidden_from_feed = false and business_id is not null;

-- Office admin realtime: active admins may SELECT platform rows (realtime respects RLS).
create or replace function public.is_active_office_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where id = auth.uid()
      and status = 'active'
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transactions'
      and policyname = 'office_admin_select_transactions'
  ) then
    create policy office_admin_select_transactions
      on public.transactions
      for select
      to authenticated
      using (public.is_active_office_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'office_admin_select_users'
  ) then
    create policy office_admin_select_users
      on public.users
      for select
      to authenticated
      using (public.is_active_office_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'wallet_balances'
      and policyname = 'office_admin_select_wallet_balances'
  ) then
    create policy office_admin_select_wallet_balances
      on public.wallet_balances
      for select
      to authenticated
      using (public.is_active_office_admin());
  end if;
end $$;
