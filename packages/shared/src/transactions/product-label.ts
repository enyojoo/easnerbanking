/**
 * Product-facing transaction titles for ledger rows (matches business `/api/transactions` mapping).
 */

import { formatDisplayPersonName } from "../format-display-name"
import { deriveBankDepositInboundDisplayLabel } from "./bank-deposit-inbound-label"
import {
  isNoahVaFundingDeposit,
  isYcFundBalanceDepositMetadata,
  resolveNoahVaFundingDepositTitleFromMeta,
  resolveYcFundBalanceDepositDisplayTitle,
} from "./yc-deposit-display"
import {
  ACCOUNT_VERIFICATION_LIST_LABEL,
  VERIFICATION_DEPOSIT_LIST_LABEL,
  VERIFICATION_DEPOSIT_PRODUCT_LABEL,
  deriveVerificationBankName,
  isVerificationDeposit,
  isVerificationDepositMetadata,
} from "./verification-deposit"

export type EasnerLedgerDirection = "in" | "out"

function firstNonEmptyString(values: readonly unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string") {
      const t = v.trim()
      if (t) return t
    }
  }
  return undefined
}

/** Noah-style inbound crypto (USDC/EURC on-chain) from a raw transaction payload. */
function isNoahPayloadCryptoInbound(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== "object") return false
  const direction = String(payload.Direction ?? "")
  if (direction !== "In") return false
  const net = String(payload.Network ?? "")
  const crypto = String(payload.CryptoCurrency ?? "").toUpperCase()
  return !!(
    net &&
    net !== "OffNetwork" &&
    (crypto.includes("USDC") || crypto.includes("EURC") || crypto.includes("BTC") || crypto.includes("ETH"))
  )
}

/**
 * Best-effort remitter / originator label for inbound bank (fiat) activity.
 * Checks ledger metadata, Noah payload nesting, and common PSP field names.
 */
export function deriveEasnerInboundRemitterDisplayName(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}): string | undefined {
  const meta = input.metadata || {}
  const payload = input.payload || {}

  if (isVerificationDeposit({ metadata: meta, payload })) {
    return deriveVerificationBankName({ metadata: meta, payload })
  }

  const bankSender = deriveBankDepositInboundDisplayLabel({
    metadata: meta,
    fiatDepositSenderName:
      typeof meta.noah_fiat_deposit_sender_name === "string"
        ? meta.noah_fiat_deposit_sender_name
        : null,
  })
  if (bankSender) return bankSender
  const noahWrapped = meta.noah
  const noahTx =
    noahWrapped && typeof noahWrapped === "object" && !Array.isArray(noahWrapped)
      ? (noahWrapped as Record<string, unknown>)
      : null
  const tx =
    noahTx ||
    (payload && typeof payload === "object" && (payload.ID != null || payload.id != null)
      ? (payload as Record<string, unknown>)
      : null) ||
    (payload &&
    typeof payload === "object" &&
    String(payload.Direction ?? "") === "In" &&
    payload.FiatPayment
      ? (payload as Record<string, unknown>)
      : null)

  const candidates: unknown[] = [
    meta.noah_fiat_deposit_sender_name,
    meta.remitter_name,
    meta.sender_name,
    meta.originator_name,
    meta.counterparty_name,
    meta.debtor_name,
    meta.merchant_name,
    meta.company_name,
    meta.sender_company,
    meta.originator_company,
    meta.remitting_company,
    meta.beneficiary_name,
    (meta.source as Record<string, unknown> | undefined)?.sender_name,
    (meta.source as Record<string, unknown> | undefined)?.originator_name,
    (meta.source as Record<string, unknown> | undefined)?.company_name,
    (meta.source as Record<string, unknown> | undefined)?.merchant_name,
    (meta.source as Record<string, unknown> | undefined)?.name,
    (meta.source as Record<string, unknown> | undefined)?.legal_name,
    (meta.destination as Record<string, unknown> | undefined)?.recipient_name,
    payload.counterpartyName,
    payload.recipientName,
    payload.senderName,
    payload.originatorName,
    (payload.source as Record<string, unknown> | undefined)?.sender_name,
    (payload.source as Record<string, unknown> | undefined)?.originator_name,
    (payload.source as Record<string, unknown> | undefined)?.company_name,
  ]

  if (tx) {
    const activity = tx.Activity as Record<string, unknown> | undefined
    const source = (activity?.Source ?? tx.Source) as Record<string, unknown> | undefined
    if (source) {
      candidates.push(
        source.SenderName,
        source.sender_name,
        source.OriginatorName,
        source.originator_name,
        source.CompanyName,
        source.company_name,
        source.MerchantName,
        source.merchant_name,
        source.Name,
        source.LegalName,
        source.DebtorName,
        source.RemitterName,
      )
    }
    const fp = tx.FiatPayment as Record<string, unknown> | undefined
    if (fp) {
      const fpSource = fp.Source as Record<string, unknown> | undefined
      if (fpSource) {
        candidates.push(
          fpSource.SenderName,
          fpSource.sender_name,
          fpSource.CompanyName,
          fpSource.company_name,
          fpSource.MerchantName,
          fpSource.merchant_name,
          fpSource.Name,
        )
      }
    }
  }

  const raw = firstNonEmptyString(candidates)
  if (!raw) return undefined
  const formatted = formatDisplayPersonName(raw)
  return formatted || undefined
}

