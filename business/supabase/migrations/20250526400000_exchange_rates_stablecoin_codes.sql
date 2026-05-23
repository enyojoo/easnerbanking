-- Allow USDC/USDT (and other 4–8 char codes) on exchange_rates.
-- Drops legacy fiat-only CHECK constraints if present (e.g. ^[A-Z]{3}$).

ALTER TABLE public.exchange_rates
  DROP CONSTRAINT IF EXISTS exchange_rates_from_currency_check;

ALTER TABLE public.exchange_rates
  DROP CONSTRAINT IF EXISTS exchange_rates_to_currency_check;

ALTER TABLE public.exchange_rates
  ADD CONSTRAINT exchange_rates_from_currency_check
  CHECK (from_currency ~ '^[A-Z0-9]{3,8}$');

ALTER TABLE public.exchange_rates
  ADD CONSTRAINT exchange_rates_to_currency_check
  CHECK (to_currency ~ '^[A-Z0-9]{3,8}$');
