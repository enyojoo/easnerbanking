-- Invoicing feature schema additions (apply in Supabase SQL editor)

-- Customer payment terms (Net N days)
ALTER TABLE business_customers
  ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 30;

-- Business-level invoice settings (payment defaults, notifications)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS invoice_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Persist customer invoice views
CREATE TABLE IF NOT EXISTS invoice_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  viewer_ip text
);

CREATE INDEX IF NOT EXISTS invoice_view_events_invoice_id_viewed_at_idx
  ON invoice_view_events (invoice_id, viewed_at DESC);

-- Invoice audit log (Phase 5)
CREATE TABLE IF NOT EXISTS invoice_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_audit_log_invoice_id_created_at_idx
  ON invoice_audit_log (invoice_id, created_at DESC);

-- Recurring invoice schedules (Phase 4)
CREATE TABLE IF NOT EXISTS invoice_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES business_customers(id) ON DELETE SET NULL,
  frequency text NOT NULL,
  next_run_at date NOT NULL,
  template jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Webhook endpoints (Phase 4)
CREATE TABLE IF NOT EXISTS invoice_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES invoice_webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
