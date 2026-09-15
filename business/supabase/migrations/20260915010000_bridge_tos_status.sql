alter table if exists public.users
  add column if not exists bridge_tos_status text;

alter table if exists public.businesses
  add column if not exists bridge_tos_status text;
