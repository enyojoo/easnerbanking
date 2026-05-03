-- Drop easner_etid_reservations + reserve_easner_transaction_id (ETID prefetch table).
--
-- Apply ONLY after updating `public.transfer_easetag_p2p` so that:
--   • When `p_reserved_debit_etid` is NULL or omitted, the function allocates the
--     sender-facing `easner_transaction_id` inside the same transaction as the debit
--     (sequence / generator), with no lookup in this table.
--   • Any branch that validated rows in `easner_etid_reservations` is removed.
--
-- Until that RPC change is deployed, dropping this table will break ledger P2P sends.

drop index if exists public.easner_etid_reservations_user_expires_idx;

drop table if exists public.easner_etid_reservations;

drop function if exists public.reserve_easner_transaction_id(uuid);
