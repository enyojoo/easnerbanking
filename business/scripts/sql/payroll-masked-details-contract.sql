-- Contract step for normalized Payroll payment methods.
--
-- Run only after:
-- 1. 20260726220000_payroll_normalized_method_rpcs.sql has been applied.
-- 2. The application version using normalized-only RPC overloads is deployed
--    everywhere.
-- 3. Payroll payment-method verification reports no incomplete active methods.

BEGIN;

DO $$
DECLARE
  v_incomplete_count bigint;
BEGIN
  SELECT count(*)
  INTO v_incomplete_count
  FROM payroll_payment_methods
  WHERE status = 'active'
    AND type <> 'easetag'
    AND (
      NULLIF(trim(full_name), '') IS NULL
      OR NULLIF(trim(currency), '') IS NULL
      OR NULLIF(trim(account_number), '') IS NULL
      OR (
        type = 'bank'
        AND (
          NULLIF(trim(country_code), '') IS NULL
          OR NULLIF(trim(bank_name), '') IS NULL
        )
      )
      OR (
        type = 'mobile_money'
        AND (
          NULLIF(trim(country_code), '') IS NULL
          OR NULLIF(trim(phone_number), '') IS NULL
          OR NULLIF(trim(mobile_provider), '') IS NULL
        )
      )
      OR (
        type = 'stablecoin'
        AND NULLIF(trim(wallet_network), '') IS NULL
      )
    );

  IF v_incomplete_count > 0 THEN
    RAISE EXCEPTION
      'Payroll masked-details contract blocked: % incomplete active methods remain',
      v_incomplete_count;
  END IF;
END
$$;

DROP FUNCTION IF EXISTS replace_payroll_employee_external_method(
  uuid, text, text, jsonb, jsonb, boolean
);

DROP FUNCTION IF EXISTS replace_payroll_business_payment_method(
  uuid, uuid, text, text, jsonb, jsonb
);

ALTER TABLE payroll_payment_methods
  DROP COLUMN IF EXISTS masked_details;

COMMIT;
