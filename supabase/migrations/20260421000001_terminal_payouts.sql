-- Terminal payout methods: org-scoped records pointing at saved recipients (rails data).

CREATE TABLE IF NOT EXISTS public.terminal_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  recipient_id uuid NOT NULL REFERENCES public.recipients (id) ON DELETE CASCADE,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_payouts_business_recipient_unique UNIQUE (business_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS terminal_payouts_business_id_idx ON public.terminal_payouts (business_id);

ALTER TABLE public.terminal_settings
  ADD COLUMN IF NOT EXISTS default_terminal_payout_id uuid REFERENCES public.terminal_payouts (id) ON DELETE SET NULL;

-- Backfill from legacy default_recipient_id when present.
INSERT INTO public.terminal_payouts (business_id, created_by, recipient_id)
SELECT DISTINCT
  ts.business_id,
  (
    SELECT u.id
    FROM public.users u
    WHERE u.easner_business_id = ts.business_id
    ORDER BY u.created_at ASC NULLS LAST
    LIMIT 1
  ),
  ts.default_recipient_id
FROM public.terminal_settings ts
WHERE ts.default_recipient_id IS NOT NULL
ON CONFLICT (business_id, recipient_id) DO NOTHING;

UPDATE public.terminal_settings ts
SET default_terminal_payout_id = tp.id
FROM public.terminal_payouts tp
WHERE tp.business_id = ts.business_id
  AND tp.recipient_id = ts.default_recipient_id
  AND ts.default_recipient_id IS NOT NULL;

ALTER TABLE public.terminal_settings DROP COLUMN IF EXISTS default_recipient_id;

ALTER TABLE public.terminal_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "terminal_payouts_select_member"
  ON public.terminal_payouts FOR SELECT
  USING (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "terminal_payouts_insert_member"
  ON public.terminal_payouts FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "terminal_payouts_update_member"
  ON public.terminal_payouts FOR UPDATE
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

CREATE POLICY "terminal_payouts_delete_member"
  ON public.terminal_payouts FOR DELETE
  USING (
    business_id IN (
      SELECT easner_business_id FROM public.users WHERE id = auth.uid() AND easner_business_id IS NOT NULL
    )
  );
