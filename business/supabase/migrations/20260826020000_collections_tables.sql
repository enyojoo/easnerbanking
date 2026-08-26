-- Collections tables currently live in production only. Land the schema in-repo
-- so local/preview environments and types stay in lockstep. All statements are
-- idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS business_checkout_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
  fee_mode text,
  allowed_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_success_url text,
  default_cancel_url text,
  appearance jsonb,
  webhook_url text,
  webhook_secret_ciphertext text,
  webhook_secret_key_id text,
  webhook_secret_last4 text,
  live_mode_enabled boolean NOT NULL DEFAULT false,
  test_payment_completed_at timestamptz,
  online_payments_enabled boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_checkout_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  origin text NOT NULL,
  success_url text,
  cancel_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, origin)
);

CREATE TABLE IF NOT EXISTS business_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  publishable_key text NOT NULL UNIQUE,
  secret_key_hash text NOT NULL,
  secret_key_last4 text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '["checkout"]'::jsonb,
  created_by uuid,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_api_keys_business_active_idx
  ON business_api_keys (business_id, mode)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  created_by uuid,
  public_id text UNIQUE,
  slug text NOT NULL,
  label text NOT NULL,
  description text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  rail text NOT NULL DEFAULT 'card_bank',
  mode text NOT NULL DEFAULT 'one_time',
  billing_interval text,
  trial_days integer,
  redirect_url text,
  stripe_price_id text,
  autopayout_config_id uuid,
  payment_count integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_links_business_created_idx
  ON payment_links (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS online_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('invoice', 'payment_link', 'embed')),
  invoice_id uuid,
  payment_link_id uuid,
  mode text NOT NULL DEFAULT 'payment' CHECK (mode IN ('payment', 'subscription')),
  status text NOT NULL DEFAULT 'open',
  fee_mode text,
  easner_settlement_id uuid NOT NULL,
  idempotency_key text,
  listed_amount_cents integer,
  gross_cents integer,
  application_fee_cents integer,
  fee_cents integer,
  net_cents integer,
  currency text NOT NULL DEFAULT 'USD',
  customer_email text,
  return_url text,
  stripe_connected_account_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  payment_method_type text,
  livemode boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS online_checkout_sessions_settlement_uidx
  ON online_checkout_sessions (easner_settlement_id);

CREATE INDEX IF NOT EXISTS online_checkout_sessions_business_created_idx
  ON online_checkout_sessions (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS online_checkout_sessions_idempotency_idx
  ON online_checkout_sessions (business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid,
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  easner_settlement_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  gross_cents integer,
  listed_amount_cents integer,
  application_fee_cents integer,
  fee_cents integer,
  net_cents integer,
  fee_mode text,
  currency text NOT NULL DEFAULT 'USD',
  customer_email text,
  idempotency_key text,
  stripe_connected_account_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  payment_method_type text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checkout_stripe_settlements (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  checkout_session_id uuid,
  payment_link_id uuid,
  invoice_id uuid,
  source text NOT NULL CHECK (source IN ('invoice', 'payment_link', 'embed')),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_connected_account_id text,
  stripe_transfer_id text,
  stripe_subscription_id text,
  stripe_refund_id text,
  gross_cents integer,
  fee_cents integer,
  net_cents integer,
  currency text NOT NULL DEFAULT 'USD',
  phase text NOT NULL DEFAULT 'payment_received',
  ledger_transaction_id uuid,
  stripe_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS checkout_stripe_settlements_pi_uidx
  ON checkout_stripe_settlements (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE checkout_stripe_settlements ADD COLUMN IF NOT EXISTS invoice_id uuid;
ALTER TABLE checkout_stripe_settlements ADD COLUMN IF NOT EXISTS stripe_refund_id text;
ALTER TABLE checkout_stripe_settlements ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE online_checkout_sessions ADD COLUMN IF NOT EXISTS invoice_id uuid;
ALTER TABLE online_checkout_sessions ADD COLUMN IF NOT EXISTS fee_cents integer;
ALTER TABLE online_checkout_sessions ADD COLUMN IF NOT EXISTS net_cents integer;
ALTER TABLE business_api_keys ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE business_checkout_settings ADD COLUMN IF NOT EXISTS webhook_secret_ciphertext text;
ALTER TABLE business_checkout_settings ADD COLUMN IF NOT EXISTS webhook_secret_key_id text;

ALTER TABLE checkout_stripe_settlements DROP CONSTRAINT IF EXISTS checkout_stripe_settlements_source_check;
ALTER TABLE checkout_stripe_settlements
  ADD CONSTRAINT checkout_stripe_settlements_source_check
  CHECK (source IN ('invoice', 'payment_link', 'embed'));

CREATE OR REPLACE FUNCTION increment_payment_link_payment_count(
  p_link_id uuid,
  p_updated_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE payment_links
  SET payment_count = COALESCE(payment_count, 0) + 1,
      updated_at = p_updated_at
  WHERE id = p_link_id;
$$;

ALTER TABLE business_checkout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_checkout_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_stripe_settlements ENABLE ROW LEVEL SECURITY;
