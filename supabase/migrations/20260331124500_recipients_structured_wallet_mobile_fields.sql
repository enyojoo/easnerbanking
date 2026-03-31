-- Add structured recipient columns for wallet/mobile-money metadata.
-- Keeps existing compatibility fields (`bank_name`, `swift_bic`) untouched.

alter table public.recipients
  add column if not exists mobile_provider text;

alter table public.recipients
  add column if not exists wallet_network text;

alter table public.recipients
  add column if not exists wallet_memo_tag text;

