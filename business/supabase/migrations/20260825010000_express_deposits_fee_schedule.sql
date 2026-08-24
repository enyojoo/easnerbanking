-- Express deposits processing fee schedule (singleton scope).
-- pay_in_bps defaults to 0 at launch; Stripe on-ramp fees pass through in UI.

ALTER TABLE processing_fee_schedule
  DROP CONSTRAINT IF EXISTS processing_fee_schedule_scope_check;

ALTER TABLE processing_fee_schedule
  ADD CONSTRAINT processing_fee_schedule_scope_check
  CHECK (scope IN ('fiat_bank', 'fiat_mobile_money', 'crypto', 'express_deposits'));

INSERT INTO processing_fee_schedule (
  scope,
  country_code,
  currency_code,
  asset_code,
  pay_in_bps,
  pay_out_bps,
  cross_border_bps
)
SELECT
  'express_deposits',
  NULL,
  NULL,
  NULL,
  0,
  0,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM processing_fee_schedule WHERE scope = 'express_deposits'
);
