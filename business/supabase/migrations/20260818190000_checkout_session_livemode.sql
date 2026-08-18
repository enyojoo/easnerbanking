-- Test checkout sessions stay off the live ledger. Existing rows default to live.

alter table public.online_checkout_sessions
  add column if not exists livemode boolean not null default true;

create index if not exists online_checkout_sessions_test_complete_idx
  on public.online_checkout_sessions (business_id, completed_at desc)
  where livemode = false and status = 'complete';

comment on column public.online_checkout_sessions.livemode is
  'False when the merchant used test keys (or Stripe sent livemode=false). Test payments are listed on Checkout, not Transactions.';
