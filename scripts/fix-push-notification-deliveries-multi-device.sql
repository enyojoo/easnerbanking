-- Fix multi-device transaction push idempotency.
--
-- Symptom: only one iOS/Android device receives each transaction push; which device
-- "wins" can alternate when token query order changes.
--
-- Cause: a UNIQUE constraint on (user_id, transaction_id, event_type) without
-- expo_push_token blocks a second delivery row per transaction.
--
-- Run in Supabase SQL editor (production). Review constraint names first:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.push_notification_deliveries'::regclass;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'push_notification_deliveries'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%expo_push_token%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.push_notification_deliveries DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS push_notification_deliveries_user_tx_event_token_key
  ON public.push_notification_deliveries (user_id, transaction_id, event_type, expo_push_token);
