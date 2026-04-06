-- B2B customers + invoices (org-scoped). Office and business app expect these table names.

CREATE TABLE IF NOT EXISTS public.b2b_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS b2b_customers_business_id_idx ON public.b2b_customers (business_id);
CREATE INDEX IF NOT EXISTS b2b_customers_business_email_idx ON public.b2b_customers (business_id, lower(email));

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.b2b_customers (id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft',
  due_date date,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  tax_rate numeric(12, 6) NOT NULL DEFAULT 0,
  bill_to_type text CHECK (
    bill_to_type IS NULL
    OR bill_to_type IN ('individual', 'company')
  ),
  customer_name text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  customer_company text NOT NULL DEFAULT '',
  customer_address text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_business_invoice_number_unique UNIQUE (business_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS invoices_business_id_idx ON public.invoices (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_customer_id_idx ON public.invoices (business_id, customer_id);

ALTER TABLE public.b2b_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Members: easner_business_id on users matches row business_id
CREATE POLICY "b2b_customers_select_member"
  ON public.b2b_customers FOR SELECT
  USING (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "b2b_customers_insert_member"
  ON public.b2b_customers FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "b2b_customers_update_member"
  ON public.b2b_customers FOR UPDATE
  USING (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "b2b_customers_delete_member"
  ON public.b2b_customers FOR DELETE
  USING (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "invoices_select_member"
  ON public.invoices FOR SELECT
  USING (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "invoices_insert_member"
  ON public.invoices FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "invoices_update_member"
  ON public.invoices FOR UPDATE
  USING (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );

CREATE POLICY "invoices_delete_member"
  ON public.invoices FOR DELETE
  USING (
    business_id IN (
      SELECT easner_business_id
      FROM public.users
      WHERE id = auth.uid ()
        AND easner_business_id IS NOT NULL
    )
  );
