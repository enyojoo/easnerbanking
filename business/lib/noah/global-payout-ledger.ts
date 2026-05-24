/** Ledger field mapping for Noah global fiat payouts (no @easner/shared imports). */

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
