-- Row Level Security for hub-grouped tables (commercial / pricing / ops / platform)
-- and public views that point at them.
--
-- Hubs vs tables:
-- - Office "Monetization / Pricing & FX / Platform control" are UI routes, not table names.
-- - Postgres grouping is by SCHEMA: commercial.*, pricing.*, ops.*, platform.* (see 20260403_000001).
-- - public.pricing_plans (etc.) are usually VIEWS over those tables — same names, not duplicate tables.
--
-- Access model:
-- - service_role (Business API, pricing evaluator, webhooks) bypasses RLS.
-- - Office browser uses authenticated JWT for admin_users, system_settings, payment_methods — policies below.
-- - Hub business tables: RLS enabled, no policy for anon/authenticated → direct client access denied;
--   server-side service_role still works.
--
-- Requires PostgreSQL 15+ for ALTER VIEW ... SET (security_invoker = true).

begin;

-- Let authenticated sessions resolve security_invoker views into these schemas (RLS still applies).
grant usage on schema commercial to authenticated;
grant usage on schema pricing to authenticated;
grant usage on schema ops to authenticated;
grant usage on schema platform to authenticated;

-- ---------------------------------------------------------------------------
-- public.admin_users — staff reads own row (Office auth gate)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.admin_users') is not null then
    execute 'alter table public.admin_users enable row level security';
    execute 'drop policy if exists office_admin_users_select_own on public.admin_users';
    execute $p$
      create policy office_admin_users_select_own
        on public.admin_users
        for select
        to authenticated
        using (id = auth.uid())
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- platform.system_settings — Office Settings + currency override keys
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('platform.system_settings') is not null then
    execute 'alter table platform.system_settings enable row level security';
    execute 'drop policy if exists office_staff_all_system_settings on platform.system_settings';
    execute $p$
      create policy office_staff_all_system_settings
        on platform.system_settings
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.admin_users au
            where au.id = auth.uid() and au.status = 'active'
          )
        )
        with check (
          exists (
            select 1
            from public.admin_users au
            where au.id = auth.uid() and au.status = 'active'
          )
        )
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- platform.payment_methods — Office Settings tab
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('platform.payment_methods') is not null then
    execute 'alter table platform.payment_methods enable row level security';
    execute 'drop policy if exists office_staff_all_payment_methods on platform.payment_methods';
    execute $p$
      create policy office_staff_all_payment_methods
        on platform.payment_methods
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.admin_users au
            where au.id = auth.uid() and au.status = 'active'
          )
        )
        with check (
          exists (
            select 1
            from public.admin_users au
            where au.id = auth.uid() and au.status = 'active'
          )
        )
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- platform.admin_audit_log — inserts/reads only via service_role in app code
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('platform.admin_audit_log') is not null then
    execute 'alter table platform.admin_audit_log enable row level security';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- commercial.* — server-side only in this repo
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('commercial.pricing_plans') is not null then
    execute 'alter table commercial.pricing_plans enable row level security';
  end if;
  if to_regclass('commercial.promo_rules') is not null then
    execute 'alter table commercial.promo_rules enable row level security';
  end if;
  if to_regclass('commercial.limit_policies') is not null then
    execute 'alter table commercial.limit_policies enable row level security';
  end if;
  if to_regclass('commercial.user_subscriptions') is not null then
    execute 'alter table commercial.user_subscriptions enable row level security';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- pricing.*
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('pricing.pricing_rules') is not null then
    execute 'alter table pricing.pricing_rules enable row level security';
  end if;
  if to_regclass('pricing.provider_fee_schedules') is not null then
    execute 'alter table pricing.provider_fee_schedules enable row level security';
  end if;
  if to_regclass('pricing.rollout_controls') is not null then
    execute 'alter table pricing.rollout_controls enable row level security';
  end if;
  if to_regclass('pricing.fee_quotes') is not null then
    execute 'alter table pricing.fee_quotes enable row level security';
  end if;
  if to_regclass('pricing.applied_fees') is not null then
    execute 'alter table pricing.applied_fees enable row level security';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ops.webhook_deliveries
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('ops.webhook_deliveries') is not null then
    execute 'alter table ops.webhook_deliveries enable row level security';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fallback: regroup (000001) not applied — same RLS on public base tables
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('platform.system_settings') is null
     and exists (
       select 1 from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'system_settings' and c.relkind = 'r'
     ) then
    execute 'alter table public.system_settings enable row level security';
    execute 'drop policy if exists office_staff_all_system_settings on public.system_settings';
    execute $p$
      create policy office_staff_all_system_settings
        on public.system_settings
        for all
        to authenticated
        using (
          exists (
            select 1 from public.admin_users au
            where au.id = auth.uid() and au.status = 'active'
          )
        )
        with check (
          exists (
            select 1 from public.admin_users au
            where au.id = auth.uid() and au.status = 'active'
          )
        )
    $p$;
  end if;
