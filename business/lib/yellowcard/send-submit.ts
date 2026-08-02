import { yellowcardFetch } from "./http"
import { resolveYcSendRefundAddress, type YcSendRefundMode } from "./refund-address"
import { depositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"
import { readYcSendLegFeeLocal, resolveYcPaymentReason } from "@easner/shared"

export type YcSendSubmitInput = {
  sequenceId: string
  customerUID: string
  customerType?: "retail" | "institution"
  channelId: string
  currency: string
  country: string
  localAmount?: number
  amount?: number
  forceAccept?: boolean
  directSettlement?: boolean
  sender?: Record<string, unknown>
  /** @deprecated Prefer destination */
  recipient?: Record<string, unknown>
  destination?: Record<string, unknown>
  /** Root-level YC send fields (cuit, identificationType, …). */
  sendExtras?: Record<string, unknown>
  refundMode: YcSendRefundMode
  userTurnkeyAddress?: string | null
  reason?: string
  /** USDC notional for directSettlement disbursement (omit localAmount/amount). */
  settlementCryptoAmount?: number
}

export type YcSendSubmitResult = {
  id?: string
  sequenceId?: string
  status?: string
  rate?: number
  convertedAmount?: number
  localAmount?: number
  networkFeeAmountUSD?: number
  serviceFeeAmountUSD?: number
  networkFeeAmountLocal?: number
  serviceFeeAmountLocal?: number
  partnerFeeAmountUSD?: number
  partnerFeeAmountLocal?: number
  settlementInfo?: {
    cryptoAmount?: number
    walletAddress?: string
    refundAddress?: string
    cryptoCurrency?: string
    cryptoNetwork?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function buildYcSendSubmitBody(input: YcSendSubmitInput): Record<string, unknown> {
  const refundAddress = resolveYcSendRefundAddress({
    mode: input.refundMode,
    userTurnkeyAddress: input.userTurnkeyAddress,
    ledgerCurrency: "USD",
  })
  const userTurnkeyAddress = String(input.userTurnkeyAddress ?? "").trim()
  const senderAddress =
    input.refundMode === "balance_payout"
      ? userTurnkeyAddress || undefined
      : depositOmnibusSolanaAddressUsd() || undefined
  const directSettlement = input.directSettlement ?? true

  const settlementInfo: Record<string, unknown> = {
    cryptoCurrency: "USDC",
    cryptoNetwork: "SOL",
    refundAddress,
    ...(senderAddress ? { senderAddress } : {}),
  }
  if (directSettlement && input.settlementCryptoAmount != null) {
    // Full 6dp USDC — rounding to cents overpays local (e.g. 1.48 → 2011.72 for quoted 2000).
    settlementInfo.cryptoAmount = input.settlementCryptoAmount
  }

  const body: Record<string, unknown> = {
    sequenceId: input.sequenceId,
    customerUID: input.customerUID,
    customerType: input.customerType ?? "retail",
    channelId: input.channelId,
    currency: input.currency.toUpperCase(),
    country: input.country.toUpperCase(),
    forceAccept: input.forceAccept ?? true,
    directSettlement,
    settlementInfo,
  }
  if (!directSettlement) {
    if (input.localAmount != null) body.localAmount = input.localAmount
    if (input.amount != null) body.amount = input.amount
  }
  // YC rejects localAmount/amount when directSettlement is true.
  if (input.sender) body.sender = input.sender
  const destination = input.destination ?? input.recipient
  if (destination) body.destination = destination
  if (input.sendExtras) {
    for (const [key, value] of Object.entries(input.sendExtras)) {
      if (value != null && value !== "") body[key] = value
    }
  }
  body.reason = resolveYcPaymentReason(input.reason)
  return body
}

export async function submitYcSend(input: YcSendSubmitInput): Promise<YcSendSubmitResult> {
  const body = buildYcSendSubmitBody(input)
  return yellowcardFetch<YcSendSubmitResult>({
    method: "POST",
    path: "/send",
    json: body,
  })
}

function ycSendSubmitHasSettlementWallet(sendRes: YcSendSubmitResult): boolean {
  const wallet = String(sendRes.settlementInfo?.walletAddress ?? "").trim()
  return wallet.length > 0
}

function ycSendSubmitReadyWithoutHydrate(sendRes: YcSendSubmitResult): boolean {
  const record = sendRes as Record<string, unknown>
  if (readYcSendLegFeeLocal(record) > 0) return true
  // POST already returned settlement wallet + locked local — skip GET poll.
  const lockedLocal = Number(sendRes.localAmount ?? sendRes.convertedAmount ?? 0)
  return ycSendSubmitHasSettlementWallet(sendRes) && Number.isFinite(lockedLocal) && lockedLocal > 0
}

/**
 * POST /send often omits serviceFeeAmountLocal; GET /send/{id} may lag briefly.
 * Skip hydrate when fee locals or settlement wallet + local amount are already present.
 */
export async function hydrateYcSendSubmitResult(
  sendRes: YcSendSubmitResult,
  opts?: { maxAttempts?: number; delayMs?: number },
): Promise<YcSendSubmitResult> {
  if (ycSendSubmitReadyWithoutHydrate(sendRes)) return sendRes

  const id = String(sendRes.id ?? "").trim()
  if (!id) return sendRes

  const maxAttempts = opts?.maxAttempts ?? 2
  const delayMs = opts?.delayMs ?? 250
  let merged: YcSendSubmitResult = sendRes

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    const full = await yellowcardFetch<YcSendSubmitResult>({
      method: "GET",
      path: `/send/${encodeURIComponent(id)}`,
    })
    merged = {
      ...merged,
      ...full,
      settlementInfo: full.settlementInfo ?? merged.settlementInfo,
    }
    if (ycSendSubmitReadyWithoutHydrate(merged)) {
      return merged
    }
  }

  return merged
}
