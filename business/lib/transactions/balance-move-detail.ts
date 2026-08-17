import {
  balanceConvertListProductLabel,
  formatTransactionDetailHeroTitle,
  normalizeBalanceMoveReviewSnapshot,
  type BalanceMoveReviewSnapshot,
} from "@easner/shared"
import { resolveLedgerWhenAtFromRow } from "@/lib/ledger/ledger-occurred-at"

export function isBalanceConvertOutRow(row: Record<string, unknown>): boolean {
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  return (
    String(row.direction ?? "").toLowerCase() === "out" &&
    (String(meta.flow ?? "") === "balance_convert" ||
      String(meta.activity_type ?? "") === "balance_convert" ||
      normalizeBalanceMoveReviewSnapshot(meta.move_review) != null)
  )
}

export function resolveBalanceMoveReviewFromRow(
  row: Record<string, unknown>,
): BalanceMoveReviewSnapshot | null {
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  return normalizeBalanceMoveReviewSnapshot(meta.move_review)
}

export function attachBalanceMoveDetailFields(
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  if (!isBalanceConvertOutRow(row)) return transaction

  const moveReview = resolveBalanceMoveReviewFromRow(row)
  if (!moveReview) return transaction

  const ledgerCreatedAt = resolveLedgerWhenAtFromRow(row)
  const productLabel = balanceConvertListProductLabel()

  return {
    ...transaction,
    amount: moveReview.destination_amount,
    currency: moveReview.destination_currency,
    display_amount: moveReview.destination_amount,
    display_currency: moveReview.destination_currency,
    display_description: productLabel,
    display_hero_title: formatTransactionDetailHeroTitle({
      direction: "out",
      counterpartyName: productLabel,
      productFallback: productLabel,
    }),
    transaction_product: productLabel,
    ledger_amount: moveReview.total_debited,
    ledger_currency: moveReview.source_currency,
    move_review: moveReview,
    ...(ledgerCreatedAt ? { ledger_created_at: ledgerCreatedAt } : {}),
    description: productLabel,
    name: productLabel,
    metadata: {
      ...((transaction.metadata as Record<string, unknown> | undefined) ?? {}),
      ...((row.metadata as Record<string, unknown> | undefined) ?? {}),
    },
  }
}
