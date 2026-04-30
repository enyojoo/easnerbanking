-- Multi-device Expo push: one row per (user, expo_push_token).
-- Legacy single-token columns on user_preferences remain updated for compatibility.

create table if not exists public.user_push_devices (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  expo_push_token text not null,
  platform text null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_push_devices_user_token_key unique (user_id, expo_push_token),
  constraint user_push_devices_platform_check check (
    platform is null
    or platform = any (array['ios'::text, 'android'::text, 'web'::text])
  )
);

create index if not exists user_push_devices_user_id_idx on public.user_push_devices using btree (user_id);

comment on table public.user_push_devices is
  'Registered Expo push tokens per user (multiple devices). RLS: service role only.';

alter table public.user_push_devices enable row level security;

insert into
  public.user_push_devices (user_id, expo_push_token, last_seen_at, updated_at)
select
  user_id,
  trim(expo_push_token),
  coalesce(expo_push_token_updated_at, now()),
  now()
from
  public.user_preferences
where
  expo_push_token is not null
  and length(trim(expo_push_token)) > 0
on conflict (user_id, expo_push_token) do update
set
  last_seen_at = excluded.last_seen_at,
  updated_at = excluded.updated_at;

-- Per-device delivery dedupe: extend unique key with target token (legacy rows use '').
alter table public.push_notification_deliveries
drop constraint if exists push_notification_deliveries_user_id_transaction_id_event_type_key;

alter table public.push_notification_deliveries
add column if not exists expo_push_token text not null default '';

alter table public.push_notification_deliveries
drop constraint if exists push_notification_deliveries_user_tx_event_token_key;

alter table public.push_notification_deliveries
add constraint push_notification_deliveries_user_tx_event_token_key unique (
  user_id,
  transaction_id,
  event_type,
  expo_push_token
);
