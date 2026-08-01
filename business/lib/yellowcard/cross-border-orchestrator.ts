import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  applyProviderBindingToRecipient,
  resolveYcQuoteExpiresAt,
  resolveYcPayInDepositExpiresAt,
  TLC_LOCAL_TRANSFER_METHOD,
  alignYcCrossBorderLockedLocalPayIn,
  bumpYcCrossBorderLocalPayInForOmnibusShortfall,
  checkYcCrossBorderOmnibusSufficient,
  computeEasnerRevenueFeeWalletSweepAmount,
  computeYcCrossBorderPricing,
  computeYcCrossBorderPricingBeforeReceive,
  computeYcCrossBorderPrincipalLocalPayIn,
  buildYcReceiveLegFromResponse,
  estimateYcSendLegSettlementCryptoForQuotedReceive,
  EASNER_REVENUE_FEE_WALLET_SWEEP_MIN,
  getGlobalPayoutProcessingTime,
  validateYcRecipientForCorridor,
  YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC,
  YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS,
  ycPayInInstructionNotice,
} from "@easner/shared"
import { buildCrossBorderQuoteSummary } from "@/lib/yellowcard/build-yc-quote-response"
import { findYcCrossRate, findYcPayInLeg, findYcRate, listYcRates } from "@/lib/fx/yc-rates"
import { submitYcReceive, type YcReceiveSubmitResult } from "@/lib/yellowcard/receive-submit"
import { submitYcSend } from "@/lib/yellowcard/send-submit"
import { submitYcSendWithDestinationAmountLock } from "@/lib/yellowcard/yc-send-leg-lock"
import { executeYcCryptoDeposit } from "@/lib/yellowcard/execute-yc-crypto-deposit"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import { resolveYcSendChannelId } from "@/lib/payout-providers/yellowcard-provider"
import { mapRecipientToYcSend } from "@/lib/yellowcard/map-recipient-to-yc-send"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { logYcTiming } from "@/lib/yellowcard/timing"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import { readPriorSweepFromMetadata, sweepEasnerRevenueFromDepositOmnibus } from "@/lib/processing-fee/fee-wallet-sweep"
import { buildRecipientSnapshotFromRow } from "@/lib/noah/build-payout-execute-snapshot"
import { buildYcCrossBorderOutMetadata, buildYcRefundExpectedPatch, canTransitionYcCrossBorderStatus, mergeYcPayoutLifecycle } from "@/lib/yellowcard/yc-ledger"
import { validateFundBalancePayInAmountLimits } from "@/lib/pay-in-limit-check"
import { buildYcCrossBorderReportingSnapshot } from "@/lib/transactions/reporting-snapshot"
import { generateTransactionId } from "@/lib/transaction-id"
import { buildYcQuoteKey, findReusableYcTransfer } from "@/lib/yellowcard/quote-key"
import {
  findReusableCrossBorderLeg2Draft,
  loadCrossBorderLeg2Draft,
  persistCrossBorderLeg2Draft,
  type CrossBorderLeg2DraftPayload,
} from "@/lib/yellowcard/cross-border-leg2-draft"
import { isCrossBorderSplitLockEnabled } from "@/lib/yellowcard/cross-border-split-flags"
import { quoteFiatProcessingFeeBps, recipientPayoutRail } from "@/lib/processing-fee/quote-processing-fee-bps"

function buildRecipientTransactionMetadata(
  recipientId: string | null,
  recipientSnapshot: { full_name?: string | null },
): Record<string, unknown> {
  const recipientName = String(recipientSnapshot.full_name ?? "").trim()
  return {
    ...(recipientId ? { recipient_id: recipientId } : {}),
    recipient_snapshot: recipientSnapshot,
    ...(recipientName
      ? {
          beneficiary_name: recipientName,
          recipient_name: recipientName,
          counterparty_name: recipientName,
        }
      : {}),
  }
}

type CrossBorderPricingFinal = ReturnType<typeof computeYcCrossBorderPricing>

function buildCrossBorderReceiveLegFromResponse(input: {
  receiveRes: YcReceiveSubmitResult
  ycSellFrom: number
  fallbackLocalPayIn: number
}) {
  return buildYcReceiveLegFromResponse({
    cryptoAmountUsd: Number(input.receiveRes.settlementInfo?.cryptoAmount ?? 0),
    lockedLocalPayIn: Number(input.receiveRes.localAmount ?? input.fallbackLocalPayIn),
    customerSellRate: input.ycSellFrom,
    networkFeeAmountUsd: Number(input.receiveRes.networkFeeAmountUSD ?? 0),
    serviceFeeAmountUsd: Number(input.receiveRes.serviceFeeAmountUSD ?? 0),
  })
}

function finalizeCrossBorderLeg1Quote(input: {
  receiveRes: YcReceiveSubmitResult
  pricingFinal: CrossBorderPricingFinal
  submittedLocalAmount: number
}): {
  lockedLocalPayIn: number
  omnibusInExpected: number
  leg2CryptoExpected: number
  pricingFinal: CrossBorderPricingFinal
} {
  const receiveCrypto = Number(
    input.receiveRes.settlementInfo?.cryptoAmount ?? input.pricingFinal.receiveCryptoUsd,
  )
  const omnibusCheck = checkYcCrossBorderOmnibusSufficient({
    receiveCryptoUsd: receiveCrypto,
    sendCryptoUsd: input.pricingFinal.sendCryptoUsd,
    processingFee: input.pricingFinal.processingFee,
    marginAmount: input.pricingFinal.marginAmount,
    tolerance: YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC,
  })
  if (!omnibusCheck.ok) {
    throw new Error(
      `yc_omnibus_below_required: receiveCrypto ${omnibusCheck.cryptoAmount} < required ${omnibusCheck.requiredOmnibus}`,
    )
  }
  const lockedLocalPayIn = alignYcCrossBorderLockedLocalPayIn({
    pricingLocalPayIn: input.pricingFinal.localPayIn,
    submittedLocalAmount: input.submittedLocalAmount,
    receiveRes: input.receiveRes,
  })
  const pricingFinal = { ...input.pricingFinal, localPayIn: lockedLocalPayIn }
  return {
    lockedLocalPayIn,
    omnibusInExpected: receiveCrypto,
    leg2CryptoExpected: pricingFinal.sendCryptoUsd,
    pricingFinal,
  }
}

export function isCrossBorderLeg1OmnibusSufficient(input: {
  omnibusAmount: number
  metadata: Record<string, unknown>
}): boolean {
  const expected = Number(input.metadata.omnibus_in_expected ?? 0)
  if (!(expected > 0)) return true
  const sendCrypto = Number(
    input.metadata.leg2_crypto_expected ??
      (input.metadata as { leg2_crypto_amount?: number }).leg2_crypto_amount ??
      0,
  )
  return checkYcCrossBorderOmnibusSufficient({
    receiveCryptoUsd: input.omnibusAmount,
    sendCryptoUsd: sendCrypto,
    processingFee: Number(input.metadata.processing_fee ?? 0),
    marginAmount: Number(input.metadata.margin_amount ?? 0),
    tolerance: YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC,
  }).ok
}

function crossBorderLeg1EconomicsMetadata(input: {
  pricingFinal: CrossBorderPricingFinal
  locked: ReturnType<typeof finalizeCrossBorderLeg1Quote>
}): Record<string, unknown> {
  return {
    processing_fee: input.pricingFinal.processingFee,
    margin_amount: input.pricingFinal.marginAmount,
    omnibus_in_expected: input.locked.omnibusInExpected,
    leg2_crypto_expected: input.locked.leg2CryptoExpected,
    margin_capture_mode: "fee_wallet_omnibus",
  }
}

async function resolveYcReceiveChannelId(input: {
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
}): Promise<string | null> {
  const channels = await listYellowcardChannels()
  const match = findYcReceiveChannel(channels, {
    country: input.countryCode,
    currency: input.currencyCode,
    rail: input.rail,
  })
  return match ? String(match.id ?? match.channelId ?? "").trim() || null : null
}

type CrossBorderTransferInput = {
  admin: SupabaseClient
  userId: string
  businessId?: string | null
  customerUID: string
  payInCurrency: string
  payInCountry: string
  payInRail: "bank_transfer" | "mobile_money"
  receiveAmount: number
  recipient: RecipientSellPrepareRow
  senderProfile: Parameters<typeof buildYcKycPersonMetadata>[0]["profile"]
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
}

