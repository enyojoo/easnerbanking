import { isBankOnrampDepositFlow, isYcFundBalanceDepositMetadata } from "@easner/shared"

function mapLedgerStatusForPresentation(status: string): string {
  const st = status.toLowerCase()
  if (st === "settled") return "completed"
  if (st === "pending" || st === "processing") return st
  if (st === "failed" || st === "cancelled") return "failed"
  if (st === "unknown") return "pending"
  return st || "pending"
}

/** Re-apply ledger direction/amount/status after detail enrichers – YC payloads must not become Noah sends. */
export function restoreInboundLedgerPresentation(
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const dirRaw = String(row.direction ?? "").toLowerCase()
  if (dirRaw !== "in") return transaction

  const meta = row.metadata as Record<string, unknown> | null | undefined
  const provider = String(row.provider ?? "").toLowerCase()
  const isYcInbound =
    provider === "yellowcard" ||
    isYcFundBalanceDepositMetadata(meta) ||
    isBankOnrampDepositFlow(meta)
  if (!isYcInbound) return transaction

  const amount =
    typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const currency = String(row.currency ?? "USD")
  const status = mapLedgerStatusForPresentation(String(row.status ?? ""))
  const txMeta = { ...((transaction.metadata as Record<string, unknown> | undefined) ?? {}) }
  const wrappedNoah = txMeta.noah
  if (wrappedNoah && typeof wrappedNoah === "object") {
    const noahPayload = wrappedNoah as Record<string, unknown>
    if (noahPayload.event != null || noahPayload.sequenceId != null) {
      delete txMeta.noah
    }
  }

  const usdCredit =
    typeof meta?.usd_credit === "number"
      ? meta.usd_credit
      : Number(meta?.usd_credit) ||
        Number(meta?.settled_amount) ||
        Number(meta?.posted_amount) ||
        amount

  const localPayIn = Number(meta?.local_pay_in)
  const localCurrency = String(meta?.local_currency ?? "").trim().toUpperCase()
  const showLocalPaidHero =
    isYcFundBalanceDepositMetadata(meta) &&
    Number.isFinite(localPayIn) &&
    localPayIn > 0 &&
    Boolean(localCurrency)

  const resolvedAmount =
    amount > 0
      ? amount
      : usdCredit > 0
        ? usdCredit
        : Number(meta?.settled_amount) || Number(meta?.posted_amount) || amount

  return {
    ...transaction,
    type: "receive",
    transaction_type: "receive",
    direction: "credit",
    amount: resolvedAmount,
    currency,
    status,
    display_amount: showLocalPaidHero ? localPayIn : usdCredit > 0 ? usdCredit : resolvedAmount,
    display_currency: showLocalPaidHero ? localCurrency : currency,
    metadata: txMeta,
  }
}
