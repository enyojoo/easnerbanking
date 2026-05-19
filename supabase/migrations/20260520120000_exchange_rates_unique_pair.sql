-- Enforce one row per directed currency pair (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exchange_rates_from_currency_to_currency_key'
  ) THEN
    ALTER TABLE public.exchange_rates
      ADD CONSTRAINT exchange_rates_from_currency_to_currency_key
      UNIQUE (from_currency, to_currency);
  END IF;
END $$;
