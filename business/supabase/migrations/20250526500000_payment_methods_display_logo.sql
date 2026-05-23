-- Display logo for manual-send pay-in options (business + mobile "Through another currency").

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS display_logo_url text;

COMMENT ON COLUMN public.payment_methods.display_logo_url IS
  'Public URL for brand logo shown beside display name in send pay-in picker.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-method-logos',
  'payment-method-logos',
  true,
  2097152,
  ARRAY['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;
