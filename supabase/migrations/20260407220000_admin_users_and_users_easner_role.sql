-- Office admins (Easner console). Run against your Supabase Postgres.
-- Safe to re-run in dev: uses IF NOT EXISTS / idempotent patterns where supported.

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  id uuid not null,
  email text not null,
  name text null,
  role text not null default 'admin'::text,
  status text not null default 'active'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint admin_users_pkey primary key (id),
  constraint admin_users_email_unique unique (email),
  constraint admin_users_id_fkey foreign key (id) references auth.users (id) on delete cascade,
  constraint admin_users_status_check check (
    status = any (array['active'::text, 'inactive'::text])
  )
) tablespace pg_default;

create index if not exists idx_admin_users_email on public.admin_users using btree (email) tablespace pg_default;

-- ---------------------------------------------------------------------------
-- users: role NOT NULL, default individual, CHECK (business | individual)
-- Renames legacy easner_role → role when present; adds column if missing.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'easner_role'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'role'
  ) then
    alter table public.users rename column easner_role to role;
  end if;
end $$;

alter table public.users add column if not exists role text;

update public.users
set role = 'individual'::text
where role is null;

alter table public.users alter column role set default 'individual'::text;

alter table public.users alter column role set not null;

alter table public.users drop constraint if exists users_easner_role_check;
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check check (
    role = any (array['business'::text, 'individual'::text])
  );

-- Unique easetag (partial index) — create only if not present.
create unique index if not exists users_easetag_key on public.users using btree (easetag) tablespace pg_default
where (easetag is not null);
