import type { SupabaseClient } from "@supabase/supabase-js"
import { isBankOnrampDepositFlow } from "@easner/shared"
import { isBankOnrampFiatDepositPayload } from "@/lib/noah/bank-onramp-tx"
import { fetchBankOnrampOrchestrationOutFromWebhooks } from "@/lib/noah/bank-onramp-orchestration-out-webhook-timestamps"
import { fetchFiatDepositLifecycleFromWebhooks } from "@/lib/noah/fiat-deposit-webhook-timestamps"
import { resolveBankDepositPayInDetail } from "@/lib/transactions/resolve-bank-deposit-pay-in"
import { attachYcPayInPaymentDetails } from "@/lib/transactions/attach-yc-pay-in-payment-details"
import { enrichYcPayInMetadataFromTransfer } from "@/lib/yellowcard/enrich-yc-pay-in-metadata"

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
    transactionStartedAt,
    ledgerCreatedAt,
    transactionTiming,
    depositReview,
    depositDisplayTitle,
    displayHeroTitle,
  } = detail

  const isYcFundBalance = Boolean(depositReview)
  const transactionProduct =
    depositDisplayTitle ??
    (transaction.transaction_product as string | undefined) ??
    "Bank Deposit"

  const easnerTransactionId =
    row.easner_transaction_id != null ? String(row.easner_transaction_id) : null

  return attachYcPayInPaymentDetails(
    {
      ...transaction,
      lifecycle,
      source_type: transaction.source_type ?? "virtual_account",
      source_payment_rail:
        detail.sourcePaymentRail ??
        transaction.source_payment_rail ??
        "ach",
      ...(isYcFundBalance
        ? {}
        : {
            payment_scheme:
              detail.depositSchemeLabel ??
              (effectiveMetadata.deposit_scheme_label as string | undefined),
          }),
      transaction_product: transactionProduct,
      ...(displayHeroTitle ? { display_hero_title: displayHeroTitle } : {}),
      ...(depositReview ? { deposit_review: depositReview } : {}),
      metadata: {
        ...((transaction.metadata as Record<string, unknown> | undefined) ?? {}),
        ...effectiveMetadata,
      },
      ...(senderName
        ? { sender_display_name: senderName, name: senderName }
        : isYcFundBalance && depositDisplayTitle
          ? { name: depositDisplayTitle }
          : {}),
      ...(isYcFundBalance
        ? {}
        : narration
          ? { reference: narration, narration }
          : reference
            ? { reference }
            : {}),
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
      ...(transactionStartedAt ? { transaction_started_at: transactionStartedAt } : {}),
      ...(ledgerCreatedAt ? { ledger_created_at: ledgerCreatedAt } : {}),
      transaction_timing: transactionTiming,
    },
    effectiveMetadata,
    easnerTransactionId,
  )
}

export async function attachBankDepositDetailFieldsAsync(
  admin: SupabaseClient,
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isBankOnrampPayInRow(row)) return transaction

  const priorMeta = (row.metadata ?? {}) as Record<string, unknown>
  const { metadata: enrichedMeta } = await enrichYcPayInMetadataFromTransfer(
    admin,
    priorMeta,
    row.id != null ? String(row.id) : null,
  )
  const enrichedRow =
    enrichedMeta !== priorMeta ? { ...row, metadata: enrichedMeta } : row

  let resolved = resolveBankDepositPayInDetail(enrichedRow)
  if (!resolved) return transaction

  const ruleId =
    resolved.fiatDepositId ??
    (typeof (enrichedRow.metadata as Record<string, unknown> | undefined)?.noah_rule_execution_id ===
    "string"
      ? String((enrichedRow.metadata as Record<string, unknown>).noah_rule_execution_id).trim()
      : null)

  if (ruleId) {
    const [fiatDeposit, orchestrationOut] = await Promise.all([
      fetchFiatDepositLifecycleFromWebhooks(admin, ruleId),
      fetchBankOnrampOrchestrationOutFromWebhooks(admin, ruleId),
    ])
    resolved =
      resolveBankDepositPayInDetail(enrichedRow, { fiatDeposit, orchestrationOut }) ?? resolved
  }

  return attachBankDepositDetailFields(enrichedRow, transaction, resolved)
}
