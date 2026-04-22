-- User preferences: separate table for realtime-safe, non-sensitive user settings.

create extension if not exists "pgcrypto";

create table if not exists public.user_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  communication_preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_preferences_updated_at_idx
  on public.user_preferences (updated_at desc);

comment on table public.user_preferences is 'Per-user preferences safe for realtime; do not store balances or secrets.';

-- RLS: only the authenticated user can read/write their preferences.
alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own
  on public.user_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own
  on public.user_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own
  on public.user_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Enable Realtime publication for this table (best-effort).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.user_preferences';
  end if;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

