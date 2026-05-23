-- Platform control: currencies catalog + exchange_rates (manual send / Rates tab).
-- Run before 20250526120000_seed_exchange_rates_ciuna.sql on fresh databases.

CREATE TABLE IF NOT EXISTS public.currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(8) NOT NULL UNIQUE,
  name text NOT NULL,
  symbol text NOT NULL,
  flag_svg text,
  can_send boolean NOT NULL DEFAULT true,
  can_receive boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency varchar(8) NOT NULL,
  to_currency varchar(8) NOT NULL,
  rate numeric(20, 10) NOT NULL,
  source text NOT NULL DEFAULT 'open_exchange_rates',
  as_of timestamptz NOT NULL DEFAULT now(),
  fee_type text NOT NULL DEFAULT 'free',
  fee_amount numeric(20, 4) NOT NULL DEFAULT 0,
  min_amount numeric(20, 2),
  max_amount numeric(20, 2),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exchange_rates_from_to_unique UNIQUE (from_currency, to_currency),
  CONSTRAINT exchange_rates_fee_type_check CHECK (
    fee_type IN ('free', 'fixed', 'percentage')
  )
);

CREATE INDEX IF NOT EXISTS exchange_rates_from_currency_idx ON public.exchange_rates (from_currency);
CREATE INDEX IF NOT EXISTS exchange_rates_to_currency_idx ON public.exchange_rates (to_currency);

-- Seed catalog rows used by Ciuna / manual-send rate matrix (idempotent).
INSERT INTO public.currencies (code, name, symbol, can_send, can_receive, status)
VALUES
  ('USD', 'US Dollar', '$', true, true, 'active'),
  ('EUR', 'Euro', '€', true, true, 'active'),
  ('GBP', 'British Pound', '£', true, true, 'active'),
  ('NGN', 'Nigerian Naira', '₦', true, true, 'active'),
  ('KES', 'Kenyan Shilling', 'KSh', true, true, 'active'),
  ('GHS', 'Ghanaian Cedi', '₵', true, true, 'active'),
  ('RUB', 'Russian Ruble', '₽', true, true, 'active'),
  ('TZS', 'Tanzanian Shilling', 'TSh', true, true, 'active'),
  ('UGX', 'Ugandan Shilling', 'USh', true, true, 'active'),
  ('ZAR', 'South African Rand', 'R', true, true, 'active'),
  ('BWP', 'Botswana Pula', 'P', true, true, 'active'),
  ('XAF', 'Central African CFA franc', 'FCFA', true, true, 'active'),
  ('RWF', 'Rwandan Franc', 'FRw', true, true, 'active'),
  ('USDC', 'USD Coin', '$', true, true, 'active'),
  ('USDT', 'Tether USD', '$', true, true, 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  symbol = EXCLUDED.symbol,
  updated_at = now();
