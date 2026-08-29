import {
  isSuccessfulFeedTransaction,
  mapLedgerRowToMobileListItem,
  resolveAccountImpactAmount,
  shouldIncludeRowInUserFeed,
  toEasnerTransactionPrimaryLabel,
} from "@easner/shared"
import { formatStatementMoney } from "./format"

export type StatementLineType = "Deposit" | "Transfer"

export type StatementActivityLine = {
  occurredAt: string
  dateLabel: string
  type: StatementLineType
  details: string
  moneyIn: string
  moneyOut: string
  impactAmount: number
  impactDirection: "in" | "out"
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function positiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function readLocalPayIn(meta: Record<string, unknown>): { amount: number; currency: string } | null {
  const depositReview = asRecord(meta.deposit_review)
  const payInReview = asRecord(meta.pay_in_review)
  const amount = positiveNumber(meta.local_pay_in, depositReview.local_pay_in, payInReview.local_pay_in)
  const currency = String(
    meta.local_currency ?? depositReview.local_currency ?? payInReview.local_currency ?? "",
  )
    .trim()
    .toUpperCase()
  if (amount == null || !currency || currency === "USD" || currency === "EUR") return null
  return { amount, currency }
}

function readLocalReceive(meta: Record<string, unknown>): { amount: number; currency: string } | null {
  const payoutReview = asRecord(meta.payout_review)
  const amount = positiveNumber(
    meta.requested_receive_amount,
    meta.receive_amount,
    payoutReview.requested_receive_amount,
    payoutReview.receive_amount,
  )
  const currency = String(
    meta.receive_currency ?? payoutReview.receive_currency ?? "",
  )
    .trim()
    .toUpperCase()
  if (amount == null || !currency || currency === "USD" || currency === "EUR" || currency === "USDC" || currency === "EURC") {
    return null
  }
  return { amount, currency }
}

export function isCompletedFeedRow(row: Record<string, unknown>): boolean {
  return shouldIncludeRowInUserFeed(row) && isSuccessfulFeedTransaction(row)
}

export function statementLineType(direction: string): StatementLineType {
  const dir = direction.trim().toLowerCase()
  return dir === "in" || dir === "credit" ? "Deposit" : "Transfer"
}

export function resolvePrintAmount(row: Record<string, unknown>): { amount: number; currency: string } {
  const meta = asRecord(row.metadata)
  const dir = String(row.direction ?? "").trim().toLowerCase()
  if (dir === "in" || dir === "credit") {
    const local = readLocalPayIn(meta)
    if (local) return local
  } else {
    const local = readLocalReceive(meta)
    if (local) return local
  }
  const mapped = mapLedgerRowToMobileListItem(row)
  const amount = Number(mapped.display_amount ?? mapped.amount ?? 0)
  const currency = String(mapped.display_currency ?? mapped.currency ?? row.currency ?? "USD")
  return {
    amount: Number.isFinite(amount) ? amount : 0,
    currency,
  }
}

export function resolveStatementDetails(
  row: Record<string, unknown>,
  senderHandleOverride?: string | null,
): string {
  const meta = asRecord(row.metadata)
  const dir = String(row.direction ?? "").trim().toLowerCase() === "in" ? "in" : "out"
  const handle = String(senderHandleOverride ?? "").trim().replace(/^@+/, "")
  if (dir === "in" && handle && String(meta.source ?? "").toLowerCase() === "easetag_p2p") {
    return `Received from @${handle}`
  }
  const mapped = mapLedgerRowToMobileListItem(row)
  const fromMap = String(mapped.display_description ?? mapped.name ?? "").trim()
  if (fromMap) return fromMap
  return toEasnerTransactionPrimaryLabel({
    provider: String(row.provider ?? ""),
    direction: dir,
    metadata: meta,
    payload: null,
  })
}

export function needsEasetagSenderLookup(row: Record<string, unknown>): boolean {
  const meta = asRecord(row.metadata)
  if (String(row.direction ?? "").toLowerCase() !== "in") return false
  if (String(meta.source ?? "").toLowerCase() !== "easetag_p2p") return false
  const tag = typeof meta.sender_easetag === "string" ? meta.sender_easetag.trim().replace(/^@+/, "") : ""
  return !tag
}

export function transferGroupIdOf(row: Record<string, unknown>): string | null {
  const meta = asRecord(row.metadata)
  const gid = typeof meta.transfer_group_id === "string" ? meta.transfer_group_id.trim() : ""
  return gid || null
}

export function impactInStatementCurrency(
  row: Record<string, unknown>,
  currency: "USD" | "EUR",
): number {
  const impact = resolveAccountImpactAmount(row)
  if (!impact) return 0
  if (impact.currency.toUpperCase() !== currency) return 0
  return impact.amount
}

export function buildActivityLine(
  row: Record<string, unknown>,
  dateLabel: string,
  senderHandleOverride?: string | null,
): StatementActivityLine {
  const dirRaw = String(row.direction ?? "").trim().toLowerCase()
  const type = statementLineType(dirRaw)
  const print = resolvePrintAmount(row)
  const formatted = formatStatementMoney(print.amount, print.currency)
  const isIn = type === "Deposit"
  return {
    occurredAt: String(row.occurred_at ?? row.created_at ?? ""),
    dateLabel,
    type,
    details: resolveStatementDetails(row, senderHandleOverride),
    moneyIn: isIn ? formatted : "",
    moneyOut: isIn ? "" : formatted,
    impactAmount: Number(resolveAccountImpactAmount(row)?.amount ?? 0),
    impactDirection: isIn ? "in" : "out",
  }
}
