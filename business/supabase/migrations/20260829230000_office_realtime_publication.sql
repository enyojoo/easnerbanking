-- Office admin realtime: publish every table `attachOfficeRealtime` watches,
-- give UPDATE payloads full replica identity, and let active office staff
-- receive postgres_changes (RLS applies to the staff JWT).

create or replace function public.is_office_admin()
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

revoke all on function public.is_office_admin() from public;
revoke all on function public.is_office_admin() from anon;
grant execute on function public.is_office_admin() to authenticated;

create or replace function public._easner_office_realtime_table(tbl text)
returns void
language plpgsql
as $$
begin
  begin
    execute format('alter publication supabase_realtime add table public.%I', tbl);
  exception
    when duplicate_object then null;
    when undefined_table then null;
    when undefined_object then null;
  end;
  begin
    execute format('alter table public.%I replica identity full', tbl);
  exception
    when undefined_table then null;
  end;
  begin
    execute format('alter table public.%I enable row level security', tbl);
  exception
    when undefined_table then null;
    return;
  end;
  begin
    execute format('grant select on table public.%I to authenticated', tbl);
  exception
    when undefined_table then null;
    when insufficient_privilege then null;
    when duplicate_object then null;
  end;
  begin
    execute format('drop policy if exists office_admin_select on public.%I', tbl);
    execute format(
      'create policy office_admin_select on public.%I for select to authenticated using (public.is_office_admin())',
      tbl
    );
  exception
    when undefined_table then null;
    when duplicate_object then null;
  end;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'transactions',
    'users',
    'wallet_balances',
    'businesses',
    'business_customers',
    'invoices',
    'terminal_sessions',
    'event_inbox',
    'account_statements',
    'system_settings',
    'currencies',
    'exchange_rates',
    'noah_rates',
    'yellowcard_rates',
    'grid_rates',
    'crypto_rates',
    'payout_corridors',
    'crypto_destinations',
    'processing_fee_schedule',
    'processing_fee_overrides',
    'business_checkout_fee_overrides'
  ]
  loop
    perform public._easner_office_realtime_table(tbl);
  end loop;
end $$;

drop function public._easner_office_realtime_table(text);
