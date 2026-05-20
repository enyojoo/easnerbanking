-- Drop unused commercial / pricing objects (views or tables).
DROP VIEW IF EXISTS public.user_subscriptions CASCADE;
DROP TABLE IF EXISTS public.user_subscriptions CASCADE;
DROP VIEW IF EXISTS public.rollout_controls CASCADE;
DROP TABLE IF EXISTS public.rollout_controls CASCADE;
DROP VIEW IF EXISTS public.provider_fee_schedules CASCADE;
DROP TABLE IF EXISTS public.provider_fee_schedules CASCADE;
DROP VIEW IF EXISTS public.promo_rules CASCADE;
DROP TABLE IF EXISTS public.promo_rules CASCADE;
DROP VIEW IF EXISTS public.pricing_rules CASCADE;
DROP TABLE IF EXISTS public.pricing_rules CASCADE;
DROP VIEW IF EXISTS public.pricing_plans CASCADE;
DROP TABLE IF EXISTS public.pricing_plans CASCADE;
DROP VIEW IF EXISTS public.limit_policies CASCADE;
DROP TABLE IF EXISTS public.limit_policies CASCADE;
DROP VIEW IF EXISTS public.fee_quotes CASCADE;
DROP TABLE IF EXISTS public.fee_quotes CASCADE;
DROP VIEW IF EXISTS public.applied_fees CASCADE;
DROP TABLE IF EXISTS public.applied_fees CASCADE;

-- Materialize kept relations as real tables when they are still views.
DO $$
DECLARE
  obj text;
  relkind "char";
  ddl text;
BEGIN
  FOREACH obj IN ARRAY ARRAY['system_settings', 'payment_methods', 'admin_audit_log']
  LOOP
    SELECT c.relkind INTO relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = obj;

    IF relkind IS NULL THEN
      RAISE NOTICE 'Object % not found; skipping', obj;
      CONTINUE;
    END IF;

    IF relkind = 'r' THEN
      RAISE NOTICE '% is already a table', obj;
      CONTINUE;
    END IF;

    IF relkind <> 'v' THEN
      RAISE NOTICE '% has relkind %; skipping materialize', obj, relkind;
      CONTINUE;
    END IF;

    ddl := format('CREATE TABLE public.%I__table AS SELECT * FROM public.%I', obj, obj);
    EXECUTE ddl;
    EXECUTE format('DROP VIEW public.%I', obj);
    EXECUTE format('ALTER TABLE public.%I__table RENAME TO %I', obj, obj);
    RAISE NOTICE 'Materialized view % as table', obj;
  END LOOP;
END $$;

-- Ensure primary keys / uniqueness when objects were created only as views.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.system_settings'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.system_settings ADD PRIMARY KEY (key);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'payment_methods' AND relnamespace = 'public'::regnamespace) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.payment_methods'::regclass AND contype = 'p'
    ) THEN
      ALTER TABLE public.payment_methods ADD PRIMARY KEY (id);
    END IF;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.admin_audit_log'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.admin_audit_log ADD PRIMARY KEY (id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;
