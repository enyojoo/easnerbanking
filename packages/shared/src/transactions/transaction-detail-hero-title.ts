import { formatDisplayPersonName } from "../format-display-name"
import { isEasetagReceiveTitle, isEasnerProductReceiveTitle, isEasnerProductSendTitle } from "./product-label"

export type TransactionDetailHeroTitleInput = {
  direction: "in" | "out"
  counterpartyName?: string | null
  productFallback?: string | null
}

/** Canonical payout title used by both transaction lists and detail heroes. */
export function formatOutboundTransferTitle(
  recipientName?: string | null,
  fallbackRecipient = "Recipient",
): string {
  const normalizedRecipient = String(recipientName ?? "")
    .trim()
    .replace(/^Transfer to\s+/i, "")
  const explicitRecipient =
    normalizedRecipient && !isEasnerProductSendTitle(normalizedRecipient)
      ? normalizedRecipient
      : null
  const name =
    formatDisplayPersonName(explicitRecipient) ||
    formatDisplayPersonName(fallbackRecipient) ||
    "Recipient"
  return name
}

/** Detail hero copy — web + mobile (not list rows or push body). */
export function formatTransactionDetailHeroTitle(input: TransactionDetailHeroTitleInput): string {
  const raw = String(input.counterpartyName ?? "").trim()
  const normalizedOutboundName = raw.replace(/^Transfer to\s+/i, "")
  if (
    input.direction === "out" &&
    !/^Transfer to\s+/i.test(raw) &&
    isEasnerProductSendTitle(raw)
  ) return raw
  if (input.direction === "in" && isEasetagReceiveTitle(raw)) return raw

  const inboundRaw = String(input.counterpartyName ?? "")
    .trim()
    .replace(/^Deposit from\s+/i, "")
  const name = formatDisplayPersonName(
    input.direction === "out" ? normalizedOutboundName : inboundRaw,
  )
  if (input.direction === "out") {
    return name || String(input.productFallback || "Transfer").trim() || "Transfer"
  }
  const productFallback = String(input.productFallback || "Bank Deposit").trim() || "Bank Deposit"
  if (name && !isEasnerProductReceiveTitle(inboundRaw)) {
    return name
  }
  if (isEasnerProductReceiveTitle(productFallback)) return productFallback
  return productFallback
}
