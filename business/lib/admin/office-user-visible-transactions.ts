import type { SupabaseClient } from "@supabase/supabase-js"
import {
  activityAccountLabel,
  activityPrimaryLabel,
  computeProviderLedgerDashboardExtras,
  formatOfficeTxAmount,
  formatOfficeTxBalanceAmount,
  officeTxFlowLabel,
  resolveOfficeTxPresentation,
  type TxRow,
  type VolumeBalanceKpi,
} from "@/lib/admin/office-overview-compute"
import type { OfficeLedgerTransaction } from "@/lib/admin/office-load-transactions"

export type OfficeUserVisibleTransaction = OfficeLedgerTransaction & {
  label: string
  amountFormatted: string
  displayAmount: number
  displayCurrency: string
  balanceAmount: number
  balanceCurrency: string | null
  balanceFormatted: string
  flowLabel: "Pay-in" | "Payout"
  who: string
}

export type OfficeTransactionsSummary = {
  volumeBalance: VolumeBalanceKpi
  transactionCount: number
  window?: {
    preset: string
    since: string | null
    until: string | null
  }
}

type LedgerScope = { userId: string; businessId: string | null }

const PENDING_GLOBAL_PAYOUT_PREFIX = "global_payout_pending:"

function easnerPayoutIdFromRow(row: Record<string, unknown>): string {
  const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
  const fromMeta = String(meta.easner_payout_id ?? "").trim()
  if (fromMeta) return fromMeta
  const ptid = String(row.provider_transaction_id ?? "").trim()
  if (ptid.startsWith(PENDING_GLOBAL_PAYOUT_PREFIX)) {
    return ptid.slice(PENDING_GLOBAL_PAYOUT_PREFIX.length)
  }
  return ""
}

/** Drop placeholder pending rows once the settled Noah payout row exists for the same easner_payout_id. */
export function filterSupersededPendingGlobalPayoutRows(rows: OfficeLedgerTransaction[]): OfficeLedgerTransaction[] {
  const settledPayoutIds = new Set<string>()
  for (const row of rows) {
    const payoutId = easnerPayoutIdFromRow(row as Record<string, unknown>)
    const ptid = String(row.provider_transaction_id ?? "").trim()
    if (!payoutId || ptid.startsWith(PENDING_GLOBAL_PAYOUT_PREFIX)) continue
    if (String(row.metadata?.payout_type ?? "").toLowerCase() === "global_fiat") {
      settledPayoutIds.add(payoutId)
    }
  }

  return rows.filter((row) => {
    const ptid = String(row.provider_transaction_id ?? "").trim()
    if (!ptid.startsWith(PENDING_GLOBAL_PAYOUT_PREFIX)) return true
    const payoutId = easnerPayoutIdFromRow(row as Record<string, unknown>)
    return !payoutId || !settledPayoutIds.has(payoutId)
  })
}

/** Rows are pre-filtered via `hidden_from_feed` at query time; drop superseded pending placeholders only. */
export async function filterUserVisibleOfficeLedgerRows(
  _admin: SupabaseClient,
  rows: OfficeLedgerTransaction[],
): Promise<OfficeLedgerTransaction[]> {
  return rows
}

function toTxRow(row: OfficeLedgerTransaction): TxRow {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    occurred_at: row.occurred_at,
    status: row.status,
    currency: row.currency,
    amount: row.amount,
    direction: row.direction,
    provider: row.provider,
    metadata: row.metadata,
    payload: row.payload,
    base_currency: row.base_currency,
    base_amount: row.base_amount,
    easner_transaction_id: row.easner_transaction_id,
    user_id: row.user_id,
    business_id: row.business_id,
    user: row.user
      ? {
          first_name: row.user.first_name,
          last_name: row.user.last_name,
          email: row.user.email,
          full_name: row.user.full_name,
        }
      : null,
    business: row.business,
  }
}

export function enrichOfficeLedgerForUserDisplay(row: OfficeLedgerTransaction): OfficeUserVisibleTransaction {
  const txRow = toTxRow(row)
  const pres = resolveOfficeTxPresentation(txRow)
  const account = activityAccountLabel(txRow)
  return {
    ...row,
    label: activityPrimaryLabel(txRow),
    amountFormatted: formatOfficeTxAmount(txRow),
    displayAmount: pres.displayAmount,
    displayCurrency: pres.displayCurrency,
    balanceAmount: pres.balanceAmount,
    balanceCurrency: pres.balanceCurrency,
    balanceFormatted: formatOfficeTxBalanceAmount(txRow),
    flowLabel: officeTxFlowLabel(txRow),
    who: account.label || "—",
  }
}

export function summarizeOfficeUserVisibleTransactions(
  rows: OfficeUserVisibleTransaction[],
): OfficeTransactionsSummary {
  const txRows: TxRow[] = rows.map((row) => toTxRow(row))
  const { volumeBalance } = computeProviderLedgerDashboardExtras(txRows)
  return {
    volumeBalance,
    transactionCount: rows.length,
  }
}

export async function prepareOfficeUserVisibleTransactions(
  admin: SupabaseClient,
  rows: OfficeLedgerTransaction[],
): Promise<OfficeUserVisibleTransaction[]> {
  const visible = filterSupersededPendingGlobalPayoutRows(
    await filterUserVisibleOfficeLedgerRows(admin, rows),
  )
  return visible.map((row) => enrichOfficeLedgerForUserDisplay(row))
}

export async function prepareOfficeUserVisibleTransactionsWithSummary(
  admin: SupabaseClient,
  rows: OfficeLedgerTransaction[],
): Promise<{ transactions: OfficeUserVisibleTransaction[]; summary: OfficeTransactionsSummary }> {
  const transactions = await prepareOfficeUserVisibleTransactions(admin, rows)
  return {
    transactions,
    summary: summarizeOfficeUserVisibleTransactions(transactions),
  }
}
