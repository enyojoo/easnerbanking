alter table public.business_stripe_connect_accounts
  add column if not exists stripe_test_account_id text;
