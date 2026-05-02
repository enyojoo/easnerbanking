-- Easetag P2P: persist easner_transaction_id on ledger rows and return it from RPC (sender debit ETID).

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
  v_etid_out text;
  v_etid_in text;
  v_existing_etid text;
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
    select t.easner_transaction_id into v_existing_etid
    from public.transactions t
    where t.provider = 'easner_internal' and t.provider_transaction_id = v_out_id
    limit 1;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'transfer_group_id', p_transfer_group_id::text,
      'debit_provider_transaction_id', v_out_id,
      'credit_provider_transaction_id', v_in_id,
      'easner_transaction_id', coalesce(nullif(trim(v_existing_etid), ''), v_out_id)
    );
  end if;

  v_etid_out := 'ETID' || lpad((floor(random() * 100000000)::bigint)::text, 8, '0');
  v_etid_in := 'ETID' || lpad((floor(random() * 100000000)::bigint)::text, 8, '0');
  while v_etid_out = v_etid_in loop
    v_etid_in := 'ETID' || lpad((floor(random() * 100000000)::bigint)::text, 8, '0');
  end loop;

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
    easner_transaction_id,
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
    v_etid_out,
    'settled',
    p_amount,
    v_currency,
    'out',
    jsonb_build_object(
      'source', 'easetag_p2p',
      'easner_transaction_id', v_etid_out,
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
    easner_transaction_id,
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
    v_etid_in,
    'settled',
    p_amount,
    v_currency,
    'in',
    jsonb_build_object(
      'source', 'easetag_p2p',
      'easner_transaction_id', v_etid_in,
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
    'credit_provider_transaction_id', v_in_id,
    'easner_transaction_id', v_etid_out
  );
end;
$$;
