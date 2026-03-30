-- When a user is created in auth.users (email signup, OAuth, etc.), ensure a matching
-- public.users row exists (FK: public.users.id -> auth.users.id).
-- Without this, the mobile app finds no profile after sign-up.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
begin
  -- Match business app signup: user_metadata.name (see business/lib/auth-context.tsx)
  v_full_name := nullif(
    trim(
      case
        when coalesce(trim(new.raw_user_meta_data->>'name'), '') <> '' then trim(new.raw_user_meta_data->>'name')
        else trim(
          coalesce(new.raw_user_meta_data->>'first_name', '') || ' ' ||
          coalesce(new.raw_user_meta_data->>'last_name', '')
        )
      end
    ),
    ''
  );

  insert into public.users (id, email, full_name)
  values (new.id, new.email, v_full_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- Optional one-time backfill for auth users created before this migration:
-- insert into public.users (id, email, full_name)
-- select u.id, u.email,
--   nullif(trim(coalesce(u.raw_user_meta_data->>'first_name','') || ' ' || coalesce(u.raw_user_meta_data->>'last_name','')), '')
-- from auth.users u
-- where not exists (select 1 from public.users p where p.id = u.id)
-- on conflict (id) do nothing;
