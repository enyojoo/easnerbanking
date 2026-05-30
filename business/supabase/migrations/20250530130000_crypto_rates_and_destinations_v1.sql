-- v1 wallet send: crypto_rates planning table + crypto_destinations catalog sync

CREATE TABLE IF NOT EXISTS public.crypto_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency varchar(8) NOT NULL,
  to_currency varchar(8) NOT NULL,
  receive_network text NOT NULL,
  lifi_mid numeric(20, 10) NOT NULL,
  rate numeric(20, 10) NOT NULL,
  margin_bps int NOT NULL DEFAULT 150,
  source text NOT NULL DEFAULT 'lifi_probe_sync',
  as_of timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crypto_rates_corridor_unique UNIQUE (from_currency, to_currency, receive_network)
);

CREATE INDEX IF NOT EXISTS crypto_rates_status_idx ON public.crypto_rates (status);
CREATE INDEX IF NOT EXISTS crypto_rates_to_network_idx ON public.crypto_rates (to_currency, receive_network);

COMMENT ON TABLE public.crypto_rates IS
  'Planning-layer wallet send FX (USD/EUR balance → receive asset/network). Synced from LI.FI probe + Easner margin.';

-- USDC
UPDATE public.crypto_destinations SET
  networks = '["Solana","Ethereum","Base","PolygonPos","BSC"]'::jsonb,
  enabled = true,
  sort_order = 1,
  provider_routing = '[{"provider":"turnkey","priority":1,"settlement_asset":"USDC"},{"provider":"lifi","priority":2,"settlement_asset":"USDC"}]'::jsonb,
  updated_at = now()
WHERE asset_code = 'USDC';

-- USDT
UPDATE public.crypto_destinations SET
  networks = '["Tron","Ethereum","BSC","PolygonPos","Solana"]'::jsonb,
  enabled = true,
  sort_order = 2,
  provider_routing = '[{"provider":"lifi","priority":1,"settlement_asset":"USDC"}]'::jsonb,
  updated_at = now()
WHERE asset_code = 'USDT';

-- EURC
UPDATE public.crypto_destinations SET
  networks = '["Solana"]'::jsonb,
  enabled = true,
  sort_order = 3,
  provider_routing = '[{"provider":"turnkey","priority":1,"settlement_asset":"EURC"}]'::jsonb,
  updated_at = now()
WHERE asset_code = 'EURC';

DELETE FROM public.crypto_destinations WHERE asset_code IN ('BTC', 'SOL', 'PYUSD');
