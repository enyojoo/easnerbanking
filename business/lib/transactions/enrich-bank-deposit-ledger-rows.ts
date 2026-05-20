import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchFiatDepositWebhooksByDepositIds } from "@/lib/noah/fiat-deposit-webhook-timestamps"
import { isBankOnrampPayInRow } from "@/lib/transactions/bank-deposit-detail"
import { resolveBankDepositPayInDetail } from "@/lib/transactions/resolve-bank-deposit-pay-in"

/**
 * Merges FiatDeposit webhook sender + ACH narration into ledger rows for list/feed labels.
 */
export async function enrichBankDepositLedgerRows(
  admin: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const depositIds = new Set<string>()
  for (const row of rows) {
    if (!isBankOnrampPayInRow(row)) continue
    const resolved = resolveBankDepositPayInDetail(row)
    if (resolved?.fiatDepositId) depositIds.add(resolved.fiatDepositId)
  }
  if (depositIds.size === 0) return rows

  const webhookByDeposit = await fetchFiatDepositWebhooksByDepositIds(admin, [...depositIds])

  return rows.map((row) => {
    if (!isBankOnrampPayInRow(row)) return row
    let resolved = resolveBankDepositPayInDetail(row)
    if (!resolved?.fiatDepositId) return row
    const webhook = webhookByDeposit.get(resolved.fiatDepositId)
    if (webhook) {
      resolved = resolveBankDepositPayInDetail(row, webhook) ?? resolved
    }
    if (!resolved.senderName) return row
    return {
      ...row,
      metadata: {
        ...((row.metadata as Record<string, unknown> | undefined) ?? {}),
        ...resolved.effectiveMetadata,
      },
    }
  })
}
