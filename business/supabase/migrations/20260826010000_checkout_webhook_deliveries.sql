-- Merchant checkout webhook delivery log + retry queue.

CREATE TABLE IF NOT EXISTS checkout_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  last_status_code integer,
  last_error text,
  response_body text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_webhook_deliveries_business_created_idx
  ON checkout_webhook_deliveries (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS checkout_webhook_deliveries_retry_idx
  ON checkout_webhook_deliveries (status, next_attempt_at)
  WHERE status = 'pending';

ALTER TABLE checkout_webhook_deliveries ENABLE ROW LEVEL SECURITY;
