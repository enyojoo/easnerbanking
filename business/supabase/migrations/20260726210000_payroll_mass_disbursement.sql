ALTER TABLE payroll_payment_methods
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS mobile_provider text,
  ADD COLUMN IF NOT EXISTS wallet_network text,
  ADD COLUMN IF NOT EXISTS routing_number text,
  ADD COLUMN IF NOT EXISTS sort_code text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS swift_bic text,
  ADD COLUMN IF NOT EXISTS transfer_type text,
  ADD COLUMN IF NOT EXISTS checking_or_savings text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE payroll_payment_methods AS method
SET
  full_name = COALESCE(method.full_name, recipient.full_name),
  country_code = COALESCE(method.country_code, recipient.country_code),
  currency = COALESCE(method.currency, recipient.currency),
  account_number = COALESCE(method.account_number, recipient.account_number),
  bank_name = COALESCE(method.bank_name, recipient.bank_name),
  phone_number = COALESCE(method.phone_number, recipient.phone_number),
  email = COALESCE(method.email, recipient.email),
  mobile_provider = COALESCE(method.mobile_provider, recipient.mobile_provider),
  wallet_network = COALESCE(method.wallet_network, recipient.wallet_network),
  routing_number = COALESCE(method.routing_number, recipient.routing_number),
  sort_code = COALESCE(method.sort_code, recipient.sort_code),
  iban = COALESCE(method.iban, recipient.iban),
  swift_bic = COALESCE(method.swift_bic, recipient.swift_bic),
  transfer_type = COALESCE(method.transfer_type, recipient.transfer_type),
  checking_or_savings = COALESCE(method.checking_or_savings, recipient.checking_or_savings),
  address_line1 = COALESCE(method.address_line1, recipient.address_line1),
  city = COALESCE(method.city, recipient.city),
  state = COALESCE(method.state, recipient.state),
  postal_code = COALESCE(method.postal_code, recipient.postal_code),
  metadata = COALESCE(method.metadata, '{}'::jsonb) || COALESCE(recipient.metadata, '{}'::jsonb)
FROM recipients AS recipient
WHERE method.provider_recipient_id = recipient.id;

ALTER TABLE payout_lock_sessions ADD COLUMN IF NOT EXISTS destination_ref text;
ALTER TABLE payout_lock_sessions DROP CONSTRAINT IF EXISTS payout_lock_sessions_recipient_id_fkey;
ALTER TABLE payout_lock_sessions ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE wallet_send_sessions ADD COLUMN IF NOT EXISTS destination_ref text;
ALTER TABLE wallet_send_sessions DROP CONSTRAINT IF EXISTS wallet_send_sessions_recipient_id_fkey;
ALTER TABLE wallet_send_sessions ALTER COLUMN recipient_id DROP NOT NULL;
UPDATE payout_lock_sessions
SET destination_ref = 'recipient:' || recipient_id::text
WHERE destination_ref IS NULL AND recipient_id IS NOT NULL;
UPDATE wallet_send_sessions
SET destination_ref = 'recipient:' || recipient_id::text
WHERE destination_ref IS NULL AND recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_lock_sessions_destination_ref
  ON payout_lock_sessions(destination_ref);
CREATE INDEX IF NOT EXISTS idx_wallet_send_sessions_destination_ref
  ON wallet_send_sessions(destination_ref);

CREATE TABLE IF NOT EXISTS payroll_execution_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'retry', 'completed', 'dead_letter')),
  phase text NOT NULL DEFAULT 'quoting'
    CHECK (phase IN ('quoting', 'funding', 'executing', 'reconciling')),
  attempts integer NOT NULL DEFAULT 0,
  failure_attempts integer NOT NULL DEFAULT 0,
  processed_lines integer NOT NULL DEFAULT 0,
  total_lines integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_execution_jobs_active_run
  ON payroll_execution_jobs(run_id)
  WHERE status IN ('queued', 'processing', 'retry');
CREATE INDEX IF NOT EXISTS idx_payroll_execution_jobs_ready
  ON payroll_execution_jobs(status, next_attempt_at);
