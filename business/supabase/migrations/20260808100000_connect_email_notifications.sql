-- Dedupe state for online-payments lifecycle emails on Connect accounts.
alter table public.business_stripe_connect_accounts
  add column if not exists email_notifications jsonb not null default '{}'::jsonb;

comment on column public.business_stripe_connect_accounts.email_notifications is
  'Timestamps/fingerprints for online payments lifecycle emails (setupStartedAt, actionRequiredAt, actionRequiredFingerprint, readyAt).';
