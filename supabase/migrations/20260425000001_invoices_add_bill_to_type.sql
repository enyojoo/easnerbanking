-- Ensure bill_to_type exists when public.invoices predates this column
-- (CREATE TABLE IF NOT EXISTS in an earlier migration does not alter existing tables).

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS bill_to_type text;
