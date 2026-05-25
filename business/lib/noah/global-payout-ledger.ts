/** Ledger field mapping for Noah global fiat payouts (no @easner/shared imports). */

import type { SupabaseClient } from "@supabase/supabase-js"

export function pendingGlobalPayoutProviderTransactionId(easnerPayoutId: string): string {
  return `global_payout_pending:${easnerPayoutId}`
}

export function isNoahGlobalPayoutSellTx(tx: Record<string, unknown>): boolean {
  if (String(tx.Direction ?? "").toUpperCase() !== "OUT") return false
  if (!tx.FiatPayment || typeof tx.FiatPayment !== "object") return false
  return Boolean(String(tx.CryptoCurrency ?? "").trim())
}

export function settlementWalletCurrencyForNoahCrypto(crypto: string): string {
  const c = crypto.trim().toUpperCase()
  if (c.includes("USDC") || c === "USD") return "USD"
  if (c.includes("EURC") || c === "EUR") return "EUR"
  return c
}

function pickPositiveAmount(raw: unknown): number | null {
  const n = Math.abs(parseFloat(String(raw ?? "")))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function pickNoahCryptoDebitAmount(tx: Record<string, unknown>): number | null {
  for (const key of ["CryptoAmount", "Amount", "CryptoAuthorizedAmount", "TotalAmount"]) {
    const n = pickPositiveAmount(tx[key])
    if (n != null) return n
  }
  const cp = tx.CryptoPayment as Record<string, unknown> | undefined
  if (cp) {
    const n = pickPositiveAmount(cp.Amount ?? cp.amount)
    if (n != null) return n
  }
  return null
}

export type NoahGlobalPayoutLedgerFields = {
  amount: number
  currency: string
  baseCurrency: string
  asset: string | null
  receiveAmount: number
  receiveCurrency: string
}

/**
 * Ledger columns for global fiat payouts:
 * - amount/currency/base_* = wallet debit (USD balance / USDC settlement)
 * - receiveAmount/receiveCurrency = beneficiary fiat (NGN, etc.)
 */
export function pickNoahGlobalPayoutLedgerFields(
  tx: Record<string, unknown>,
  hints?: { cryptoAuthorizedAmount?: string; sourceBalanceCurrency?: string },
): NoahGlobalPayoutLedgerFields {
  const fp = tx.FiatPayment as Record<string, unknown> | undefined
  const receiveAmount = Math.abs(parseFloat(String(fp?.Amount ?? "0")) || 0)
  const receiveCurrency = String(fp?.FiatCurrency ?? "USD").toUpperCase()
  const asset = String(tx.CryptoCurrency ?? "").trim() || null

  let cryptoAmount = pickNoahCryptoDebitAmount(tx)
  if (cryptoAmount == null && hints?.cryptoAuthorizedAmount) {
    cryptoAmount = pickPositiveAmount(hints.cryptoAuthorizedAmount)
  }

  const baseCurrency =
    String(hints?.sourceBalanceCurrency ?? "").trim().toUpperCase() ||
    (asset ? settlementWalletCurrencyForNoahCrypto(asset) : "USD")

  return {
    amount: cryptoAmount ?? 0,
    currency: baseCurrency,
    baseCurrency,
    asset,
    receiveAmount,
    receiveCurrency,
  }
}

export async function findPendingGlobalPayoutByExternalId(
  admin: SupabaseClient,
  externalId: string,
): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const key = String(externalId || "").trim()
  if (!key) return null

  const pendingPtid = pendingGlobalPayoutProviderTransactionId(key)
  const { data: byPtid } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "noah")
    .eq("provider_transaction_id", pendingPtid)
    .maybeSingle()
  if (byPtid?.id) {
    return { id: String(byPtid.id), metadata: (byPtid.metadata || {}) as Record<string, unknown> }
  }

  const { data: byMeta } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "noah")
    .contains("metadata", { easner_payout_id: key })
    .maybeSingle()
  if (byMeta?.id) {
    return { id: String(byMeta.id), metadata: (byMeta.metadata || {}) as Record<string, unknown> }
  }

  return null
}

/** Skip duplicate chain-ingest debit when Turnkey global payout settlement already handled balance. */
export async function findGlobalPayoutSettlementForChainSuppression(
  admin: SupabaseClient,
  input: { turnkeySendStatusId?: string | null; txHash?: string | null },
): Promise<{ easnerPayoutId: string } | null> {
  const tid = String(input.turnkeySendStatusId || "").trim()
  if (tid) {
    const { data } = await admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "turnkey")
      .eq("provider_transaction_id", tid)
      .maybeSingle()
    const meta = (data?.metadata || {}) as Record<string, unknown>
    if (meta.global_payout_settlement_leg === true) {
      const easnerPayoutId = String(meta.easner_payout_id || "").trim()
      if (easnerPayoutId) return { easnerPayoutId }
    }
  }

  const hx = String(input.txHash || "").trim()
  if (hx) {
    const { data } = await admin
      .from("transactions")
      .select("metadata")
      .eq("provider", "turnkey")
      .eq("tx_hash", hx)
      .maybeSingle()
    const meta = (data?.metadata || {}) as Record<string, unknown>
    if (meta.global_payout_settlement_leg === true) {
      const easnerPayoutId = String(meta.easner_payout_id || "").trim()
      if (easnerPayoutId) return { easnerPayoutId }
    }
  }

  return null
}

export async function linkPendingGlobalPayoutToNoahTransactionId(
  admin: SupabaseClient,
  input: { pendingRowId: string; noahTransactionId: string },
): Promise<void> {
  await admin
    .from("transactions")
    .update({
      provider_transaction_id: input.noahTransactionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.pendingRowId)
}
