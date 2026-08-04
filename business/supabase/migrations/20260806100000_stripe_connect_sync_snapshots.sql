-- Extended Stripe Connect sync snapshots (requirements, profile, payout destination).

alter table if exists public.business_stripe_connect_accounts
  add column if not exists requirements_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists business_profile_snapshot jsonb,
  add column if not exists payout_destination_snapshot jsonb;

comment on column public.business_stripe_connect_accounts.requirements_snapshot is
  'Stripe Account.requirements mirror: currently/eventually/past due, errors, disabled_reason, deadlines.';

comment on column public.business_stripe_connect_accounts.business_profile_snapshot is
  'Read-only Stripe business profile cache (name, url, support contact, country).';

comment on column public.business_stripe_connect_accounts.payout_destination_snapshot is
  'Default external payout bank snapshot (masked last4, currency, status).';
