import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildYcFundBalanceDepositReviewSnapshot,
  normalizeYcFundBalanceDepositReview,
  reconstructYcFundBalanceDepositReview,
} from "@easner/shared"
import { isOfficeYcFundBalancePayIn, type TxRow } from "@/lib/admin/office-overview-compute"

type YcTransferRow = {
  id: string
  transaction_id: string | null
  quoted_pay_in: number | null
  pay_in_currency: string | null
  quoted_receive: number | null
  customer_rate: number | null
  leg1_sequence_id: string | null
  metadata: Record<string, unknown> | null
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key]
  return value != null ? String(value).trim() : ""
}

function collectFundBalanceTransferLookupKeys(row: TxRow): {
  sequenceIds: string[]
  transferIds: string[]
} {
  const meta = row.metadata ?? {}
  const sequenceIds = new Set<string>()
  const transferIds = new Set<string>()

  for (const key of ["yc_sequence_id", "leg1_sequence_id", "sequence_id"] as const) {
    const value = readMetaString(meta, key)
    if (value) sequenceIds.add(value)
  }

  const providerTxId = String(row.provider_transaction_id ?? meta.provider_transaction_id ?? "").trim()
  if (providerTxId) sequenceIds.add(providerTxId)

  const transferId = readMetaString(meta, "yc_transfer_id")
  if (transferId) transferIds.add(transferId)

  return {
    sequenceIds: [...sequenceIds],
    transferIds: [...transferIds],
  }
}

function hasResolvedFundBalanceLocalPayIn(meta: Record<string, unknown>): boolean {
  if (normalizeYcFundBalanceDepositReview(meta.deposit_review)) return true
  if (reconstructYcFundBalanceDepositReview(meta)) return true
  const localPayIn = Number(meta.local_pay_in)
  const localCurrency = String(meta.local_currency ?? meta.fiat_deposit_currency ?? "").trim()
  return Number.isFinite(localPayIn) && localPayIn > 0 && Boolean(localCurrency)
}

function mergeFundBalanceTransferContext(
  meta: Record<string, unknown>,
  transfer: YcTransferRow,
): Record<string, unknown> {
  const transferMeta = asMeta(transfer.metadata)
  const localPayIn = Number(
    meta.local_pay_in ?? meta.fiat_deposit_amount ?? transfer.quoted_pay_in ?? transferMeta.local_pay_in ?? 0,
  )
  const localCurrency = String(
    meta.local_currency ??
      meta.fiat_deposit_currency ??
      meta.pay_in_currency ??
      transfer.pay_in_currency ??
      transferMeta.local_currency ??
      "",
  )
    .trim()
    .toUpperCase()
  const customerRate = Number(
    meta.customer_rate ?? meta.exchange_rate ?? transfer.customer_rate ?? transferMeta.customer_rate ?? 0,
  )
  const usdCredit = Number(
    meta.usd_credit ??
      meta.settled_amount ??
      meta.posted_amount ??
      transfer.quoted_receive ??
      transferMeta.usd_credit ??
      0,
  )

  const patched: Record<string, unknown> = {
    ...meta,
    ...(localPayIn > 0 ? { local_pay_in: localPayIn } : {}),
    ...(localCurrency ? { local_currency: localCurrency } : {}),
    ...(Number.isFinite(customerRate) && customerRate > 0 ? { customer_rate: customerRate } : {}),
    ...(Number.isFinite(usdCredit) && usdCredit > 0 ? { usd_credit: usdCredit } : {}),
    ...(readMetaString(meta, "yc_mode") ? {} : { yc_mode: "fund_balance" }),
  }

  if (!normalizeYcFundBalanceDepositReview(patched.deposit_review)) {
    const review =
      reconstructYcFundBalanceDepositReview(patched, customerRate) ??
      (localPayIn > 0 && localCurrency && usdCredit > 0
        ? buildYcFundBalanceDepositReviewSnapshot({
            localPayIn,
            localCurrency,
            usdCredit,
            processingFee: Number(meta.processing_fee ?? transferMeta.processing_fee ?? 0),
            exchangeRate: Number.isFinite(customerRate) && customerRate > 0 ? customerRate : 0,
            residenceCountry: String(meta.residence_country ?? transferMeta.residence_country ?? ""),
            payInRail:
              String(meta.pay_in_rail ?? transferMeta.pay_in_rail ?? "").trim().toLowerCase() ===
              "mobile_money"
                ? "mobile_money"
                : "bank_transfer",
          })
        : null)
    if (review) {
      patched.deposit_review = review
    }
  }

  return patched
}

