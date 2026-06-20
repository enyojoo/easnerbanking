-- Persist LI.FI binary-search result so execute can re-quote in one API call.

ALTER TABLE public.wallet_send_sessions
  ADD COLUMN IF NOT EXISTS lifi_from_amount_raw text;

COMMENT ON COLUMN public.wallet_send_sessions.lifi_from_amount_raw IS
  'LI.FI fromAmount (base units) from quote-time sizing; used for single-shot execute re-quote.';
