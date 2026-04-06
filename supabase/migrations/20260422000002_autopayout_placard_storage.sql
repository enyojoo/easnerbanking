-- Private bucket for Stablecoin Autopayout placards (HD PNG + PDF). Upload/download via service role + signed URLs from app API.

INSERT INTO
  storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'autopayout-placards',
    'autopayout-placards',
    false,
    52428800,
    ARRAY['image/png', 'application/pdf']
  )
ON CONFLICT (id) DO NOTHING;

-- Authenticated org members may read objects under their business_id prefix (direct client access if needed).
CREATE POLICY "autopayout_placards_select_member"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'autopayout-placards'
    AND EXISTS (
      SELECT
        1
      FROM
        public.users u
      WHERE
        u.id = auth.uid()
        AND u.easner_business_id IS NOT NULL
        AND name LIKE (u.easner_business_id::text || '/%')
    )
  );

-- Inserts/updates from client optional; primary path is service role from Next API.
CREATE POLICY "autopayout_placards_insert_member"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'autopayout-placards'
    AND EXISTS (
      SELECT
        1
      FROM
        public.users u
      WHERE
        u.id = auth.uid()
        AND u.easner_business_id IS NOT NULL
        AND name LIKE (u.easner_business_id::text || '/%')
    )
  );

CREATE POLICY "autopayout_placards_update_member"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'autopayout-placards'
    AND EXISTS (
      SELECT
        1
      FROM
        public.users u
      WHERE
        u.id = auth.uid()
        AND u.easner_business_id IS NOT NULL
        AND name LIKE (u.easner_business_id::text || '/%')
    )
  );

CREATE POLICY "autopayout_placards_delete_member"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'autopayout-placards'
    AND EXISTS (
      SELECT
        1
      FROM
        public.users u
      WHERE
        u.id = auth.uid()
        AND u.easner_business_id IS NOT NULL
        AND name LIKE (u.easner_business_id::text || '/%')
    )
  );