function resolveTransferForRow(
  row: TxRow,
  byTransactionId: Map<string, YcTransferRow>,
  bySequenceId: Map<string, YcTransferRow>,
  byTransferId: Map<string, YcTransferRow>,
): YcTransferRow | undefined {
  const meta = row.metadata ?? {}
  return (
    byTransactionId.get(row.id) ??
    byTransferId.get(readMetaString(meta, "yc_transfer_id")) ??
    collectFundBalanceTransferLookupKeys(row).sequenceIds
      .map((sequenceId) => bySequenceId.get(sequenceId))
      .find(Boolean)
  )
}

async function loadFundBalanceTransfersForRows(
  admin: SupabaseClient,
  rows: TxRow[],
): Promise<YcTransferRow[]> {
  const transactionIds = new Set<string>()
  const sequenceIds = new Set<string>()
  const transferIds = new Set<string>()

  for (const row of rows) {
    if (!isOfficeYcFundBalancePayIn(row)) continue
    if (hasResolvedFundBalanceLocalPayIn(row.metadata ?? {})) continue
    transactionIds.add(row.id)
    const keys = collectFundBalanceTransferLookupKeys(row)
    for (const sequenceId of keys.sequenceIds) sequenceIds.add(sequenceId)
    for (const transferId of keys.transferIds) transferIds.add(transferId)
  }

  const orFilters: string[] = []
  if (transactionIds.size > 0) {
    orFilters.push(`transaction_id.in.(${[...transactionIds].join(",")})`)
  }
  if (sequenceIds.size > 0) {
    orFilters.push(`leg1_sequence_id.in.(${[...sequenceIds].join(",")})`)
  }
  if (transferIds.size > 0) {
    orFilters.push(`id.in.(${[...transferIds].join(",")})`)
  }
  if (orFilters.length === 0) return []

  const { data, error } = await admin
    .from("yc_transfers")
    .select(
      "id, transaction_id, quoted_pay_in, pay_in_currency, quoted_receive, customer_rate, leg1_sequence_id, metadata",
    )
    .eq("mode", "fund_balance")
    .or(orFilters.join(","))

  if (error) {
    console.error("enrichYcFundBalanceOfficeRows:", error)
    return []
  }

  return (data ?? []) as YcTransferRow[]
}

/** Patch YC fund-balance rows with local pay-in from linked yc_transfers when metadata is USD-only. */
export async function enrichYcFundBalanceOfficeRows<T extends TxRow>(
  admin: SupabaseClient,
  rows: T[],
): Promise<T[]> {
  const transfers = await loadFundBalanceTransfersForRows(admin, rows)
  if (transfers.length === 0) return rows

  const byTransactionId = new Map<string, YcTransferRow>()
  const bySequenceId = new Map<string, YcTransferRow>()
  const byTransferId = new Map<string, YcTransferRow>()

  for (const transfer of transfers) {
    const txId = transfer.transaction_id != null ? String(transfer.transaction_id) : ""
    if (txId) byTransactionId.set(txId, transfer)
    const sequenceId =
      transfer.leg1_sequence_id != null ? String(transfer.leg1_sequence_id).trim() : ""
    if (sequenceId) bySequenceId.set(sequenceId, transfer)
    if (transfer.id) byTransferId.set(String(transfer.id), transfer)
  }

  return rows.map((row) => {
    if (!isOfficeYcFundBalancePayIn(row)) return row
    const meta = row.metadata ?? {}
    if (hasResolvedFundBalanceLocalPayIn(meta)) return row
    const transfer = resolveTransferForRow(row, byTransactionId, bySequenceId, byTransferId)
    if (!transfer) return row
    return {
      ...row,
      metadata: mergeFundBalanceTransferContext(meta, transfer),
    }
  })
}
