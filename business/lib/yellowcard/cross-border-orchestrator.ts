import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  YC_QUOTE_TTL_MS,
  TLC_LOCAL_TRANSFER_METHOD,
  bumpYcCrossBorderLocalPayInForOmnibusShortfall,
  checkYcCrossBorderOmnibusSufficient,
  computeEasnerRevenueFeeWalletSweepAmount,
  computeYcCrossBorderPricing,
  computeYcCrossBorderPricingBeforeReceive,
  computeYcCrossBorderPrincipalLocalPayIn,
  EASNER_REVENUE_FEE_WALLET_SWEEP_MIN,
  getGlobalPayoutProcessingTime,
  validateYcRecipientForCorridor,
  YC_CROSS_BORDER_OMNIBUS_TOLERANCE_USDC,
  YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS,
} from "@easner/shared"
import { buildCrossBorderQuoteSummary } from "@/lib/yellowcard/build-yc-quote-response"
import { findYcCrossRate, findYcPayInLeg, findYcRate, listYcRates } from "@/lib/fx/yc-rates"
import { submitYcReceive, type YcReceiveSubmitResult } from "@/lib/yellowcard/receive-submit"
import { submitYcSend } from "@/lib/yellowcard/send-submit"
import { executeYcCryptoDeposit } from "@/lib/yellowcard/execute-yc-crypto-deposit"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import { resolveYcSendChannelId } from "@/lib/payout-providers/yellowcard-provider"
import { mapRecipientToYcSend } from "@/lib/yellowcard/map-recipient-to-yc-send"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import { readPriorSweepFromMetadata, sweepEasnerRevenueFromDepositOmnibus } from "@/lib/processing-fee/fee-wallet-sweep"
import { buildRecipientSnapshotFromRow } from "@/lib/noah/build-payout-execute-snapshot"
import { buildYcCrossBorderOutMetadata, canTransitionYcCrossBorderStatus } from "@/lib/yellowcard/yc-ledger"
import { validateFundBalancePayInAmountLimits } from "@/lib/pay-in-limit-check"
import { buildYcCrossBorderReportingSnapshot } from "@/lib/transactions/reporting-snapshot"
import { generateTransactionId } from "@/lib/transaction-id"
import { buildYcQuoteKey, findReusableYcTransfer } from "@/lib/yellowcard/quote-key"

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

