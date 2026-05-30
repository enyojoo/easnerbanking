-- Wallet send planning rates (USD/EUR balance → receive asset + network)

CREATE TABLE IF NOT EXISTS public.crypto_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_currency character varying(8) NOT NULL,
  to_currency character varying(8) NOT NULL,
  receive_network text NOT NULL,
  lifi_mid numeric(20, 10) NOT NULL,
  rate numeric(20, 10) NOT NULL,
  margin_bps integer NOT NULL DEFAULT 150,
  source text NOT NULL DEFAULT 'lifi_probe_sync'::text,
  as_of timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crypto_rates_pkey PRIMARY KEY (id),
  CONSTRAINT crypto_rates_corridor_unique UNIQUE (from_currency, to_currency, receive_network)
);

CREATE INDEX IF NOT EXISTS crypto_rates_status_idx ON public.crypto_rates (status);
CREATE INDEX IF NOT EXISTS crypto_rates_to_network_idx ON public.crypto_rates (to_currency, receive_network);

COMMENT ON TABLE public.crypto_rates IS
  'Planning-layer wallet send FX (USD/EUR balance → receive asset/network). Synced from LI.FI probe + Easner margin.';
