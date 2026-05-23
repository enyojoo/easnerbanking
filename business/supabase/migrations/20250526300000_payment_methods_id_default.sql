-- Ensure new payment_methods rows get an id when the client omits it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_methods' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.payment_methods
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
END $$;
