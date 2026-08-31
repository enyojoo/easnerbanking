import type { Transaction } from "@/lib/finance-types"
import {
  formatTransactionDetailHeroTitle,
  isEasnerProductReceiveTitle,
  isEasnerProductSendTitle,
  isEasetagReceiveTitle,
  resolveInboundDepositReceivedAmount,
} from "@easner/shared"

export function resolveTransactionDetailHeroTitle(transaction: Transaction): string {
  const preset = transaction.displayHeroTitle?.trim()
  if (preset) {
    return preset.replace(/^Transfer to\s+/i, "").replace(/^Deposit from\s+/i, "")
  }

  const description = transaction.description?.trim() || ""
  const isCredit = transaction.direction === "credit"
  const isEasetag = transaction.paymentScheme?.toLowerCase() === "easetag"

  if (isEasetag || isEasnerProductSendTitle(description) || isEasetagReceiveTitle(description)) {
    return description.replace(/^Transfer to\s+/i, "") || (isCredit ? "Easetag Received" : "Easetag Transfer")
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
  if (isCredit && transaction.inboundReceive) {
    const paid = resolveInboundDepositReceivedAmount(transaction.inboundReceive)
    if (paid.amount > 0 && paid.currency) {
      return paid
    }
  }
  if (isCredit && transaction.depositReview) {
    const paid = transaction.depositReview.local_pay_in
    const currency = String(transaction.depositReview.local_currency ?? "").trim().toUpperCase()
    if (Number.isFinite(paid) && paid > 0 && currency) {
      return { amount: paid, currency }
    }
  }
  if (
    isCredit &&
    transaction.depositAmount != null &&
    transaction.depositAmount > 0
  ) {
    const reviewCurrency = transaction.depositReview?.local_currency
    const currency =
      (reviewCurrency ? String(reviewCurrency).trim().toUpperCase() : null) ||
      transaction.displayCurrency ||
      transaction.postedCurrency ||
      "USD"
    return {
      amount: transaction.depositAmount,
      currency,
    }
  }
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
