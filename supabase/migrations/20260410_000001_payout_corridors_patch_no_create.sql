-- Patch only: no CREATE TABLE. Use when you see ERROR 42P07 (relation "payout_corridors" already exists)
-- from re-running 20260407, or when the table was created manually. Safe to run multiple times.
--
-- Applies the same idempotent steps as 20260408 + 20260409. If your project already ran those
-- migrations via `supabase db push`, this file is a no-op except COMMENT re-application.

-- Semantics: providers vs settlement_backend; clear legacy 'noah' seed marker.
UPDATE public.payout_corridors
SET settlement_backend = NULL
WHERE settlement_backend = 'noah';

COMMENT ON COLUMN public.payout_corridors.providers IS
  'Office-curated mobile-money network labels for this corridor (recipient UI allow-list). Friendly product names; map to payment-rail API codes in the integration layer. Not the source of truth for provider capability—that is enforced at quote/prepare time.';

COMMENT ON COLUMN public.payout_corridors.settlement_backend IS
  'Optional ops hint for primary settlement stack (e.g. noah, other). NULL when unspecified. Does not imply the listed mobile providers are Noah enums; actual payout support is validated by integrations after office enables the corridor.';

COMMENT ON TABLE public.payout_corridors IS
  'Office-managed destination catalog per rail and country: country-first, currency fixed on the row. enabled gate controls what business/mobile apps show. providers = MM offer list; settlement_backend = optional routing metadata.';

-- Bank_transfer rows for countries that also appear on mobile_money (missing from original Noah-only bank seed).
INSERT INTO public.payout_corridors (rail, country_code, country_name, currency_code, currency_name, enabled, sort_order, providers, settlement_backend, metadata)
VALUES
  ('bank_transfer', 'BW', 'Botswana', 'BWP', 'Botswana Pula', true, 601, NULL, NULL, NULL),
  ('bank_transfer', 'CM', 'Cameroon', 'XAF', 'Central African CFA Franc', true, 602, NULL, NULL, NULL),
  ('bank_transfer', 'KE', 'Kenya', 'KES', 'Kenyan Shilling', true, 603, NULL, NULL, NULL),
  ('bank_transfer', 'SN', 'Senegal', 'XOF', 'West African CFA Franc', true, 604, NULL, NULL, NULL),
  ('bank_transfer', 'TZ', 'Tanzania', 'TZS', 'Tanzanian Shilling', true, 605, NULL, NULL, NULL),
  ('bank_transfer', 'TG', 'Togo', 'XOF', 'West African CFA Franc', true, 606, NULL, NULL, NULL),
  ('bank_transfer', 'ZM', 'Zambia', 'ZMW', 'Zambian Kwacha', true, 607, NULL, NULL, NULL),
  ('bank_transfer', 'BF', 'Burkina Faso', 'XOF', 'West African CFA Franc', true, 608, NULL, NULL, NULL),
  ('bank_transfer', 'ML', 'Mali', 'XOF', 'West African CFA Franc', true, 609, NULL, NULL, NULL)
ON CONFLICT (rail, country_code) DO NOTHING;
