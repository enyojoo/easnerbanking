-- Ensure every mobile_money corridor country also has a bank_transfer row (same ISO country + currency).
-- Safe for DBs that already ran 20260407 before those bank rows existed.

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
