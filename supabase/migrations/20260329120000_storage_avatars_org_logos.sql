-- Public buckets: readable via Storage public URLs; writes only from Easner API (service role).
-- Apply in Supabase Dashboard → SQL Editor (or `supabase db push` if linked).

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('avatars', 'avatars', true, 2097152),
  ('org-logos', 'org-logos', true, 2097152)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;
