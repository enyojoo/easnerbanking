-- Yellowcard transfer orchestration (cross-border, fund_balance, balance_payout).

create table if not exists public.yc_transfers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions(id) on delete set null,
  user_id uuid not null,
  business_id uuid,
  mode text not null check (mode in ('fund_balance', 'balance_payout', 'cross_border_send')),
  status text not null default 'pending',
  pay_in_currency text,
  receive_currency text,
  quoted_pay_in numeric,
  quoted_receive numeric,
  customer_rate numeric,
  leg1_sequence_id text,
  leg1_yc_id text,
  leg1_channel_id text,
  leg1_status text,
  leg2_sequence_id text,
  leg2_yc_id text,
  leg2_channel_id text,
  leg2_status text,
  omnibus_in_actual numeric,
  fee_wallet_sweep numeric,
  bank_info jsonb,
  settlement_info jsonb,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists yc_transfers_user_id_idx on public.yc_transfers (user_id);
create index if not exists yc_transfers_leg1_seq_idx on public.yc_transfers (leg1_sequence_id);
create index if not exists yc_transfers_leg2_seq_idx on public.yc_transfers (leg2_sequence_id);
create index if not exists yc_transfers_transaction_id_idx on public.yc_transfers (transaction_id);
create index if not exists yc_transfers_status_idx on public.yc_transfers (status);

comment on table public.yc_transfers is
  'YC product orchestration: fund_balance, balance_payout, cross_border_send. cross_border_send may use status leg2_quoted for split leg2 draft sessions.';
