-- Office /users and /businesses: KYB application rows update org verification
-- which the users directory merges. Publish + office_admin SELECT so staff JWT
-- receives postgres_changes.

do $$
begin
  begin
    alter publication supabase_realtime add table public.business_kyb_applications;
  exception
    when duplicate_object then null;
    when undefined_table then null;
    when undefined_object then null;
  end;

  begin
    alter table public.business_kyb_applications replica identity full;
  exception
    when undefined_table then null;
  end;

  begin
    alter table public.business_kyb_applications enable row level security;
  exception
    when undefined_table then null;
  end;

  begin
    grant select on table public.business_kyb_applications to authenticated;
  exception
    when undefined_table then null;
    when insufficient_privilege then null;
    when duplicate_object then null;
  end;

  begin
    drop policy if exists office_admin_select on public.business_kyb_applications;
    create policy office_admin_select on public.business_kyb_applications
      for select to authenticated
      using (public.is_office_admin());
  exception
    when undefined_table then null;
    when undefined_function then null;
    when duplicate_object then null;
  end;
end $$;
