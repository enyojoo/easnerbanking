import { YC_QUOTE_TTL_MS, buildLegacyNoahSettlementFromLeg, computePayoutQuoteDisplayProcessingFee, type PayoutSettlementLeg } from "@easner/shared"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import { lockYcBalancePayoutSend } from "@/lib/yellowcard/payout-quote"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  findReusablePayoutLockSession,
  lockedQuoteFromSession,
  upsertPayoutLockSession,
} from "@/lib/payout/payout-lock-session"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { hashRecipientSnapshot } from "@/lib/payout/recipient-snapshot-hash"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ConfirmYcBalancePayoutInput = {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  recipientId: string
  recipient: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  userTurnkeyAddress: string
  senderProfile: Parameters<typeof import("@/lib/yellowcard/kyc-metadata").buildYcKycPersonMetadata>[0]["profile"]
  paymentPurpose?: string
  channelId?: string
}

function buildLockedYcPayoutQuote(input: {
  locked: Awaited<ReturnType<typeof lockYcBalancePayoutSend>>
  receiveAmount: number
  receiveCurrency: string
  sourceBalanceCurrency: string
  quoteKey: string
  lockId: string
}): PayoutQuoteResult {
  const { locked, receiveAmount, receiveCurrency, sourceBalanceCurrency, quoteKey, lockId } = input
  const displayProcessingFee = computePayoutQuoteDisplayProcessingFee({
    processingFee: locked.pricing.processingFee,
    displayChannelCost: locked.pricing.displayChannelCost,
    channelCost: locked.pricing.channelCost,
  })
  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()

  const settlement: PayoutSettlementLeg = {
    totalFee: locked.pricing.channelCost,
    feeCurrency: "USD",
    cryptoAuthorizedAmount: String(locked.cryptoAmount),
    cryptoFloor: String(locked.cryptoAmount),
    cryptoSendAmount: String(locked.cryptoAmount),
    cryptoCurrency: "USDC",
    sessionId: locked.sequenceId,
    customerRate: locked.pricing.customerRate,
    effectiveRate: locked.pricing.customerRate,
    marginCaptureMode: "fee_wallet_deferred",
    channelCost: locked.pricing.channelCost,
    marginAmount: locked.pricing.marginAmount,
    customerPrincipal: locked.pricing.customerPrincipal,
  }

  return {
    receiveAmount,
    receiveCurrency,
    customerPrincipal: locked.pricing.customerPrincipal,
    sendAmount: locked.pricing.customerPrincipal,
    sendCurrency: sourceBalanceCurrency,
    totalDebited: locked.pricing.totalDebited,
    channelCost: locked.pricing.channelCost,
    marginAmount: locked.pricing.marginAmount,
    processingFee: locked.pricing.processingFee,
    displayChannelCost: locked.pricing.displayChannelCost,
    displayProcessingFee,
    ycLegFeesUsd: locked.ycLegFeesUsd,
    channelId: locked.channelId,
    settlement,
    noah: buildLegacyNoahSettlementFromLeg(settlement),
    easner: {
      quoteId: locked.sequenceId,
      expiresAt,
      providerRate: locked.pricing.customerRate,
      effectiveRate: locked.pricing.customerRate,
      destinationAmount: receiveAmount,
      fxMarkupBps: 50,
      payinFeeAmount: 0,
      payoutFeeAmount: locked.pricing.channelCost,
      totalFeeAmount: locked.pricing.marginAmount + locked.pricing.channelCost,
      sourceAmount: locked.pricing.customerPrincipal,
      sourceCurrency: sourceBalanceCurrency,
      destinationCurrency: receiveCurrency,
      pricingTotals: {
        total_easner_fee: locked.pricing.marginAmount,
        total_user_fee: locked.pricing.marginAmount + locked.pricing.channelCost,
        total_recipient_amount: receiveAmount,
      },
    },
    pricingQuoteId: locked.sequenceId,
    expiresAt,
    executionModel: "turnkey_workflow",
    provider: "yellowcard",
    quotePhase: "locked",
    requiresConfirm: false,
    quoteKey,
    lockId,
    yc: {
      sequenceId: locked.sequenceId,
      sendId: locked.sendId ?? undefined,
      channelId: locked.channelId,
      cryptoAmount: locked.cryptoAmount,
      walletAddress: locked.walletAddress,
    },
  }
}

export async function confirmYcBalancePayoutOrder(
  input: ConfirmYcBalancePayoutInput,
): Promise<PayoutQuoteResult> {
  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const quoteKey = buildPayoutQuoteKey({
    recipientId: input.recipientId,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode,
    receiveAmount: input.receiveFiatAmount,
    sendBudget: input.sendBudget,
    paymentPurpose: input.paymentPurpose,
  })

  const existing = await findReusablePayoutLockSession(input.admin, {
    userId: input.userId,
    quoteKey,
  })
  if (existing && existing.provider === "yellowcard") {
    return lockedQuoteFromSession(existing)
  }

  const locked = await lockYcBalancePayoutSend({
    userId: input.userId,
    customerUID: input.userId,
    recipient: input.recipient,
    receiveFiatAmount: input.receiveFiatAmount,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode: input.amountEntryMode,
    sendBudget: input.sendBudget,
    userTurnkeyAddress: input.userTurnkeyAddress,
    senderProfile: input.senderProfile,
    paymentPurpose: input.paymentPurpose,
    channelId: input.channelId,
  })

  const raced = await findReusablePayoutLockSession(input.admin, {
    userId: input.userId,
    quoteKey,
  })
  if (raced && raced.provider === "yellowcard" && String(raced.provider_payload_json?.sendId ?? "") !== String(locked.sendId ?? "")) {
    return lockedQuoteFromSession(raced)
  }

  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const pricing = buildLockedYcPayoutQuote({
    locked,
    receiveAmount: input.receiveFiatAmount,
    receiveCurrency,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    quoteKey,
    lockId: "",
  })

  const row = await upsertPayoutLockSession(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    recipientId: input.recipientId,
    provider: "yellowcard",
    quoteKey,
    recipientSnapshotHash: hashRecipientSnapshot(input.recipient),
    pricing: { ...pricing, lockId: undefined },
    providerPayload: {
      sequenceId: locked.sequenceId,
      sendId: locked.sendId,
      channelId: locked.channelId,
      cryptoAmount: locked.cryptoAmount,
      walletAddress: locked.walletAddress,
      lockedLocalAmount: locked.lockedLocalAmount,
    },
    expiresAt,
  })

  return buildLockedYcPayoutQuote({
    locked,
    receiveAmount: input.receiveFiatAmount,
    receiveCurrency,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    quoteKey,
    lockId: row.id,
  })
}
