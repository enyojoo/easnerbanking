import { getGridQuoteTtlMs, gridQuoteCanReuseOnConfirm } from "@/lib/grid/config"
import {
  buildGridBalancePayoutPreview,
  buildGridLockedPayoutQuoteResult,
  computeGridLockedBalancePayoutPricing,
  fetchGridPayoutExchangeRateQuote,
  lockGridBalancePayoutQuote,
  type LockGridBalancePayoutQuoteResult,
} from "@/lib/grid/payout-quote"
import type { GridPersonProfile } from "@/lib/grid/kyc-metadata"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  findReusablePayoutLockSession,
  lockedQuoteFromSession,
  upsertPayoutLockSession,
  type PayoutLockSessionRow,
} from "@/lib/payout/payout-lock-session"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { hashRecipientSnapshot } from "@/lib/payout/recipient-snapshot-hash"
import type { SupabaseClient } from "@supabase/supabase-js"

function gridReviewQuoteKey(input: {
  recipientId: string
  destinationRef?: string
  sourceBalanceCurrency: string
  amountEntryMode: "send" | "receive"
  receiveAmount: number
  sendBudget?: number
}): string {
  return buildPayoutQuoteKey({
    recipientId: input.recipientId,
    destinationRef: input.destinationRef,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode: input.amountEntryMode,
    receiveAmount: input.receiveAmount,
    sendBudget: input.sendBudget,
  })
}

function isReusableGridReviewLock(row: PayoutLockSessionRow): boolean {
  if (row.provider !== "grid") return false
  return gridQuoteCanReuseOnConfirm(row.expires_at)
}

function storedGridExternalAccountId(recipient: RecipientSellPrepareRow): string {
  const meta = recipient.metadata
  const obj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {}
  return String(obj.grid_external_account_id ?? "").trim()
}

export type ConfirmGridBalancePayoutInput = {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  recipientId: string
  destinationRef?: string
  recipient: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  senderProfile?: GridPersonProfile
  paymentPurpose?: string
}

/**
 * Noah/YC confirm is a fast provider lock (prepare / POST /send).
 * Grid POST /quotes (REALTIME_FUNDING) mints a Solana address and is ~20s, so review
 * locks Grid GET /exchange-rates (cached ~5 min, includes platform fees). Live
 * POST /quotes is prefetched in the background and used at PIN.
 */
