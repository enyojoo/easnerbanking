-- Canonical Expo tokens live in user_push_devices only; remove legacy mirrors.

drop index if exists public.user_preferences_expo_push_token_idx;

alter table public.user_preferences
  drop column if exists expo_push_token,
  drop column if exists expo_push_token_updated_at;

alter table public.users
  drop column if exists expo_push_token,
  drop column if exists expo_push_token_updated_at;
