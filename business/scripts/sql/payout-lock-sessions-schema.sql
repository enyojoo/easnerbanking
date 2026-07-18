-- Locked balance payout sessions (Noah fiat + YC balance_payout confirm-on-review).

create table if not exists public.payout_lock_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid,
  recipient_id uuid not null,
  provider text not null check (provider in ('noah', 'yellowcard')),
  quote_key text not null,
  status text not null default 'locked' check (status in ('locked', 'executed', 'expired')),
  recipient_snapshot_hash text not null,
  pricing_json jsonb not null default '{}'::jsonb,
  provider_payload_json jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payout_lock_sessions_user_quote_key_idx
  on public.payout_lock_sessions (user_id, quote_key);

create index if not exists payout_lock_sessions_recipient_idx
  on public.payout_lock_sessions (recipient_id);

create index if not exists payout_lock_sessions_expires_at_idx
  on public.payout_lock_sessions (expires_at);

comment on table public.payout_lock_sessions is
  'Locked balance payout orders: Noah off-ramp + YC balance_payout confirm-on-review.';
