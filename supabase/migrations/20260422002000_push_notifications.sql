-- Push notifications support:
-- - Store Expo push token on public.user_preferences (authoritative).
-- - Log per-transaction deliveries for idempotency + debugging.

create extension if not exists "pgcrypto";

-- Add Expo token columns to user_preferences (authoritative source).
alter table public.user_preferences
  add column if not exists expo_push_token text,
  add column if not exists expo_push_token_updated_at timestamptz;

create index if not exists user_preferences_expo_push_token_idx
  on public.user_preferences using btree (expo_push_token)
  where expo_push_token is not null;

-- Delivery log: server-written, uniquely identifies the user/tx/event.
create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  event_type text not null,
  provider text not null default 'expo',
  provider_ticket_id text,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, transaction_id, event_type)
);

create index if not exists push_notification_deliveries_user_created_at_idx
  on public.push_notification_deliveries (user_id, created_at desc);

create index if not exists push_notification_deliveries_tx_created_at_idx
  on public.push_notification_deliveries (transaction_id, created_at desc);

-- RLS: no client access; service-role can bypass.
alter table public.push_notification_deliveries enable row level security;

