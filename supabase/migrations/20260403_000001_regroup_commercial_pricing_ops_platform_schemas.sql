-- =============================================================================
-- Schema regrouping + public compatibility views + audit table bootstrap
-- =============================================================================
--
-- What this migration does:
--
-- 1) REGROUP: For tables that already live as BASE TABLEs in `public`, move them
--    into domain schemas (`commercial`, `pricing`, `ops`, `platform`) using
--    ALTER TABLE ... SET SCHEMA. Office/business code continues to use the same
--    Supabase `.from("table_name")` paths via step (2).
--
-- 2) VIEWS: CREATE OR REPLACE VIEW public.<name> AS SELECT * FROM <schema>.<name>
--    so PostgREST and supabase-js keep resolving `public` names without exposing
--    extra schemas in API settings.
--
-- 3) CREATE (only where missing): `admin_audit_log` — the Business app expects
--    this table for GET /api/admin/audit-log and logAdminAction (Noah sync, etc.)
--    but no earlier migration in this repo created it. If neither `public` nor
--    `platform` already has a base table `admin_audit_log`, we create
--    `platform.admin_audit_log` with the columns those routes insert/select.
--
-- What this migration does NOT do:
-- - It does not CREATE pricing/commercial/ops tables (pricing_plans, pricing_rules,
--   webhook_deliveries, …). Those must already exist in your database (from prior
--   migrations, seeds, or manual DDL). If a name is missing, the corresponding
--   ALTER / VIEW blocks are simply skipped for that object.
--
-- Idempotency: moves run only when `public.<table>` is still a BASE TABLE; views
-- are always recreated when the physical table exists in the target schema.
--
-- Depends on: 20260402_* (system_settings, payment_methods, transactions columns);
--             pgcrypto for gen_random_uuid() on admin_audit_log.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

create schema if not exists commercial;
create schema if not exists pricing;
create schema if not exists ops;
create schema if not exists platform;

-- ---------------------------------------------------------------------------
-- platform.admin_audit_log — create physical table if missing
-- Matches business/lib/admin-audit.ts insert + audit-log route select("*")
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'platform' and c.relname = 'admin_audit_log' and c.relkind = 'r'
  )
  and not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'admin_audit_log' and c.relkind = 'r'
  ) then
    create table platform.admin_audit_log (
      id uuid primary key default gen_random_uuid(),
      admin_user_id uuid not null,
      action text not null,
      resource text not null,
      metadata jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists admin_audit_log_created_at_idx
      on platform.admin_audit_log (created_at desc);
  end if;
end $$;

-- commercial.pricing_plans
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'pricing_plans' and table_type = 'BASE TABLE'
  ) then
    alter table public.pricing_plans set schema commercial;
  end if;
end $$;
do $$
begin
  if to_regclass('commercial.pricing_plans') is not null then
    execute 'create or replace view public.pricing_plans as select * from commercial.pricing_plans';
  end if;
end $$;

-- commercial.promo_rules
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'promo_rules' and table_type = 'BASE TABLE'
  ) then
    alter table public.promo_rules set schema commercial;
  end if;
end $$;
do $$
begin
  if to_regclass('commercial.promo_rules') is not null then
    execute 'create or replace view public.promo_rules as select * from commercial.promo_rules';
  end if;
end $$;

-- commercial.limit_policies
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'limit_policies' and table_type = 'BASE TABLE'
  ) then
    alter table public.limit_policies set schema commercial;
  end if;
end $$;
do $$
begin
  if to_regclass('commercial.limit_policies') is not null then
    execute 'create or replace view public.limit_policies as select * from commercial.limit_policies';
  end if;
end $$;

-- commercial.user_subscriptions
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_subscriptions' and table_type = 'BASE TABLE'
  ) then
    alter table public.user_subscriptions set schema commercial;
  end if;
end $$;
do $$
begin
  if to_regclass('commercial.user_subscriptions') is not null then
    execute 'create or replace view public.user_subscriptions as select * from commercial.user_subscriptions';
  end if;
end $$;

-- pricing.pricing_rules
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'pricing_rules' and table_type = 'BASE TABLE'
  ) then
    alter table public.pricing_rules set schema pricing;
  end if;
end $$;
do $$
begin
  if to_regclass('pricing.pricing_rules') is not null then
    execute 'create or replace view public.pricing_rules as select * from pricing.pricing_rules';
  end if;
end $$;

-- pricing.provider_fee_schedules
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'provider_fee_schedules' and table_type = 'BASE TABLE'
  ) then
    alter table public.provider_fee_schedules set schema pricing;
  end if;
end $$;
do $$
begin
  if to_regclass('pricing.provider_fee_schedules') is not null then
    execute 'create or replace view public.provider_fee_schedules as select * from pricing.provider_fee_schedules';
  end if;
end $$;

-- pricing.rollout_controls
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'rollout_controls' and table_type = 'BASE TABLE'
  ) then
    alter table public.rollout_controls set schema pricing;
  end if;
end $$;
do $$
begin
  if to_regclass('pricing.rollout_controls') is not null then
    execute 'create or replace view public.rollout_controls as select * from pricing.rollout_controls';
  end if;
end $$;

-- pricing.fee_quotes
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'fee_quotes' and table_type = 'BASE TABLE'
  ) then
    alter table public.fee_quotes set schema pricing;
  end if;
end $$;
do $$
begin
  if to_regclass('pricing.fee_quotes') is not null then
    execute 'create or replace view public.fee_quotes as select * from pricing.fee_quotes';
  end if;
end $$;

-- pricing.applied_fees
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'applied_fees' and table_type = 'BASE TABLE'
  ) then
    alter table public.applied_fees set schema pricing;
  end if;
end $$;
do $$
begin
  if to_regclass('pricing.applied_fees') is not null then
    execute 'create or replace view public.applied_fees as select * from pricing.applied_fees';
  end if;
end $$;

-- ops.webhook_deliveries
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'webhook_deliveries' and table_type = 'BASE TABLE'
  ) then
    alter table public.webhook_deliveries set schema ops;
  end if;
end $$;
do $$
begin
  if to_regclass('ops.webhook_deliveries') is not null then
    execute 'create or replace view public.webhook_deliveries as select * from ops.webhook_deliveries';
  end if;
end $$;

-- platform.system_settings
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'system_settings' and table_type = 'BASE TABLE'
  ) then
    alter table public.system_settings set schema platform;
  end if;
end $$;
do $$
begin
  if to_regclass('platform.system_settings') is not null then
    execute 'create or replace view public.system_settings as select * from platform.system_settings';
  end if;
end $$;

-- platform.payment_methods
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payment_methods' and table_type = 'BASE TABLE'
  ) then
    alter table public.payment_methods set schema platform;
  end if;
end $$;
do $$
begin
  if to_regclass('platform.payment_methods') is not null then
    execute 'create or replace view public.payment_methods as select * from platform.payment_methods';
  end if;
end $$;

-- platform.admin_audit_log: move from public if still a base table there, then view
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_audit_log' and table_type = 'BASE TABLE'
  ) then
    alter table public.admin_audit_log set schema platform;
  end if;
end $$;
do $$
begin
  if to_regclass('platform.admin_audit_log') is not null then
    execute 'create or replace view public.admin_audit_log as select * from platform.admin_audit_log';
  end if;
end $$;

commit;
