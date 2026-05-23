-- Support stablecoin codes (USDC, USDT) on manual Rates / payment_methods.
-- Safe no-op when columns are already varchar/text.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'currencies' AND column_name = 'code'
      AND character_maximum_length IS NOT NULL AND character_maximum_length < 8
  ) THEN
    ALTER TABLE public.currencies ALTER COLUMN code TYPE varchar(8);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exchange_rates' AND column_name = 'from_currency'
      AND character_maximum_length IS NOT NULL AND character_maximum_length < 8
  ) THEN
    ALTER TABLE public.exchange_rates ALTER COLUMN from_currency TYPE varchar(8);
    ALTER TABLE public.exchange_rates ALTER COLUMN to_currency TYPE varchar(8);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_methods' AND column_name = 'currency'
      AND character_maximum_length IS NOT NULL AND character_maximum_length < 8
  ) THEN
    ALTER TABLE public.payment_methods ALTER COLUMN currency TYPE varchar(8);
  END IF;
END $$;
