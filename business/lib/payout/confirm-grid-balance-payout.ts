import { getGridQuoteTtlMs } from "@/lib/grid/config"
import {
  buildGridLockedPayoutQuoteResult,
  lockGridBalancePayoutQuote,
} from "@/lib/grid/payout-quote"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  findReusablePayoutLockSession,
  lockedQuoteFromSession,
  upsertPayoutLockSession,
} from "@/lib/payout/payout-lock-session"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { hashRecipientSnapshot } from "@/lib/payout/recipient-snapshot-hash"
import type { GridPersonProfile } from "@/lib/grid/kyc-metadata"
import type { SupabaseClient } from "@supabase/supabase-js"

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
  senderProfile: GridPersonProfile
  paymentPurpose?: string
}

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

  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const expiresAt = locked.expiresAt ?? new Date(Date.now() + getGridQuoteTtlMs()).toISOString()

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
      quoteId: locked.quoteId,
      sequenceId: locked.sequenceId,
      customerId: locked.customerId,
      externalAccountId: locked.externalAccountId,
      cryptoAmount: locked.cryptoAmount,
      fundingAddress: locked.fundingAddress,
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
