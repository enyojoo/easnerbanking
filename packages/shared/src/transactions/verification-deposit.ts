/**
 * Noah verification / trial ACH credits to a VA (< $1, not onramped).
 * @see https://docs.noah.com/api-concepts/microdeposits
 */

import { formatDisplayPersonName } from "../format-display-name"
import { parseSentFromNarrationLabel } from "./bank-deposit-inbound-label"

export type DepositKind = "verification" | "funding"

export const ACCOUNT_VERIFICATION_LIST_LABEL = "Account verification"
export const VERIFICATION_DEPOSIT_PRODUCT_LABEL = "Verification deposit"
/** Mobile / API list row title for verification microdeposits. */
export const VERIFICATION_DEPOSIT_LIST_LABEL = "Bank verification deposit"
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

/** Noah FiatDeposit webhook payload (no Transaction FiatPayment leg). */
function isFiatDepositWebhookPayload(payload: Record<string, unknown>): boolean {
  return payload.FiatAmount != null && !payload.FiatPayment
}

/** ACH originator stems that should not be title-cased (e.g. PNC, not Pnc). */
const KNOWN_VERIFICATION_BANK_STEMS: Record<string, string> = {
  PNC: "PNC",
  TD: "TD",
  BMO: "BMO",
  RBC: "RBC",
  HSBC: "HSBC",
  BOA: "BOA",
  USB: "USB",
  WF: "WF",
  SECU: "SECU",
  NFCU: "NFCU",
  CHASE: "Chase",
  CITI: "Citi",
  AMEX: "Amex",
}

/** Format token before a trailing "Bank" (PNC → PNC, CHASE → Chase). */
function formatVerificationBankStem(stem: string): string {
  const t = stem.trim()
  if (!t) return ""
  const upper = t.toUpperCase()
  const known = KNOWN_VERIFICATION_BANK_STEMS[upper]
  if (known) return known
  if (t === upper && /^[A-Z]{2,6}$/.test(t)) return t
  return formatDisplayPersonName(t)
}

function formatVerificationBankWithSuffix(stemPart: string): string {
  const stemFormatted = formatVerificationBankStem(stemPart)
  return stemFormatted ? `${stemFormatted} Bank` : VERIFICATION_BANK_FALLBACK
}

/**
 * ACH originator token → display name (e.g. PNCBANK_XTRANSFR → PNC Bank).
 */
export function formatVerificationBankDisplayName(raw: string | null | undefined): string {
  let s = String(raw ?? "")
    .trim()
    .replace(/_XTRANSFR/gi, "")
    .replace(/ACCTVERIFY/gi, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!s) return VERIFICATION_BANK_FALLBACK

  const words = s.split(/\s+/)
  if (words.length >= 2 && /^bank$/i.test(words[words.length - 1]!)) {
    return formatVerificationBankWithSuffix(words.slice(0, -1).join(" "))
  }

  if (!s.includes(" ") && /bank$/i.test(s) && s.length > 4) {
    return formatVerificationBankWithSuffix(s.slice(0, -4))
  }

  const formatted = formatDisplayPersonName(s)
  return formatted || VERIFICATION_BANK_FALLBACK
}

/** FiatDeposit microdeposits are always verification (never onramped). */
export function classifyVerificationDepositFromFiatDeposit(input: {
  fiatAmount: number
}): DepositKind {
  return isUnderVerificationThreshold(input.fiatAmount) ? "verification" : "funding"
}

/**
 * User-facing narration for verification microdeposits — same "Sent from …" pattern as funding VA pay-ins.
 */
export function deriveVerificationDepositNarrationLabel(input: {
  metadata?: Record<string, unknown> | null
  paymentReference?: string | null
  verificationBankName?: string | null
  fiatDepositSenderName?: string | null
}): string {
  const meta = input.metadata ?? {}
  if (typeof meta.deposit_narration === "string" && meta.deposit_narration.trim()) {
    return meta.deposit_narration.trim()
  }
  if (typeof meta.narration === "string" && /^sent from /i.test(String(meta.narration).trim())) {
    return String(meta.narration).trim()
  }

  const sentFrom = parseSentFromNarrationLabel(input.paymentReference)
  if (sentFrom) return sentFrom

  const bank =
    String(input.verificationBankName ?? "").trim() ||
    formatVerificationBankDisplayName(input.fiatDepositSenderName) ||
    VERIFICATION_BANK_FALLBACK
  return `Sent from ${bank}`
}

export function formatVerificationDepositPushBody(input: {
  amount: number
  currency: string
  bankName: string
}): string {
  const c = String(input.currency || "USD").trim().toUpperCase()
  const n = Number.isFinite(input.amount) ? Math.round(input.amount * 100) / 100 : 0
  const sym = c === "EUR" ? "€" : c === "GBP" ? "£" : "$"
  const amountText = `${sym}${n.toFixed(2)}`
  const bank = String(input.bankName || VERIFICATION_BANK_FALLBACK).trim() || VERIFICATION_BANK_FALLBACK
  return `Received ${amountText} from ${bank}`
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
  const payload = input.payload
  if (payload && typeof payload === "object" && isFiatDepositWebhookPayload(payload)) {
    const amount =
      input.fiatAmount ??
      readFiatAmountFromPayload(payload) ??
      (input.metadata ? readFiatAmountFromMetadata(input.metadata) : null)
    if (amount == null) return "funding"
    return classifyVerificationDepositFromFiatDeposit({ fiatAmount: amount })
  }

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
    if (issuerName) return formatVerificationBankDisplayName(issuerName)

    const sender = payload.Sender as Record<string, unknown> | undefined
    const senderFull = sender?.FullName != null ? String(sender.FullName).trim() : ""
    if (senderFull) return formatVerificationBankDisplayName(senderFull)
  }

  const fiatSender = input.fiatDepositSenderName?.trim()
  if (fiatSender) return formatVerificationBankDisplayName(fiatSender)

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
