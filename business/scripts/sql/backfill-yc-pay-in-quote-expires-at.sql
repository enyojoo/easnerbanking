-- Backfill quote_expires_at on YC pay-in transactions from yc_transfers.expires_at.
-- Safe to re-run: only updates rows missing quote_expires_at in metadata.

update public.transactions t
set metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
  'quote_expires_at', yt.expires_at
)
from public.yc_transfers yt
where yt.transaction_id = t.id
  and yt.expires_at is not null
  and coalesce(t.metadata->>'quote_expires_at', '') = ''
  and coalesce(t.metadata->>'yc_mode', '') in ('fund_balance', 'cross_border_send');

-- Optional: backfill yc_bank_info when missing on the transaction but present on the transfer.
update public.transactions t
set metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
  'yc_bank_info', yt.bank_info
)
from public.yc_transfers yt
where yt.transaction_id = t.id
  and yt.bank_info is not null
  and jsonb_typeof(yt.bank_info) = 'object'
  and coalesce(t.metadata->>'yc_mode', '') in ('fund_balance', 'cross_border_send')
  and (t.metadata->'yc_bank_info') is null;
