import type { SupabaseClient } from "@supabase/supabase-js"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  findReusablePayoutLockSession,
  lockedQuoteFromSession,
  upsertPayoutLockSession,
} from "@/lib/payout/payout-lock-session"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { hashRecipientSnapshot } from "@/lib/payout/recipient-snapshot-hash"
import { buildBridgeBalancePayoutPreview } from "@/lib/bridge/payout-quote"
import { getBridgeQuoteTtlMs } from "@/lib/bridge/config"

function storedBridgeExternalAccountId(recipient: RecipientSellPrepareRow): string | null {
  const meta = recipient.metadata
  const obj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {}
  const id = String(obj.bridge_external_account_id ?? "").trim()
  return id || null
}

export async function confirmBridgeBalancePayoutOrder(input: {
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
}): Promise<PayoutQuoteResult> {
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
  if (existing && existing.provider === "bridge") {
    return lockedQuoteFromSession(existing)
  }

  const preview = await buildBridgeBalancePayoutPreview({
    admin: input.admin as never,
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
  const cryptoAmount = Number(preview.settlement?.cryptoAuthorizedAmount ?? preview.customerPrincipal)
  const expiresAt = preview.expiresAt ?? new Date(Date.now() + getBridgeQuoteTtlMs()).toISOString()
  const lockedQuote: PayoutQuoteResult = {
    ...preview,
    quotePhase: "locked",
    requiresConfirm: false,
  }
  const row = await upsertPayoutLockSession(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    recipientId: input.recipientId,
    destinationRef: input.destinationRef,
    provider: "bridge",
    quoteKey,
    recipientSnapshotHash: hashRecipientSnapshot(input.recipient),
    pricing: { ...lockedQuote, lockId: undefined },
    providerPayload: {
      sequenceId: String(preview.pricingQuoteId || preview.settlement?.sessionId || ""),
      externalAccountId: storedBridgeExternalAccountId(input.recipient) ?? "",
      cryptoAmount,
      fundingAddress: "",
      paymentPurpose: input.paymentPurpose ?? "",
      sourceBalanceCurrency: input.sourceBalanceCurrency,
    },
    expiresAt,
  })
  return { ...lockedQuote, lockId: row.id, quoteKey }
}
