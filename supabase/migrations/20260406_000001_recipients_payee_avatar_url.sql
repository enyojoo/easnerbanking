-- Snapshot of payee profile image when saving an Easenet recipient (from users.avatar_url at save time)
ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS payee_avatar_url text;

COMMENT ON COLUMN public.recipients.payee_avatar_url IS 'URL snapshot from payee users.avatar_url when recipient was saved (Easenet / payee_easetag).';
