-- Outbound compliance: inbound events, velocity controls, trigger log, daily limit overrides.

create table if not exists public.wallet_send_inbound_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  amount_usd numeric not null check (amount_usd > 0),
  source text not null check (source in ('grid_va', 'grid_fund_balance', 'noah_bank_onramp', 'on_chain')),
  transaction_id uuid,
  credit_key text,
  credited_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists wallet_send_inbound_events_credit_key_uidx
  on public.wallet_send_inbound_events (business_id, credit_key)
  where credit_key is not null;

create unique index if not exists wallet_send_inbound_events_transaction_uidx
  on public.wallet_send_inbound_events (business_id, transaction_id)
  where transaction_id is not null;

create index if not exists wallet_send_inbound_events_business_credited_idx
  on public.wallet_send_inbound_events (business_id, credited_at desc);

create table if not exists public.wallet_send_velocity_controls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  trigger_reason text not null,
  inbound_total_usd numeric not null check (inbound_total_usd >= 0),
  max_send_usd numeric not null check (max_send_usd >= 0),
  cap_pct numeric not null default 20,
  sent_usd numeric not null default 0 check (sent_usd >= 0),
  mode text not null default 'shadow' check (mode in ('shadow', 'enforce')),
  triggered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lifted_at timestamptz,
  lifted_by_admin_id uuid references public.admin_users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wallet_send_velocity_controls_active_uidx
  on public.wallet_send_velocity_controls (business_id)
  where lifted_at is null;

create index if not exists wallet_send_velocity_controls_expires_idx
  on public.wallet_send_velocity_controls (expires_at);

create table if not exists public.wallet_send_velocity_trigger_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  control_id uuid references public.wallet_send_velocity_controls (id) on delete set null,
  trigger_reason text not null,
  inbound_total_usd numeric not null,
  triggered_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists wallet_send_velocity_trigger_log_business_idx
  on public.wallet_send_velocity_trigger_log (business_id, triggered_at desc);

create table if not exists public.wallet_send_limit_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  rail text not null check (rail in ('stablecoin', 'fiat_payout')),
  daily_max_usd numeric not null check (daily_max_usd >= 0),
  expires_at timestamptz,
  reason text,
  created_by_admin_id uuid references public.admin_users (id) on delete set null,
  lifted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wallet_send_limit_overrides_active_uidx
  on public.wallet_send_limit_overrides (business_id, rail)
  where lifted_at is null;

do $$
begin
  begin
    alter publication supabase_realtime add table public.wallet_send_velocity_controls;
  exception
    when duplicate_object then null;
    when undefined_table then null;
    when undefined_object then null;
  end;

  begin
    alter table public.wallet_send_inbound_events replica identity full;
    alter table public.wallet_send_velocity_controls replica identity full;
    alter table public.wallet_send_velocity_trigger_log replica identity full;
    alter table public.wallet_send_limit_overrides replica identity full;
  exception
    when undefined_table then null;
  end;

  begin
    alter table public.wallet_send_inbound_events enable row level security;
    alter table public.wallet_send_velocity_controls enable row level security;
    alter table public.wallet_send_velocity_trigger_log enable row level security;
    alter table public.wallet_send_limit_overrides enable row level security;
  exception
    when undefined_table then null;
  end;

  begin
    grant select on table public.wallet_send_inbound_events to authenticated;
    grant select on table public.wallet_send_velocity_controls to authenticated;
    grant select on table public.wallet_send_velocity_trigger_log to authenticated;
    grant select on table public.wallet_send_limit_overrides to authenticated;
  exception
    when undefined_table then null;
    when insufficient_privilege then null;
    when duplicate_object then null;
  end;

  begin
    drop policy if exists office_admin_select on public.wallet_send_inbound_events;
    create policy office_admin_select on public.wallet_send_inbound_events
      for select to authenticated
      using (public.is_office_admin());
    drop policy if exists office_admin_select on public.wallet_send_velocity_controls;
    create policy office_admin_select on public.wallet_send_velocity_controls
      for select to authenticated
      using (public.is_office_admin());
    drop policy if exists office_admin_select on public.wallet_send_velocity_trigger_log;
    create policy office_admin_select on public.wallet_send_velocity_trigger_log
      for select to authenticated
      using (public.is_office_admin());
    drop policy if exists office_admin_select on public.wallet_send_limit_overrides;
    create policy office_admin_select on public.wallet_send_limit_overrides
      for select to authenticated
      using (public.is_office_admin());
  exception
    when undefined_table then null;
    when undefined_function then null;
    when duplicate_object then null;
  end;
end $$;
