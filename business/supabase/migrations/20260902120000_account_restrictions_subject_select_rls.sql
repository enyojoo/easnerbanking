-- Allow account holders to SELECT their own restriction rows so Supabase
-- Realtime can deliver Office restrict/close/lift events to business + mobile.

do $$
begin
  begin
    drop policy if exists account_restrictions_select_own_user on public.account_restrictions;
    create policy account_restrictions_select_own_user on public.account_restrictions
      for select to authenticated
      using (
        subject_kind = 'user'
        and user_id is not null
        and user_id = auth.uid()
      );
  exception
    when undefined_table then null;
    when undefined_function then null;
    when duplicate_object then null;
  end;

  begin
    drop policy if exists account_restrictions_select_own_business on public.account_restrictions;
    create policy account_restrictions_select_own_business on public.account_restrictions
      for select to authenticated
      using (
        subject_kind = 'business'
        and business_id is not null
        and (
          exists (
            select 1
            from public.users u
            where u.id = auth.uid()
              and u.easner_business_id = account_restrictions.business_id
          )
          or exists (
            select 1
            from public.business_memberships m
            where m.user_id = auth.uid()
              and m.business_id = account_restrictions.business_id
              and coalesce(m.status, '') is distinct from 'invited'
          )
        )
      );
  exception
    when undefined_table then null;
    when undefined_function then null;
    when duplicate_object then null;
  end;
end $$;
