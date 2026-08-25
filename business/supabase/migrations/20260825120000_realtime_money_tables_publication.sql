-- Realtime publication membership for every table the shared bridge
-- subscribes to (packages/shared/src/query/realtime.ts). These were never
-- added by migration — only by hand in some environments — so a fresh
-- environment could subscribe "successfully" and receive zero events while
-- the channel reported healthy, silently disabling the polling fallback.
-- Context: docs/speed-ux-plan.md (Phase B3A.3).

do $$
begin
  begin
    alter publication supabase_realtime add table public.transactions;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.wallet_balances;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.cards;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.payment_links;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.checkout_stripe_settlements;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.invoice_stripe_settlements;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.invoices;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.payroll_runs;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.user_preferences;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;
end $$;

-- Introspection RPC for the publication health check
-- (app/api/internal/health/realtime-publication): pg_publication_tables is
-- not reachable through PostgREST directly.
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

-- Full replica identity: UPDATE payloads must include non-PK columns so the
-- bridge's `business_id=eq.` filters match and `p.old` carries status fields.
do $$
begin
  begin
    alter table public.transactions replica identity full;
  exception when undefined_table then null; end;
  begin
    alter table public.wallet_balances replica identity full;
  exception when undefined_table then null; end;
  begin
    alter table public.cards replica identity full;
  exception when undefined_table then null; end;
  begin
    alter table public.payment_links replica identity full;
  exception when undefined_table then null; end;
  begin
    alter table public.checkout_stripe_settlements replica identity full;
  exception when undefined_table then null; end;
  begin
    alter table public.invoice_stripe_settlements replica identity full;
  exception when undefined_table then null; end;
  begin
    alter table public.invoices replica identity full;
  exception when undefined_table then null; end;
  begin
    alter table public.payroll_runs replica identity full;
  exception when undefined_table then null; end;
end $$;
