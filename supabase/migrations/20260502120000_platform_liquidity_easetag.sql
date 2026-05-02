-- Easetag P2P: internal ledger RPC. Pool Solana addresses: set PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_USD / _EUR (see business/lib/liquidity/platform-pool.ts).

create table if not exists public.liquidity_sweep_jobs (
  id uuid primary key default gen_random_uuid(),
  wallet_account_id uuid not null references public.wallet_accounts (id) on delete cascade,
  asset text not null,
  amount numeric(24, 8) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  turnkey_send_status_id text,
  last_error text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists liquidity_sweep_jobs_status_created_idx
  on public.liquidity_sweep_jobs (status, created_at);

comment on table public.liquidity_sweep_jobs is
  'Post-deposit USDC/EURC sweep from user wallet_accounts to platform pool; reconciliation is async.';

alter table public.wallet_owners
  drop constraint if exists wallet_owners_owner_type_check;

alter table public.wallet_owners
  add constraint wallet_owners_owner_type_check
  check (owner_type in ('individual', 'business', 'platform'));

comment on column public.wallet_owners.owner_type is
  'platform = pooled liquidity Turnkey owner; individual/business = customer vaults.';

-- Atomic Easetag P2P: wallet_balances + two transactions rows (single DB transaction).
create or replace function public.transfer_easetag_p2p (
  p_idempotency_key text,
  p_amount numeric,
  p_currency text,
  p_sender_user_id uuid,
  p_sender_business_id uuid,
  p_payee_user_id uuid,
  p_payee_business_id uuid,
  p_payee_easetag text,
  p_transfer_group_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
  v_key text;
  v_out_id text;
  v_in_id text;
  v_now timestamptz := now();
  v_sender_avail numeric;
  v_sender_row_id uuid;
  v_sender_ver bigint;
  v_payee_row_id uuid;
  v_payee_ver bigint;
begin
  v_key := nullif(trim(p_idempotency_key), '');
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  end if;

  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  v_currency := upper(trim(p_currency));
  if v_currency not in ('USD', 'EUR') then
    return jsonb_build_object('ok', false, 'error', 'invalid_currency');
  end if;

  v_out_id := v_key || ':out';
  v_in_id := v_key || ':in';

  if exists (
    select 1 from public.transactions t
    where t.provider = 'easner_internal' and t.provider_transaction_id = v_out_id
  ) then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'transfer_group_id', p_transfer_group_id::text,
      'debit_provider_transaction_id', v_out_id,
      'credit_provider_transaction_id', v_in_id
    );
  end if;

  if p_sender_business_id is not null then
    select wb.id, wb.available_balance, wb.version
      into v_sender_row_id, v_sender_avail, v_sender_ver
    from public.wallet_balances wb
    where wb.business_id = p_sender_business_id and wb.currency = v_currency
    for update;
  else
    select wb.id, wb.available_balance, wb.version
      into v_sender_row_id, v_sender_avail, v_sender_ver
    from public.wallet_balances wb
    where wb.user_id = p_sender_user_id and wb.business_id is null and wb.currency = v_currency
    for update;
  end if;

  if v_sender_row_id is null then
    return jsonb_build_object('ok', false, 'error', 'sender_balance_row_missing');
  end if;

  if coalesce(v_sender_avail, 0) < p_amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  end if;

  if p_payee_business_id is not null then
    select wb.id, wb.version into v_payee_row_id, v_payee_ver
    from public.wallet_balances wb
    where wb.business_id = p_payee_business_id and wb.currency = v_currency
    for update;
    if v_payee_row_id is null then
      insert into public.wallet_balances (business_id, user_id, currency, available_balance, version, updated_at)
      values (p_payee_business_id, null, v_currency, 0, 0, v_now)
      returning id, version into v_payee_row_id, v_payee_ver;
    end if;
  else
    select wb.id, wb.version into v_payee_row_id, v_payee_ver
    from public.wallet_balances wb
    where wb.user_id = p_payee_user_id and wb.business_id is null and wb.currency = v_currency
    for update;
    if v_payee_row_id is null then
      insert into public.wallet_balances (business_id, user_id, currency, available_balance, version, updated_at)
      values (null, p_payee_user_id, v_currency, 0, 0, v_now)
      returning id, version into v_payee_row_id, v_payee_ver;
    end if;
  end if;

  update public.wallet_balances
  set
    available_balance = available_balance - p_amount,
    version = coalesce(version, 0) + 1,
    updated_at = v_now
  where id = v_sender_row_id;

  update public.wallet_balances
  set
    available_balance = available_balance + p_amount,
    version = coalesce(version, 0) + 1,
    updated_at = v_now
  where id = v_payee_row_id;

  insert into public.transactions (
    user_id,
    business_id,
    provider,
    provider_transaction_id,
    status,
    amount,
    currency,
    direction,
    metadata,
    occurred_at,
    settled_at,
    base_currency,
    updated_at
  ) values (
    p_sender_user_id,
    p_sender_business_id,
    'easner_internal',
    v_out_id,
    'settled',
    p_amount,
    v_currency,
    'out',
    jsonb_build_object(
      'source', 'easetag_p2p',
      'transfer_group_id', p_transfer_group_id::text,
      'payee_easetag', p_payee_easetag,
      'payee_user_id', p_payee_user_id::text,
      'payee_business_id', case when p_payee_business_id is null then null else p_payee_business_id::text end
    ),
    v_now,
    v_now,
    v_currency,
    v_now
  );

  insert into public.transactions (
    user_id,
    business_id,
    provider,
    provider_transaction_id,
    status,
    amount,
    currency,
    direction,
    metadata,
    occurred_at,
    settled_at,
    base_currency,
    updated_at
  ) values (
    p_payee_user_id,
    p_payee_business_id,
    'easner_internal',
    v_in_id,
    'settled',
    p_amount,
    v_currency,
    'in',
    jsonb_build_object(
      'source', 'easetag_p2p',
      'transfer_group_id', p_transfer_group_id::text,
      'payee_easetag', p_payee_easetag,
      'sender_user_id', p_sender_user_id::text,
      'sender_business_id', case when p_sender_business_id is null then null else p_sender_business_id::text end
    ),
    v_now,
    v_now,
    v_currency,
    v_now
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'transfer_group_id', p_transfer_group_id::text,
    'debit_provider_transaction_id', v_out_id,
    'credit_provider_transaction_id', v_in_id
  );
end;
$$;

revoke all on function public.transfer_easetag_p2p (
  text,
  numeric,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  uuid
) from public;

grant execute on function public.transfer_easetag_p2p (
  text,
  numeric,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  uuid
) to service_role;

-- Pool: configure PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_USD and/or PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_EUR on the app host.
