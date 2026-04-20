create extension if not exists "pgcrypto";

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null check (from_currency = upper(from_currency) and char_length(from_currency) = 3),
  to_currency text not null check (to_currency = upper(to_currency) and char_length(to_currency) = 3),
  rate numeric(20,10) not null,
  source text not null default 'open_exchange_rates',
  as_of timestamptz not null default now(),
  fee_type text not null default 'free',
  fee_amount numeric(18,6) not null default 0,
  min_amount numeric(18,2),
  max_amount numeric(18,2),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_currency, to_currency)
);

create index if not exists exchange_rates_status_idx on public.exchange_rates (status, updated_at desc);
create index if not exists exchange_rates_as_of_idx on public.exchange_rates (as_of desc);

alter table public.transactions
  add column if not exists provider_transaction_id text,
  add column if not exists provider_event_id text,
  add column if not exists tx_hash text,
  add column if not exists wallet_address text,
  add column if not exists asset text,
  add column if not exists chain text,
  add column if not exists counterparty_address text,
  add column if not exists occurred_at timestamptz,
  add column if not exists settled_at timestamptz,
  add column if not exists amount_minor numeric,
  add column if not exists base_currency text,
  add column if not exists base_amount numeric(18,6),
  add column if not exists fx_rate numeric(20,10),
  add column if not exists fx_rate_as_of timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'noah_transaction_id'
  ) then
    update public.transactions
    set provider_transaction_id = noah_transaction_id
    where provider_transaction_id is null
      and noah_transaction_id is not null;
  end if;
end
$$;

update public.transactions
set occurred_at = coalesce(occurred_at, created_at)
where occurred_at is null;

drop index if exists idx_transactions_provider_txid_unique;
drop index if exists idx_noah_transactions_txid_unique;
drop index if exists transactions_noah_transaction_id_idx;

create unique index if not exists transactions_provider_transaction_unique
  on public.transactions using btree (provider, provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists transactions_business_occurred_at_idx
  on public.transactions using btree (business_id, occurred_at desc nulls last);

create index if not exists transactions_user_occurred_at_idx
  on public.transactions using btree (user_id, occurred_at desc nulls last);

create index if not exists transactions_provider_event_id_idx
  on public.transactions using btree (provider, provider_event_id)
  where provider_event_id is not null;

create index if not exists transactions_tx_hash_idx
  on public.transactions using btree (tx_hash)
  where tx_hash is not null;

alter table public.transactions
  drop column if exists noah_transaction_id;
