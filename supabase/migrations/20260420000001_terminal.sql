-- Stablecoin Terminal: sessions + per-org default payout recipient (MVP).

CREATE TABLE IF NOT EXISTS public.terminal_settings (
  business_id uuid NOT NULL PRIMARY KEY REFERENCES public.businesses (id) ON DELETE CASCADE,
  default_recipient_id uuid REFERENCES public.recipients (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.terminal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES public.recipients (id) ON DELETE SET NULL,
  crypto_currency text NOT NULL,
  network text NOT NULL,
  fiat_amount numeric NOT NULL,
  fiat_currency text NOT NULL DEFAULT 'USD',
  crypto_amount_expected text,
  status text NOT NULL DEFAULT 'awaiting_deposit',
  noah_form_session_id text,
  noah_trigger_json jsonb,
  source_address text,
  destination_address text,
  expires_at timestamptz,
  external_id text,
  noah_workflow_raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS terminal_sessions_business_created_at_idx
  ON public.terminal_sessions (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS terminal_sessions_business_status_idx
  ON public.terminal_sessions (business_id, status);

ALTER TABLE public.terminal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_sessions ENABLE ROW LEVEL SECURITY;

-- Authenticated members of the org (same business_id on users) may read/write terminal data.
CREATE POLICY "terminal_settings_select_member"
  ON public.terminal_settings FOR SELECT
  USING (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "terminal_settings_modify_member"
  ON public.terminal_settings FOR ALL
  USING (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "terminal_sessions_select_member"
  ON public.terminal_sessions FOR SELECT
  USING (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "terminal_sessions_insert_member"
  ON public.terminal_sessions FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "terminal_sessions_update_member"
  ON public.terminal_sessions FOR UPDATE
  USING (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  );
