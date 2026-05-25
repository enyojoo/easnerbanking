import type { Transaction } from "@/lib/finance-types"
import {
  formatTransactionDetailHeroTitle,
  isEasnerProductReceiveTitle,
  isEasnerProductSendTitle,
} from "@easner/shared"

export function resolveTransactionDetailHeroTitle(transaction: Transaction): string {
  const preset = transaction.displayHeroTitle?.trim()
  if (preset) return preset

  const description = transaction.description?.trim() || ""
  const isCredit = transaction.direction === "credit"
  const isEasetag = transaction.paymentScheme?.toLowerCase() === "easetag"

  if (isEasetag || isEasnerProductSendTitle(description)) {
    return description || (isCredit ? "Easetag Deposit" : "Easetag Transfer")
  }

  if (
    transaction.type === "stablecoin" ||
    description.toLowerCase().startsWith("stablecoin") ||
    String(transaction.collectionChannel ?? "").toLowerCase() === "autopayout"
  ) {
    return description || (isCredit ? "Stablecoin Deposit" : "Stablecoin Transfer")
  }

  const counterparty =
    transaction.counterpartyName?.trim() ||
    (isCredit && description && !isEasnerProductReceiveTitle(description) ? description : "")

  if (counterparty) {
    return formatTransactionDetailHeroTitle({
      direction: isCredit ? "in" : "out",
      counterpartyName: counterparty,
      productFallback: isCredit ? "Bank Deposit" : "Transfer",
    })
  }

  if (description) return description
  return isCredit ? "Bank Deposit" : "Transfer"
}

export function resolveTransactionDetailHeroAmount(transaction: Transaction): {
  amount: number
  currency: string
} {
  const isCredit = transaction.direction === "credit"
  if (
    isCredit &&
    transaction.postedAmount != null &&
    transaction.postedAmount > 0
  ) {
    return {
      amount: transaction.postedAmount,
      currency: transaction.postedCurrency || transaction.displayCurrency || "USD",
    }
  }
  return {
    amount: Math.abs(transaction.amount),
    currency: transaction.displayCurrency || "USD",
  }
}