async function prepareCrossBorderQuote(input: CrossBorderTransferInput) {
  if (input.payInRail === "mobile_money") {
    const phone = String(input.sourcePhone ?? "").trim()
    const netId = String(input.sourceNetworkId ?? "").trim()
    if (!phone || !netId) {
      throw new Error("Mobile number and network are required for mobile_money pay-in")
    }
  }
  const admin = input.admin
  const payInCurrency = input.payInCurrency.toUpperCase()
  const receiveCurrency = String(input.recipient.currency || "").toUpperCase()
  const receiveCountry = resolveRecipientPayoutCountry(input.recipient)
  if (!receiveCountry) throw new Error("Recipient country required")
  if (payInCurrency === receiveCurrency) {
    throw new Error("Through Local Currency requires cross-currency corridors")
  }

  const destinationRail = recipientPayoutRail(input.recipient)
  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    {
      countryCode: receiveCountry,
      currencyCode: receiveCurrency,
      rail: destinationRail,
    },
    "cross_border",
    { userId: input.userId, businessId: input.businessId ?? null },
  )

  const payInEnabled = await isYcLocalPayInEnabledForCorridor(admin, {
    countryCode: input.payInCountry,
    currencyCode: payInCurrency,
    rail: input.payInRail,
  })
  if (!payInEnabled) {
    throw new Error("Local pay-in is not enabled for this corridor")
  }

  const rates = await listYcRates(admin, { status: "active" })
  const cross = findYcCrossRate(rates, payInCurrency, receiveCurrency)
  if (!cross?.rate) {
    throw new Error(`No Yellowcard cross rate for ${payInCurrency}→${receiveCurrency}`)
  }

  const fromLeg = findYcPayInLeg(rates, payInCurrency) ?? findYcRate(rates, payInCurrency, "USDC")
  const toLeg = findYcPayInLeg(rates, receiveCurrency) ?? findYcRate(rates, receiveCurrency, "USDC")
  const ycBuyTo = Number(toLeg?.yc_sell ?? 0)
  if (!ycBuyTo) throw new Error("YC destination rate unavailable for cross-border send leg")

  const pricing = computeYcCrossBorderPricing({
    receiveAmount: input.receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_buy ?? 0),
    ycBuyTo,
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    sendLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    processingFeeBps,
  })

  const amountCheck = await validateFundBalancePayInAmountLimits({
    admin,
    countryCode: input.payInCountry,
    currencyCode: payInCurrency,
    rail: input.payInRail,
    localPayIn: pricing.localPayIn,
  })
  if (!amountCheck.ok) {
    throw new Error(
      amountCheck.message.toLowerCase().includes("minimum")
        ? "yc_amount_below_min"
        : amountCheck.message,
    )
  }

  const recipientId =
    String((input.recipient as RecipientSellPrepareRow & { id?: string }).id ?? "").trim() || null
  const quoteKey = buildYcQuoteKey({
    mode: "cross_border_send",
    userId: input.userId,
    recipientId,
    payInCurrency,
    payInCountry: input.payInCountry.toUpperCase(),
    payInRail: input.payInRail,
    receiveAmount: input.receiveAmount,
    sourcePhone: input.sourcePhone ?? null,
    sourceNetworkId: input.sourceNetworkId ?? null,
  })

  return { cross, pricing, payInCurrency, receiveCurrency, quoteKey, rates, fromLeg, toLeg, processingFeeBps }
}

/** Indicative cross-border pricing — no YC API calls, no ledger rows. */
export async function previewCrossBorderQuote(input: CrossBorderTransferInput) {
  const prepared = await prepareCrossBorderQuote(input)
  const expiresAt = resolveYcQuoteExpiresAt()
  const quoteSummary = buildCrossBorderQuoteSummary({
    pricing: prepared.pricing,
    payInCurrency: prepared.payInCurrency,
    receiveCurrency: prepared.receiveCurrency,
    customerRate: prepared.cross.rate,
    rail: input.payInRail,
    expiresAt,
    transactionId: "",
    transferId: "",
    bankInfo: null,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
    easnerSellFrom:
      Number(prepared.fromLeg?.easner_sell ?? prepared.fromLeg?.yc_buy ?? prepared.fromLeg?.rate ?? 0) ||
      prepared.pricing.customerRate,
  })

  return {
    ok: true as const,
    quotePhase: "preview" as const,
    quoteKey: prepared.quoteKey,
    requiresConfirm: true,
    localPayIn: prepared.pricing.localPayIn,
    customerRate: prepared.cross.rate,
    processingFee: prepared.pricing.processingFee,
    ycLegFeesUsd: prepared.pricing.ycLegFeesUsd,
    displayProcessingFee: quoteSummary.displayProcessingFee,
    displayProcessingFeeLocal: quoteSummary.displayProcessingFeeLocal ?? 0,
    displayProcessingFeeCurrency: prepared.payInCurrency,
    provisionalPayIn: prepared.pricing.provisionalPayIn,
    receiveAmount: input.receiveAmount,
    receiveCurrency: prepared.receiveCurrency,
    expiresAt,
    payInRail: input.payInRail,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
  }
}

async function formatCrossBorderFromExistingTransfer(
  admin: SupabaseClient,
  transfer: Record<string, unknown>,
  input: CrossBorderTransferInput,
) {
  const payInCurrency = String(transfer.pay_in_currency ?? input.payInCurrency).toUpperCase()
  const receiveCurrency = String(transfer.receive_currency ?? input.recipient.currency ?? "").toUpperCase()
  const meta = (transfer.metadata || {}) as Record<string, unknown>
  let easnerTransactionId = ""
  let transactionId = ""
  if (transfer.transaction_id) {
    const { data: txRow } = await admin
      .from("transactions")
      .select("id,easner_transaction_id")
      .eq("id", String(transfer.transaction_id))
      .maybeSingle()
    transactionId = String(txRow?.id ?? transfer.transaction_id)
    easnerTransactionId = String(txRow?.easner_transaction_id ?? "")
  }

  const pricing = computeYcCrossBorderPricing({
    receiveAmount: Number(transfer.quoted_receive ?? input.receiveAmount),
    customerRate: Number(transfer.customer_rate ?? 0),
    ycSellFrom: Number(meta.yc_sell_from ?? 0),
    ycBuyTo: Number(meta.yc_buy_to ?? 0),
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    sendLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    processingFeeBps: await quoteFiatProcessingFeeBps(
      admin,
      {
        countryCode: resolveRecipientPayoutCountry(input.recipient) ?? input.payInCountry,
        currencyCode: receiveCurrency,
        rail: recipientPayoutRail(input.recipient),
      },
      "cross_border",
      { userId: input.userId, businessId: input.businessId ?? null },
    ),
  })

  return {
    quotePhase: "locked" as const,
    transferId: String(transfer.id),
    transactionId,
    easnerTransactionId,
    localPayIn: Number(transfer.quoted_pay_in ?? pricing.localPayIn),
    customerRate: Number(transfer.customer_rate ?? 0),
    processingFee: Number(meta.processing_fee ?? pricing.processingFee),
    ycLegFeesUsd: Number(meta.yc_leg_fees_usd ?? pricing.ycLegFeesUsd),
    displayProcessingFee: Number(meta.display_processing_fee ?? 0),
    displayProcessingFeeLocal: Number(meta.display_processing_fee_local ?? 0),
    displayProcessingFeeCurrency: payInCurrency,
    provisionalPayIn: Number(meta.provisional_pay_in ?? pricing.provisionalPayIn),
    receiveAmount: Number(transfer.quoted_receive ?? input.receiveAmount),
    receiveCurrency,
    bankInfo: (transfer.bank_info as Record<string, unknown> | null) ?? null,
    expiresAt: resolveYcPayInDepositExpiresAt({
      lockedAt: String(transfer.created_at ?? ""),
      preferredExpiresAt: String(transfer.expires_at ?? ""),
      country: input.payInCountry,
      payInRail: input.payInRail,
    }),
    payInRail: input.payInRail,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
  }
}

type CrossBorderLockedTransferResult = {
  transferId: string
  transactionId: string
  easnerTransactionId: string
  localPayIn: number
  customerRate: number
  processingFee: number
  ycLegFeesUsd: number
  displayProcessingFee: number
  displayProcessingFeeLocal: number
  displayProcessingFeeCurrency: string
  provisionalPayIn: number
  receiveAmount: number
  receiveCurrency: string
  bankInfo: Record<string, unknown> | null
  expiresAt: string
  payInRail: "bank_transfer" | "mobile_money"
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
  quotePhase: "locked"
}

type CrossBorderLeg2LockResult = {
  ok: true
  quotePhase: "leg2_locked" | "locked"
  quoteKey: string
  leg2DraftId?: string
  localPayIn: number
  customerRate: number
  processingFee: number
  ycLegFeesUsd: number
  displayProcessingFee: number
  displayProcessingFeeLocal: number
  displayProcessingFeeCurrency: string
  provisionalPayIn: number
  receiveAmount: number
  receiveCurrency: string
  expiresAt: string
  payInRail: "bank_transfer" | "mobile_money"
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
  transferId?: string
  transactionId?: string
  easnerTransactionId?: string
  bankInfo?: Record<string, unknown> | null
}

