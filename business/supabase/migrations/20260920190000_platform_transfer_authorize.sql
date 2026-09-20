-- Customer-authorized send: merchant creates the transfer; confirm uses a hashed client_secret.

alter table public.platform_transfers
  add column if not exists client_secret_hash text,
  add column if not exists expires_at timestamptz,
  add column if not exists authorized_at timestamptz,
  add column if not exists customer_id text;

create index if not exists platform_transfers_secret_hash_idx
  on public.platform_transfers (client_secret_hash)
  where client_secret_hash is not null;
