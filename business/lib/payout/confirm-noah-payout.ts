import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { pickNoahWorkflowIdFromResponse } from "@/lib/noah/bank-onramp-workflow"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { buildPayoutQuote, type PayoutQuoteResult } from "@/lib/noah/payout-quote"
import {
  cryptoCurrencyForBalanceCurrency,
  type QuotedPayoutSession,
} from "@/lib/noah/turnkey-offramp-orchestration"
import { resolveRecipientPayoutCountry, type RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import {
  pickDestinationAddress,
  pickTriggerCryptoAmount,
  startOnchainDepositToPaymentWorkflow,
} from "@/lib/terminal/automated-payout-workflow"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import {
  findReusablePayoutLockSession,
  lockedQuoteFromSession,
  upsertPayoutLockSession,
} from "@/lib/payout/payout-lock-session"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { hashRecipientSnapshot } from "@/lib/payout/recipient-snapshot-hash"
import { selectProviderForCorridor } from "@/lib/payout-providers"

const NOAH_OFFRAMP_NETWORK = "Solana"

export type ConfirmNoahPayoutInput = {
  admin: SupabaseClient
  ctx: NoahAccountContext
  userId: string
  businessId: string | null
  noahCustomerId: string
  recipientId: string
  recipient: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  note?: string
  paymentPurpose?: string
}

export async function confirmNoahPayoutOrder(
  input: ConfirmNoahPayoutInput,
): Promise<PayoutQuoteResult> {
  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const quoteKey = buildPayoutQuoteKey({
    recipientId: input.recipientId,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode,
    receiveAmount: input.receiveFiatAmount,
    sendBudget: input.sendBudget,
    note: input.note,
    paymentPurpose: input.paymentPurpose,
  })

  const existing = await findReusablePayoutLockSession(input.admin, {
    userId: input.userId,
    quoteKey,
  })
  if (existing && existing.provider === "noah") {
    return lockedQuoteFromSession(existing)
  }

  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(input.recipient)
  if (!countryCode) throw new Error("Recipient country is required for payout.")

  const provider = await selectProviderForCorridor(input.admin, {
    countryCode,
    currencyCode: receiveCurrency,
    mobileProvider: input.recipient.mobile_provider,
    bankName: input.recipient.bank_name,
  })
  if (provider.id === "yellowcard") {
    throw new Error("Yellowcard corridor must use YC confirm path.")
  }
  if (provider.id === "grid") {
    throw new Error("Grid corridor must use Grid confirm path.")
  }

  const preview = await buildPayoutQuote({
    userId: input.userId,
    noahCustomerId: input.noahCustomerId,
    recipientId: input.recipientId,
    recipient: input.recipient,
    receiveFiatAmount: input.receiveFiatAmount,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode: input.amountEntryMode,
    sendBudget: input.sendBudget,
    prepareOverrides: {
      note: input.note,
      paymentPurpose: input.paymentPurpose,
    },
  })

  const leg = preview.settlement
  const formSessionId = String(leg.sessionId || "").trim()
  const cryptoAuthorizedAmount = String(leg.cryptoAuthorizedAmount || "").trim()
  if (!formSessionId || !cryptoAuthorizedAmount) {
    throw new Error("Noah prepare did not return a form session or crypto authorization.")
  }

  const cryptoCurrency = cryptoCurrencyForBalanceCurrency(input.sourceBalanceCurrency)
  const sourceAddress = (
    await resolveTurnkeyAddressForNoahPair(input.admin, input.ctx, cryptoCurrency, NOAH_OFFRAMP_NETWORK)
  )?.trim()
  if (!sourceAddress) {
    throw new Error("No Turnkey wallet found for this payout. Complete wallet setup first.")
  }

  const lockExternalId = `payout_lock_${randomUUID()}`
  const cryptoTrigger = pickTriggerCryptoAmount(cryptoAuthorizedAmount, cryptoAuthorizedAmount)
  const workflowRaw = await startOnchainDepositToPaymentWorkflow({
    customerId: input.noahCustomerId,
    cryptoCurrency,
    fiatAmount: input.receiveFiatAmount.toFixed(2),
    formSessionId,
    externalId: lockExternalId,
    network: NOAH_OFFRAMP_NETWORK,
    sourceAddress,
    cryptoTriggerAmount: cryptoTrigger,
  })

  const destinationAddress = pickDestinationAddress(workflowRaw)?.trim() || ""
  if (!destinationAddress) {
    throw new Error("Noah did not return a deposit address for this payout.")
  }

  const noahWorkflowId = pickNoahWorkflowIdFromResponse(workflowRaw)
  const quotedSession: QuotedPayoutSession = {
    formSessionId,
    cryptoAuthorizedAmount,
    channelId: preview.channelId,
    noahFloor: leg.cryptoFloor,
    noahSendAmount: leg.cryptoSendAmount,
    totalDebited: String(preview.totalDebited),
    marginAmount: String(preview.marginAmount),
    marginCaptureMode: leg.marginCaptureMode,
    customerRate: leg.customerRate,
    noahMid: leg.providerMid,
  }

  const lockedQuote: PayoutQuoteResult = {
    ...preview,
    quotePhase: "locked",
    requiresConfirm: false,
    quoteKey,
    pricingQuoteId: preview.pricingQuoteId || formSessionId,
  }

  const row = await upsertPayoutLockSession(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
    recipientId: input.recipientId,
    provider: "noah",
    quoteKey,
    recipientSnapshotHash: hashRecipientSnapshot(input.recipient),
    pricing: lockedQuote,
    providerPayload: {
      formSessionId,
      cryptoAuthorizedAmount,
      destinationAddress,
      noahWorkflowId,
      sourceAddress,
      channelId: preview.channelId,
      cryptoCurrency,
      fiatCurrency: receiveCurrency,
      countryCode,
      lockExternalId,
      quotedSession,
    },
    expiresAt: preview.expiresAt,
  })

  return { ...lockedQuote, lockId: row.id }
}
