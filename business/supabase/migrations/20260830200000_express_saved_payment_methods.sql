-- Per-rail Express Card and ACH instruments (display fields + token).
-- stripe_express_payment_token_id stays as the last-saved id.

alter table public.users
  add column if not exists stripe_express_payment_methods jsonb;
