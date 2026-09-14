-- Bridge.xyz: customer ids, KYC/KYB status, mobile cutover, payout lock + transfers.

alter table if exists public.users
  add column if not exists bridge_customer_id text;

alter table if exists public.users
  add column if not exists bridge_kyc_status text;

alter table if exists public.users
  add column if not exists bridge_cutover_required_at timestamptz;

alter table if exists public.users
  add column if not exists bridge_cutover_deadline_at timestamptz;

alter table if exists public.users
  add column if not exists bridge_cutover_email_sent_at timestamptz;

alter table if exists public.businesses
  add column if not exists bridge_customer_id text;

alter table if exists public.businesses
  add column if not exists bridge_kyc_status text;

create index if not exists users_bridge_customer_id_idx
  on public.users (bridge_customer_id)
  where bridge_customer_id is not null;

create index if not exists businesses_bridge_customer_id_idx
  on public.businesses (bridge_customer_id)
  where bridge_customer_id is not null;

alter table if exists public.payout_lock_sessions
  drop constraint if exists payout_lock_sessions_provider_check;

alter table if exists public.payout_lock_sessions
  add constraint payout_lock_sessions_provider_check
  check (provider in ('noah', 'yellowcard', 'grid', 'bridge'));

create table if not exists public.bridge_transfers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions(id) on delete set null,
  user_id uuid not null,
  business_id uuid,
  mode text not null check (mode in ('balance_payout', 'va_inbound')),
  status text not null default 'pending',
  pay_in_currency text,
  receive_currency text,
  quoted_pay_in numeric,
  quoted_receive numeric,
  bridge_transfer_id text,
  external_account_id text,
  bridge_customer_id text,
  deposit_id text,
  settlement_info jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bridge_transfers_deposit_id_uidx
  on public.bridge_transfers (deposit_id)
  where deposit_id is not null;

create index if not exists bridge_transfers_user_id_idx on public.bridge_transfers (user_id);
create index if not exists bridge_transfers_transfer_id_idx on public.bridge_transfers (bridge_transfer_id);
create index if not exists bridge_transfers_transaction_id_idx on public.bridge_transfers (transaction_id);

comment on table public.bridge_transfers is
  'Bridge orchestration: VA inbound deposits and balance payouts.';
