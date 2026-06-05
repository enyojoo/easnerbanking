-- Short-lived wallet send quote sessions (Turnkey direct / LI.FI bridge).

CREATE TABLE IF NOT EXISTS public.wallet_send_sessions (
  form_session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  source_balance_currency character varying(3) NOT NULL,
  receive_asset character varying(16) NOT NULL,
  receive_network text NOT NULL,
  destination_address text NOT NULL,
  receive_amount numeric(20, 6) NOT NULL,
  customer_rate numeric(20, 10) NOT NULL,
  lifi_mid numeric(20, 10) NOT NULL,
  lifi_floor numeric(20, 6) NOT NULL,
  total_debited numeric(20, 6) NOT NULL,
  margin_amount numeric(20, 6) NOT NULL,
  execution_model text NOT NULL,
  lifi_quote_id text,
  status text NOT NULL DEFAULT 'quoted'::text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_send_sessions_pkey PRIMARY KEY (form_session_id)
);

CREATE INDEX IF NOT EXISTS wallet_send_sessions_user_expires_idx
  ON public.wallet_send_sessions (user_id, expires_at);

COMMENT ON TABLE public.wallet_send_sessions IS
  'Executable wallet send quotes keyed by form_session_id; survives serverless cold starts.';
