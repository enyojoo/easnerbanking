import { formatAccountBalanceLabel } from "../review-row-labels"

export type BalanceMoveDirection = "usd_to_eur" | "eur_to_usd"

export type BalanceMoveReviewSnapshot = {
  source_amount: number
  source_currency: string
  destination_amount: number
  destination_currency: string
  exchange_rate: number
  processing_fee: number
  total_debited: number
  debited_from_label: string
  credited_to_label: string
}

export const BALANCE_CONVERT_MIN_SOURCE_AMOUNT = 10

export function isBalanceConvertMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta) return false
  if (String(meta.flow ?? "").trim().toLowerCase() === "balance_convert") return true
  if (String(meta.activity_type ?? "").trim().toLowerCase() === "balance_convert") return true
  return normalizeBalanceMoveReviewSnapshot(meta.move_review) != null
}

export function directionFromBalanceMove(
  direction: BalanceMoveDirection,
): { sourceCurrency: "USD" | "EUR"; destCurrency: "USD" | "EUR" } {
  return direction === "usd_to_eur"
    ? { sourceCurrency: "USD", destCurrency: "EUR" }
    : { sourceCurrency: "EUR", destCurrency: "USD" }
}

export function normalizeBalanceMoveReviewSnapshot(
  raw: unknown,
): BalanceMoveReviewSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const sourceAmount = Number(o.source_amount)
  const destinationAmount = Number(o.destination_amount)
  const exchangeRate = Number(o.exchange_rate)
  const totalDebited = Number(o.total_debited)
  const sourceCurrency = String(o.source_currency ?? "").trim().toUpperCase()
  const destCurrency = String(o.destination_currency ?? "").trim().toUpperCase()
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) return null
  if (!Number.isFinite(destinationAmount) || destinationAmount <= 0) return null
  if (!sourceCurrency || !destCurrency) return null
  const processingFee = Number.isFinite(Number(o.processing_fee))
    ? Number(o.processing_fee)
    : 0
  return {
    source_amount: sourceAmount,
    source_currency: sourceCurrency,
    destination_amount: destinationAmount,
    destination_currency: destCurrency,
    exchange_rate: Number.isFinite(exchangeRate) && exchangeRate > 0
      ? exchangeRate
      : destinationAmount / sourceAmount,
    processing_fee: processingFee,
    total_debited: Number.isFinite(totalDebited) && totalDebited > 0
      ? totalDebited
      : sourceAmount,
    debited_from_label:
      String(o.debited_from_label ?? "").trim() ||
      formatAccountBalanceLabel(sourceCurrency),
    credited_to_label:
      String(o.credited_to_label ?? "").trim() ||
      formatAccountBalanceLabel(destCurrency),
  }
}

export function buildBalanceMoveReviewSnapshot(input: {
  direction: BalanceMoveDirection
  sourceAmount: number
  destinationAmount: number
  processingFee?: number
}): BalanceMoveReviewSnapshot {
  const { sourceCurrency, destCurrency } = directionFromBalanceMove(input.direction)
  const processingFee = Math.max(0, Number(input.processingFee ?? 0))
  const sourceAmount = input.sourceAmount
  const destinationAmount = input.destinationAmount
  // Ledger debits source_amount only; Relay fees are embedded in the swap rate.
  return {
    source_amount: sourceAmount,
    source_currency: sourceCurrency,
    destination_amount: destinationAmount,
    destination_currency: destCurrency,
    exchange_rate: destinationAmount / sourceAmount,
    processing_fee: processingFee,
    total_debited: sourceAmount,
    debited_from_label: formatAccountBalanceLabel(sourceCurrency),
    credited_to_label: formatAccountBalanceLabel(destCurrency),
  }
}

export function balanceConvertListProductLabel(): string {
  return "Move between accounts"
}
