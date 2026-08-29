-- Generated account statements (PDF snapshots). Service-role access only.

CREATE TABLE IF NOT EXISTS public.account_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.users (id),
  business_id uuid NULL REFERENCES public.businesses (id) ON DELETE SET NULL,
  scope text NOT NULL CHECK (scope IN ('personal', 'business')),
  currency text NOT NULL CHECK (currency IN ('USD', 'EUR')),
  period_from date NOT NULL,
  period_to date NOT NULL,
  available_as_of timestamptz NOT NULL,
  time_zone text NOT NULL,
  holder_name text NOT NULL DEFAULT '',
  holder_email text NOT NULL DEFAULT '',
  available_balance numeric NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_statements_created_at_idx
  ON public.account_statements (created_at DESC);

CREATE INDEX IF NOT EXISTS account_statements_user_id_idx
  ON public.account_statements (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_statements_business_id_idx
  ON public.account_statements (business_id, created_at DESC)
  WHERE business_id IS NOT NULL;

ALTER TABLE public.account_statements ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'account-statements',
  'account-statements',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;