async function resolveCrossBorderSendContext(input: CrossBorderTransferInput, prepared: Awaited<ReturnType<typeof prepareCrossBorderQuote>>) {
  const admin = input.admin
  const payInCurrency = prepared.payInCurrency
  const receiveCurrency = prepared.receiveCurrency
  const receiveCountry = resolveRecipientPayoutCountry(input.recipient)
  if (!receiveCountry) throw new Error("Recipient country required")

  const receiveChannelId = await resolveYcReceiveChannelId({
    countryCode: input.payInCountry.toUpperCase(),
    currencyCode: payInCurrency,
    rail: input.payInRail,
  })
  const sendRail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)
  const sendChannelId = await resolveYcSendChannelId({
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    rail: sendRail,
  })
  if (!receiveChannelId || !sendChannelId) {
    throw new Error("Yellowcard channels unavailable for this corridor")
  }

  const { data: corridorRow } = await admin
    .from("payout_corridors")
    .select("fields_schema")
    .eq("country_code", receiveCountry)
    .eq("currency_code", receiveCurrency)
    .eq("rail", sendRail)
    .maybeSingle()

  const ycRecipientCheck = validateYcRecipientForCorridor({
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    fieldsSchema: corridorRow?.fields_schema,
    row: applyProviderBindingToRecipient(input.recipient, "yellowcard"),
  })
  if (!ycRecipientCheck.ok) {
    throw new Error(ycRecipientCheck.message)
  }

  const sender = buildYcKycPersonMetadata({ profile: input.senderProfile, requireNgIds: true })
  const recipientMapped = await mapRecipientToYcSend(input.recipient, { channelId: sendChannelId })
  if (!recipientMapped.destination.networkId) {
    throw new Error(
      "Yellowcard could not resolve a payout network for this recipient. Re-save the recipient with a bank from the corridor list.",
    )
  }

  return {
    payInCurrency,
    receiveCurrency,
    receiveCountry,
    receiveChannelId,
    sendChannelId,
    sendRail,
    sender,
    recipientMapped,
    fromLeg: prepared.fromLeg,
    toLeg: prepared.toLeg,
    cross: prepared.cross,
  }
}

/** Lock cross-border leg2 (destination send) and persist a reusable draft session. */
export async function lockCrossBorderLeg2(
  input: CrossBorderTransferInput,
): Promise<CrossBorderLeg2LockResult> {
  const prepared = await prepareCrossBorderQuote(input)
  const existing = await findReusableYcTransfer(input.admin, {
    userId: input.userId,
    mode: "cross_border_send",
    quoteKey: prepared.quoteKey,
  })
  if (existing?.id) {
    const locked = await formatCrossBorderFromExistingTransfer(input.admin, existing, input)
    return { ok: true, quoteKey: prepared.quoteKey, ...locked }
  }

  const existingDraft = await findReusableCrossBorderLeg2Draft(input.admin, {
    userId: input.userId,
    quoteKey: prepared.quoteKey,
  })
  if (existingDraft?.id) {
    const meta = (existingDraft.metadata || {}) as Record<string, unknown>
    const payInCurrency = String(existingDraft.pay_in_currency ?? prepared.payInCurrency).toUpperCase()
    const receiveCurrency = String(existingDraft.receive_currency ?? prepared.receiveCurrency).toUpperCase()
    return {
      ok: true,
      quotePhase: "leg2_locked",
      quoteKey: prepared.quoteKey,
      leg2DraftId: String(existingDraft.id),
      localPayIn: Number(existingDraft.quoted_pay_in ?? prepared.pricing.localPayIn),
      customerRate: Number(existingDraft.customer_rate ?? prepared.cross.rate),
      processingFee: Number(meta.processing_fee ?? prepared.pricing.processingFee),
      ycLegFeesUsd: Number(meta.yc_leg_fees_usd ?? prepared.pricing.ycLegFeesUsd),
      displayProcessingFee: Number(meta.display_processing_fee ?? 0),
      displayProcessingFeeLocal: Number(meta.display_processing_fee_local ?? 0),
      displayProcessingFeeCurrency: payInCurrency,
      provisionalPayIn: Number(meta.provisional_pay_in ?? prepared.pricing.provisionalPayIn),
      receiveAmount: Number(existingDraft.quoted_receive ?? input.receiveAmount),
      receiveCurrency,
      expiresAt: String(existingDraft.expires_at ?? resolveYcQuoteExpiresAt()),
      payInRail: input.payInRail,
      sourcePhone: input.sourcePhone,
      sourceNetworkId: input.sourceNetworkId,
      sourceNetworkName: input.sourceNetworkName,
    }
  }

  const ctx = await resolveCrossBorderSendContext(input, prepared)
  const ycBuyTo = Number(ctx.toLeg?.yc_sell ?? 0)
  if (!ycBuyTo) throw new Error("YC destination rate unavailable for cross-border send leg")

  const provisionalSendCrypto = estimateYcSendLegSettlementCryptoForQuotedReceive({
    quotedReceive: input.receiveAmount,
    destinationRate: ycBuyTo,
  })
  const sendLock = await submitYcSendWithDestinationAmountLock({
    receiveAmount: input.receiveAmount,
    initialSettlementCryptoUsd: provisionalSendCrypto,
    destinationRate: ycBuyTo,
    receiveCurrency: ctx.receiveCurrency,
    sequenceIdPrefix: "yc_cb_l2",
    buildSubmit: async ({ settlementCryptoUsd, settlementLocalGross, sequenceId }) =>
      submitYcSend({
        sequenceId,
        customerUID: input.customerUID,
        channelId: ctx.sendChannelId,
        currency: ctx.receiveCurrency,
        country: ctx.receiveCountry,
        settlementCryptoAmount: settlementCryptoUsd,
        settlementLocalGross,
        refundMode: "cross_border_send",
        sender: ctx.sender,
        destination: ctx.recipientMapped.destination,
        sendExtras: ctx.recipientMapped.root,
        reason: "cross_border_leg2_quote",
      }),
  })
  const sendRes = sendLock.sendRes
  const leg2Seq = sendLock.sequenceId
  const lockedReceiveAmount = sendLock.lockedLocalAmount

  const easnerSellFrom = Number(ctx.fromLeg?.easner_sell ?? ctx.fromLeg?.yc_buy ?? 0)
  const sendLeg = {
    cryptoAmountUsd: Number(sendRes.settlementInfo?.cryptoAmount ?? 0),
    networkFeeAmountUsd: Number(sendRes.networkFeeAmountUSD ?? 0),
    serviceFeeAmountUsd: Number(sendRes.serviceFeeAmountUSD ?? 0),
  }
  const pricingBeforeReceive = computeYcCrossBorderPricingBeforeReceive({
    receiveAmount: input.receiveAmount,
    customerRate: ctx.cross.rate,
    ycSellFrom: Number(ctx.fromLeg?.yc_buy ?? 0),
    ycBuyTo,
    easnerSellFrom,
    sendLeg,
    processingFeeBps: prepared.processingFeeBps,
  })

  const expiresAt = resolveYcQuoteExpiresAt(
    (sendRes as { expiresAt?: string }).expiresAt ?? (sendRes as { expires_at?: string }).expires_at,
  )
  const draftPayload: CrossBorderLeg2DraftPayload = {
    quoteKey: prepared.quoteKey,
    payInCurrency: ctx.payInCurrency,
    receiveCurrency: ctx.receiveCurrency,
    receiveCountry: ctx.receiveCountry,
    customerRate: ctx.cross.rate,
    receiveAmount: input.receiveAmount,
    lockedReceiveAmount,
    payInRail: input.payInRail,
    receiveChannelId: ctx.receiveChannelId,
    sendChannelId: ctx.sendChannelId,
    sendRail: ctx.sendRail,
    ycBuyTo,
    ycSellFrom: Number(ctx.fromLeg?.yc_buy ?? 0),
    easnerSellFrom,
    reportingSourceToUsdRate: Number(ctx.fromLeg?.easner_sell ?? 0),
    pricingBeforeReceive: pricingBeforeReceive as unknown as Record<string, unknown>,
    sendLeg,
    sendRes: {
      id: sendRes.id ?? null,
      status: sendRes.status ?? null,
      rate: sendRes.rate ?? null,
      settlementInfo: (sendRes.settlementInfo as Record<string, unknown> | null) ?? null,
      networkFeeAmountUSD: sendRes.networkFeeAmountUSD ?? null,
      serviceFeeAmountUSD: sendRes.serviceFeeAmountUSD ?? null,
    },
    recipientMapped: ctx.recipientMapped as unknown as Record<string, unknown>,
    sender: ctx.sender as unknown as Record<string, unknown>,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
  }

  const leg2DraftId = await persistCrossBorderLeg2Draft({
    admin: input.admin,
    userId: input.userId,
    businessId: input.businessId,
    quoteKey: prepared.quoteKey,
    payInCurrency: ctx.payInCurrency,
    receiveCurrency: ctx.receiveCurrency,
    receiveAmount: input.receiveAmount,
    customerRate: ctx.cross.rate,
    leg2SequenceId: leg2Seq,
    leg2YcId: sendRes.id ?? null,
    leg2ChannelId: ctx.sendChannelId,
    sendLeg,
    settlementInfo: { send: sendRes.settlementInfo ?? null },
    expiresAt,
    payload: draftPayload,
  })

  const quoteSummary = buildCrossBorderQuoteSummary({
    pricing: pricingBeforeReceive,
    payInCurrency: ctx.payInCurrency,
    receiveCurrency: ctx.receiveCurrency,
    customerRate: ctx.cross.rate,
    rail: input.payInRail,
    expiresAt,
    transactionId: "",
    transferId: leg2DraftId,
    bankInfo: null,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
    easnerSellFrom,
  })

  return {
    ok: true,
    quotePhase: "leg2_locked",
    quoteKey: prepared.quoteKey,
    leg2DraftId,
    localPayIn: pricingBeforeReceive.localPayIn,
    customerRate: ctx.cross.rate,
    processingFee: pricingBeforeReceive.processingFee,
    ycLegFeesUsd: pricingBeforeReceive.ycLegFeesUsd,
    displayProcessingFee: quoteSummary.displayProcessingFee,
    displayProcessingFeeLocal: quoteSummary.displayProcessingFeeLocal ?? 0,
    displayProcessingFeeCurrency: ctx.payInCurrency,
    provisionalPayIn: pricingBeforeReceive.provisionalPayIn,
    receiveAmount: input.receiveAmount,
    receiveCurrency: ctx.receiveCurrency,
    expiresAt,
    payInRail: input.payInRail,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
  }
}

