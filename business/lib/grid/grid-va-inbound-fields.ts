import {
  deriveBankDepositPaymentRail,
  deriveBankDepositSchemeLabel,
  formatDisplayPersonName,
} from "@easner/shared"
import { gridMoneyToMajor } from "./webhook-amount"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function firstString(values: readonly unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return ""
}

export function extractGridVaInboundSharedFields(data: Record<string, unknown>): {
  senderName: string
  sourcePaymentRail: string
  depositSchemeLabel: string
  narration: string
  feeAmount: number
} {
  const originator =
    asRecord(data.originator) ??
    asRecord(data.sender) ??
    asRecord(data.source) ??
    asRecord(data.counterparty)
  const originatorName = asRecord(originator?.name)
  const rawName = firstString([
    data.senderName,
    data.sender_name,
    originator?.name,
    originator?.fullName,
    originator?.legalName,
    originatorName?.fullName,
    [originatorName?.firstName, originatorName?.lastName].filter(Boolean).join(" "),
  ])
  const senderName = formatDisplayPersonName(rawName) || rawName
  const railHint = firstString([
    data.paymentRail,
    data.payment_rail,
    originator?.paymentRail,
    data.paymentMethod,
    data.payment_method,
  ])
  const narration = firstString([
    data.description,
    data.narration,
    data.memo,
    data.reference,
    data.paymentReference,
  ])
  const fee =
    gridMoneyToMajor(data.feeAmount) ??
    gridMoneyToMajor(data.fee) ??
    gridMoneyToMajor(data.fees)
  const feeAmount = fee && Number.isFinite(fee.amount) && fee.amount > 0 ? fee.amount : 0
  const sourcePaymentRail = deriveBankDepositPaymentRail({
    metadata: railHint ? { source_payment_rail: railHint } : {},
    payload: data,
  })
  const depositSchemeLabel = deriveBankDepositSchemeLabel({
    metadata: {
      ...(railHint ? { source_payment_rail: sourcePaymentRail } : {}),
    },
    payload: data,
  })
  return { senderName, sourcePaymentRail, depositSchemeLabel, narration, feeAmount }
}
