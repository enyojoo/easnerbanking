-- Apply only after scripts/backfill-payroll-payment-methods.ts --execute reports
-- safeToRemoveLegacyColumns=true.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
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
      )
  ) THEN
    RAISE EXCEPTION 'Payroll payment-method contract blocked: incomplete active methods remain';
  END IF;
END;
$$;

ALTER TABLE payroll_payment_methods
  DROP COLUMN IF EXISTS encrypted_details,
  DROP COLUMN IF EXISTS provider_recipient_id;
