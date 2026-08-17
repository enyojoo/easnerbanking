-- USD ↔ EUR balance convert sessions (Relay USDC ↔ EURC on Solana).

create table if not exists public.balance_convert_sessions (
  id uuid primary key,
  wallet_owner_id uuid not null references public.wallet_owners (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  direction text not null check (direction in ('usd_to_eur', 'eur_to_usd')),
  source_amount numeric not null check (source_amount > 0),
  destination_amount numeric,
  relay_request_id text,
  status text not null default 'quoted'
    check (status in ('quoted', 'executed', 'settled', 'failed', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists balance_convert_sessions_relay_request_id_idx
  on public.balance_convert_sessions (relay_request_id)
  where relay_request_id is not null;

create index if not exists balance_convert_sessions_status_updated_idx
  on public.balance_convert_sessions (status, updated_at);

comment on table public.balance_convert_sessions is
  'Quoted and executed USD↔EUR balance convert sessions (Relay swap between Turnkey vaults).';
