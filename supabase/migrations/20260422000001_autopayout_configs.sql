-- Stablecoin Autopayout: org-scoped receive configs + durable deposit addresses (Noah workflow).
-- Independent from terminal_payouts / terminal_sessions CRUD.

CREATE TABLE IF NOT EXISTS public.autopayout_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  recipient_id uuid NOT NULL REFERENCES public.recipients (id) ON DELETE RESTRICT,
  label text,
  crypto_currency text NOT NULL,
  network text NOT NULL,
  deposit_address text,
  deposit_memo text,
  /** Nominal fiat amount used only for Noah sell/pre + workflow (not shown on placard as “amount due”). */
  fiat_prepare_amount numeric NOT NULL DEFAULT 1,
  prepare_fiat_currency text NOT NULL DEFAULT 'USD',
  crypto_amount_expected text,
  status text NOT NULL DEFAULT 'provisioning',
  noah_form_session_id text,
  noah_workflow_raw jsonb,
  noah_trigger_json jsonb,
  source_address text,
  expires_at timestamptz,
  archived_at timestamptz,
  archived_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  placard_hd_png_storage_path text,
  placard_pdf_storage_path text,
  placard_generated_at timestamptz,
  placard_template_version int NOT NULL DEFAULT 1,
  placard_content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT autopayout_configs_status_check CHECK (
    status = ANY (
      ARRAY[
        'provisioning'::text,
        'awaiting_deposit'::text,
        'failed'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS autopayout_configs_business_id_idx ON public.autopayout_configs (business_id);

CREATE INDEX IF NOT EXISTS autopayout_configs_business_archived_idx ON public.autopayout_configs (business_id, archived_at);

CREATE UNIQUE INDEX IF NOT EXISTS autopayout_configs_business_deposit_key ON public.autopayout_configs (business_id, deposit_address)
WHERE
  deposit_address IS NOT NULL
  AND trim(deposit_address) <> '';

ALTER TABLE public.autopayout_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autopayout_configs_select_member"
  ON public.autopayout_configs
  FOR SELECT
  USING (
    business_id IN (
      SELECT
        easner_business_id
      FROM
        public.users
      WHERE
        id = auth.uid()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "autopayout_configs_insert_member"
  ON public.autopayout_configs
  FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT
        easner_business_id
      FROM
        public.users
      WHERE
        id = auth.uid()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "autopayout_configs_update_member"
  ON public.autopayout_configs
  FOR UPDATE
  USING (
    business_id IN (
      SELECT
        easner_business_id
      FROM
        public.users
      WHERE
        id = auth.uid()
        AND easner_business_id IS NOT NULL
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT
        easner_business_id
      FROM
        public.users
      WHERE
        id = auth.uid()
        AND easner_business_id IS NOT NULL
    )
  );

-- Service role (API) bypasses RLS; members use API routes with session.

COMMENT ON TABLE public.autopayout_configs IS 'Stablecoin Autopayout: deposit address + payout recipient per row; archive soft-deletes.';