/** Confirm cross-border leg1 (source receive) using a prior leg2 draft session. */
export async function confirmCrossBorderLeg1(
  input: CrossBorderTransferInput,
  leg2DraftId: string,
): Promise<CrossBorderLockedTransferResult> {
  const { row: draftRow, payload } = await loadCrossBorderLeg2Draft(input.admin, {
    userId: input.userId,
    leg2DraftId,
  })

  const admin = input.admin
  const payInCurrency = payload.payInCurrency
  const receiveCurrency = payload.receiveCurrency
  const crossRate = payload.customerRate
  const sendLeg = payload.sendLeg
  const leg2Seq = String(draftRow.leg2_sequence_id ?? "")
  const sendChannelId = String(draftRow.leg2_channel_id ?? payload.sendChannelId)
  const receiveChannelId = payload.receiveChannelId
  const reportingSourceToUsdRate = payload.reportingSourceToUsdRate
  const ycBuyTo = payload.ycBuyTo
  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    {
      countryCode: resolveRecipientPayoutCountry(input.recipient) ?? input.payInCountry,
      currencyCode: receiveCurrency,
      rail: recipientPayoutRail(input.recipient),
    },
    "cross_border",
    { userId: input.userId, businessId: input.businessId ?? null },
  )
  const recipientMapped = payload.recipientMapped as Awaited<ReturnType<typeof mapRecipientToYcSend>>
  const sender = payload.sender as ReturnType<typeof buildYcKycPersonMetadata>

  let localAmount = Number(payload.pricingBeforeReceive.localPayIn ?? draftRow.quoted_pay_in ?? 0)
  let leg1Seq = `yc_cb_l1_${randomUUID()}`
  let receiveRes!: YcReceiveSubmitResult
  let pricingFinal!: CrossBorderPricingFinal
  let lockedQuote!: ReturnType<typeof finalizeCrossBorderLeg1Quote>

  for (let attempt = 0; attempt < YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      leg1Seq = `yc_cb_l1_${randomUUID()}`
    }
    logYcTiming("cross_border_receive_attempt", {
      attempt: attempt + 1,
      maxAttempts: YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS,
      localAmount,
      payInCurrency,
      payInCountry: input.payInCountry.toUpperCase(),
      payInRail: input.payInRail,
      leg2DraftId,
    })
    receiveRes = await submitYcReceive({
      sequenceId: leg1Seq,
      customerUID: input.customerUID,
      channelId: receiveChannelId,
      currency: payInCurrency,
      country: input.payInCountry.toUpperCase(),
      localAmount,
      recipient: sender,
      payInRail: input.payInRail,
      sourcePhone:
        input.payInRail === "mobile_money"
          ? String(input.sourcePhone ?? payload.sourcePhone ?? "").trim()
          : input.senderProfile.phone,
      sourceNetworkId:
        input.payInRail === "mobile_money"
          ? String(input.sourceNetworkId ?? payload.sourceNetworkId ?? "").trim()
          : undefined,
      reason: "cross_border_leg1",
    })

    pricingFinal = computeYcCrossBorderPricing({
      receiveAmount: input.receiveAmount,
      customerRate: crossRate,
      ycSellFrom: Number(payload.ycSellFrom ?? receiveRes.rate ?? 0),
      ycBuyTo: Number(ycBuyTo ?? payload.sendRes.rate ?? 0),
      receiveLeg: buildCrossBorderReceiveLegFromResponse({
        receiveRes,
        ycSellFrom: Number(payload.ycSellFrom ?? receiveRes.rate ?? 0),
        fallbackLocalPayIn: localAmount,
      }),
      sendLeg,
      processingFeeBps,
    })

    const receiveCrypto = Number(
      receiveRes.settlementInfo?.cryptoAmount ?? pricingFinal.receiveCryptoUsd,
    )
    const omnibusCheck = checkYcCrossBorderOmnibusSufficient({
      receiveCryptoUsd: receiveCrypto,
      sendCryptoUsd: pricingFinal.sendCryptoUsd,
      processingFee: pricingFinal.processingFee,
      marginAmount: pricingFinal.marginAmount,
      tolerance: YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC,
    })

    if (omnibusCheck.ok) {
      lockedQuote = finalizeCrossBorderLeg1Quote({
        receiveRes,
        pricingFinal,
        submittedLocalAmount: localAmount,
      })
      pricingFinal = lockedQuote.pricingFinal
      break
    }

    if (attempt < YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS - 1) {
      const ycSellFrom = Number(payload.ycSellFrom ?? receiveRes.rate ?? 0)
      localAmount = bumpYcCrossBorderLocalPayInForOmnibusShortfall({
        localPayIn: Math.max(
          localAmount,
          Number(receiveRes.localAmount ?? 0),
          pricingFinal.localPayIn,
        ),
        ycSellFrom,
        requiredOmnibus: omnibusCheck.requiredOmnibus,
        cryptoAmount: omnibusCheck.cryptoAmount,
      })
      continue
    }

    throw new Error(
      `yc_omnibus_below_required: receiveCrypto ${omnibusCheck.cryptoAmount} < required ${omnibusCheck.requiredOmnibus}`,
    )
  }

  const reportingSnapshot = buildYcCrossBorderReportingSnapshot({
    localPayIn: lockedQuote.lockedLocalPayIn,
    payInCurrency,
    easnerSellFrom: reportingSourceToUsdRate,
    receiveCryptoUsd: pricingFinal.receiveCryptoUsd,
    sendCryptoUsd: pricingFinal.sendCryptoUsd,
  })

  const startedAt = new Date().toISOString()
  const expiresAt = resolveYcPayInDepositExpiresAt({
    lockedAt: startedAt,
    preferredExpiresAt:
      (receiveRes as { expiresAt?: string }).expiresAt ??
      (receiveRes as { expires_at?: string }).expires_at,
    country: input.payInCountry,
    payInRail: input.payInRail,
  })
  const easnerTransactionId = generateTransactionId()
  const recipientSnapshot = buildRecipientSnapshotFromRow(input.recipient)
  const recipientId =
    String((input.recipient as RecipientSellPrepareRow & { id?: string }).id ?? "").trim() ||
    null
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .insert({
      user_id: input.userId,
      business_id: input.businessId ?? null,
      provider: "yellowcard",
      provider_transaction_id: leg1Seq,
      status: "pending",
      amount: lockedQuote.lockedLocalPayIn,
      currency: payInCurrency,
      direction: "out",
      easner_transaction_id: easnerTransactionId,
      occurred_at: startedAt,
      metadata: buildYcCrossBorderOutMetadata({
        prior: {
          ...reportingSnapshot,
          ...buildRecipientTransactionMetadata(recipientId, recipientSnapshot),
        },
        sequenceId: leg1Seq,
        localPayIn: lockedQuote.lockedLocalPayIn,
        receiveAmount: input.receiveAmount,
        payInCurrency,
        receiveCurrency,
        customerRate: crossRate,
      }),
    })
    .select("id")
    .single()
  if (txErr || !tx) throw new Error(txErr?.message || "failed_to_create_transaction")

  const quoteSummary = buildCrossBorderQuoteSummary({
    pricing: pricingFinal,
    payInCurrency,
    receiveCurrency,
    customerRate: crossRate,
    rail: input.payInRail,
    expiresAt,
    transactionId: easnerTransactionId,
    transferId: String(draftRow.id),
    bankInfo: (receiveRes.bankInfo as Record<string, unknown>) ?? null,
    sourcePhone: input.sourcePhone ?? payload.sourcePhone,
    sourceNetworkId: input.sourceNetworkId ?? payload.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName ?? payload.sourceNetworkName,
    easnerSellFrom: payload.easnerSellFrom,
    easnerTransactionId,
  })

  const { error: trErr } = await admin
    .from("yc_transfers")
    .update({
      transaction_id: tx.id,
      status: "awaiting_pay_in",
      quoted_pay_in: lockedQuote.lockedLocalPayIn,
      leg1_sequence_id: leg1Seq,
      leg1_yc_id: receiveRes.id ?? null,
      leg1_channel_id: receiveChannelId,
      leg1_status: receiveRes.status ?? "pending",
      bank_info: receiveRes.bankInfo ?? null,
      settlement_info: {
        receive: receiveRes.settlementInfo,
        send: payload.sendRes.settlementInfo,
      },
      metadata: {
        quote_key: payload.quoteKey,
        ...crossBorderLeg1EconomicsMetadata({ pricingFinal, locked: lockedQuote }),
        yc_sell_from: payload.ycSellFrom,
        yc_buy_to: ycBuyTo,
        ...reportingSnapshot,
        recipient: recipientMapped,
        sender,
        yc_leg_fees_usd: pricingFinal.ycLegFeesUsd,
        display_processing_fee: quoteSummary.displayProcessingFee,
        display_processing_fee_local: quoteSummary.displayProcessingFeeLocal,
        provisional_pay_in: pricingFinal.provisionalPayIn,
        ...(input.sourcePhone || payload.sourcePhone
          ? {
              source_phone: input.sourcePhone ?? payload.sourcePhone,
              source_network_id: input.sourceNetworkId ?? payload.sourceNetworkId,
            }
          : {}),
      },
      expires_at: expiresAt,
      updated_at: startedAt,
    })
    .eq("id", leg2DraftId)
    .eq("user_id", input.userId)
    .eq("status", "leg2_quoted")

  if (trErr) throw new Error(trErr.message || "failed_to_update_yc_transfer")

  const processingTime = getGlobalPayoutProcessingTime(TLC_LOCAL_TRANSFER_METHOD)
  const payoutReview = {
    you_send_amount: lockedQuote.lockedLocalPayIn,
    total_debited: lockedQuote.lockedLocalPayIn,
    exchange_fee: pricingFinal.ycLegFeesUsd,
    processing_fee: pricingFinal.processingFee,
    exchange_rate: crossRate,
    send_currency: payInCurrency,
    receive_amount: input.receiveAmount,
    receive_currency: receiveCurrency,
    transfer_method: TLC_LOCAL_TRANSFER_METHOD,
    processing_time: processingTime,
    display_processing_fee_local: quoteSummary.displayProcessingFeeLocal ?? 0,
    principal_local_pay_in: computeYcCrossBorderPrincipalLocalPayIn({
      receiveAmount: input.receiveAmount,
      customerRate: crossRate,
      provisionalPayIn: pricingFinal.provisionalPayIn,
    }),
  }
  const payInReview = {
    local_pay_in: lockedQuote.lockedLocalPayIn,
    principal_local_pay_in: computeYcCrossBorderPrincipalLocalPayIn({
      receiveAmount: input.receiveAmount,
      customerRate: crossRate,
      provisionalPayIn: pricingFinal.provisionalPayIn,
    }),
    local_currency: payInCurrency,
    processing_fee: pricingFinal.processingFee,
    exchange_fee: pricingFinal.ycLegFeesUsd,
    exchange_rate: crossRate,
    transfer_method: TLC_LOCAL_TRANSFER_METHOD,
    pay_in_rail: input.payInRail,
    ...(quoteSummary.displayProcessingFeeLocal != null && quoteSummary.displayProcessingFeeLocal > 0
      ? { display_processing_fee_local: quoteSummary.displayProcessingFeeLocal }
      : {}),
  }

  await admin
    .from("transactions")
    .update({
      amount: lockedQuote.lockedLocalPayIn,
      currency: payInCurrency,
      metadata: {
        ...buildYcCrossBorderOutMetadata({
          prior: {
            yc_mode: "cross_border_send",
            yc_sequence_id: leg1Seq,
            receive_amount: input.receiveAmount,
            receive_currency: receiveCurrency,
            customer_rate: crossRate,
            quote_locked_at: startedAt,
            transaction_started_at: startedAt,
          },
          sequenceId: leg1Seq,
          transferId: leg2DraftId,
          localPayIn: lockedQuote.lockedLocalPayIn,
          receiveAmount: input.receiveAmount,
          payInCurrency,
          receiveCurrency,
          customerRate: crossRate,
        }),
        easner_transaction_id: easnerTransactionId,
        yc_transfer_id: leg2DraftId,
        local_pay_in: lockedQuote.lockedLocalPayIn,
        local_currency: payInCurrency,
        send_currency: payInCurrency,
        you_send_amount: lockedQuote.lockedLocalPayIn,
        total_debited: lockedQuote.lockedLocalPayIn,
        ...crossBorderLeg1EconomicsMetadata({ pricingFinal, locked: lockedQuote }),
        exchange_fee: pricingFinal.ycLegFeesUsd,
        yc_leg_fees_usd: pricingFinal.ycLegFeesUsd,
        display_processing_fee: quoteSummary.displayProcessingFee,
        display_processing_fee_local: quoteSummary.displayProcessingFeeLocal,
        provisional_pay_in: pricingFinal.provisionalPayIn,
        pay_in_rail: input.payInRail,
        ...buildRecipientTransactionMetadata(recipientId, recipientSnapshot),
        payout_review: payoutReview,
        pay_in_review: payInReview,
        ...reportingSnapshot,
        quote_locked_at: startedAt,
        transaction_started_at: startedAt,
        quote_expires_at: expiresAt,
        yc_bank_info: (receiveRes.bankInfo as Record<string, unknown>) ?? null,
        yc_pay_in_notice: ycPayInInstructionNotice(input.payInRail),
        leg1_status: receiveRes.status ?? "pending",
        leg2_status: payload.sendRes.status ?? "quoted",
        ...(input.sourcePhone || payload.sourcePhone
          ? {
              source_phone: input.sourcePhone ?? payload.sourcePhone,
              source_network_id: input.sourceNetworkId ?? payload.sourceNetworkId,
              source_network_name: input.sourceNetworkName ?? payload.sourceNetworkName,
            }
          : {}),
      },
    })
    .eq("id", tx.id)

  return {
    quotePhase: "locked",
    transferId: leg2DraftId,
    transactionId: String(tx.id),
    easnerTransactionId,
    localPayIn: lockedQuote.lockedLocalPayIn,
    customerRate: crossRate,
    processingFee: pricingFinal.processingFee,
    ycLegFeesUsd: pricingFinal.ycLegFeesUsd,
    displayProcessingFee: quoteSummary.displayProcessingFee,
    displayProcessingFeeLocal: quoteSummary.displayProcessingFeeLocal ?? 0,
    displayProcessingFeeCurrency: payInCurrency,
    provisionalPayIn: pricingFinal.provisionalPayIn,
    receiveAmount: input.receiveAmount,
    receiveCurrency,
    bankInfo: (receiveRes.bankInfo as Record<string, unknown>) ?? null,
    expiresAt,
    payInRail: input.payInRail,
    sourcePhone: input.sourcePhone ?? payload.sourcePhone,
    sourceNetworkId: input.sourceNetworkId ?? payload.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName ?? payload.sourceNetworkName,
  }
}

