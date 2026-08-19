import { getGridQuoteTtlMs, gridQuoteCanReuseOnConfirm } from "@/lib/grid/config"
import {
  buildGridBalancePayoutPreview,
  buildGridLockedPayoutQuoteResult,
  lockGridBalancePayoutQuote,
  type LockGridBalancePayoutQuoteResult,
} from "@/lib/grid/payout-quote"
import type { GridPersonProfile } from "@/lib/grid/kyc-metadata"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  findReusablePayoutLockSession,
  getPayoutLockSession,
  lockedQuoteFromSession,
  upsertPayoutLockSession,
  type PayoutLockSessionRow,
} from "@/lib/payout/payout-lock-session"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { hashRecipientSnapshot } from "@/lib/payout/recipient-snapshot-hash"
import type { SupabaseClient } from "@supabase/supabase-js"

function storedGridExternalAccountId(recipient: RecipientSellPrepareRow): string | null {
  const meta = recipient.metadata
  const obj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {}
  const id = String(obj.grid_external_account_id ?? "").trim()
  return id || null
}

function liveQuoteIdFromLock(row: PayoutLockSessionRow): string {
  return String(row.provider_payload_json?.quoteId ?? "").trim()
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
  paymentPurpose?: string
}

/**
 * Review lock is Easner actuals (Office rate + 1% + FX margin). Grid POST /quotes
 * runs in the background / at PIN so Continue stays fast.
 */
export async function confirmGridBalancePayoutOrder(
  input: ConfirmGridBalancePayoutInput,
): Promise<PayoutQuoteResult> {
  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const quoteKey = buildPayoutQuoteKey({
    recipientId: input.recipientId,
    destinationRef: input.destinationRef,
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
  if (existing && existing.provider === "grid") {
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

  const cryptoAmount = Number(
    preview.settlement?.cryptoAuthorizedAmount ?? preview.customerPrincipal,
  )
  const expiresAt = preview.expiresAt ?? new Date(Date.now() + getGridQuoteTtlMs()).toISOString()
  const customerRate = preview.easner?.effectiveRate ?? preview.settlement?.customerRate ?? 0

  const locked: LockGridBalancePayoutQuoteResult = {
    quoteId: "",
    sequenceId: String(preview.pricingQuoteId || preview.settlement?.sessionId || ""),
    customerId: "",
    externalAccountId: storedGridExternalAccountId(input.recipient) ?? "",
    receiveAmount: preview.receiveAmount,
    receiveCurrency: preview.receiveCurrency,
    cryptoAmount,
    fundingAddress: null,
    exchangeRate: customerRate,
    expiresAt,
    pricing: {
      customerPrincipal: preview.customerPrincipal,
      totalDebited: preview.totalDebited,
      marginAmount: preview.marginAmount,
      processingFee: preview.processingFee,
      channelCost: preview.channelCost,
      customerRate,
    },
  }

  const pricing = buildGridLockedPayoutQuoteResult({
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
    pricing: { ...pricing, lockId: undefined },
    providerPayload: {
      quoteId: "",
      sequenceId: locked.sequenceId,
      customerId: "",
      externalAccountId: locked.externalAccountId,
      cryptoAmount,
      fundingAddress: "",
      paymentPurpose: input.paymentPurpose ?? "",
      amountEntryMode,
      sendBudget: input.sendBudget ?? null,
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

export async function attachLiveGridQuoteToLockSession(input: {
  admin: SupabaseClient
  userId: string
  lockId: string
  recipient: RecipientSellPrepareRow
  senderProfile: GridPersonProfile
}): Promise<PayoutQuoteResult> {
  const row = await getPayoutLockSession(input.admin, {
    lockId: input.lockId,
    userId: input.userId,
  })
  if (!row || row.provider !== "grid") {
    throw new Error("Payout lock expired or invalid.")
  }
  if (liveQuoteIdFromLock(row) && gridQuoteCanReuseOnConfirm(row.expires_at)) {
    return lockedQuoteFromSession(row)
  }

  const payload = row.provider_payload_json ?? {}
  const locked = await lockGridBalancePayoutQuote({
    admin: input.admin,
    userId: input.userId,
    businessId: row.business_id,
    recipient: input.recipient,
    receiveFiatAmount: row.pricing_json.receiveAmount,
    sourceBalanceCurrency: row.pricing_json.sendCurrency || "USD",
    amountEntryMode: payload.amountEntryMode === "send" ? "send" : "receive",
    sendBudget:
      payload.sendBudget != null && Number(payload.sendBudget) > 0
        ? Number(payload.sendBudget)
        : undefined,
    senderProfile: input.senderProfile,
    paymentPurpose: String(payload.paymentPurpose ?? "").trim() || undefined,
  })

  const pricing = buildGridLockedPayoutQuoteResult({
    locked,
    sourceBalanceCurrency: row.pricing_json.sendCurrency || "USD",
    quoteKey: row.quote_key,
    lockId: row.id,
  })

  await input.admin
    .from("payout_lock_sessions")
    .update({
      pricing_json: { ...pricing, lockId: undefined },
      provider_payload_json: {
        ...payload,
        quoteId: locked.quoteId,
        sequenceId: locked.sequenceId,
        customerId: locked.customerId,
        externalAccountId: locked.externalAccountId,
        cryptoAmount: locked.cryptoAmount,
        fundingAddress: locked.fundingAddress ?? "",
      },
      expires_at: locked.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("user_id", input.userId)

  return { ...pricing, lockId: row.id }
}
