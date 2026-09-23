-- Bridge webhooks were accepted (HTTP 200) but never stored: event_inbox_provider_check
-- omitted 'bridge'. Customer and KYC events then had nowhere to land.

alter table if exists public.event_inbox
  drop constraint if exists event_inbox_provider_check;

alter table if exists public.event_inbox
  add constraint event_inbox_provider_check
  check (provider in ('noah', 'turnkey', 'yellowcard', 'grid', 'bridge', 'stripe', 'relay', 'other'));

alter table if exists public.users
  add column if not exists bridge_kyc_rejection_reasons jsonb;

alter table if exists public.businesses
  add column if not exists bridge_kyc_rejection_reasons jsonb;

comment on column public.users.bridge_kyc_rejection_reasons is
  'Bridge rejection_reasons: customer-facing reason and compliance developer_reason.';

comment on column public.businesses.bridge_kyc_rejection_reasons is
  'Bridge rejection_reasons: customer-facing reason and compliance developer_reason.';