/**
 * Create locked cross-border quote + leg 1 receive session (bank pay-in).
 */
export async function createCrossBorderTransfer(input: CrossBorderTransferInput): Promise<{
  transferId: string
  transactionId: string
  easnerTransactionId: string
  localPayIn: number
  customerRate: number
  processingFee: number
  ycLegFeesUsd: number
  displayProcessingFee: number
  displayProcessingFeeLocal: number
  displayProcessingFeeCurrency: string
  provisionalPayIn: number
  receiveAmount: number
  receiveCurrency: string
  bankInfo: Record<string, unknown> | null
  expiresAt: string
  payInRail: "bank_transfer" | "mobile_money"
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
  quotePhase: "locked"
}> {
  const leg2 = await lockCrossBorderLeg2(input)
  if (leg2.quotePhase === "locked" && leg2.transferId) {
    return {
      quotePhase: "locked",
      transferId: leg2.transferId,
      transactionId: leg2.transactionId ?? "",
      easnerTransactionId: leg2.easnerTransactionId ?? "",
      localPayIn: leg2.localPayIn,
      customerRate: leg2.customerRate,
      processingFee: leg2.processingFee,
      ycLegFeesUsd: leg2.ycLegFeesUsd,
      displayProcessingFee: leg2.displayProcessingFee,
      displayProcessingFeeLocal: leg2.displayProcessingFeeLocal,
      displayProcessingFeeCurrency: leg2.displayProcessingFeeCurrency,
      provisionalPayIn: leg2.provisionalPayIn,
      receiveAmount: leg2.receiveAmount,
      receiveCurrency: leg2.receiveCurrency,
      bankInfo: leg2.bankInfo ?? null,
      expiresAt: leg2.expiresAt,
      payInRail: leg2.payInRail,
      sourcePhone: leg2.sourcePhone,
      sourceNetworkId: leg2.sourceNetworkId,
      sourceNetworkName: leg2.sourceNetworkName,
    }
  }
  if (!leg2.leg2DraftId) {
    throw new Error("leg2_lock_failed")
  }
  return confirmCrossBorderLeg1(input, leg2.leg2DraftId)
}


