/** Parse Grid money objects (`{ amount, currency: { code, decimals } }`) to major units. */
export function gridMoneyToMajor(raw: unknown): { amount: number; currency: string } | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const amount = Number(row.amount)
  if (!Number.isFinite(amount)) return null

  const currencyObj = row.currency
  const code =
    currencyObj && typeof currencyObj === "object"
      ? String((currencyObj as Record<string, unknown>).code ?? "USD").trim().toUpperCase()
      : "USD"

  const decimalsRaw =
    currencyObj && typeof currencyObj === "object"
      ? Number((currencyObj as Record<string, unknown>).decimals)
      : NaN
  if (Number.isFinite(decimalsRaw) && decimalsRaw > 0) {
    return { amount: amount / 10 ** decimalsRaw, currency: code }
  }

  if (code === "USD" && Number.isInteger(amount) && Math.abs(amount) >= 100) {
    return { amount: amount / 100, currency: code }
  }

  return { amount, currency: code }
}

export function extractGridInboundAmountCents(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null
  const candidates = [
    data.receivedAmount,
    data.receiveAmount,
    data.amount,
    data.quotedReceive,
    (data.destination as Record<string, unknown> | undefined)?.amount,
  ]
  for (const candidate of candidates) {
    const parsed = gridMoneyToMajor(candidate)
    if (!parsed || !(parsed.amount > 0)) continue
    if (parsed.currency === "USD") return Math.round(parsed.amount * 100)
    return Math.round(parsed.amount * 100)
  }
  return null
}

export function extractGridOnChainTxHash(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null
  const reconciliation = data.reconciliationInstructions
  if (reconciliation && typeof reconciliation === "object") {
    const hash = String(
      (reconciliation as Record<string, unknown>).transactionHash ?? "",
    ).trim()
    if (hash) return hash
  }
  const dest = data.destination
  if (dest && typeof dest === "object") {
    const destRec = dest as Record<string, unknown>
    const onChain = destRec.onChainTransaction
    if (onChain && typeof onChain === "object") {
      const nested = String(
        (onChain as Record<string, unknown>).transactionHash ??
          (onChain as Record<string, unknown>).hash ??
          "",
      ).trim()
      if (nested) return nested
    }
    const destHash = String(destRec.transactionHash ?? "").trim()
    if (destHash) return destHash
  }
  const direct = [data.transactionHash, data.txHash, data.onChainTxHash]
  for (const value of direct) {
    const hash = String(value ?? "").trim()
    if (hash) return hash
  }
  return null
}

/** Wallet credit amount in USD ledger terms for a Grid VA inbound webhook. */
export function resolveGridVaInboundWalletCredit(data: Record<string, unknown>): {
  amount: number
  ledgerCurrency: "USD" | "EUR"
  fiatAmount: number
  fiatCurrency: string
} | null {
  const received = gridMoneyToMajor(data.receivedAmount)
  const sent = gridMoneyToMajor(data.sentAmount)

  const stable =
    [received, sent].find((row) => row && ["USD", "USDC", "USDT"].includes(row.currency)) ??
    received ??
    sent
  if (!stable || !(stable.amount > 0)) return null

  const fiat = received ?? stable
  const ledgerCurrency: "USD" | "EUR" =
    stable.currency === "EUR" || stable.currency === "EURC" ? "EUR" : "USD"

  return {
    amount: stable.amount,
    ledgerCurrency,
    fiatAmount: fiat.amount,
    fiatCurrency: fiat.currency,
  }
}