/**
 * Fixed product line for detail UIs (e.g. "Bank Deposit" vs sender name on a separate row).
 * Does not substitute remitter — use {@link deriveEasnerInboundRemitterDisplayName} for that.
 */
export function toEasnerTransactionProductCategory(input: {
  provider: string
  direction: EasnerLedgerDirection
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}): string {
  const provider = input.provider.toLowerCase()
  const direction = input.direction
  const meta = input.metadata
  if (provider === "easner_internal" && String(meta?.source ?? "").toLowerCase() === "easetag_p2p") {
    return direction === "in" ? "Easetag Received" : "Easetag Send"
  }
  const collectionChannel = String(meta?.collection_channel ?? "").toLowerCase()
  const isWalletSend =
    direction === "out" && String(meta?.activity_type ?? "").trim().toLowerCase() === "wallet_send"
  const isStablecoin =
    !isWalletSend &&
    (provider === "turnkey" ||
      collectionChannel === "autopayout" ||
      (direction === "in" && String(meta?.source_type ?? "").toLowerCase() === "liquidation_address") ||
      (direction === "in" && isNoahPayloadCryptoInbound(input.payload ?? undefined)))

  if (isStablecoin) {
    return direction === "in" ? "Stablecoin Deposit" : "Stablecoin Transfer"
  }
  if (isWalletSend) {
    return "Stablecoin Transfer"
  }
  if (direction === "in" && isVerificationDepositMetadata(meta)) {
    return VERIFICATION_DEPOSIT_PRODUCT_LABEL
  }
  if (direction === "in" && isYcFundBalanceDepositMetadata(meta)) {
    return resolveYcFundBalanceDepositDisplayTitle(meta)
  }
  if (
    direction === "in" &&
    isNoahVaFundingDeposit({
      provider: input.provider,
      direction: "in",
      metadata: meta,
    })
  ) {
    return resolveNoahVaFundingDepositTitleFromMeta(meta)
  }
  if (direction === "in") return "Bank Deposit"
  return "Bank Transfer"
}

/**
 * Primary list/dialog title: stablecoin product labels, inbound bank = remitter when known, else "Bank Deposit".
 */
