import type { SupabaseClient } from "@supabase/supabase-js"
import { isBankOnrampDepositFlow } from "@easner/shared"
import { isBankOnrampFiatDepositPayload } from "@/lib/noah/bank-onramp-tx"
import { fetchFiatDepositLifecycleFromWebhooks } from "@/lib/noah/fiat-deposit-webhook-timestamps"
import { resolveBankDepositPayInDetail } from "@/lib/transactions/resolve-bank-deposit-pay-in"

export function isBankOnrampPayInRow(row: Record<string, unknown>): boolean {
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const payload = row.payload as Record<string, unknown> | null | undefined
  if (isBankOnrampDepositFlow(meta)) return true
  if (payload && isBankOnrampFiatDepositPayload(payload)) return true
  return false
}

export function attachBankDepositDetailFields(
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
  resolved?: ReturnType<typeof resolveBankDepositPayInDetail> | null,
): Record<string, unknown> {
  const detail = resolved ?? resolveBankDepositPayInDetail(row)
  if (!detail) return transaction

  const {
    effectiveMetadata,
    lifecycle,
    depositAmount,
    feeAmount,
    postedAmount,
    postedCurrency,
    senderName,
    narration,
    reference,
    processingAt,
    completedAt,
  } = detail

  return {
    ...transaction,
    lifecycle,
    source_type: transaction.source_type ?? "virtual_account",
    source_payment_rail:
      detail.sourcePaymentRail ??
      transaction.source_payment_rail ??
      "ach",
    payment_scheme:
      detail.depositSchemeLabel ??
      (effectiveMetadata.deposit_scheme_label as string | undefined),
    transaction_product: transaction.transaction_product ?? "Bank Deposit",
    metadata: {
      ...((transaction.metadata as Record<string, unknown> | undefined) ?? {}),
      ...effectiveMetadata,
    },
    ...(senderName
      ? { sender_display_name: senderName, name: senderName }
      : {}),
    ...(narration ? { reference: narration, narration } : reference ? { reference } : {}),
    deposit_amount: depositAmount,
    ...(feeAmount != null ? { fee_amount: feeAmount } : {}),
    ...(postedAmount != null
      ? {
          posted_amount: postedAmount,
          settled_amount: postedAmount,
          settled_currency: postedCurrency,
          final_amount: postedAmount,
          receipt_final_amount: postedAmount,
        }
      : {}),
    ...(processingAt ? { processing_at: processingAt } : {}),
    ...(completedAt ? { completed_at: completedAt } : {}),
  }
}

export async function attachBankDepositDetailFieldsAsync(
  admin: SupabaseClient,
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isBankOnrampPayInRow(row)) return transaction

  let resolved = resolveBankDepositPayInDetail(row)
  if (!resolved) return transaction

  if (resolved.fiatDepositId) {
    const webhook = await fetchFiatDepositLifecycleFromWebhooks(admin, resolved.fiatDepositId)
    resolved = resolveBankDepositPayInDetail(row, webhook) ?? resolved
  }

  return attachBankDepositDetailFields(row, transaction, resolved)
}
