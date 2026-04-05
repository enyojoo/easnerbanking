-- Office-managed allowlists for business signup country + legal-entity country (KYB).
-- Semantics: see business/lib/jurisdiction-country-policy.ts. Missing or invalid JSON => unrestricted.

INSERT INTO public.system_settings (key, value, data_type, category, is_active)
VALUES (
  'jurisdiction_country_policy',
  '{"v":1}',
  'json',
  'platform',
  true
)
ON CONFLICT (key) DO NOTHING;