export function toEasnerTransactionPrimaryLabel(input: {
  provider: string
  direction: EasnerLedgerDirection
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}): string {
  const provider = input.provider.toLowerCase()
  const direction = input.direction
  const meta = input.metadata
  if (provider === "easner_internal" && String(meta?.source ?? "").toLowerCase() === "easetag_p2p") {
    if (direction === "in") {
      const senderTag =
        typeof meta?.sender_easetag === "string" ? meta.sender_easetag.trim().replace(/^@+/, "") : ""
      return senderTag ? `Received from @${senderTag}` : "Easetag Received"
    }
    const payeeTag =
      typeof meta?.payee_easetag === "string" ? meta.payee_easetag.trim().replace(/^@+/, "") : ""
    return payeeTag ? `Sent to @${payeeTag}` : "Easetag Send"
  }
  const collectionChannel = String(meta?.collection_channel ?? "").toLowerCase()
  const isWalletSend =
    direction === "out" && String(meta?.activity_type ?? "").trim().toLowerCase() === "wallet_send"
  const isStablecoin =
    !isWalletSend &&
    (provider === "turnkey" ||
      collectionChannel === "autopayout" ||
      (direction === "in" && String(meta?.source_type ?? "").toLowerCase() === "liquidation_address") ||
      (direction === "in" && isNoahPayloadCryptoInbound(input.payload ?? undefined)))

  if (isStablecoin) {
    return direction === "in" ? "Stablecoin Deposit" : "Stablecoin Transfer"
  }
  if (isWalletSend) {
    const recipientName = firstNonEmptyString([
      meta?.counterparty_name,
      meta?.recipient_name,
      meta?.beneficiary_name,
      (meta?.recipient_snapshot as Record<string, unknown> | undefined)?.full_name,
    ])
    return recipientName || "Wallet transfer"
  }
  if (direction === "in" && isVerificationDepositMetadata(meta)) {
    return VERIFICATION_DEPOSIT_LIST_LABEL
  }
  if (direction === "in" && isYcFundBalanceDepositMetadata(meta)) {
    return resolveYcFundBalanceDepositDisplayTitle(meta)
  }
  if (
    direction === "in" &&
    isNoahVaFundingDeposit({
      provider: input.provider,
      direction: "in",
      metadata: meta,
    })
  ) {
    return resolveNoahVaFundingDepositTitleFromMeta(meta)
  }
  if (direction === "in") {
    return deriveEasnerInboundRemitterDisplayName({
      metadata: input.metadata,
      payload: input.payload,
    }) ?? "Bank Deposit"
  }
  return "Bank Transfer"
}

/**
 * @deprecated Prefer {@link toEasnerTransactionPrimaryLabel} with `payload` for inbound bank labels.
 * Bank inbound without payload cannot resolve remitter from nested Noah data.
 */
export function toEasnerProductTransactionLabel(input: {
  provider: string
  direction: EasnerLedgerDirection
  metadata?: Record<string, unknown> | null
}): string {
  return toEasnerTransactionPrimaryLabel({ ...input, payload: null })
}

/** Inbound titles when no remitter was resolved (generic product labels). */
export function isEasnerProductReceiveTitle(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim()
  if (
    n === "Stablecoin Deposit" ||
    n === "Bank Deposit" ||
    n === ACCOUNT_VERIFICATION_LIST_LABEL ||
    n === VERIFICATION_DEPOSIT_LIST_LABEL ||
    n === VERIFICATION_DEPOSIT_PRODUCT_LABEL
  ) {
    return true
  }
  return / Bank Deposit$/i.test(n) || / MOMO Deposit$/i.test(n)
}

/** Outbound titles from {@link toEasnerTransactionPrimaryLabel}. */
export function isEasnerProductSendTitle(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim()
  if (n === "Stablecoin Transfer" || n === "Bank Transfer" || n === "Wallet transfer") return true
  if (/^Transfer to /i.test(n)) return true
  // Easetag P2P: primary label is "Sent to @handle" or fallback "Easetag Send" (see toEasnerTransactionPrimaryLabel).
  if (n === "Easetag Send") return true
  if (/^Sent to @/i.test(n)) return true
  return false
}

/** Inbound Easetag P2P titles from {@link toEasnerTransactionPrimaryLabel}. */
export function isEasetagReceiveTitle(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim()
  if (n === "Easetag Received") return true
  if (/^Received from @/i.test(n)) return true
  return false
}
