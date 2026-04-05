-- Canada · CAD bank payout (signup/settings already list CA; send flows use payout_corridors).

INSERT INTO public.payout_corridors (
  rail,
  country_code,
  country_name,
  currency_code,
  currency_name,
  enabled,
  sort_order,
  providers,
  settlement_backend,
  metadata
)
VALUES (
  'bank_transfer',
  'CA',
  'Canada',
  'CAD',
  'Canadian Dollar',
  true,
  25,
  null,
  null,
  null
)
ON CONFLICT (rail, country_code) DO UPDATE SET
  country_name = EXCLUDED.country_name,
  currency_code = EXCLUDED.currency_code,
  currency_name = EXCLUDED.currency_name,
  enabled = EXCLUDED.enabled,
  sort_order = COALESCE(public.payout_corridors.sort_order, EXCLUDED.sort_order),
  updated_at = now();
