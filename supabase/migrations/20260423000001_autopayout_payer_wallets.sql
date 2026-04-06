-- Saved payer (source) wallets for Auto Payout placard creation: address + asset/network + label per business.

CREATE TABLE IF NOT EXISTS public.autopayout_payer_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  source_address text NOT NULL,
  crypto_currency text NOT NULL,
  network text NOT NULL,
  label text,
  archived_at timestamptz,
  archived_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS autopayout_payer_wallets_business_id_idx ON public.autopayout_payer_wallets (business_id);

CREATE INDEX IF NOT EXISTS autopayout_payer_wallets_business_active_idx ON public.autopayout_payer_wallets (business_id)
WHERE
  archived_at IS NULL;

ALTER TABLE public.autopayout_payer_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autopayout_payer_wallets_select_member"
  ON public.autopayout_payer_wallets
  FOR SELECT
  USING (
    business_id IN (
      SELECT
        easner_business_id
      FROM
        public.users
      WHERE
        id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "autopayout_payer_wallets_insert_member"
  ON public.autopayout_payer_wallets
  FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT
        easner_business_id
      FROM
        public.users
      WHERE
        id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "autopayout_payer_wallets_update_member"
  ON public.autopayout_payer_wallets
  FOR UPDATE
  USING (
    business_id IN (
      SELECT
        easner_business_id
      FROM
        public.users
      WHERE
        id = auth.uid ()
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
        id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

COMMENT ON TABLE public.autopayout_payer_wallets IS 'Auto Payout: reusable customer payer wallet + asset/network presets; archive soft-deletes.';
