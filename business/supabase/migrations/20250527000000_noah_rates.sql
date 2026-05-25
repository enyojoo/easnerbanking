-- Global payout customer rates: Noah /prices mid + Easner margin (separate from P2P exchange_rates).

CREATE TABLE IF NOT EXISTS public.noah_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency varchar(8) NOT NULL,
  to_currency varchar(8) NOT NULL,
  country_code varchar(2),
  noah_mid numeric(20, 10) NOT NULL,
  rate numeric(20, 10) NOT NULL,
  margin_bps int NOT NULL DEFAULT 300,
  source text NOT NULL DEFAULT 'noah_prices_sync',
  as_of timestamptz NOT NULL DEFAULT now(),
  fee_type text NOT NULL DEFAULT 'free',
  fee_amount numeric(20, 4) NOT NULL DEFAULT 0,
  min_amount numeric(20, 2),
  max_amount numeric(20, 2),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT noah_rates_from_to_unique UNIQUE (from_currency, to_currency),
  CONSTRAINT noah_rates_fee_type_check CHECK (
    fee_type IN ('free', 'fixed', 'percentage')
  )
);

CREATE INDEX IF NOT EXISTS noah_rates_to_currency_idx ON public.noah_rates (to_currency);
CREATE INDEX IF NOT EXISTS noah_rates_status_idx ON public.noah_rates (status);

COMMENT ON TABLE public.noah_rates IS
  'Customer-facing global payout FX (USD/EUR balance → payout fiats). Synced from Noah /prices Rate + Easner margin.';