export async function confirmGridBalancePayoutOrder(
  input: ConfirmGridBalancePayoutInput,
): Promise<PayoutQuoteResult> {
  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const quoteKey = gridReviewQuoteKey({
    recipientId: input.recipientId,
    destinationRef: input.destinationRef,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode,
    receiveAmount: input.receiveFiatAmount,
    sendBudget: input.sendBudget,
  })

  const existing = await findReusablePayoutLockSession(input.admin, {
    userId: input.userId,
    quoteKey,
  })
  if (existing && isReusableGridReviewLock(existing)) {
    return lockedQuoteFromSession(existing)
  }

  const preview = await buildGridBalancePayoutPreview({
    admin: input.admin,
    userId: input.userId,
    businessId: input.businessId,
    recipient: input.recipient,
    recipientId: input.recipientId,
    receiveFiatAmount: input.receiveFiatAmount,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode: input.amountEntryMode,
    sendBudget: input.sendBudget,
    paymentPurpose: input.paymentPurpose,
  })

  const rail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)
  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const provisional = Number(
    preview.settlement?.cryptoAuthorizedAmount ?? preview.customerPrincipal,
  )
  const liveRate = await fetchGridPayoutExchangeRateQuote({
    receiveCurrency,
    sendingUsdcMajor: provisional,
    rail,
  })
  const processingFeeBps =
    preview.customerPrincipal > 0 && preview.processingFee > 0
      ? Math.round((preview.processingFee / preview.customerPrincipal) * 10_000)
      : 100
  const customerRate = preview.easner?.effectiveRate ?? preview.settlement?.customerRate ?? 0
  const pricing = liveRate
    ? computeGridLockedBalancePayoutPricing({
        receiveAmount: preview.receiveAmount,
        customerRate,
        gridSendingUsd: liveRate.sendingUsd,
        processingFeeBps,
        gridFeesUsd: liveRate.feesUsd,
      })
    : null

  const cryptoAmount = liveRate?.sendingUsd ?? provisional
  const expiresAt = preview.expiresAt ?? new Date(Date.now() + getGridQuoteTtlMs()).toISOString()
  const locked: LockGridBalancePayoutQuoteResult = {
    quoteId: "",
    sequenceId: String(preview.pricingQuoteId || preview.settlement?.sessionId || ""),
    customerId: "",
    externalAccountId: storedGridExternalAccountId(input.recipient),
    receiveAmount: preview.receiveAmount,
    receiveCurrency: preview.receiveCurrency,
    cryptoAmount,
    fundingAddress: null,
    exchangeRate: customerRate,
    expiresAt,
    pricing: {
      customerPrincipal: pricing?.customerPrincipal ?? preview.customerPrincipal,
      totalDebited: pricing?.totalDebited ?? preview.totalDebited,
      marginAmount: pricing?.marginAmount ?? preview.marginAmount,
      processingFee: pricing?.processingFee ?? preview.processingFee,
      channelCost: pricing?.channelCost ?? preview.channelCost,
      customerRate,
    },
  }

  const result = buildGridLockedPayoutQuoteResult({
    locked,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    quoteKey,
    lockId: "",
  })

  const row = await upsertPayoutLockSession(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    recipientId: input.recipientId,
    destinationRef: input.destinationRef,
    provider: "grid",
    quoteKey,
    recipientSnapshotHash: hashRecipientSnapshot(input.recipient),
    pricing: { ...result, lockId: undefined },
    providerPayload: {
      quoteId: "",
      sequenceId: locked.sequenceId,
      customerId: "",
      externalAccountId: locked.externalAccountId,
      cryptoAmount,
      fundingAddress: "",
    },
    expiresAt,
  })

  return buildGridLockedPayoutQuoteResult({
    locked,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    quoteKey,
    lockId: row.id,
  })
}

/** Background POST /quotes so PIN does not wait 20s after review. */
export async function prefetchGridBalancePayoutLiveQuote(
  input: ConfirmGridBalancePayoutInput & { senderProfile: GridPersonProfile },
): Promise<void> {
  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const quoteKey = gridReviewQuoteKey({
    recipientId: input.recipientId,
    destinationRef: input.destinationRef,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode,
    receiveAmount: input.receiveFiatAmount,
    sendBudget: input.sendBudget,
  })
  const existing = await findReusablePayoutLockSession(input.admin, {
    userId: input.userId,
    quoteKey,
  })
  const quoteId = String(existing?.provider_payload_json?.quoteId ?? "").trim()
  const fundingAddress = String(existing?.provider_payload_json?.fundingAddress ?? "").trim()
  if (existing && quoteId && fundingAddress && gridQuoteCanReuseOnConfirm(existing.expires_at)) {
    return
  }

  const locked = await lockGridBalancePayoutQuote({
    admin: input.admin,
    userId: input.userId,
    businessId: input.businessId,
    recipient: input.recipient,
    receiveFiatAmount: input.receiveFiatAmount,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode: input.amountEntryMode,
    sendBudget: input.sendBudget,
    senderProfile: input.senderProfile,
    paymentPurpose: input.paymentPurpose,
  })
  const pricing = buildGridLockedPayoutQuoteResult({
    locked,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    quoteKey,
    lockId: existing?.id ?? "",
  })
  await upsertPayoutLockSession(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    recipientId: input.recipientId,
    destinationRef: input.destinationRef,
    provider: "grid",
    quoteKey,
    recipientSnapshotHash: hashRecipientSnapshot(input.recipient),
    pricing: { ...pricing, lockId: undefined },
    providerPayload: {
      quoteId: locked.quoteId,
      sequenceId: locked.sequenceId,
      customerId: locked.customerId,
      externalAccountId: locked.externalAccountId,
      cryptoAmount: locked.cryptoAmount,
      fundingAddress: locked.fundingAddress ?? "",
    },
    expiresAt: locked.expiresAt,
  })
}
