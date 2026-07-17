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
  const explicitRecipient =
    recipientName && !isEasnerProductSendTitle(recipientName)
      ? recipientName
      : null
  const name =
    formatDisplayPersonName(explicitRecipient) ||
    formatDisplayPersonName(fallbackRecipient) ||
    "Recipient"
  return `Transfer to ${name}`
}

/** Detail hero copy — web + mobile (not list rows or push body). */
export function formatTransactionDetailHeroTitle(input: TransactionDetailHeroTitleInput): string {
  const raw = String(input.counterpartyName ?? "").trim()
  if (input.direction === "out" && isEasnerProductSendTitle(raw)) return raw
  if (input.direction === "in" && isEasetagReceiveTitle(raw)) return raw

  const name = formatDisplayPersonName(input.counterpartyName)
  if (input.direction === "out") {
    return name ? `Transfer to ${name}` : String(input.productFallback || "Transfer").trim() || "Transfer"
  }
  const productFallback = String(input.productFallback || "Bank Deposit").trim() || "Bank Deposit"
  if (name && !isEasnerProductReceiveTitle(input.counterpartyName)) {
    return `Deposit from ${name}`
  }
  if (isEasnerProductReceiveTitle(productFallback)) return productFallback
  return productFallback
}
