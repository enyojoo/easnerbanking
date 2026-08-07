-- Relay integration: intents, Tron deposit addresses, convert sessions, wallet send relay fields.

CREATE TABLE IF NOT EXISTS public.relay_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_owner_id uuid REFERENCES public.wallet_owners(id) ON DELETE SET NULL,
  form_session_id text,
  corridor text,
  receive_amount numeric,
  relay_floor numeric,
  relay_fee numeric,
  subsidize_fees boolean NOT NULL DEFAULT false,
  relay_request_id text,
  status text NOT NULL DEFAULT 'quoted',
  tx_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relay_intents_form_session_id_idx ON public.relay_intents (form_session_id);
CREATE INDEX IF NOT EXISTS relay_intents_relay_request_id_idx ON public.relay_intents (relay_request_id);

CREATE TABLE IF NOT EXISTS public.relay_deposit_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_owner_id uuid NOT NULL REFERENCES public.wallet_owners(id) ON DELETE CASCADE,
  route text NOT NULL DEFAULT 'tron_usdt_to_sol_usdc',
  tron_address text NOT NULL,
  recipient_vault_ata text NOT NULL,
  relay_request_id text,
  estimated_fee_bps integer,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_owner_id, route)
);

CREATE INDEX IF NOT EXISTS relay_deposit_addresses_tron_address_idx ON public.relay_deposit_addresses (tron_address);

CREATE TABLE IF NOT EXISTS public.relay_deposit_provision_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_owner_id uuid NOT NULL REFERENCES public.wallet_owners(id) ON DELETE CASCADE,
  recipient_vault_ata text NOT NULL,
  route text NOT NULL DEFAULT 'tron_usdt_to_sol_usdc',
  state text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  error text,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relay_deposit_provision_jobs_state_idx
  ON public.relay_deposit_provision_jobs (state, next_retry_at);

CREATE TABLE IF NOT EXISTS public.relay_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_owner_id uuid NOT NULL REFERENCES public.wallet_owners(id) ON DELETE CASCADE,
  tron_address text NOT NULL,
  relay_request_id text UNIQUE,
  gross_usdt numeric,
  relay_fee numeric,
  on_chain_usdc numeric,
  easner_deposit_fee numeric,
  posted_amount numeric,
  status text NOT NULL DEFAULT 'pending',
  turnkey_tx_hash text,
  ledger_tx_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relay_deposits_relay_request_id_idx ON public.relay_deposits (relay_request_id);
CREATE INDEX IF NOT EXISTS relay_deposits_wallet_owner_id_idx ON public.relay_deposits (wallet_owner_id);

CREATE TABLE IF NOT EXISTS public.balance_convert_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_owner_id uuid NOT NULL REFERENCES public.wallet_owners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  direction text NOT NULL,
  source_amount numeric NOT NULL,
  destination_amount numeric,
  relay_request_id text,
  status text NOT NULL DEFAULT 'quoted',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_send_sessions
  ADD COLUMN IF NOT EXISTS relay_quote_id text,
  ADD COLUMN IF NOT EXISTS relay_from_amount_raw text,
  ADD COLUMN IF NOT EXISTS relay_floor numeric,
  ADD COLUMN IF NOT EXISTS relay_mid numeric;
