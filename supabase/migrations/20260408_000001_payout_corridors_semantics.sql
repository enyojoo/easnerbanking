-- Clarify corridor semantics: `providers` is an office/MM UI allow-list, not Noah-specific.
-- `settlement_backend` is optional ops routing; runtime prepare/quote validates actual rail support.
-- Clears legacy seed marker where rows used settlement_backend = 'noah' only as a default.

UPDATE public.payout_corridors
SET settlement_backend = NULL
WHERE settlement_backend = 'noah';

COMMENT ON COLUMN public.payout_corridors.providers IS
  'Office-curated mobile-money network labels for this corridor (recipient UI allow-list). Friendly product names; map to payment-rail API codes in the integration layer. Not the source of truth for provider capability—that is enforced at quote/prepare time.';

COMMENT ON COLUMN public.payout_corridors.settlement_backend IS
  'Optional ops hint for primary settlement stack (e.g. noah, other). NULL when unspecified. Does not imply the listed mobile providers are Noah enums; actual payout support is validated by integrations after office enables the corridor.';

COMMENT ON TABLE public.payout_corridors IS
  'Office-managed destination catalog per rail and country: country-first, currency fixed on the row. enabled gate controls what business/mobile apps show. providers = MM offer list; settlement_backend = optional routing metadata.';
