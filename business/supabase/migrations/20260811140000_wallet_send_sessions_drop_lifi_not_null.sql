-- App writes relay_* for wallet sends (Turnkey direct + Relay bridge).
-- Leftover NOT NULL on lifi_mid blocked inserts — including direct_turnkey
-- USDC/EURC on Solana, which never used LI.FI.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wallet_send_sessions'
      AND column_name = 'lifi_mid'
  ) THEN
    EXECUTE $sql$
      UPDATE public.wallet_send_sessions
      SET
        relay_mid = COALESCE(relay_mid, lifi_mid, 1),
        relay_floor = COALESCE(relay_floor, lifi_floor, 0),
        relay_quote_id = COALESCE(relay_quote_id, lifi_quote_id),
        relay_from_amount_raw = COALESCE(relay_from_amount_raw, lifi_from_amount_raw)
      WHERE relay_mid IS NULL
         OR relay_floor IS NULL
         OR (relay_quote_id IS NULL AND lifi_quote_id IS NOT NULL)
         OR (relay_from_amount_raw IS NULL AND lifi_from_amount_raw IS NOT NULL)
    $sql$;
  END IF;
END $$;

UPDATE public.wallet_send_sessions
SET relay_mid = COALESCE(relay_mid, 1)
WHERE relay_mid IS NULL;

UPDATE public.wallet_send_sessions
SET relay_floor = COALESCE(relay_floor, 0)
WHERE relay_floor IS NULL;

ALTER TABLE public.wallet_send_sessions
  ALTER COLUMN relay_mid SET DEFAULT 1,
  ALTER COLUMN relay_floor SET DEFAULT 0;

ALTER TABLE public.wallet_send_sessions
  ALTER COLUMN relay_mid SET NOT NULL,
  ALTER COLUMN relay_floor SET NOT NULL;

-- Drop leftover LI.FI columns (NOT NULL constraint is removed with the column).
ALTER TABLE public.wallet_send_sessions DROP COLUMN IF EXISTS lifi_mid;
ALTER TABLE public.wallet_send_sessions DROP COLUMN IF EXISTS lifi_floor;
ALTER TABLE public.wallet_send_sessions DROP COLUMN IF EXISTS lifi_quote_id;
ALTER TABLE public.wallet_send_sessions DROP COLUMN IF EXISTS lifi_from_amount_raw;