/** Lock YC legs + create ledger rows after user confirms review. */
export async function confirmCrossBorderTransfer(
  input: CrossBorderTransferInput,
  opts?: { leg2DraftId?: string },
) {
  const startedAt = Date.now()
  try {
    if (isCrossBorderSplitLockEnabled() && opts?.leg2DraftId) {
      return confirmCrossBorderLeg1(input, opts.leg2DraftId)
    }
    return await createCrossBorderTransfer(input)
  } finally {
    logYcTiming("cross_border_confirm", {
      durationMs: Date.now() - startedAt,
      payInCurrency: input.payInCurrency,
      payInCountry: input.payInCountry,
      payInRail: input.payInRail,
      userId: input.userId,
      receiveAmount: input.receiveAmount,
    })
  }
}

/** @deprecated MoMo cross-border draft — quote API replaces this. Routes return 410. */
export async function createCrossBorderDraft(input: {
  admin: SupabaseClient
  userId: string
  businessId?: string | null
  customerUID: string
  payInCurrency: string
  payInCountry: string
  receiveAmount: number
  recipient: RecipientSellPrepareRow
  senderProfile: Parameters<typeof buildYcKycPersonMetadata>[0]["profile"]
}): Promise<{
  transferId: string
  transactionId: string
  localPayIn: number
  customerRate: number
  processingFee: number
  expiresAt: string
}> {
  const admin = input.admin
  const payInCurrency = input.payInCurrency.toUpperCase()
  const receiveCurrency = String(input.recipient.currency || "").toUpperCase()
  const receiveCountry = resolveRecipientPayoutCountry(input.recipient)
  if (!receiveCountry) throw new Error("Recipient country required")

  const rates = await listYcRates(admin, { status: "active" })
  const cross = findYcCrossRate(rates, payInCurrency, receiveCurrency)
  if (!cross?.rate) {
    throw new Error(`No Yellowcard cross rate for ${payInCurrency}→${receiveCurrency}`)
  }

  const receiveChannelId = await resolveYcReceiveChannelId({
    countryCode: input.payInCountry.toUpperCase(),
    currencyCode: payInCurrency,
    rail: "mobile_money",
  })
  const sendRail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)
  const sendChannelId = await resolveYcSendChannelId({
    countryCode: receiveCountry,
    currencyCode: receiveCurrency,
    rail: sendRail,
  })
  if (!receiveChannelId || !sendChannelId) {
    throw new Error("Yellowcard channels unavailable for this corridor")
  }

  const fromLeg = findYcPayInLeg(rates, payInCurrency) ?? findYcRate(rates, payInCurrency, "USDC")
  const toLeg = findYcPayInLeg(rates, receiveCurrency) ?? findYcRate(rates, receiveCurrency, "USDC")
  const ycBuyTo = Number(toLeg?.yc_sell ?? 0)
  if (!ycBuyTo) throw new Error("YC destination rate unavailable for cross-border send leg")

  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    { countryCode: receiveCountry, currencyCode: receiveCurrency, rail: sendRail },
    "cross_border",
    { userId: input.userId, businessId: input.businessId ?? null },
  )
  const pricing = computeYcCrossBorderPricing({
    receiveAmount: input.receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_buy ?? 0),
    ycBuyTo,
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    sendLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    processingFeeBps,
  })

  const leg1Seq = `yc_cb_l1_${randomUUID()}`
  const expiresAt = resolveYcQuoteExpiresAt()
  const startedAt = new Date().toISOString()
  const sender = buildYcKycPersonMetadata({ profile: input.senderProfile, requireNgIds: true })
  const recipientSnapshot = buildRecipientSnapshotFromRow(input.recipient)
  const recipientId =
    String((input.recipient as RecipientSellPrepareRow & { id?: string }).id ?? "").trim() ||
    null

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .insert({
      user_id: input.userId,
      business_id: input.businessId ?? null,
      provider: "yellowcard",
      provider_transaction_id: leg1Seq,
      status: "pending",
      amount: pricing.localPayIn,
      currency: payInCurrency,
      direction: "out",
      occurred_at: startedAt,
      metadata: {
        yc_mode: "cross_border_send",
        yc_sequence_id: leg1Seq,
        receive_amount: input.receiveAmount,
        receive_currency: receiveCurrency,
        customer_rate: cross.rate,
        quote_locked_at: startedAt,
        transaction_started_at: startedAt,
        pay_in_rail: "mobile_money",
        ...buildRecipientTransactionMetadata(recipientId, recipientSnapshot),
      },
    })
    .select("id")
    .single()
  if (txErr || !tx) throw new Error(txErr?.message || "failed_to_create_transaction")

  const { data: transfer, error: trErr } = await admin
    .from("yc_transfers")
    .insert({
      transaction_id: tx.id,
      user_id: input.userId,
      business_id: input.businessId ?? null,
      mode: "cross_border_send",
      status: "pending_authorize",
      pay_in_currency: payInCurrency,
      receive_currency: receiveCurrency,
      quoted_pay_in: pricing.localPayIn,
      quoted_receive: input.receiveAmount,
      customer_rate: cross.rate,
      leg1_sequence_id: leg1Seq,
      leg1_channel_id: receiveChannelId,
      leg2_channel_id: sendChannelId,
      metadata: {
        processing_fee: pricing.processingFee,
        margin_amount: pricing.marginAmount,
        sender,
        recipient_id: recipientId,
        recipient_snapshot: recipientSnapshot,
        pay_in_country: input.payInCountry.toUpperCase(),
        draft: true,
      },
      expires_at: expiresAt,
    })
    .select("id")
    .single()
  if (trErr || !transfer) throw new Error(trErr?.message || "failed_to_create_yc_transfer")

  return {
    transferId: String(transfer.id),
    transactionId: String(tx.id),
    localPayIn: pricing.localPayIn,
    customerRate: cross.rate,
    processingFee: pricing.processingFee,
    expiresAt,
  }
}

