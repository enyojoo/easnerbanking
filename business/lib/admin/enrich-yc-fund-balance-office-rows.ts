import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildYcFundBalanceDepositReviewSnapshot,
  normalizeYcFundBalanceDepositReview,
  reconstructYcFundBalanceDepositReview,
} from "@easner/shared"
import { isOfficeYcFundBalancePayIn, type TxRow } from "@/lib/admin/office-overview-compute"

type YcTransferRow = {
  transaction_id: string | null
  quoted_pay_in: number | null
  pay_in_currency: string | null
  quoted_receive: number | null
  customer_rate: number | null
  metadata: Record<string, unknown> | null
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
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

/** Patch YC fund-balance rows with local pay-in from linked yc_transfers when metadata is USD-only. */
export async function enrichYcFundBalanceOfficeRows<T extends TxRow>(
  admin: SupabaseClient,
  rows: T[],
): Promise<T[]> {
  const candidates = rows.filter(
    (row) => isOfficeYcFundBalancePayIn(row) && !hasResolvedFundBalanceLocalPayIn(row.metadata ?? {}),
  )
  if (candidates.length === 0) return rows

  const txIds = candidates.map((row) => row.id)
  const { data: transfers, error } = await admin
    .from("yc_transfers")
    .select("transaction_id, quoted_pay_in, pay_in_currency, quoted_receive, customer_rate, metadata")
    .in("transaction_id", txIds)
    .eq("mode", "fund_balance")

  if (error) {
    console.error("enrichYcFundBalanceOfficeRows:", error)
    return rows
  }

  const transferByTxId = new Map<string, YcTransferRow>()
  for (const raw of transfers ?? []) {
    const txId = raw.transaction_id != null ? String(raw.transaction_id) : ""
    if (txId) transferByTxId.set(txId, raw as YcTransferRow)
  }

  if (transferByTxId.size === 0) return rows

  return rows.map((row) => {
    if (!isOfficeYcFundBalancePayIn(row)) return row
    const meta = row.metadata ?? {}
    if (hasResolvedFundBalanceLocalPayIn(meta)) return row
    const transfer = transferByTxId.get(row.id)
    if (!transfer) return row
    return {
      ...row,
      metadata: mergeFundBalanceTransferContext(meta, transfer),
    }
  })
}
