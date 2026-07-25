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

-- RLS: enable and scope by business membership (adjust policies to match your org model)
ALTER TABLE payroll_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_approvals ENABLE ROW LEVEL SECURITY;
