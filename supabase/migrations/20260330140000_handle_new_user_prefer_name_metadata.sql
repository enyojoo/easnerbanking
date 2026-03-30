-- Prefer user_metadata.name (business + mobile sign-up) when building public.users.full_name.
-- Safe if 20260330130000 already ran with first/last-only logic.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
begin
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
