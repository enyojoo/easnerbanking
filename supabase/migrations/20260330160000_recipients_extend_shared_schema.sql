-- Run after 20260330150000_recipients_table.sql (e.g. if that migration already
-- applied before these columns existed). Aligns with packages/server (database.ts).
-- Idempotent: ADD COLUMN IF NOT EXISTS.

alter table public.recipients add column if not exists address_line1 text;
alter table public.recipients add column if not exists address_line2 text;
alter table public.recipients add column if not exists city text;
alter table public.recipients add column if not exists state text;
alter table public.recipients add column if not exists postal_code text;
alter table public.recipients add column if not exists transfer_type text;
alter table public.recipients add column if not exists checking_or_savings text;
