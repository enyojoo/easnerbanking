-- Payroll Settings are the single source of truth for timezone, source
-- account, currency, and payday time. Schedules retain only recurrence data.

UPDATE payroll_schedules
SET
  template = COALESCE(template, '{}'::jsonb)
    - 'timezone'
    - 'sourceCurrency'
    - 'sourceAccountId',
  updated_at = now()
WHERE
  COALESCE(template, '{}'::jsonb) ? 'timezone'
  OR COALESCE(template, '{}'::jsonb) ? 'sourceCurrency'
  OR COALESCE(template, '{}'::jsonb) ? 'sourceAccountId';

-- Older settings accepted arbitrary minutes. Payroll now offers and enforces
-- the 48 supported half-hour execution slots.
UPDATE payroll_settings
SET default_payday_time = '09:00', updated_at = now()
WHERE default_payday_time !~ '^([01][0-9]|2[0-3]):(00|30)$';

ALTER TABLE payroll_settings
  DROP CONSTRAINT IF EXISTS payroll_settings_default_payday_time_check;
ALTER TABLE payroll_settings
  ADD CONSTRAINT payroll_settings_default_payday_time_check
  CHECK (default_payday_time ~ '^([01][0-9]|2[0-3]):(00|30)$');