ALTER TABLE payroll_execution_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE payroll_execution_jobs FROM anon, authenticated;
GRANT ALL ON TABLE payroll_execution_jobs TO service_role;

ALTER TABLE payroll_lines DROP CONSTRAINT IF EXISTS payroll_lines_status_check;
ALTER TABLE payroll_lines ADD CONSTRAINT payroll_lines_status_check CHECK (
  status IN ('pending', 'quoting', 'locked', 'processing', 'paid', 'failed', 'skipped')
);

CREATE OR REPLACE FUNCTION claim_payroll_execution_jobs(
  p_limit integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF payroll_execution_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT candidate.id
    FROM payroll_execution_jobs AS candidate
    WHERE
      (candidate.status IN ('queued', 'retry') AND candidate.next_attempt_at <= now())
      OR (candidate.status = 'processing' AND candidate.lease_expires_at <= now())
    ORDER BY candidate.next_attempt_at, candidate.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(p_limit, 25))
  )
  UPDATE payroll_execution_jobs AS job
  SET
    status = 'processing',
    attempts = job.attempts + 1,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_payroll_execution_jobs(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_payroll_execution_jobs(integer, integer) TO service_role;

DROP FUNCTION IF EXISTS replace_payroll_employee_external_method(
  uuid, text, text, jsonb, text, uuid, boolean
);
DROP FUNCTION IF EXISTS replace_payroll_employee_external_method(
  uuid, text, text, jsonb, text, boolean
);

CREATE OR REPLACE FUNCTION replace_payroll_employee_external_method(
  p_connection_id uuid,
  p_type text,
  p_label text,
  p_masked_details jsonb,
  p_destination jsonb,
  p_preferred boolean DEFAULT true
) RETURNS SETOF payroll_payment_methods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection payroll_connections%ROWTYPE;
  v_method payroll_payment_methods%ROWTYPE;
BEGIN
  IF p_type NOT IN ('bank', 'mobile_money', 'stablecoin') THEN
    RAISE EXCEPTION 'Invalid external payroll receiving method';
  END IF;
  SELECT * INTO v_connection
  FROM payroll_connections
  WHERE id = p_connection_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll connection not found'; END IF;

  UPDATE payroll_payment_methods
  SET status = 'deleted', updated_at = now()
  WHERE connection_id = p_connection_id
    AND owner_type = 'employee'
    AND type <> 'easetag'
    AND status = 'active';

  INSERT INTO payroll_payment_methods (
    connection_id, person_id, business_id, owner_type, type, label,
    masked_details, full_name, country_code, currency, account_number,
    bank_name, phone_number, email, mobile_provider, wallet_network,
    routing_number, sort_code, iban, swift_bic, transfer_type,
    checking_or_savings, address_line1, city, state, postal_code, metadata,
    status
  ) VALUES (
    p_connection_id, v_connection.person_id, v_connection.business_id,
    'employee', p_type, p_label, COALESCE(p_masked_details, '{}'::jsonb),
    p_destination->>'full_name', p_destination->>'country_code',
    p_destination->>'currency', p_destination->>'account_number',
    p_destination->>'bank_name', p_destination->>'phone_number',
    p_destination->>'email', p_destination->>'mobile_provider',
    p_destination->>'wallet_network', p_destination->>'routing_number',
    p_destination->>'sort_code', p_destination->>'iban',
    p_destination->>'swift_bic', p_destination->>'transfer_type',
    p_destination->>'checking_or_savings', p_destination->>'address_line1',
    p_destination->>'city', p_destination->>'state',
    p_destination->>'postal_code',
    COALESCE(p_destination->'metadata', '{}'::jsonb), 'active'
  ) RETURNING * INTO v_method;

  IF p_preferred THEN
    UPDATE payroll_connections
    SET preferred_method_id = v_method.id, updated_at = now()
    WHERE id = p_connection_id;
  END IF;
  RETURN NEXT v_method;
END;
$$;

REVOKE ALL ON FUNCTION replace_payroll_employee_external_method(
  uuid, text, text, jsonb, jsonb, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_payroll_employee_external_method(
  uuid, text, text, jsonb, jsonb, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION replace_payroll_business_payment_method(
  p_person_id uuid,
  p_business_id uuid,
  p_type text,
  p_label text,
  p_masked_details jsonb,
  p_destination jsonb
) RETURNS SETOF payroll_payment_methods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person payroll_people%ROWTYPE;
  v_method payroll_payment_methods%ROWTYPE;
BEGIN
  IF p_type NOT IN ('bank', 'mobile_money', 'stablecoin') THEN
    RAISE EXCEPTION 'Invalid Payroll receiving method';
  END IF;

  SELECT * INTO v_person
  FROM payroll_people
  WHERE id = p_person_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll person not found'; END IF;
  IF v_person.connection_status <> 'manual' THEN
    RAISE EXCEPTION 'Connected receiving methods are employee managed';
  END IF;

  UPDATE payroll_payment_methods
  SET status = 'deleted', updated_at = now()
  WHERE person_id = p_person_id
    AND business_id = p_business_id
    AND owner_type = 'business'
    AND status = 'active';

  INSERT INTO payroll_payment_methods (
    person_id, business_id, owner_type, type, label, masked_details,
    full_name, country_code, currency, account_number, bank_name,
    phone_number, email, mobile_provider, wallet_network, routing_number,
    sort_code, iban, swift_bic, transfer_type, checking_or_savings,
    address_line1, city, state, postal_code, metadata, status
  ) VALUES (
    p_person_id, p_business_id, 'business', p_type, p_label,
    COALESCE(p_masked_details, '{}'::jsonb),
    p_destination->>'full_name', p_destination->>'country_code',
    p_destination->>'currency', p_destination->>'account_number',
    p_destination->>'bank_name', p_destination->>'phone_number',
    p_destination->>'email', p_destination->>'mobile_provider',
    p_destination->>'wallet_network', p_destination->>'routing_number',
    p_destination->>'sort_code', p_destination->>'iban',
    p_destination->>'swift_bic', p_destination->>'transfer_type',
    p_destination->>'checking_or_savings', p_destination->>'address_line1',
    p_destination->>'city', p_destination->>'state',
    p_destination->>'postal_code',
    COALESCE(p_destination->'metadata', '{}'::jsonb), 'active'
  ) RETURNING * INTO v_method;

  UPDATE payroll_people
  SET
    rail = CASE p_type
      WHEN 'mobile_money' THEN 'mobile'
      WHEN 'stablecoin' THEN 'crypto'
      ELSE 'bank'
    END,
    recipient_id = NULL,
    readiness_status = 'ready',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'preferredPaymentMethod',
      jsonb_build_object(
        'id', v_method.id,
        'type', v_method.type,
        'label', v_method.label,
        'maskedDetails', v_method.masked_details,
        'ownerType', 'business',
        'status', 'active',
        'preferred', true
      )
    ),
    updated_at = now()
  WHERE id = p_person_id AND business_id = p_business_id;

  UPDATE payroll_lines AS line
  SET
    rail = CASE p_type
      WHEN 'mobile_money' THEN 'mobile'
      WHEN 'stablecoin' THEN 'crypto'
      ELSE 'bank'
    END,
    payment_method_id = v_method.id,
    payment_method_snapshot = jsonb_build_object(
      'id', v_method.id,
      'type', v_method.type,
      'label', v_method.label,
      'maskedDetails', v_method.masked_details,
      'payrollOwned', true
    ),
    updated_at = now()
  FROM payroll_runs AS run
  WHERE line.run_id = run.id
    AND line.person_id = p_person_id
    AND run.business_id = p_business_id
    AND run.status = 'draft';

  RETURN NEXT v_method;
END;
$$;

REVOKE ALL ON FUNCTION replace_payroll_business_payment_method(
  uuid, uuid, text, text, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_payroll_business_payment_method(
  uuid, uuid, text, text, jsonb, jsonb
) TO service_role;
