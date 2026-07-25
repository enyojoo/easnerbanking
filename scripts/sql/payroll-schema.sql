-- Easner Payroll — apply in Supabase (business-scoped disbursement)
-- Run after review in staging; tables are additive.

-- ---------------------------------------------------------------------------
-- payroll_people
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('employee', 'contractor')),
  full_name text NOT NULL,
  email text,
  country text,
  default_amount_cents bigint NOT NULL DEFAULT 0,
  pay_currency text NOT NULL DEFAULT 'USD',
  pay_basis text NOT NULL DEFAULT 'fixed' CHECK (pay_basis IN ('fixed', 'hourly')),
  hourly_rate_cents bigint,
  recipient_id uuid REFERENCES recipients(id) ON DELETE SET NULL,
  easetag text,
  rail text NOT NULL CHECK (rail IN ('easetag', 'bank', 'mobile', 'intl_bank', 'crypto')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'held', 'terminated')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_people_business ON payroll_people(business_id);
CREATE INDEX IF NOT EXISTS idx_payroll_people_status ON payroll_people(business_id, status);

-- ---------------------------------------------------------------------------
-- payroll_schedules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default schedule',
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'semimonthly')),
  next_run_at date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  template jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_schedules_due ON payroll_schedules(active, next_run_at);

-- ---------------------------------------------------------------------------
-- payroll_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft',
      'pending_approval',
      'approved',
      'executing',
      'completed',
      'partial',
      'failed',
      'cancelled'
    )
  ),
  scheduled_for date,
  source_currency text NOT NULL DEFAULT 'USD',
  total_source_cents bigint NOT NULL DEFAULT 0,
  shortfall_cents bigint NOT NULL DEFAULT 0,
  drafted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  executed_at timestamptz,
  fx_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_business ON payroll_runs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(business_id, status);

-- ---------------------------------------------------------------------------
-- payroll_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  person_id uuid REFERENCES payroll_people(id) ON DELETE SET NULL,
  recipient_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount_cents bigint NOT NULL DEFAULT 0,
  pay_currency text NOT NULL DEFAULT 'USD',
  source_amount_cents bigint NOT NULL DEFAULT 0,
  rail text NOT NULL CHECK (rail IN ('easetag', 'bank', 'mobile', 'intl_bank', 'crypto')),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'quoting', 'locked', 'paid', 'failed', 'skipped')
  ),
  lock_id text,
  transfer_etid text,
  error_code text,
  error_message text,
  stub_storage_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_run ON payroll_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_status ON payroll_lines(run_id, status);

-- ---------------------------------------------------------------------------
-- business_approvals (payroll + future money gates)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'approved', 'rejected')),
  amount_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('transfer', 'payout', 'invoice', 'card', 'payroll_run')),
  subject_id uuid NOT NULL,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_approvals_queue ON business_approvals(business_id, status);

-- ---------------------------------------------------------------------------
-- Payroll V2 additive columns
-- ---------------------------------------------------------------------------
ALTER TABLE payroll_people
  ADD COLUMN IF NOT EXISTS connection_id uuid,
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS readiness_status text NOT NULL DEFAULT 'needs_method',
  ADD COLUMN IF NOT EXISTS identity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES payroll_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pay_period_start date,
  ADD COLUMN IF NOT EXISTS pay_period_end date,
  ADD COLUMN IF NOT EXISTS payday date,
  ADD COLUMN IF NOT EXISTS approval_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

ALTER TABLE payroll_lines
  ADD COLUMN IF NOT EXISTS payment_method_id uuid,
  ADD COLUMN IF NOT EXISTS payment_method_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS payroll_document_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_schedule_payday
  ON payroll_runs(schedule_id, payday)
  WHERE schedule_id IS NOT NULL AND payday IS NOT NULL;

-- The old status constraint may not contain V2 lifecycle states.
ALTER TABLE payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_status_check;
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_status_check CHECK (
  status IN (
    'draft', 'pending_approval', 'approved', 'scheduled', 'executing',
    'completed', 'partial', 'failed', 'needs_reapproval', 'cancelled'
  )
);

-- ---------------------------------------------------------------------------
-- Employee-owned payroll connections and invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES payroll_people(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'declined', 'expired', 'revoked')
  ),
  preferred_method_id uuid,
  shared_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, person_id)
);

