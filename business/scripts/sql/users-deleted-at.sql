-- Soft account closure: retain profile + related records; revoke auth access only.
-- Set by cron after deletion_scheduled_at grace period expires.

alter table public.users
  add column if not exists deleted_at timestamptz;

comment on column public.users.deleted_at is
  'When set, account is closed (auth revoked). Profile and financial records are retained. Null means not closed.';

create index if not exists users_deleted_at_idx
  on public.users (deleted_at)
  where deleted_at is not null;
