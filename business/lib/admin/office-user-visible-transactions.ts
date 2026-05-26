import type { SupabaseClient } from "@supabase/supabase-js"
import { collectGlobalPayoutSettlementTxHashesForScope } from "@/lib/noah/global-payout-ledger"
import { collectNoahBankOnrampOnChainTxHashesForScope } from "@/lib/noah/noah-bank-onramp-chain-suppression"
import { enrichBankDepositLedgerRows } from "@/lib/transactions/enrich-bank-deposit-ledger-rows"
import {
  isNoahGlobalPayoutOrchestrationInHiddenFromFeed,
  isTurnkeyNoahBankOnrampChainMirror,
  isTurnkeyTransactionHiddenFromFeed,
} from "@/lib/transactions/transaction-feed-filters"
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
}

type LedgerScope = { userId: string; businessId: string | null }

function collectGlobalPayoutSettlementTxHashes(rows: Record<string, unknown>[]): Set<string> {
  const hashes = new Set<string>()
  for (const row of rows) {
    if (String(row.provider ?? "").toLowerCase() !== "turnkey") continue
    if (String(row.direction ?? "").toLowerCase() !== "out") continue
    const meta = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (meta.global_payout_settlement_leg !== true) continue
    const hash = String(row.tx_hash ?? "").trim()
    if (hash) hashes.add(hash)
  }
  return hashes
}

function ledgerScope(row: Record<string, unknown>): LedgerScope | null {
  const userId = row.user_id != null ? String(row.user_id).trim() : ""
  if (!userId) return null
  const businessIdRaw = row.business_id != null ? String(row.business_id).trim() : ""
  return { userId, businessId: businessIdRaw || null }
}

function scopeKey(scope: LedgerScope): string {
  return `${scope.userId}|${scope.businessId ?? ""}`
}

function groupRowsByScope(rows: Record<string, unknown>[]): Map<string, { scope: LedgerScope; rows: Record<string, unknown>[] }> {
  const groups = new Map<string, { scope: LedgerScope; rows: Record<string, unknown>[] }>()
  for (const row of rows) {
    const scope = ledgerScope(row)
    if (!scope) continue
    const key = scopeKey(scope)
    const entry = groups.get(key) ?? { scope, rows: [] }
    entry.rows.push(row)
    groups.set(key, entry)
  }
  return groups
}

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

/** Same feed suppression as business/mobile `/api/transactions`. */
export async function filterUserVisibleOfficeLedgerRows(
  admin: SupabaseClient,
  rows: OfficeLedgerTransaction[],
): Promise<OfficeLedgerTransaction[]> {
  if (rows.length === 0) return []

  const rawRows = rows as Record<string, unknown>[]
  const afterMetadata = rawRows.filter(
    (r) => !isTurnkeyTransactionHiddenFromFeed(r.metadata, r.payload),
  )

  const globalPayoutSettlementHashes = collectGlobalPayoutSettlementTxHashes(afterMetadata)
  const afterGlobalPayoutIn = afterMetadata.filter(
    (r) => !isNoahGlobalPayoutOrchestrationInHiddenFromFeed(r, globalPayoutSettlementHashes),
  )

  const visibleIds = new Set<string>()
  const groups = groupRowsByScope(afterGlobalPayoutIn)

  for (const { scope, rows: groupRows } of groups.values()) {
    const noahGlobalPayoutInHashes = groupRows
      .filter(
        (r) =>
          String(r.provider ?? "").toLowerCase() === "noah" &&
          String(r.direction ?? "").toLowerCase() === "in" &&
          String(r.tx_hash ?? "").trim(),
      )
      .map((r) => String(r.tx_hash ?? "").trim())

    if (noahGlobalPayoutInHashes.length > 0) {
      const fromDb = await collectGlobalPayoutSettlementTxHashesForScope(admin, noahGlobalPayoutInHashes, {
        userId: scope.userId,
        businessId: scope.businessId,
      })
      for (const hash of fromDb) globalPayoutSettlementHashes.add(hash)
    }

    const afterSecondPass = groupRows.filter(
      (r) => !isNoahGlobalPayoutOrchestrationInHiddenFromFeed(r, globalPayoutSettlementHashes),
    )

    const turnkeyInboundHashes = afterSecondPass
      .filter(
        (r) =>
          String(r.provider ?? "").toLowerCase() === "turnkey" &&
          String(r.direction ?? "").toLowerCase() === "in",
      )
      .map((r) => String(r.tx_hash ?? "").trim())
      .filter(Boolean)

    const noahOnChainHashes =
      turnkeyInboundHashes.length > 0
        ? await collectNoahBankOnrampOnChainTxHashesForScope(admin, turnkeyInboundHashes, {
            userId: scope.userId,
            businessId: scope.businessId,
          })
        : new Set<string>()

    for (const row of afterSecondPass) {
      if (isTurnkeyNoahBankOnrampChainMirror(row, noahOnChainHashes)) continue
      const id = row.id != null ? String(row.id) : ""
      if (id) visibleIds.add(id)
    }
  }

  return rows.filter((row) => visibleIds.has(row.id))
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
  const enrichedRows = await enrichBankDepositLedgerRows(admin, visible as Record<string, unknown>[])
  const enrichedById = new Map(
    enrichedRows.map((row) => [String(row.id ?? ""), row as OfficeLedgerTransaction]),
  )
  return visible.map((row) =>
    enrichOfficeLedgerForUserDisplay(enrichedById.get(row.id) ?? row),
  )
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