/** MoMo cross-border authorize — submit YC legs on existing draft transfer. */
export async function authorizeCrossBorderDraft(input: {
  admin: SupabaseClient
  userId: string
  customerUID: string
  transferId: string
  sourcePhone: string
  sourceNetworkId: string
  senderProfile: Parameters<typeof buildYcKycPersonMetadata>[0]["profile"]
}): Promise<{
  transferId: string
  transactionId: string
  localPayIn: number
  customerRate: number
  processingFee: number
  bankInfo: Record<string, unknown> | null
  expiresAt: string
}> {
  const phone = String(input.sourcePhone ?? "").trim()
  const networkId = String(input.sourceNetworkId ?? "").trim()
  if (!phone || !networkId) throw new Error("Mobile number and network are required")

  const admin = input.admin
  const { data: transfer } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("id", input.transferId)
    .eq("user_id", input.userId)
    .maybeSingle()
  if (!transfer || transfer.mode !== "cross_border_send") {
    throw new Error("Transfer not found")
  }
  if (String(transfer.status) !== "pending_authorize") {
    throw new Error("Transfer is not awaiting authorization")
  }
  if (transfer.expires_at && new Date(String(transfer.expires_at)).getTime() <= Date.now()) {
    throw new Error("Quote expired — start again")
  }

  const meta = (transfer.metadata || {}) as Record<string, unknown>
  const recipientId = String(meta.recipient_id ?? "").trim()
  const payInCountry = String(meta.pay_in_country ?? input.senderProfile.residenceCountry ?? "").trim().toUpperCase()
  if (!recipientId) throw new Error("Draft session is incomplete")

  const { data: recipient } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", input.userId)
    .maybeSingle()
  if (!recipient) throw new Error("Recipient not found")
  const recipientSnapshot = buildRecipientSnapshotFromRow(
    recipient as RecipientSellPrepareRow,
  )

  const payInCurrency = String(transfer.pay_in_currency ?? "").toUpperCase()
  const receiveAmount = Number(transfer.quoted_receive)
  const receiveCurrency = String(transfer.receive_currency ?? "").toUpperCase()
  const receiveCountry = resolveRecipientPayoutCountry(recipient as RecipientSellPrepareRow)
  if (!receiveCountry) throw new Error("Recipient country required")

  const rates = await listYcRates(admin, { status: "active" })
  const cross = findYcCrossRate(rates, payInCurrency, receiveCurrency)
  if (!cross?.rate) throw new Error(`No Yellowcard cross rate for ${payInCurrency}→${receiveCurrency}`)

  const receiveChannelId = String(transfer.leg1_channel_id ?? "").trim()
  const sendChannelId = String(transfer.leg2_channel_id ?? "").trim()
  if (!receiveChannelId || !sendChannelId) throw new Error("Draft channels missing")

  const sender = buildYcKycPersonMetadata({ profile: input.senderProfile, requireNgIds: true })
  const recipientMapped = await mapRecipientToYcSend(recipient as RecipientSellPrepareRow, {
    channelId: sendChannelId,
  })
  if (!recipientMapped.destination.networkId) {
    throw new Error("Yellowcard could not resolve a payout network for this recipient")
  }

  const fromLeg = findYcPayInLeg(rates, payInCurrency) ?? findYcRate(rates, payInCurrency, "USDC")
  const toLeg = findYcPayInLeg(rates, receiveCurrency) ?? findYcRate(rates, receiveCurrency, "USDC")
  const ycBuyTo = Number(toLeg?.yc_sell ?? 0)
  if (!ycBuyTo) throw new Error("YC destination rate unavailable for cross-border send leg")

  const provisionalSendCrypto = estimateYcSendLegSettlementCryptoForQuotedReceive({
    quotedReceive: receiveAmount,
    destinationRate: ycBuyTo,
  })
  const sendLock = await submitYcSendWithDestinationAmountLock({
    receiveAmount,
    initialSettlementCryptoUsd: provisionalSendCrypto,
    destinationRate: ycBuyTo,
    receiveCurrency,
    sequenceIdPrefix: "yc_cb_l2",
    buildSubmit: async ({ settlementCryptoUsd, settlementLocalGross, sequenceId }) =>
      submitYcSend({
        sequenceId,
        customerUID: input.customerUID,
        channelId: sendChannelId,
        currency: receiveCurrency,
        country: receiveCountry,
        settlementCryptoAmount: settlementCryptoUsd,
        settlementLocalGross,
        refundMode: "cross_border_send",
        sender,
        destination: recipientMapped.destination,
        sendExtras: recipientMapped.root,
        reason: "cross_border_leg2_quote",
      }),
  })
  const sendRes = sendLock.sendRes
  const leg2Seq = sendLock.sequenceId
  const lockedReceiveAmount = sendLock.lockedLocalAmount

  const easnerSellFrom = Number(fromLeg?.easner_sell ?? fromLeg?.yc_buy ?? 0)
  const reportingSourceToUsdRate = Number(fromLeg?.easner_sell ?? 0)
  const sendLeg = {
    cryptoAmountUsd: Number(sendRes.settlementInfo?.cryptoAmount ?? 0),
    networkFeeAmountUsd: Number(sendRes.networkFeeAmountUSD ?? 0),
    serviceFeeAmountUsd: Number(sendRes.serviceFeeAmountUSD ?? 0),
  }
  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    {
      countryCode: receiveCountry,
      currencyCode: receiveCurrency,
      rail: recipientPayoutRail(recipient as RecipientSellPrepareRow),
    },
    "cross_border",
    {
      userId: input.userId,
      businessId: transfer.business_id ? String(transfer.business_id) : null,
    },
  )
  const pricing = computeYcCrossBorderPricingBeforeReceive({
    receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_buy ?? 0),
    ycBuyTo,
    easnerSellFrom,
    sendLeg,
    processingFeeBps,
  })

  let localAmount = pricing.localPayIn
  const leg1Seq = String(transfer.leg1_sequence_id ?? `yc_cb_l1_${randomUUID()}`)
  let receiveRes!: YcReceiveSubmitResult
  let pricingFinal!: CrossBorderPricingFinal
  let lockedQuote!: ReturnType<typeof finalizeCrossBorderLeg1Quote>

  for (let attempt = 0; attempt < YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS; attempt++) {
    receiveRes = await submitYcReceive({
      sequenceId: leg1Seq,
      customerUID: input.customerUID,
      channelId: receiveChannelId,
      currency: payInCurrency,
      country: payInCountry,
      localAmount,
      recipient: sender,
      payInRail: "mobile_money",
      sourcePhone: phone,
      sourceNetworkId: networkId,
      reason: "cross_border_leg1",
    })

    pricingFinal = computeYcCrossBorderPricing({
      receiveAmount,
      customerRate: cross.rate,
      ycSellFrom: Number(fromLeg?.yc_buy ?? receiveRes.rate ?? 0),
      ycBuyTo: Number(toLeg?.yc_sell ?? sendRes.rate ?? 0),
      receiveLeg: buildCrossBorderReceiveLegFromResponse({
        receiveRes,
        ycSellFrom: Number(fromLeg?.yc_buy ?? receiveRes.rate ?? 0),
        fallbackLocalPayIn: localAmount,
      }),
      sendLeg,
      processingFeeBps,
    })

    const receiveCrypto = Number(
      receiveRes.settlementInfo?.cryptoAmount ?? pricingFinal.receiveCryptoUsd,
    )
    const omnibusCheck = checkYcCrossBorderOmnibusSufficient({
      receiveCryptoUsd: receiveCrypto,
      sendCryptoUsd: pricingFinal.sendCryptoUsd,
      processingFee: pricingFinal.processingFee,
      marginAmount: pricingFinal.marginAmount,
      tolerance: YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC,
    })

    if (omnibusCheck.ok) {
      lockedQuote = finalizeCrossBorderLeg1Quote({
        receiveRes,
        pricingFinal,
        submittedLocalAmount: localAmount,
      })
      pricingFinal = lockedQuote.pricingFinal
      break
    }

    if (attempt < YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS - 1) {
      const ycSellFrom = Number(fromLeg?.yc_buy ?? receiveRes.rate ?? 0)
      localAmount = bumpYcCrossBorderLocalPayInForOmnibusShortfall({
        localPayIn: Math.max(
          localAmount,
          Number(receiveRes.localAmount ?? 0),
          pricingFinal.localPayIn,
        ),
        ycSellFrom,
        requiredOmnibus: omnibusCheck.requiredOmnibus,
        cryptoAmount: omnibusCheck.cryptoAmount,
      })
      continue
    }

    throw new Error(
      `yc_omnibus_below_required: receiveCrypto ${omnibusCheck.cryptoAmount} < required ${omnibusCheck.requiredOmnibus}`,
    )
  }

  const reportingSnapshot = buildYcCrossBorderReportingSnapshot({
    localPayIn: lockedQuote.lockedLocalPayIn,
    payInCurrency,
    easnerSellFrom: reportingSourceToUsdRate,
    receiveCryptoUsd: pricingFinal.receiveCryptoUsd,
    sendCryptoUsd: pricingFinal.sendCryptoUsd,
  })

  const now = new Date().toISOString()
  const expiresAt = resolveYcPayInDepositExpiresAt({
    lockedAt: now,
    preferredExpiresAt:
      (receiveRes as { expiresAt?: string }).expiresAt ??
      (receiveRes as { expires_at?: string }).expires_at,
    country: payInCountry,
    payInRail: String(meta.pay_in_rail ?? "bank_transfer") === "mobile_money"
      ? "mobile_money"
      : "bank_transfer",
  })

  await admin
    .from("yc_transfers")
    .update({
      status: "awaiting_pay_in",
      quoted_pay_in: lockedQuote.lockedLocalPayIn,
      leg1_yc_id: receiveRes.id ?? null,
      leg1_status: receiveRes.status ?? "pending",
      leg2_sequence_id: leg2Seq,
      leg2_yc_id: sendRes.id ?? null,
      leg2_status: "quoted",
      bank_info: receiveRes.bankInfo ?? null,
      settlement_info: {
        receive: receiveRes.settlementInfo,
        send: sendRes.settlementInfo,
      },
      expires_at: expiresAt,
      metadata: {
        ...meta,
        ...crossBorderLeg1EconomicsMetadata({ pricingFinal, locked: lockedQuote }),
        recipient: recipientMapped,
        recipient_snapshot: recipientSnapshot,
        sender,
        source_phone: phone,
        source_network_id: networkId,
        draft: false,
        ...reportingSnapshot,
        yc_locked_local_amount: lockedReceiveAmount,
      },
      updated_at: now,
    })
    .eq("id", input.transferId)

  if (transfer.transaction_id) {
    const { data: transactionRow } = await admin
      .from("transactions")
      .select("metadata")
      .eq("id", transfer.transaction_id)
      .maybeSingle()
    await admin
      .from("transactions")
      .update({
        amount: lockedQuote.lockedLocalPayIn,
        metadata: {
          ...((transactionRow?.metadata as Record<string, unknown> | null) ?? {}),
          yc_mode: "cross_border_send",
          yc_sequence_id: leg1Seq,
          receive_amount: receiveAmount,
          receive_currency: receiveCurrency,
          customer_rate: cross.rate,
          pay_in_rail: "mobile_money",
          source_phone: phone,
          source_network_id: networkId,
          ...buildRecipientTransactionMetadata(recipientId, recipientSnapshot),
          ...reportingSnapshot,
        },
        updated_at: now,
      })
      .eq("id", transfer.transaction_id)
  }

  return {
    transferId: String(transfer.id),
    transactionId: String(transfer.transaction_id ?? ""),
    localPayIn: lockedQuote.lockedLocalPayIn,
    customerRate: cross.rate,
    processingFee: pricingFinal.processingFee,
    bankInfo: (receiveRes.bankInfo as Record<string, unknown>) ?? null,
    expiresAt,
  }
}