CREATE TABLE IF NOT EXISTS payroll_connection_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES payroll_connections(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES payroll_people(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'declined', 'expired', 'invalidated')
  ),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES payroll_connections(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES payroll_people(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('employee', 'business')),
  type text NOT NULL CHECK (type IN ('easetag', 'bank', 'mobile_money', 'stablecoin')),
  label text NOT NULL,
  masked_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_details text,
  provider_recipient_id uuid REFERENCES recipients(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_connections_preferred_method_fk') THEN
    ALTER TABLE payroll_connections
      ADD CONSTRAINT payroll_connections_preferred_method_fk
      FOREIGN KEY (preferred_method_id) REFERENCES payroll_payment_methods(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_people_connection_fk') THEN
    ALTER TABLE payroll_people
      ADD CONSTRAINT payroll_people_connection_fk
      FOREIGN KEY (connection_id) REFERENCES payroll_connections(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_lines_payment_method_fk') THEN
    ALTER TABLE payroll_lines
      ADD CONSTRAINT payroll_lines_payment_method_fk
      FOREIGN KEY (payment_method_id) REFERENCES payroll_payment_methods(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_employee_external_method
  ON payroll_payment_methods(connection_id)
  WHERE owner_type = 'employee' AND type <> 'easetag' AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_business_method_person
  ON payroll_payment_methods(person_id)
  WHERE owner_type = 'business' AND connection_id IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_payroll_connections_user ON payroll_connections(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_invitations_hash ON payroll_connection_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_payroll_invitations_connection ON payroll_connection_invitations(connection_id, status);

-- Preserve legacy people while making V2 consent/readiness explicit.
UPDATE payroll_people
SET
  connection_status = CASE
    WHEN rail = 'easetag' AND easetag IS NOT NULL THEN 'pending'
    ELSE 'manual'
  END,
  readiness_status = CASE
    WHEN rail = 'easetag' AND easetag IS NOT NULL THEN 'pending_consent'
    WHEN rail <> 'easetag' AND recipient_id IS NOT NULL THEN 'ready'
    ELSE 'missing_payment_method'
  END
WHERE connection_id IS NULL;

-- Existing provider recipient IDs become Payroll-owned method references.
INSERT INTO payroll_payment_methods (
  person_id,
  business_id,
  owner_type,
  type,
  label,
  masked_details,
  provider_recipient_id
)
SELECT
  p.id,
  p.business_id,
  'business',
  CASE
    WHEN p.rail = 'mobile' THEN 'mobile_money'
    WHEN p.rail = 'crypto' THEN 'stablecoin'
    ELSE 'bank'
  END,
  COALESCE(NULLIF(r.bank_name, ''), 'Payroll payout method'),
  jsonb_strip_nulls(jsonb_build_object(
    'provider', NULLIF(r.mobile_provider, ''),
    'bank', NULLIF(r.bank_name, ''),
    'ending', CASE WHEN r.account_number IS NOT NULL THEN right(r.account_number, 4) END,
    'network', NULLIF(r.wallet_network, '')
  )),
  p.recipient_id
FROM payroll_people p
JOIN recipients r ON r.id = p.recipient_id
WHERE p.rail <> 'easetag'
  AND NOT EXISTS (
    SELECT 1 FROM payroll_payment_methods method
    WHERE method.person_id = p.id
      AND method.owner_type = 'business'
      AND method.connection_id IS NULL
      AND method.status = 'active'
  );

-- ---------------------------------------------------------------------------
-- Permissions, settings, audit, and durable payment documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_access_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('viewer', 'preparer', 'approver')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

CREATE TABLE IF NOT EXISTS payroll_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  require_separate_approver boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Existing owners and administrators retain approval access during rollout.
INSERT INTO payroll_access_assignments (business_id, user_id, role)
SELECT easner_business_id, id, 'approver'
FROM users
WHERE easner_business_id IS NOT NULL
ON CONFLICT (business_id, user_id) DO UPDATE SET
  role = 'approver',
  updated_at = now();

INSERT INTO payroll_access_assignments (business_id, user_id, role)
SELECT business_id, user_id, 'approver'
FROM business_memberships
WHERE user_id IS NOT NULL
  AND lower(role) IN ('owner', 'admin')
  AND lower(status) = 'active'
ON CONFLICT (business_id, user_id) DO UPDATE SET
  role = 'approver',
  updated_at = now();

CREATE TABLE IF NOT EXISTS payroll_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  run_id uuid REFERENCES payroll_runs(id) ON DELETE CASCADE,
  person_id uuid REFERENCES payroll_people(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
  person_id uuid REFERENCES payroll_people(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('pay_stub', 'payment_reversal')),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('generating', 'ready', 'failed')),
  filename text NOT NULL,
  storage_path text NOT NULL,
  content_hash text NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (line_id, type)
);

CREATE TABLE IF NOT EXISTS payroll_document_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES payroll_documents(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email')),
  destination_masked text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_rate_limits (
  rate_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION consume_payroll_rate_limit(
  p_rate_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count integer;
BEGIN
  INSERT INTO payroll_rate_limits (rate_key, window_started_at, request_count, updated_at)
  VALUES (p_rate_key, now(), 1, now())
  ON CONFLICT (rate_key) DO UPDATE SET
    window_started_at = CASE
      WHEN payroll_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
      THEN now() ELSE payroll_rate_limits.window_started_at END,
    request_count = CASE
      WHEN payroll_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
      THEN 1 ELSE payroll_rate_limits.request_count + 1 END,
    updated_at = now()
  RETURNING request_count INTO current_count;
  RETURN current_count <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION consume_payroll_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_payroll_rate_limit(text, integer, integer) TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_lines_document_fk') THEN
    ALTER TABLE payroll_lines
      ADD CONSTRAINT payroll_lines_document_fk
      FOREIGN KEY (payroll_document_id) REFERENCES payroll_documents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_run_events_run ON payroll_run_events(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payroll_documents_run ON payroll_documents(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payroll_documents_user ON payroll_documents(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payroll_deliveries_status ON payroll_document_deliveries(status, created_at);

INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-documents', 'payroll-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- RLS: enable and scope by business membership (adjust policies to match your org model)
ALTER TABLE payroll_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_connection_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_access_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_document_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_rate_limits ENABLE ROW LEVEL SECURITY;
