-- One sweep orchestration row per inbound Grid ACH credit.
create unique index if not exists grid_transfers_va_sweep_inbound_uidx
  on public.grid_transfers ((metadata->>'inbound_grid_transaction_id'))
  where mode = 'va_turnkey_sweep'
    and metadata->>'inbound_grid_transaction_id' is not null;
