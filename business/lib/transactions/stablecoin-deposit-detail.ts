import {
  isStablecoinDepositPayInRow,
  resolveStablecoinDepositPayInDetail,
} from "@/lib/transactions/resolve-stablecoin-deposit-pay-in"
import { isRelayTronDepositMetadata } from "@easner/shared"

export { isStablecoinDepositPayInRow }

/**
 * Enriches the mobile detail `transaction` shape for inbound stablecoin (liquidation
 * address) deposits: masked Sender, lifecycle, posted amount, and canonical scheme.
 */
export function attachStablecoinDepositDetailFields(
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
  resolved?: ReturnType<typeof resolveStablecoinDepositPayInDetail> | null,
): Record<string, unknown> {
  const detail = resolved ?? resolveStablecoinDepositPayInDetail(row)
  if (!detail) return transaction

  const {
    lifecycle,
    depositAmount,
    postedAmount,
    postedCurrency,
    feeAmount,
    senderDisplay,
    schemeLabel,
    sourcePaymentRail,
    transactionTiming,
    ledgerCreatedAt,
    processingAt,
    completedAt,
  } = detail

  return {
    ...transaction,
    lifecycle,
    source_type: isRelayTronDepositMetadata(row.metadata as Record<string, unknown> | null | undefined)
      ? "relay_tron_deposit"
      : (transaction.source_type as string | undefined) ?? "liquidation_address",
    source_payment_rail: sourcePaymentRail ?? transaction.source_payment_rail,
    payment_scheme: schemeLabel,
    transaction_product: transaction.transaction_product ?? "Stablecoin Deposit",
    ...(senderDisplay ? { sender_display_name: senderDisplay, name: senderDisplay } : {}),
    ...(depositAmount != null && depositAmount > 0
      ? {
          deposit_amount: depositAmount,
          display_amount: depositAmount,
          display_currency: "USD",
        }
      : {}),
    ...(postedAmount > 0
      ? {
          posted_amount: postedAmount,
          settled_amount: postedAmount,
          settled_currency: postedCurrency,
          posted_currency: postedCurrency,
          final_amount: postedAmount,
          receipt_final_amount: postedAmount,
        }
      : {}),
    ...(feeAmount > 0 ? { fee_amount: feeAmount } : {}),
    ...(processingAt ? { processing_at: processingAt } : {}),
    ...(completedAt ? { completed_at: completedAt } : {}),
    ...(ledgerCreatedAt ? { ledger_created_at: ledgerCreatedAt } : {}),
    transaction_timing: transactionTiming,
  }
}
