-- Add first-class Easner transaction id column and backfill existing rows.
alter table public.transactions
  add column if not exists easner_transaction_id text;

-- Backfill from metadata if present, else deterministically derive from timestamp.
update public.transactions
set easner_transaction_id = coalesce(
  nullif(metadata ->> 'easner_transaction_id', ''),
  'ETID' || right(((extract(epoch from coalesce(occurred_at, created_at, now())) * 1000)::bigint)::text, 8)
)
where coalesce(easner_transaction_id, '') = '';

-- Keep metadata + column aligned for older rows.
update public.transactions
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{easner_transaction_id}',
  to_jsonb(easner_transaction_id),
  true
)
where easner_transaction_id is not null
  and coalesce(metadata ->> 'easner_transaction_id', '') = '';

create index if not exists transactions_easner_transaction_id_idx
  on public.transactions using btree (easner_transaction_id);
