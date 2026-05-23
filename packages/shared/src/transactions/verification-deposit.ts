/**
 * Noah verification / trial ACH credits to a VA (< $1, not onramped).
 * @see https://docs.noah.com/api-concepts/microdeposits
 */

import { formatDisplayPersonName } from "../format-display-name"

export type DepositKind = "verification" | "funding"

export const ACCOUNT_VERIFICATION_LIST_LABEL = "Account verification"
export const VERIFICATION_DEPOSIT_PRODUCT_LABEL = "Verification deposit"
export const VERIFICATION_BANK_FALLBACK = "Your bank"

export const BANK_VERIFICATION_COMPLETED_DESCRIPTION =
  "Verification only — not added to your balance. If your bank asked you to confirm trial deposits, complete that in your bank app."

/** USD/EUR/GBP: Noah treats deposits under 1 unit as verification attempts. */
export const VERIFICATION_FIAT_AMOUNT_THRESHOLD = 1

export function isVerificationDepositMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata || typeof metadata !== "object") return false
  return String(metadata.deposit_kind ?? "").toLowerCase() === "verification"
}

function readFiatAmountFromPayload(payload: Record<string, unknown>): number | null {
  const fp = payload.FiatPayment as Record<string, unknown> | undefined
  if (fp?.Amount != null) {
    const n = Number.parseFloat(String(fp.Amount))
    if (Number.isFinite(n)) return n
  }
  if (payload.FiatAmount != null) {
    const n = Number.parseFloat(String(payload.FiatAmount))
    if (Number.isFinite(n)) return n
  }
  return null
}

function readFiatAmountFromMetadata(metadata: Record<string, unknown>): number | null {
  const raw = metadata.fiat_deposit_amount ?? metadata.fiat_amount
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (raw != null) {
    const n = Number.parseFloat(String(raw))
    if (Number.isFinite(n)) return n
  }
  return null
}

function readSettledAmount(metadata: Record<string, unknown>): number | null {
  const raw = metadata.settled_amount ?? metadata.posted_amount
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (raw != null) {
    const n = Number.parseFloat(String(raw))
    if (Number.isFinite(n)) return n
  }
  return null
}

function readRemainingFromPayload(payload: Record<string, unknown>): number | null {
  const items = payload.Breakdown
  if (!Array.isArray(items)) return null
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (String(row.Type ?? "") !== "Remaining") continue
    const n = Number.parseFloat(String(row.Amount ?? ""))
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Inbound bank pay-in on Noah ledger (Transaction or metadata flow). */
export function isInboundBankPayInContext(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}): boolean {
  const meta = input.metadata
  if (meta && String(meta.flow ?? "").toLowerCase() === "bank_onramp") return true
  const payload = input.payload
  if (!payload || typeof payload !== "object") return false
  if (String(payload.Direction ?? "") !== "In") return false
  if (String(payload.Network ?? "") !== "OffNetwork") return false
  return !!payload.FiatPayment
}

function hasNoWalletSettlement(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  settledStablecoinAmount?: number | null
}): boolean {
  if (
    input.settledStablecoinAmount != null &&
    Number.isFinite(input.settledStablecoinAmount) &&
    input.settledStablecoinAmount > 0
  ) {
    return false
  }
  const meta = input.metadata
  if (meta) {
    const settled = readSettledAmount(meta)
    if (settled != null && settled > 0) return false
  }
  const payload = input.payload
  if (payload && typeof payload === "object") {
    const remaining = readRemainingFromPayload(payload)
    if (remaining != null && remaining > 0) return false
  }
  return true
}

function isUnderVerificationThreshold(amount: number): boolean {
  return amount >= 0 && amount < VERIFICATION_FIAT_AMOUNT_THRESHOLD
}

/**
 * Classify a bank pay-in as verification (trial/micro deposit) vs funding.
 * Uses Noah rule: fiat &lt; $1 and no on-chain / wallet settlement.
 */
export function classifyVerificationDeposit(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  fiatAmount?: number | null
  settledStablecoinAmount?: number | null
}): DepositKind {
  if (!isInboundBankPayInContext(input)) return "funding"

  const meta = input.metadata ?? {}
  const amount =
    input.fiatAmount ??
    readFiatAmountFromMetadata(meta) ??
    (input.payload ? readFiatAmountFromPayload(input.payload) : null)

  if (amount == null || !isUnderVerificationThreshold(amount)) return "funding"
  if (!hasNoWalletSettlement(input)) return "funding"

  return "verification"
}

/** @deprecated Alias for metadata check after ingest. */
export function isVerificationDeposit(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  fiatAmount?: number | null
  settledStablecoinAmount?: number | null
}): boolean {
  if (isVerificationDepositMetadata(input.metadata)) return true
  return classifyVerificationDeposit(input) === "verification"
}

export function deriveVerificationBankName(input: {
  payload?: Record<string, unknown> | null
  fiatDepositSenderName?: string | null
  metadata?: Record<string, unknown> | null
}): string {
  const meta = input.metadata
  if (meta && typeof meta.verification_bank_name === "string" && meta.verification_bank_name.trim()) {
    return meta.verification_bank_name.trim()
  }

  const payload = input.payload
  if (payload && typeof payload === "object") {
    const fpm = payload.FiatPaymentMethod as Record<string, unknown> | undefined
    const issuer = fpm?.IssuerDetails as Record<string, unknown> | undefined
    const issuerName = issuer?.Name != null ? String(issuer.Name).trim() : ""
    if (issuerName) return formatDisplayPersonName(issuerName) || issuerName

    const sender = payload.Sender as Record<string, unknown> | undefined
    const senderFull = sender?.FullName != null ? String(sender.FullName).trim() : ""
    if (senderFull) return formatDisplayPersonName(senderFull) || senderFull
  }

  const fiatSender = input.fiatDepositSenderName?.trim()
  if (fiatSender) return formatDisplayPersonName(fiatSender) || fiatSender

  return VERIFICATION_BANK_FALLBACK
}

export function buildVerificationDepositMetadataFields(input: {
  payload?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  fiatAmount: number
  settledStablecoinAmount?: number | null
  fiatDepositSenderName?: string | null
}): { deposit_kind: DepositKind; verification_bank_name: string | null } {
  const deposit_kind = classifyVerificationDeposit({
    metadata: input.metadata,
    payload: input.payload,
    fiatAmount: input.fiatAmount,
    settledStablecoinAmount: input.settledStablecoinAmount,
  })
  if (deposit_kind !== "verification") {
    return { deposit_kind: "funding", verification_bank_name: null }
  }
  return {
    deposit_kind: "verification",
    verification_bank_name: deriveVerificationBankName({
      payload: input.payload,
      fiatDepositSenderName: input.fiatDepositSenderName,
      metadata: input.metadata,
    }),
  }
}
