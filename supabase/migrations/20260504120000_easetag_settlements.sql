-- Chain settlement tracking for Easetag P2P (Turnkey Solana SPL), keyed by deterministic transfer_group_id.

create table if not exists public.easetag_settlements (
  transfer_group_id uuid primary key,
  idempotency_key text not null unique,
  status text not null check (status in ('pending', 'submitted', 'settled', 'failed')),
  sender_user_id uuid not null,
  sender_business_id uuid null,
  payee_user_id uuid not null,
  payee_business_id uuid null,
  amount numeric(20, 8) not null,
  currency text not null check (currency in ('USD', 'EUR')),
  asset text not null check (asset in ('USDC', 'EURC')),
  turnkey_send_status_id text null,
  tx_hash text null,
  error text null,
  debit_provider_transaction_id text null,
  credit_provider_transaction_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists easetag_settlements_turnkey_send_idx
  on public.easetag_settlements (turnkey_send_status_id)
  where turnkey_send_status_id is not null;

create index if not exists easetag_settlements_tx_hash_idx
  on public.easetag_settlements (tx_hash)
  where tx_hash is not null;

create index if not exists easetag_settlements_status_updated_idx
  on public.easetag_settlements (status, updated_at desc);

comment on table public.easetag_settlements is
  'Turnkey Solana settlement for Easetag P2P; ledger moves in executeEasetagTransfer, chain settles async.';
