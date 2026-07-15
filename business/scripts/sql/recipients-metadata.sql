-- Optional: recipients.metadata jsonb for Yellowcard LatAm extras (pix_key_type, cuit, …).
-- Safe to re-run.

ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.recipients.metadata IS
  'Provider-specific recipient extras (e.g. Yellowcard pix_key_type, cuit, identification_type).';
