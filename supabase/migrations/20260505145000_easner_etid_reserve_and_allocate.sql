-- Easetag P2P: global ETID uniqueness (transactions + active reservations), optional reserved debit ETID,
-- and reservation rows so preview IDs match persisted debit legs.

drop function if exists public.transfer_easetag_p2p (
  text,
  numeric,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  uuid
);

create table if not exists public.easner_etid_reservations (
  etid text not null primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists easner_etid_reservations_user_expires_idx
  on public.easner_etid_reservations (user_id, expires_at);

comment on table public.easner_etid_reservations is
  'Short-lived holds on ETID strings until transfer_easetag_p2p consumes them or expiry; enables server-issued preview ETIDs.';

create or replace function public.allocate_unique_easner_transaction_id(p_exclude text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  attempts int := 0;
begin
  delete from public.easner_etid_reservations where expires_at <= now();

  loop
    attempts := attempts + 1;
    if attempts > 100000 then
      raise exception 'allocate_unique_easner_transaction_id: exhausted attempts';
    end if;
    candidate := 'ETID' || lpad((floor(random() * 100000000)::bigint)::text, 8, '0');
    continue when p_exclude is not null and candidate = p_exclude;
    exit when not exists (
      select 1
      from public.transactions t
      where trim(coalesce(t.easner_transaction_id, '')) = candidate
        or trim(coalesce(t.metadata ->> 'easner_transaction_id', '')) = candidate
    )
    and not exists (
      select 1
      from public.easner_etid_reservations r
      where r.etid = candidate
        and r.expires_at > now()
    );
  end loop;
  return candidate;
end;
$$;

create or replace function public.reserve_easner_transaction_id(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etid text;
  attempts int := 0;
begin
  if p_user_id is null then
    raise exception 'reserve_easner_transaction_id: user required';
  end if;

  loop
    attempts := attempts + 1;
    if attempts > 1000 then
      raise exception 'reserve_easner_transaction_id: exhausted attempts';
    end if;
    v_etid := public.allocate_unique_easner_transaction_id(null);
    begin
      insert into public.easner_etid_reservations (etid, user_id, expires_at)
      values (v_etid, p_user_id, now() + interval '15 minutes');
      return v_etid;
    exception
      when unique_violation then
        null;
    end;
  end loop;
end;
$$;

create or replace function public.transfer_easetag_p2p (
  p_idempotency_key text,
  p_amount numeric,
  p_currency text,
  p_sender_user_id uuid,
  p_sender_business_id uuid,
  p_payee_user_id uuid,
  p_payee_business_id uuid,
  p_payee_easetag text,
  p_transfer_group_id uuid,
  p_reserved_debit_etid text default null
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
  v_sender_easetag text;
  v_reserved text;
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

  if p_sender_business_id is not null then
    select b.easetag into v_sender_easetag
    from public.businesses b
    where b.id = p_sender_business_id;
  else
    select u.easetag into v_sender_easetag
    from public.users u
    where u.id = p_sender_user_id;
  end if;

  v_reserved := nullif(trim(p_reserved_debit_etid), '');
  if v_reserved is not null then
    v_etid_out := upper(v_reserved);
    if v_etid_out !~ '^ETID[0-9]{8}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_reserved_debit_etid');
    end if;
    if not exists (
      select 1 from public.easner_etid_reservations r
      where r.etid = v_etid_out
        and r.user_id = p_sender_user_id
        and r.expires_at > now()
    ) then
      return jsonb_build_object('ok', false, 'error', 'reserved_debit_etid_not_found');
    end if;
    if exists (
      select 1 from public.transactions t
      where trim(coalesce(t.easner_transaction_id, '')) = v_etid_out
        or trim(coalesce(t.metadata ->> 'easner_transaction_id', '')) = v_etid_out
    ) then
      return jsonb_build_object('ok', false, 'error', 'reserved_debit_etid_already_used');
    end if;
  else
    v_etid_out := public.allocate_unique_easner_transaction_id(null);
  end if;

  v_etid_in := public.allocate_unique_easner_transaction_id(v_etid_out);

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
      'sender_business_id', case when p_sender_business_id is null then null else p_sender_business_id::text end,
      'sender_easetag', v_sender_easetag
    ),
    v_now,
    v_now,
    v_currency,
    v_now
  );

  delete from public.easner_etid_reservations r
  where r.etid = v_etid_out
    and r.user_id = p_sender_user_id;

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

revoke all on function public.allocate_unique_easner_transaction_id (text) from public;
grant execute on function public.allocate_unique_easner_transaction_id (text) to service_role;

revoke all on function public.reserve_easner_transaction_id (uuid) from public;
grant execute on function public.reserve_easner_transaction_id (uuid) to service_role;

revoke all on function public.transfer_easetag_p2p (
  text,
  numeric,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text
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
  uuid,
  text
) to service_role;
