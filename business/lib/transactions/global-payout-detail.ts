import type { SupabaseClient } from "@supabase/supabase-js"
import { isGlobalPayoutOffRampOutRow } from "@easner/shared"
import { fetchGlobalPayoutLifecycleFromWebhooks } from "@/lib/noah/global-payout-webhook-timestamps"
import { resolveGlobalPayoutOffRampDetail } from "@/lib/transactions/resolve-global-payout-off-ramp"

export function isGlobalPayoutOffRampRow(row: Record<string, unknown>): boolean {
  return isGlobalPayoutOffRampOutRow(row)
}

export function attachGlobalPayoutDetailFields(
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
  resolved?: ReturnType<typeof resolveGlobalPayoutOffRampDetail> | null,
): Record<string, unknown> {
  const detail = resolved ?? resolveGlobalPayoutOffRampDetail(row)
  if (!detail) return transaction

  const {
    effectiveMetadata,
    lifecycle,
    displayAmount,
    displayCurrency,
    ledgerAmount,
    ledgerCurrency,
    displayDescription,
    displayHeroTitle,
    payoutReview,
    recipientSnapshot,
    sendNote,
    processingAt,
    completedAt,
    failedAt,
    transactionStartedAt,
    ledgerCreatedAt,
    transactionTiming,
  } = detail

  return {
    ...transaction,
    amount: displayAmount,
    currency: displayCurrency,
    display_amount: displayAmount,
    display_currency: displayCurrency,
    display_description: displayDescription,
    display_hero_title: displayHeroTitle,
    ledger_amount: ledgerAmount,
    ledger_currency: ledgerCurrency,
    baseAmount: ledgerAmount,
    baseCurrency: ledgerCurrency,
    description: displayDescription,
    name: displayDescription,
    lifecycle,
    payout_review: payoutReview,
    recipient_snapshot: recipientSnapshot,
    ...(sendNote ? { send_note: sendNote, sendNote } : {}),
    ...(processingAt ? { processing_at: processingAt } : {}),
    ...(completedAt ? { completed_at: completedAt } : {}),
    ...(failedAt ? { failed_at: failedAt } : {}),
    ...(transactionStartedAt ? { transaction_started_at: transactionStartedAt } : {}),
    ...(ledgerCreatedAt ? { ledger_created_at: ledgerCreatedAt } : {}),
    transaction_timing: transactionTiming,
    metadata: {
      ...((transaction.metadata as Record<string, unknown> | undefined) ?? {}),
      ...effectiveMetadata,
    },
  }
}

export async function attachGlobalPayoutDetailFieldsAsync(
  admin: SupabaseClient,
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isGlobalPayoutOffRampRow(row)) return transaction

  let resolved = resolveGlobalPayoutOffRampDetail(row)
  if (!resolved) return transaction

  if (resolved.easnerPayoutId) {
    const webhook = await fetchGlobalPayoutLifecycleFromWebhooks(admin, resolved.easnerPayoutId)
    resolved = resolveGlobalPayoutOffRampDetail(row, webhook) ?? resolved
  }

  return attachGlobalPayoutDetailFields(row, transaction, resolved)
}
