-- Brownfield: older DBs may already have applied 20260407220000 with column `easner_role`.
-- This migration is idempotent and safe if `role` already exists.
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

alter table public.users drop constraint if exists users_easner_role_check;
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check check (
    role = any (array['business'::text, 'individual'::text])
  );
