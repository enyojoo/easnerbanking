-- YC fund_balance rows where ledger was credited but USDC never reached the user vault.
-- Step 1: preview stranded omnibus USDC (e.g. ETID25261407).

select
  t.easner_transaction_id as etid,
  y.id as yc_transfer_id,
  y.status as transfer_status,
  y.omnibus_in_actual,
  y.metadata->>'usd_credit_applied' as usd_credit_applied,
  y.metadata->>'leg1_omnibus_tx_hash' as leg1_omnibus_tx_hash,
  y.metadata->>'user_vault_tx_hash' as user_vault_tx_hash,
  y.metadata->>'fee_wallet_sweep_tx_hash' as fee_wallet_sweep_tx_hash,
  y.metadata->>'balance_delta_applied' as balance_delta_applied,
  t.id as transaction_id,
  t.user_id,
  t.business_id,
  t.amount,
  t.status as tx_status,
  t.tx_hash as tx_on_chain_hash,
  t.updated_at
from public.yc_transfers y
join public.transactions t on t.id = y.transaction_id
where y.mode = 'fund_balance'
  and y.status = 'completed'
  and coalesce(t.metadata->>'balance_delta_applied', 'false') = 'true'
  and coalesce(y.metadata->>'user_vault_tx_hash', '') = ''
order by y.updated_at desc;

-- Step 2 (manual ops — do NOT run as blind SQL UPDATE):
-- For each row above, send `usd_credit_applied` USDC from the deposit omnibus to the user's
-- active Turnkey USDC Solana address. Do NOT re-apply wallet_balances credit when
-- wallet_balance_credit_key is already set.
--
-- After the on-chain send:
--   update yc_transfers.metadata with user_vault_tx_hash / fund_balance_split_status = completed
--   update transactions.tx_hash to the user vault inbound hash (not the omnibus hash)
--
-- Example ETID25261407: ~1.781872 USDC to user vault; fee (~0.02474) was already swept.
