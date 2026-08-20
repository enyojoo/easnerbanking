/** Columns for transaction list feeds (no `payload` – labels come from `metadata`). */
export const LEDGER_LIST_SELECT =
  "id, easner_transaction_id, provider, provider_transaction_id, status, amount, currency, direction, metadata, created_at, updated_at, occurred_at, settled_at, tx_hash, wallet_address, counterparty_address, asset, chain, base_currency, base_amount, hidden_from_feed"

/** Full row for detail views and webhook upserts. */
export const LEDGER_DETAIL_SELECT =
  "id, easner_transaction_id, provider, provider_transaction_id, status, amount, currency, direction, metadata, payload, created_at, updated_at, occurred_at, settled_at, tx_hash, wallet_address, counterparty_address, asset, chain, base_currency, base_amount, hidden_from_feed"

/** Office admin list – metadata only, includes scope columns for joins. */
export const OFFICE_LEDGER_LIST_SELECT =
  "id, user_id, business_id, provider, provider_transaction_id, provider_event_id, easner_transaction_id, status, amount, currency, direction, metadata, created_at, updated_at, occurred_at, settled_at, tx_hash, wallet_address, asset, chain, counterparty_address, base_currency, base_amount, hidden_from_feed"