function finalizeCrossBorderLeg1Quote(input: {
  receiveRes: YcReceiveSubmitResult
  pricingFinal: CrossBorderPricingFinal
}): {
  lockedLocalPayIn: number
  omnibusInExpected: number
  leg2CryptoExpected: number
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
  const lockedLocalPayIn = Number(input.receiveRes.localAmount ?? input.pricingFinal.localPayIn)
  if (Math.abs(input.pricingFinal.localPayIn - lockedLocalPayIn) >= 0.01) {
    throw new Error(
      `yc_pay_in_mismatch: YC locked ${lockedLocalPayIn} vs quoted ${input.pricingFinal.localPayIn}`,
    )
  }
  return {
    lockedLocalPayIn,
    omnibusInExpected: receiveCrypto,
    leg2CryptoExpected: input.pricingFinal.sendCryptoUsd,
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
  const ycBuyTo = Number(toLeg?.yc_buy ?? 0)
  if (!ycBuyTo) throw new Error("YC destination rate unavailable for cross-border send leg")

  const pricing = computeYcCrossBorderPricing({
    receiveAmount: input.receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_sell ?? 0),
    ycBuyTo,
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    sendLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
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

  return { cross, pricing, payInCurrency, receiveCurrency, quoteKey }
}

/** Indicative cross-border pricing — no YC API calls, no ledger rows. */
export async function previewCrossBorderQuote(input: CrossBorderTransferInput) {
  const prepared = await prepareCrossBorderQuote(input)
  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
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
    easnerSellFrom: prepared.pricing.customerRate,
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
    expiresAt: String(transfer.expires_at ?? new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()),
    payInRail: input.payInRail,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
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
  const prepared = await prepareCrossBorderQuote(input)
  const existing = await findReusableYcTransfer(input.admin, {
    userId: input.userId,
    mode: "cross_border_send",
    quoteKey: prepared.quoteKey,
  })
  if (existing?.id) {
    return formatCrossBorderFromExistingTransfer(input.admin, existing, input)
  }

  const admin = input.admin
  const payInCurrency = prepared.payInCurrency
  const receiveCurrency = prepared.receiveCurrency
  const cross = prepared.cross
  const receiveCountry = resolveRecipientPayoutCountry(input.recipient)
  if (!receiveCountry) throw new Error("Recipient country required")

  const rates = await listYcRates(admin, { status: "active" })
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
    row: input.recipient,
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

  // Provisional send lock for fee/crypto sizing
  const fromLeg = findYcPayInLeg(rates, payInCurrency) ?? findYcRate(rates, payInCurrency, "USDC")
  const toLeg = findYcPayInLeg(rates, receiveCurrency) ?? findYcRate(rates, receiveCurrency, "USDC")
  const ycBuyTo = Number(toLeg?.yc_buy ?? 0)
  if (!ycBuyTo) throw new Error("YC destination rate unavailable for cross-border send leg")

  const leg2Seq = `yc_cb_l2_${randomUUID()}`
  const provisionalSendCrypto = Math.round((input.receiveAmount / ycBuyTo) * 1_000_000) / 1_000_000
  const sendRes = await submitYcSend({
    sequenceId: leg2Seq,
    customerUID: input.customerUID,
    channelId: sendChannelId,
    currency: receiveCurrency,
    country: receiveCountry,
    settlementCryptoAmount: provisionalSendCrypto,
    refundMode: "cross_border_send",
    sender,
    destination: recipientMapped.destination,
    sendExtras: recipientMapped.root,
    reason: "cross_border_leg2_quote",
  })

  const easnerSellFrom = Number(fromLeg?.easner_sell ?? fromLeg?.yc_sell ?? 0)
  const reportingSourceToUsdRate = Number(fromLeg?.easner_sell ?? 0)
  const sendLeg = {
    cryptoAmountUsd: Number(sendRes.settlementInfo?.cryptoAmount ?? 0),
    networkFeeAmountUsd: Number(sendRes.networkFeeAmountUSD ?? 0),
    serviceFeeAmountUsd: Number(sendRes.serviceFeeAmountUSD ?? 0),
  }
  const pricing = computeYcCrossBorderPricingBeforeReceive({
    receiveAmount: input.receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_sell ?? 0),
    ycBuyTo,
    easnerSellFrom,
    sendLeg,
  })

  let localAmount = pricing.localPayIn
  let leg1Seq = `yc_cb_l1_${randomUUID()}`
  let receiveRes!: YcReceiveSubmitResult
  let pricingFinal!: CrossBorderPricingFinal
  let lockedQuote!: ReturnType<typeof finalizeCrossBorderLeg1Quote>

  for (let attempt = 0; attempt < YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      leg1Seq = `yc_cb_l1_${randomUUID()}`
    }
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
          ? String(input.sourcePhone ?? "").trim()
          : input.senderProfile.phone,
      sourceNetworkId:
        input.payInRail === "mobile_money" ? String(input.sourceNetworkId ?? "").trim() : undefined,
      reason: "cross_border_leg1",
    })

    pricingFinal = computeYcCrossBorderPricing({
      receiveAmount: input.receiveAmount,
      customerRate: cross.rate,
      ycSellFrom: Number(fromLeg?.yc_sell ?? receiveRes.rate ?? 0),
      ycBuyTo: Number(toLeg?.yc_buy ?? sendRes.rate ?? 0),
      receiveLeg: {
        cryptoAmountUsd: Number(receiveRes.settlementInfo?.cryptoAmount ?? 0),
        networkFeeAmountUsd: Number(receiveRes.networkFeeAmountUSD ?? 0),
        serviceFeeAmountUsd: Number(receiveRes.serviceFeeAmountUSD ?? 0),
      },
      sendLeg,
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
      lockedQuote = finalizeCrossBorderLeg1Quote({ receiveRes, pricingFinal })
      break
    }

    if (attempt < YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS - 1) {
      const ycSellFrom = Number(fromLeg?.yc_sell ?? receiveRes.rate ?? 0)
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

  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const startedAt = new Date().toISOString()
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
        customerRate: cross.rate,
      }),
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
      status: "awaiting_pay_in",
      pay_in_currency: payInCurrency,
      receive_currency: receiveCurrency,
      quoted_pay_in: lockedQuote.lockedLocalPayIn,
      quoted_receive: input.receiveAmount,
      customer_rate: cross.rate,
      leg1_sequence_id: leg1Seq,
      leg1_yc_id: receiveRes.id ?? null,
      leg1_channel_id: receiveChannelId,
      leg1_status: receiveRes.status ?? "pending",
      leg2_sequence_id: leg2Seq,
      leg2_yc_id: sendRes.id ?? null,
      leg2_channel_id: sendChannelId,
      leg2_status: "quoted",
      bank_info: receiveRes.bankInfo ?? null,
      settlement_info: {
        receive: receiveRes.settlementInfo,
        send: sendRes.settlementInfo,
      },
      metadata: {
        quote_key: prepared.quoteKey,
        ...crossBorderLeg1EconomicsMetadata({ pricingFinal, locked: lockedQuote }),
        yc_sell_from: Number(fromLeg?.yc_sell ?? 0),
        yc_buy_to: ycBuyTo,
        ...reportingSnapshot,
        recipient: recipientMapped,
        sender,
      },
      expires_at: expiresAt,
    })
    .select("id")
    .single()
  if (trErr || !transfer) throw new Error(trErr?.message || "failed_to_create_yc_transfer")

  const quoteSummary = buildCrossBorderQuoteSummary({
    pricing: pricingFinal,
    payInCurrency,
    receiveCurrency,
    customerRate: cross.rate,
    rail: input.payInRail,
    expiresAt,
    transactionId: easnerTransactionId,
    transferId: String(transfer.id),
    bankInfo: (receiveRes.bankInfo as Record<string, unknown>) ?? null,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
    easnerSellFrom,
    easnerTransactionId,
  })

  const processingTime = getGlobalPayoutProcessingTime(TLC_LOCAL_TRANSFER_METHOD)
  const payoutReview = {
    you_send_amount: lockedQuote.lockedLocalPayIn,
    total_debited: lockedQuote.lockedLocalPayIn,
    exchange_fee: pricingFinal.ycLegFeesUsd,
    processing_fee: pricingFinal.processingFee,
    exchange_rate: cross.rate,
    send_currency: payInCurrency,
    receive_amount: input.receiveAmount,
    receive_currency: receiveCurrency,
    transfer_method: TLC_LOCAL_TRANSFER_METHOD,
    processing_time: processingTime,
    display_processing_fee_local: quoteSummary.displayProcessingFeeLocal ?? 0,
    principal_local_pay_in: computeYcCrossBorderPrincipalLocalPayIn({
      receiveAmount: input.receiveAmount,
      customerRate: cross.rate,
      provisionalPayIn: pricingFinal.provisionalPayIn,
    }),
  }
  const payInReview = {
    local_pay_in: lockedQuote.lockedLocalPayIn,
    principal_local_pay_in: computeYcCrossBorderPrincipalLocalPayIn({
      receiveAmount: input.receiveAmount,
      customerRate: cross.rate,
      provisionalPayIn: pricingFinal.provisionalPayIn,
    }),
    local_currency: payInCurrency,
    processing_fee: pricingFinal.processingFee,
    exchange_fee: pricingFinal.ycLegFeesUsd,
    exchange_rate: cross.rate,
    transfer_method: TLC_LOCAL_TRANSFER_METHOD,
    pay_in_rail: input.payInRail,
    ...(quoteSummary.displayProcessingFeeLocal != null &&
    quoteSummary.displayProcessingFeeLocal > 0
      ? { display_processing_fee_local: quoteSummary.displayProcessingFeeLocal }
      : {}),
  }

  await admin
    .from("yc_transfers")
    .update({
      metadata: {
        ...crossBorderLeg1EconomicsMetadata({ pricingFinal, locked: lockedQuote }),
        yc_leg_fees_usd: pricingFinal.ycLegFeesUsd,
        display_processing_fee: quoteSummary.displayProcessingFee,
        display_processing_fee_local: quoteSummary.displayProcessingFeeLocal,
        provisional_pay_in: pricingFinal.provisionalPayIn,
        ...reportingSnapshot,
        recipient: recipientMapped,
        sender,
        ...(input.sourcePhone
          ? { source_phone: input.sourcePhone, source_network_id: input.sourceNetworkId }
          : {}),
      },
    })
    .eq("id", transfer.id)

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
            customer_rate: cross.rate,
            processing_at: startedAt,
            transaction_started_at: startedAt,
          },
          sequenceId: leg1Seq,
          transferId: transfer.id,
          localPayIn: lockedQuote.lockedLocalPayIn,
          receiveAmount: input.receiveAmount,
          payInCurrency,
          receiveCurrency,
          customerRate: cross.rate,
        }),
        easner_transaction_id: easnerTransactionId,
        yc_transfer_id: transfer.id,
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
        processing_at: startedAt,
        transaction_started_at: startedAt,
        leg1_status: receiveRes.status ?? "pending",
        leg2_status: "quoted",
        ...(input.sourcePhone
          ? {
              source_phone: input.sourcePhone,
              source_network_id: input.sourceNetworkId,
              source_network_name: input.sourceNetworkName,
            }
          : {}),
      },
    })
    .eq("id", tx.id)

  return {
    quotePhase: "locked" as const,
    transferId: String(transfer.id),
    transactionId: String(tx.id),
    easnerTransactionId,
    localPayIn: lockedQuote.lockedLocalPayIn,
    customerRate: cross.rate,
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
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
  }
}

