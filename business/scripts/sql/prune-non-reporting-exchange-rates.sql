-- Optional cleanup: remove legacy exchange_rates rows outside reporting FX base currencies.
-- Reporting FX supports business dashboard totals when org base currency is USD, EUR, GBP, or NGN.
--
-- WARNING: Ledger `base_amount` for transactions in corridor currencies (e.g. KES) may still
-- reference legacy rows. Run only after confirming no production dependency on those pairs.
--
-- Safe to run in dev/staging first; review counts before DELETE in production.

-- Preview rows that would be removed:
-- SELECT from_currency, to_currency, rate, source
-- FROM public.exchange_rates
-- WHERE from_currency NOT IN ('USD', 'EUR', 'GBP', 'NGN')
--    OR to_currency NOT IN ('USD', 'EUR', 'GBP', 'NGN');

DELETE FROM public.exchange_rates
WHERE from_currency NOT IN ('USD', 'EUR', 'GBP', 'NGN')
   OR to_currency NOT IN ('USD', 'EUR', 'GBP', 'NGN');

-- Ensure the 12 directed reporting crosses exist (bootstrap placeholders; run Office Sync after):
INSERT INTO public.exchange_rates (
  from_currency,
  to_currency,
  rate,
  fee_type,
  fee_amount,
  status,
  source,
  as_of,
  updated_at
)
SELECT f.code, t.code, 1, 'free', 0, 'active', 'reporting_fx_bootstrap', NOW(), NOW()
FROM (
  VALUES ('USD'), ('EUR'), ('GBP'), ('NGN')
) AS f(code)
CROSS JOIN (
  VALUES ('USD'), ('EUR'), ('GBP'), ('NGN')
) AS t(code)
WHERE f.code <> t.code
ON CONFLICT (from_currency, to_currency) DO NOTHING;
