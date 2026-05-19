-- Simplify virtual_accounts: drop unused/duplicate columns, consolidate BIC.
-- One row per Noah PaymentMethodID (ACH, Wire, SWIFT, SEPA each get their own row).
-- USD ACH/Wire: account_number + routing_number
-- USD SWIFT: account_number + bic (stored; receive UI shows routing from ACH/Wire row only)
-- EUR SEPA: iban + bic
-- GBP: account_number + sort_code

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'virtual_accounts'
      AND column_name = 'swift_bic'
  ) THEN
    UPDATE public.virtual_accounts
    SET bic = swift_bic
    WHERE bic IS NULL AND swift_bic IS NOT NULL;
  END IF;
END $$;

ALTER TABLE public.virtual_accounts
  DROP COLUMN IF EXISTS account_name,
  DROP COLUMN IF EXISTS noah_payment_method_id,
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS swift_bic,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS payment_rail;

DROP INDEX IF EXISTS public.idx_noah_virtual_accounts_pm_unique;

COMMENT ON COLUMN public.virtual_accounts.bic IS 'SEPA BIC (EUR) or SWIFT BIC for USD SWIFT rows (not shown on USD receive UI).';
COMMENT ON COLUMN public.virtual_accounts.routing_number IS 'US ABA routing for ACH/Wire rows only (never SWIFT BIC).';