/** Lock YC legs + create ledger rows after user confirms review. */
export async function confirmCrossBorderTransfer(input: CrossBorderTransferInput) {
  return createCrossBorderTransfer(input)
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
  const ycBuyTo = Number(toLeg?.yc_buy ?? 0)
  if (!ycBuyTo) throw new Error("YC destination rate unavailable for cross-border send leg")

  const pricing = computeYcCrossBorderPricing({
    receiveAmount: input.receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_sell ?? 0),
    ycBuyTo,
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    sendLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
  })

  const leg1Seq = `yc_cb_l1_${randomUUID()}`
  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
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
        processing_at: startedAt,
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
  const ycBuyTo = Number(toLeg?.yc_buy ?? 0)
  if (!ycBuyTo) throw new Error("YC destination rate unavailable for cross-border send leg")

  const leg2Seq = `yc_cb_l2_${randomUUID()}`
  const provisionalSendCrypto = Math.round((receiveAmount / ycBuyTo) * 1_000_000) / 1_000_000
  const sendRes = await submitYcSend({
    sequenceId: leg2Seq,
    customerUID: input.customerUID,
    channelId: sendChannelId,
    currency: receiveCurrency,
    country: receiveCountry,
    settlementCryptoAmount: provisionalSendCrypto,
    refundMode: "cross_border_send",
    sender,
    destination: recipientMapped.destination,
    sendExtras: recipientMapped.root,
    reason: "cross_border_leg2_quote",
  })

  const easnerSellFrom = Number(fromLeg?.easner_sell ?? fromLeg?.yc_sell ?? 0)
  const reportingSourceToUsdRate = Number(fromLeg?.easner_sell ?? 0)
  const sendLeg = {
    cryptoAmountUsd: Number(sendRes.settlementInfo?.cryptoAmount ?? 0),
    networkFeeAmountUsd: Number(sendRes.networkFeeAmountUSD ?? 0),
    serviceFeeAmountUsd: Number(sendRes.serviceFeeAmountUSD ?? 0),
  }
  const pricing = computeYcCrossBorderPricingBeforeReceive({
    receiveAmount,
    customerRate: cross.rate,
    ycSellFrom: Number(fromLeg?.yc_sell ?? 0),
    ycBuyTo,
    easnerSellFrom,
    sendLeg,
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
      ycSellFrom: Number(fromLeg?.yc_sell ?? receiveRes.rate ?? 0),
      ycBuyTo: Number(toLeg?.yc_buy ?? sendRes.rate ?? 0),
      receiveLeg: {
        cryptoAmountUsd: Number(receiveRes.settlementInfo?.cryptoAmount ?? 0),
        networkFeeAmountUsd: Number(receiveRes.networkFeeAmountUSD ?? 0),
        serviceFeeAmountUsd: Number(receiveRes.serviceFeeAmountUSD ?? 0),
      },
      sendLeg,
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
      lockedQuote = finalizeCrossBorderLeg1Quote({ receiveRes, pricingFinal })
      break
    }

    if (attempt < YC_CROSS_BORDER_RECEIVE_MAX_ATTEMPTS - 1) {
      const ycSellFrom = Number(fromLeg?.yc_sell ?? receiveRes.rate ?? 0)
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

  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const now = new Date().toISOString()

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
        updated_at: new Date().toISOString(),
      })
      .eq("id", transferId)
    if (transfer.transaction_id) {
      await admin
        .from("transactions")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", transfer.transaction_id)
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
