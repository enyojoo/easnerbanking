import { formatDisplayPersonName } from "../format-display-name"
import { isEasetagReceiveTitle, isEasnerProductSendTitle } from "./product-label"

export type TransactionDetailHeroTitleInput = {
  direction: "in" | "out"
  counterpartyName?: string | null
  productFallback?: string | null
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
  return name
    ? `Deposit from ${name}`
    : String(input.productFallback || "Bank Deposit").trim() || "Bank Deposit"
}
