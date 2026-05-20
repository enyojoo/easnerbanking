/** Extract Solana settlement signature from Noah ledger rows / API payloads. */

export function pickNoahOnChainTxHashFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>
  const h = p.TxHash ?? p.TransactionHash ?? p.txHash ?? p.Hash ?? p.PublicID
  return h != null && String(h).trim() ? String(h).trim() : null
}

export function pickNoahOnChainTxHashFromLedgerRow(row: {
  tx_hash?: unknown
  payload?: unknown
  metadata?: unknown
}): string | null {
  const fromCol = String(row.tx_hash ?? "").trim()
  if (fromCol) return fromCol

  const meta = row.metadata as Record<string, unknown> | undefined
  const fromMeta =
    typeof meta?.noah_on_chain_tx_hash === "string" ? meta.noah_on_chain_tx_hash.trim() : ""
  if (fromMeta) return fromMeta

  return pickNoahOnChainTxHashFromPayload(row.payload)
}
