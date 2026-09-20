-- Catch-up: production is missing tables from supabase_realtime that the
-- health check (and office/shared bridges) subscribe to. Safe to re-run.
-- Completes 20260825120000_realtime_money_tables_publication.sql and
-- 20260829230000_office_realtime_publication.sql.

create or replace function public.realtime_publication_tables()
returns setof text
language sql
security definer
set search_path = public
as $$
  select tablename::text from pg_publication_tables where pubname = 'supabase_realtime'
$$;

revoke all on function public.realtime_publication_tables() from public;
revoke all on function public.realtime_publication_tables() from anon;
revoke all on function public.realtime_publication_tables() from authenticated;
grant execute on function public.realtime_publication_tables() to service_role;

create or replace function public._easner_realtime_pub_add(tbl text)
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
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'transactions',
    'wallet_balances',
    'cards',
    'payment_links',
    'checkout_stripe_settlements',
    'invoice_stripe_settlements',
    'invoices',
    'payroll_runs',
    'notifications',
    'user_preferences',
    'businesses',
    'business_kyb_applications',
    'users',
    'business_stripe_connect_accounts',
    'business_checkout_settings',
    'business_customers',
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
    perform public._easner_realtime_pub_add(tbl);
  end loop;
end $$;

drop function public._easner_realtime_pub_add(text);
