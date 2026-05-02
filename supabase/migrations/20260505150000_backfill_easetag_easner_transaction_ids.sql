-- Easetag P2P (easner_internal): clear bogus easner_transaction_id, assign distinct ETIDs per debit/credit leg,
-- and backfill sender_easetag on inbound rows when missing.
--
-- Requires `allocate_unique_easner_transaction_id` from migration `20260505145000_easner_etid_reserve_and_allocate.sql`.

update public.transactions
set easner_transaction_id = null
where easner_transaction_id is not null
  and trim(lower(easner_transaction_id)) in ('null', '');

do $$
declare
  tg text;
  id_out uuid;
  id_in uuid;
  et_out text;
  et_in text;
begin
  for tg in
    select distinct (t.metadata ->> 'transfer_group_id')::text
    from public.transactions t
    where t.provider = 'easner_internal'
      and coalesce(t.metadata ->> 'source', '') = 'easetag_p2p'
      and (t.metadata ->> 'transfer_group_id') is not null
      and trim(t.metadata ->> 'transfer_group_id') <> ''
  loop
    select t.id
    into id_out
    from public.transactions t
    where t.provider = 'easner_internal'
      and t.metadata ->> 'transfer_group_id' = tg
      and t.direction = 'out'
    limit 1;

    select t.id
    into id_in
    from public.transactions t
    where t.provider = 'easner_internal'
      and t.metadata ->> 'transfer_group_id' = tg
      and t.direction = 'in'
    limit 1;

    if id_out is null or id_in is null then
      continue;
    end if;

    et_out := public.allocate_unique_easner_transaction_id(null);
    et_in := public.allocate_unique_easner_transaction_id(et_out);

    update public.transactions
    set
      easner_transaction_id = case direction
        when 'out' then et_out
        when 'in' then et_in
        else easner_transaction_id
      end,
      metadata =
        coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'easner_transaction_id',
          case direction
            when 'out' then et_out
            when 'in' then et_in
          end
        )
    where id in (id_out, id_in)
      and (
        easner_transaction_id is null
        or trim(lower(easner_transaction_id)) in ('null', '')
      );
  end loop;
end;
$$;

-- Inbound credit: sender easetag from business when sender_business_id is set
update public.transactions t
set metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object('sender_easetag', b.easetag)
from public.businesses b
where t.provider = 'easner_internal'
  and coalesce(t.metadata ->> 'source', '') = 'easetag_p2p'
  and t.direction = 'in'
  and (t.metadata ->> 'sender_easetag') is null
  and nullif(trim(t.metadata ->> 'sender_business_id'), '') is not null
  and b.id::text = trim(t.metadata ->> 'sender_business_id');

-- Inbound credit: sender easetag from user when individual sender
update public.transactions t
set metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object('sender_easetag', u.easetag)
from public.users u
where t.provider = 'easner_internal'
  and coalesce(t.metadata ->> 'source', '') = 'easetag_p2p'
  and t.direction = 'in'
  and (t.metadata ->> 'sender_easetag') is null
  and nullif(trim(t.metadata ->> 'sender_user_id'), '') is not null
  and u.id::text = trim(t.metadata ->> 'sender_user_id');
