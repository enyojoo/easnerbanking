import type { SupabaseClient } from "@supabase/supabase-js"
import {
  activityAccountLabel,
  activityPrimaryLabel,
  computeProviderLedgerDashboardExtras,
  formatOfficeTxAmount,
  formatOfficeTxBalanceAmount,
  formatOfficeTxImpactAmount,
  officeTxFlowLabel,
  resolveOfficePayInRail,
  resolveOfficeProductLabel,
  resolveOfficeReportingEurAmount,
  resolveOfficeReportingUsdAmount,
  resolveOfficeTxPresentation,
  resolveOfficeYcMode,
  type TxRow,
  type VolumeBalanceKpi,
  type OfficeYcMode,
} from "@/lib/admin/office-overview-compute"
import { filterSupersededPendingGlobalPayoutRows as filterSupersededPendingGlobalPayoutRowsShared } from "@easner/shared"
import type { OfficeLedgerTransaction } from "@/lib/admin/office-load-transactions"
import { enrichYcFundBalanceOfficeRows } from "@/lib/admin/enrich-yc-fund-balance-office-rows"

export type OfficeUserVisibleTransaction = OfficeLedgerTransaction & {
  label: string
  amountFormatted: string
  displayAmount: number
  displayCurrency: string
  balanceAmount: number
  balanceCurrency: string | null
  balanceFormatted: string
  impactFormatted: string
  reportingUsdAmount: number | null
  reportingEurAmount: number | null
  productLabel: string
  ycMode: OfficeYcMode
  payInRail: "bank_transfer" | "mobile_money" | null
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

/** Rows are pre-filtered via `hidden_from_feed` at query time; drop superseded pending placeholders only. */
export function filterSupersededPendingGlobalPayoutRows(rows: OfficeLedgerTransaction[]): OfficeLedgerTransaction[] {
  return filterSupersededPendingGlobalPayoutRowsShared(rows) as OfficeLedgerTransaction[]
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
    provider_transaction_id: row.provider_transaction_id,
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
    impactFormatted: formatOfficeTxImpactAmount(txRow),
    reportingUsdAmount: resolveOfficeReportingUsdAmount(txRow),
    reportingEurAmount: resolveOfficeReportingEurAmount(txRow),
    productLabel: resolveOfficeProductLabel(txRow),
    ycMode: resolveOfficeYcMode(txRow),
    payInRail: resolveOfficePayInRail(txRow),
    flowLabel: officeTxFlowLabel(txRow),
    who: account.label || "–",
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
  const enriched = await enrichYcFundBalanceOfficeRows(admin, visible)
  return enriched.map((row) => enrichOfficeLedgerForUserDisplay(row))
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