end $$;

do $$
begin
  if to_regclass('platform.payment_methods') is null
     and exists (
       select 1 from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'payment_methods' and c.relkind = 'r'
     ) then
    execute 'alter table public.payment_methods enable row level security';
    execute 'drop policy if exists office_staff_all_payment_methods on public.payment_methods';
    execute $p$
      create policy office_staff_all_payment_methods
        on public.payment_methods
        for all
        to authenticated
        using (
          exists (
            select 1 from public.admin_users au
            where au.id = auth.uid() and au.status = 'active'
          )
        )
        with check (
          exists (
            select 1 from public.admin_users au
            where au.id = auth.uid() and au.status = 'active'
          )
        )
    $p$;
  end if;
end $$;

do $$
begin
  if to_regclass('platform.admin_audit_log') is null
     and exists (
       select 1 from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'admin_audit_log' and c.relkind = 'r'
     ) then
    execute 'alter table public.admin_audit_log enable row level security';
  end if;
end $$;

do $$
begin
  if to_regclass('commercial.pricing_plans') is null
     and exists (
       select 1 from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'pricing_plans' and c.relkind = 'r'
     ) then
    execute 'alter table public.pricing_plans enable row level security';
  end if;
  if to_regclass('commercial.promo_rules') is null
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'promo_rules' and c.relkind = 'r') then
    execute 'alter table public.promo_rules enable row level security';
  end if;
  if to_regclass('commercial.limit_policies') is null
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'limit_policies' and c.relkind = 'r') then
    execute 'alter table public.limit_policies enable row level security';
  end if;
  if to_regclass('commercial.user_subscriptions') is null
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'user_subscriptions' and c.relkind = 'r') then
    execute 'alter table public.user_subscriptions enable row level security';
  end if;
  if to_regclass('pricing.pricing_rules') is null
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'pricing_rules' and c.relkind = 'r') then
    execute 'alter table public.pricing_rules enable row level security';
  end if;
  if to_regclass('pricing.provider_fee_schedules') is null
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'provider_fee_schedules' and c.relkind = 'r') then
    execute 'alter table public.provider_fee_schedules enable row level security';
  end if;
  if to_regclass('pricing.rollout_controls') is null
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'rollout_controls' and c.relkind = 'r') then
    execute 'alter table public.rollout_controls enable row level security';
  end if;
  if to_regclass('pricing.fee_quotes') is null
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'fee_quotes' and c.relkind = 'r') then
    execute 'alter table public.fee_quotes enable row level security';
  end if;
  if to_regclass('pricing.applied_fees') is null
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'applied_fees' and c.relkind = 'r') then
    execute 'alter table public.applied_fees enable row level security';
  end if;
  if to_regclass('ops.webhook_deliveries') is null
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'webhook_deliveries' and c.relkind = 'r') then
    execute 'alter table public.webhook_deliveries enable row level security';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- public views — evaluate underlying RLS as the current user (not bypass via view owner)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname as view_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and c.relname in (
        'pricing_plans',
        'promo_rules',
        'limit_policies',
        'user_subscriptions',
        'pricing_rules',
        'provider_fee_schedules',
        'rollout_controls',
        'fee_quotes',
        'applied_fees',
        'webhook_deliveries',
        'system_settings',
        'payment_methods',
        'admin_audit_log'
      )
  loop
    execute format('alter view public.%I set (security_invoker = true)', r.view_name);
  end loop;
end $$;

commit;
