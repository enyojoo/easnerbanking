CREATE OR REPLACE FUNCTION replace_payroll_employee_external_method(
  p_connection_id uuid,
  p_type text,
  p_label text,
  p_masked_details jsonb,
  p_encrypted_details text,
  p_provider_recipient_id uuid,
  p_preferred boolean DEFAULT true
) RETURNS TABLE (
  id uuid,
  type text,
  label text,
  masked_details jsonb,
  owner_type text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_person_id uuid;
  v_method payroll_payment_methods%ROWTYPE;
BEGIN
  IF p_type NOT IN ('bank', 'mobile_money', 'stablecoin') THEN
    RAISE EXCEPTION 'Invalid external payroll receiving method';
  END IF;

  SELECT connection.business_id, connection.person_id
    INTO v_business_id, v_person_id
    FROM payroll_connections AS connection
   WHERE connection.id = p_connection_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll connection not found';
  END IF;

  UPDATE payroll_payment_methods AS method
     SET status = 'deleted', updated_at = now()
   WHERE method.connection_id = p_connection_id
     AND method.owner_type = 'employee'
     AND method.type <> 'easetag'
     AND method.status = 'active';

  INSERT INTO payroll_payment_methods (
    connection_id,
    person_id,
    business_id,
    owner_type,
    type,
    label,
    masked_details,
    encrypted_details,
    provider_recipient_id,
    status
  ) VALUES (
    p_connection_id,
    v_person_id,
    v_business_id,
    'employee',
    p_type,
    p_label,
    COALESCE(p_masked_details, '{}'::jsonb),
    p_encrypted_details,
    p_provider_recipient_id,
    'active'
  ) RETURNING * INTO v_method;

  IF p_preferred THEN
    UPDATE payroll_connections
       SET preferred_method_id = v_method.id, updated_at = now()
     WHERE payroll_connections.id = p_connection_id;
  END IF;

  RETURN QUERY SELECT
    v_method.id,
    v_method.type,
    v_method.label,
    v_method.masked_details,
    v_method.owner_type,
    v_method.status;
END;
$$;

REVOKE ALL ON FUNCTION replace_payroll_employee_external_method(
  uuid, text, text, jsonb, text, uuid, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_payroll_employee_external_method(
  uuid, text, text, jsonb, text, uuid, boolean
) TO service_role;
