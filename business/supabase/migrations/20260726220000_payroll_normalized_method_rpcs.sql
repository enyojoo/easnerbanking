-- Expand step for removing payroll_payment_methods.masked_details.
--
-- Add normalized-only RPC overloads while retaining the legacy overloads and
-- column during application rollout. The contract migration removes them once
-- all application instances use the normalized destination fields.

CREATE OR REPLACE FUNCTION replace_payroll_employee_external_method(
  p_connection_id uuid,
  p_type text,
  p_label text,
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
    full_name, country_code, currency, account_number, bank_name,
    phone_number, email, mobile_provider, wallet_network, routing_number,
    sort_code, iban, swift_bic, transfer_type, checking_or_savings,
    address_line1, city, state, postal_code, metadata, status
  ) VALUES (
    p_connection_id, v_connection.person_id, v_connection.business_id,
    'employee', p_type, p_label, p_destination->>'full_name',
    p_destination->>'country_code', p_destination->>'currency',
    p_destination->>'account_number', p_destination->>'bank_name',
    p_destination->>'phone_number', p_destination->>'email',
    p_destination->>'mobile_provider', p_destination->>'wallet_network',
    p_destination->>'routing_number', p_destination->>'sort_code',
    p_destination->>'iban', p_destination->>'swift_bic',
    p_destination->>'transfer_type', p_destination->>'checking_or_savings',
    p_destination->>'address_line1', p_destination->>'city',
    p_destination->>'state', p_destination->>'postal_code',
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
  uuid, text, text, jsonb, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_payroll_employee_external_method(
  uuid, text, text, jsonb, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION replace_payroll_business_payment_method(
  p_person_id uuid,
  p_business_id uuid,
  p_type text,
  p_label text,
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
    person_id, business_id, owner_type, type, label, full_name,
    country_code, currency, account_number, bank_name, phone_number,
    email, mobile_provider, wallet_network, routing_number, sort_code,
    iban, swift_bic, transfer_type, checking_or_savings, address_line1,
    city, state, postal_code, metadata, status
  ) VALUES (
    p_person_id, p_business_id, 'business', p_type, p_label,
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
        'details', '{}'::jsonb,
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
      'details', p_destination,
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
  uuid, uuid, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_payroll_business_payment_method(
  uuid, uuid, text, text, jsonb
) TO service_role;