/**
 * On receive crypto settlement: execute leg 2 send crypto deposit from omnibus.
 * Note: POST /send was already submitted at quote time; deposit USDC to its walletAddress.
 */
export async function maybeExecuteCrossBorderLeg2(
  admin: SupabaseClient,
  transferId: string,
): Promise<void> {
  const { data: transfer } = await admin.from("yc_transfers").select("*").eq("id", transferId).maybeSingle()
  if (!transfer || transfer.mode !== "cross_border_send") return
  if (String(transfer.leg2_status) === "complete" || String(transfer.status) === "completed") return
  if (String(transfer.leg2_status) === "depositing") return
  if (!canTransitionYcCrossBorderStatus(String(transfer.status), "leg2_in_progress")) return

  const settlement = transfer.settlement_info as {
    send?: { walletAddress?: string; cryptoAmount?: number }
  } | null
  const walletAddress = String(settlement?.send?.walletAddress ?? "").trim()
  const cryptoAmount = Number(settlement?.send?.cryptoAmount ?? 0)
  if (!walletAddress || !(cryptoAmount > 0)) {
    throw new Error("cross_border_leg2_missing_settlement")
  }

  await admin
    .from("yc_transfers")
    .update({ leg2_status: "depositing", status: "leg2_in_progress", updated_at: new Date().toISOString() })
    .eq("id", transferId)

  const deposit = await executeYcCryptoDeposit({
    ycWalletAddress: walletAddress,
    cryptoAmountUsd: cryptoAmount,
    pollForSettlement: true,
  })

  if (deposit.status === "failed") {
    const failedAt = new Date().toISOString()
    await admin
      .from("yc_transfers")
      .update({
        status: "failed",
        leg2_status: "failed",
        metadata: {
          ...(transfer.metadata as object),
          leg2_deposit_error: deposit.errorMessage,
          ops_alert: "cross_border_leg2_failed_refund_to_fee_wallet",
        },
        updated_at: failedAt,
      })
      .eq("id", transferId)
    if (transfer.transaction_id) {
      const { data: txRow } = await admin
        .from("transactions")
        .select(
          "id,user_id,business_id,metadata,amount,provider,provider_transaction_id,direction,currency",
        )
        .eq("id", transfer.transaction_id)
        .maybeSingle()
      if (txRow?.id) {
        const prior = (txRow.metadata || {}) as Record<string, unknown>
        const { upsertLedgerTransaction } = await import("@/lib/ledger/transactions")
        await upsertLedgerTransaction(admin, {
          userId: String(txRow.user_id),
          businessId: txRow.business_id ? String(txRow.business_id) : null,
          provider: String(txRow.provider ?? "yellowcard"),
          providerTransactionId: String(
            txRow.provider_transaction_id ?? prior.yc_sequence_id ?? transfer.leg1_sequence_id ?? transfer.id,
          ),
          status: "failed",
          amount: Number(txRow.amount ?? 0),
          currency: String(txRow.currency ?? "USD"),
          direction: txRow.direction === "in" ? "in" : "out",
          metadata: {
            ...mergeYcPayoutLifecycle(prior, { failed_at: failedAt }),
            leg2_deposit_error: deposit.errorMessage,
            ops_alert: "cross_border_leg2_failed_refund_to_fee_wallet",
            failure_leg: "leg2",
            leg2_status: "failed",
            ...buildYcRefundExpectedPatch(prior, {}),
          },
          occurredAt: failedAt,
          baseCurrency: "USD",
        })
      }
    }
    console.error("[yc-cross-border] leg2 deposit failed — USDC refund to fee wallet; NGN recovery runbook", {
      transferId,
      error: deposit.errorMessage,
    })
    return
  }

  await admin
    .from("yc_transfers")
    .update({
      leg1_status: "complete",
      leg2_status: "pending_yc",
      metadata: {
        ...(transfer.metadata as object),
        leg2_deposit_tx_hash: deposit.txHash,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", transferId)
}

/** Mark cross-border complete on SEND.COMPLETE for leg2 + margin sweep to fee wallet. */
export async function completeCrossBorderOnSendSuccess(
  admin: SupabaseClient,
  transferId: string,
): Promise<void> {
  const { data: transfer } = await admin.from("yc_transfers").select("*").eq("id", transferId).maybeSingle()
  if (!transfer) return
  if (String(transfer.status) === "completed") return

  const now = new Date().toISOString()
  const meta = (transfer.metadata || {}) as Record<string, unknown>
  const omnibusIn = Number(transfer.omnibus_in_actual ?? 0)
  const leg2Crypto = Number(
    (transfer.settlement_info as { send?: { cryptoAmount?: number } } | null)?.send?.cryptoAmount ?? 0,
  )
  const processingFee = Number(meta.processing_fee ?? 0)
  const marginAmount = Number(meta.margin_amount ?? 0)
  const residual = omnibusIn > 0 && leg2Crypto > 0 ? Math.max(0, omnibusIn - leg2Crypto) : 0
  const quotedSweep = computeEasnerRevenueFeeWalletSweepAmount({
    marginAmount,
    processingFee,
    ledgerSurplus: residual,
  })
  const sweepAmt = Math.min(quotedSweep, residual)

  let feeWalletSweepTxHash: string | null = null
  if (sweepAmt >= EASNER_REVENUE_FEE_WALLET_SWEEP_MIN && !readPriorSweepFromMetadata(meta).captured) {
    const sweep = await sweepEasnerRevenueFromDepositOmnibus({
      ledgerCurrency: "USD",
      amount: sweepAmt,
      logTag: "yc-cross-border",
    })
    feeWalletSweepTxHash = sweep.feeWalletSweepTxHash
  }

  await admin
    .from("yc_transfers")
    .update({
      status: "completed",
      leg2_status: "complete",
      fee_wallet_sweep: sweepAmt >= EASNER_REVENUE_FEE_WALLET_SWEEP_MIN ? sweepAmt : transfer.fee_wallet_sweep,
      metadata: {
        ...meta,
        margin_capture_mode: "fee_wallet_omnibus",
        ...(feeWalletSweepTxHash ? { fee_wallet_sweep_tx_hash: feeWalletSweepTxHash } : {}),
        completed_at: now,
      },
      updated_at: now,
    })
    .eq("id", transferId)

  if (transfer.transaction_id) {
    const { data: txRow } = await admin
      .from("transactions")
      .select(
        "id,user_id,business_id,metadata,amount,provider,provider_transaction_id,direction,currency",
      )
      .eq("id", transfer.transaction_id)
      .maybeSingle()
    const prior = (txRow?.metadata || {}) as Record<string, unknown>
    const { mergeYcPayoutLifecycle } = await import("@/lib/yellowcard/yc-ledger")
    const { upsertLedgerTransaction } = await import("@/lib/ledger/transactions")
    if (txRow?.id) {
      await upsertLedgerTransaction(admin, {
        userId: String(txRow.user_id),
        businessId: txRow.business_id ? String(txRow.business_id) : null,
        provider: String(txRow.provider ?? "yellowcard"),
        providerTransactionId: String(
          txRow.provider_transaction_id ?? prior.yc_sequence_id ?? transfer.leg1_sequence_id ?? transfer.id,
        ),
        status: "settled",
        amount: Number(txRow.amount ?? 0),
        currency: String(txRow.currency ?? "USD"),
        direction: txRow.direction === "in" ? "in" : "out",
        metadata: mergeYcPayoutLifecycle(prior, { completed_at: now, processing_at: now }),
        occurredAt: now,
        settledAt: now,
        baseCurrency: "USD",
      })
    }
  }
}
