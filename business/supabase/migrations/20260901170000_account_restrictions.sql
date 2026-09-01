-- Account restriction (compliance wind-down / lock) separate from KYB/KYC verification_status.

create table if not exists public.account_restrictions (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('user', 'business')),
  user_id uuid references public.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete cascade,
  phase text not null default 'wind_down' check (phase in ('wind_down', 'locked')),
  source text not null check (source in ('grid', 'noah', 'office')),
  restricted_at timestamptz not null default now(),
  wind_down_ends_at timestamptz not null,
  locked_at timestamptz,
  lifted_at timestamptz,
  created_by_admin_id uuid references public.admin_users (id) on delete set null,
  reason text,
  partner_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_restrictions_subject_check check (
    (subject_kind = 'user' and user_id is not null and business_id is null)
    or (subject_kind = 'business' and business_id is not null and user_id is null)
  )
);

create unique index if not exists account_restrictions_active_user_uidx
  on public.account_restrictions (user_id)
  where lifted_at is null and subject_kind = 'user';

create unique index if not exists account_restrictions_active_business_uidx
  on public.account_restrictions (business_id)
  where lifted_at is null and subject_kind = 'business';

create index if not exists account_restrictions_lifted_at_idx
  on public.account_restrictions (lifted_at);

do $$
begin
  begin
    alter publication supabase_realtime add table public.account_restrictions;
  exception
    when duplicate_object then null;
    when undefined_table then null;
    when undefined_object then null;
  end;

  begin
    alter table public.account_restrictions replica identity full;
  exception
    when undefined_table then null;
  end;

  begin
    alter table public.account_restrictions enable row level security;
  exception
    when undefined_table then null;
  end;

  begin
    grant select on table public.account_restrictions to authenticated;
  exception
    when undefined_table then null;
    when insufficient_privilege then null;
    when duplicate_object then null;
  end;

  begin
    drop policy if exists office_admin_select on public.account_restrictions;
    create policy office_admin_select on public.account_restrictions
      for select to authenticated
      using (public.is_office_admin());
  exception
    when undefined_table then null;
    when undefined_function then null;
    when duplicate_object then null;
  end;
end $$;
