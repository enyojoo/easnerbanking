-- Self-serve account deletion grace period (mobile/web).
-- When set, account closure runs after this timestamp via cron.
-- Signing back in clears the column (cancels pending deletion).

alter table public.users
  add column if not exists deletion_scheduled_at timestamptz;

comment on column public.users.deletion_scheduled_at is
  'When set, account is pending closure at/after this time. Null means active.';

create index if not exists users_deletion_scheduled_at_idx
  on public.users (deletion_scheduled_at)
  where deletion_scheduled_at is not null;

-- See users-deleted-at.sql for deleted_at (soft closure after grace expires).
