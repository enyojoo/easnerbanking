-- Backfill Relay fields from legacy LI.FI columns/values before dropping dual-read in app code.

UPDATE public.wallet_send_sessions
SET
  relay_mid = COALESCE(relay_mid, lifi_mid),
  relay_floor = COALESCE(relay_floor, lifi_floor),
  relay_quote_id = COALESCE(relay_quote_id, lifi_quote_id),
  relay_from_amount_raw = COALESCE(relay_from_amount_raw, lifi_from_amount_raw)
WHERE
  relay_mid IS NULL
  OR relay_floor IS NULL
  OR (relay_quote_id IS NULL AND lifi_quote_id IS NOT NULL)
  OR (relay_from_amount_raw IS NULL AND lifi_from_amount_raw IS NOT NULL);

UPDATE public.wallet_send_sessions
SET execution_model = 'relay_bridge'
WHERE execution_model = 'lifi_bridge';

UPDATE public.transactions
SET provider = 'relay'
WHERE provider = 'lifi';

UPDATE public.transactions
SET metadata = jsonb_set(metadata, '{execution_model}', '"relay_bridge"', false)
WHERE metadata->>'execution_model' = 'lifi_bridge';

UPDATE public.transactions
SET metadata = jsonb_set(metadata, '{payout_review,execution_model}', '"relay_bridge"', true)
WHERE metadata->'payout_review'->>'execution_model' = 'lifi_bridge';

UPDATE public.crypto_rates
SET source = 'relay_probe_sync'
WHERE source = 'lifi_probe_sync';
