import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { randomUUID } from "crypto"
import { getNoahEurCryptoTicker, getNoahSettlementCryptoCurrency } from "@/lib/noah/config"
import { findNoahRate, listNoahRates } from "@/lib/fx/noah-rates"
import {
  computeGlobalPayoutPricing,
  computePayoutProcessingFeeBps,
  normalizeGlobalPayoutQuoteReceiveAmount,
  normalizePayoutReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
  buildLegacyNoahSettlementFromLeg,
  computePayoutQuoteDisplayProcessingFee,
  type PayoutSettlementLeg,
} from "@easner/shared"
import {
  prepareSellFromRecipientRow,
  resolveRecipientPayoutCountry,
  type RecipientSellPrepareRow,
  type SellPrepareOverrides,
} from "@/lib/terminal/recipient-sell-prepare"
import { NoProviderForCorridorError, selectProviderForCorridor } from "@/lib/payout-providers"
import { mapNoahPrepareError } from "@/lib/noah/noah-prepare-errors"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { quoteFiatProcessingFeeBps, recipientPayoutRail } from "@/lib/processing-fee/quote-processing-fee-bps"
import { logNoahPayoutFailure } from "@/lib/noah/log-noah-payout-failure"
import { getGlobalPayoutMarginCaptureMode } from "@/lib/noah/margin-capture-mode"
import { noahImpliedProviderRate } from "@/lib/noah/fx-prices"
import {
  computeNoahOfframpScheduleFee,
  noahOfframpScheduleFeeDelta,
  NOAH_OFFRAMP_SCHEDULE_FEE_TOLERANCE_USD,
  resolveNoahOfframpPaymentMethodKey,
} from "@/lib/noah/noah-offramp-fee-schedule"

/** Easner fee slice on payout quotes (Noah prepare is authoritative at lock; preview uses noah_rates). */
export type EasnerPayoutQuoteSlice = {
  quoteId: string
  expiresAt: string
  providerRate: number
  effectiveRate: number
  destinationAmount: number
  fxMarkupBps: number
  payinFeeAmount: number
  payoutFeeAmount: number
  totalFeeAmount: number
  sourceAmount: number
  sourceCurrency: string
  destinationCurrency: string
  pricingTotals: {
    total_easner_fee: number
    total_user_fee: number
    total_recipient_amount: number
  }
}

export type PayoutQuoteResult = {
  /** Amount entered before provider precision/quantization. */
  requestedReceiveAmount?: number
  /** Customer-facing receive amount. Execution and persistence must continue to use receiveAmount. */
  displayReceiveAmount?: number
  /** Actual provider-locked recipient amount for execution/audit; never replace with a display amount. */
  receiveAmount: number
  receiveCurrency: string
  /** Customer FX principal at margined rate (you-send box). */
  customerPrincipal: number
  sendAmount: number
  sendCurrency: string
  totalDebited: number
  channelCost: number
  marginAmount: number
  /** Explicit Easner 1% processing fee leg (uncapped), collected to the fee wallet. */
  processingFee: number
  /** Channel component shown in the combined Processing fee row (foots with total). */
  displayChannelCost: number
  channelId?: string
  /** Provider-neutral crypto settlement leg (Noah + Yellowcard). */
  settlement: PayoutSettlementLeg
  /** @deprecated Prefer `settlement`. Legacy Noah field names for older clients. */
  noah: {
    totalFee: number
    feeCurrency: string
    cryptoAuthorizedAmount: string
    noahFloor: string
    noahSendAmount: string
    cryptoCurrency: string
    formSessionId: string
    rate?: number
    noahMid?: number
    effectiveRate?: number
    marginCaptureMode: import("@easner/shared").PayoutMarginCaptureMode
    channelCost: number
    marginAmount: number
    customerPrincipal: number
    scheduleFee?: number
    prepareChannelFee?: number
    prepareRemaining?: number
    quoteNoahMid?: number
  }
  easner: EasnerPayoutQuoteSlice
  pricingQuoteId: string
  expiresAt: string
  executionModel: "turnkey_workflow"
  /** Payout rail provider when not Noah. */
  provider?: "noah" | "yellowcard" | "grid"
  /** Yellowcard-specific locked send fields (balance_payout). */
  yc?: {
    sequenceId: string
    sendId?: string
    channelId: string
    cryptoAmount: number
    walletAddress?: string
    grossLocalAmount?: number
    recipientLocalAmount?: number
    recipientSurplusLocal?: number
    payoutQuantumLocal?: number
    settlementQuantumUsd?: number
    precisionMode?: "micro" | "cent"
    sendLegFeeLocal?: number
    discardedSendIds?: string[]
  }
  /** Grid-specific locked quote fields (balance_payout). */
  grid?: {
    quoteId: string
    sequenceId: string
    customerId: string
    externalAccountId: string
    cryptoAmount: number
    fundingAddress?: string
  }
  /** Explicit YC send leg fees from POST /send (USD). */
  ycLegFeesUsd?: number
  /** Easner 1% + channel/YC component shown as one Processing fee row (USD). */
  displayProcessingFee?: number
  quotePhase?: "preview" | "locked"
  requiresConfirm?: boolean
  quoteKey?: string
  lockId?: string
}

const QUOTE_TTL_MS = 15 * 60 * 1000

async function buildYellowcardBalancePayoutQuoteFromRow(input: {
  admin: ReturnType<typeof createSupabaseAdmin>
  userId: string
  noahCustomerId: string
  recipientId?: string
  row: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  paymentPurpose?: string
}) {
  const { buildYcPayoutQuote } = await import("@/lib/yellowcard/payout-quote")
  const { data: userRow } = await input.admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", input.userId)
    .maybeSingle()
  const { getWalletOwnerId } = await import("@/lib/wallet/resolve-wallet-owner")
  const walletOwnerId = await getWalletOwnerId(input.admin, "individual", input.userId)
  const { data: walletRow } = walletOwnerId
    ? await input.admin
        .from("wallet_accounts")
        .select("address")
        .eq("wallet_owner_id", walletOwnerId)
        .eq("ledger_currency", "USD")
        .eq("asset", "USDC")
        .eq("status", "active")
        .maybeSingle()
    : { data: null }
  const turnkeyAddr = String(walletRow?.address ?? "").trim()
  if (!turnkeyAddr) {
    throw new Error("User Solana wallet is required for Yellowcard payout refund routing.")
  }
  return buildYcPayoutQuote({
    userId: input.userId,
    customerUID: input.noahCustomerId || input.userId,
    recipientId: input.recipientId,
    recipient: input.row,
    receiveFiatAmount: input.receiveFiatAmount,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode: input.amountEntryMode,
    sendBudget: input.sendBudget,
    userTurnkeyAddress: turnkeyAddr,
    paymentPurpose: input.paymentPurpose,
    senderProfile: {
      residenceCountry: userRow?.residence_country,
      kycIdType: userRow?.kyc_id_type,
      kycIdNumber: userRow?.kyc_id_number,
      ngLocalIdType: userRow?.ng_local_id_type,
      ngLocalIdNumber: userRow?.ng_local_id_number,
      fullName: userRow?.full_name,
      phone: userRow?.phone,
      email: userRow?.email,
      dateOfBirth: userRow?.date_of_birth,
      addressStreet: userRow?.kyc_address_street,
      addressCity: userRow?.kyc_address_city,
      addressCountry: userRow?.kyc_address_country,
    },
  })
}

async function buildGridBalancePayoutQuoteFromRow(input: {
  admin: ReturnType<typeof createSupabaseAdmin>
  userId: string
  businessId?: string | null
  recipientId?: string
  row: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  paymentPurpose?: string
}) {
  const { buildGridBalancePayoutPreview } = await import("@/lib/grid/payout-quote")

  if (!input.recipientId) {
    throw new Error("recipientId is required for Grid payout quote.")
  }

  return buildGridBalancePayoutPreview({
    admin: input.admin,
    userId: input.userId,
    businessId: input.businessId ?? null,
    recipient: input.row,
    recipientId: input.recipientId,
    receiveFiatAmount: input.receiveFiatAmount,
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode: input.amountEntryMode,
    sendBudget: input.sendBudget,
    paymentPurpose: input.paymentPurpose,
  })
}

function payoutRailForRecipient(row: RecipientSellPrepareRow): "bank_transfer" | "mobile_money" {
  return row.mobile_provider || String(row.bank_name || "").toLowerCase().includes("mobile money")
    ? "mobile_money"
    : "bank_transfer"
}

function buildEasnerSlice(params: {
  sourceAmount: number
  sourceCurrency: string
  destinationCurrency: string
  receiveAmount: number
  providerRate: number
  marginAmount: number
  channelCost: number
}): EasnerPayoutQuoteSlice {
  const {
    sourceAmount,
    sourceCurrency,
    destinationCurrency,
    receiveAmount,
    providerRate,
    marginAmount,
    channelCost,
  } = params
  const effectiveRate = providerRate > 0 ? providerRate : 1
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS).toISOString()
  const totalUserFee = marginAmount + channelCost
  return {
    quoteId: "",
    expiresAt,
    providerRate: effectiveRate,
    effectiveRate,
    destinationAmount: sourceAmount * effectiveRate,
    fxMarkupBps: 0,
    payinFeeAmount: 0,
    payoutFeeAmount: channelCost,
    totalFeeAmount: totalUserFee,
    sourceAmount,
    sourceCurrency,
    destinationCurrency,
    pricingTotals: {
      total_easner_fee: marginAmount,
      total_user_fee: totalUserFee,
      total_recipient_amount: receiveAmount,
    },
  }
}

function settlementCryptoForBalance(balanceCurrency: string): string {
  return balanceCurrency.trim().toUpperCase() === "EUR"
    ? getNoahEurCryptoTicker()
    : getNoahSettlementCryptoCurrency()
}

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

/** DB-only Noah balance payout preview – no prepare (lock on `/confirm`). */
export async function buildNoahBalancePayoutPreview(input: {
  userId: string
  noahCustomerId: string
  recipientId?: string
  recipient: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  prepareOverrides?: SellPrepareOverrides
}): Promise<PayoutQuoteResult> {
  const receiveAmountRaw = normalizePayoutReceiveAmount(Number(input.receiveFiatAmount))
  if (!Number.isFinite(receiveAmountRaw) || receiveAmountRaw <= 0) {
    throw new Error("receiveFiatAmount must be positive.")
  }

  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const sendBudget =
    input.sendBudget != null && Number.isFinite(input.sendBudget) && input.sendBudget > 0
      ? input.sendBudget
      : undefined

  const sourceBalanceCurrency = input.sourceBalanceCurrency.trim().toUpperCase()
  if (sourceBalanceCurrency !== "USD" && sourceBalanceCurrency !== "EUR") {
    throw new Error("sourceBalanceCurrency must be USD or EUR.")
  }

  const admin = createSupabaseAdmin()
  const row = input.recipient

  const receiveCurrency = String(row.currency || "").trim().toUpperCase()
  const cryptoCurrency = settlementCryptoForBalance(sourceBalanceCurrency)
  const countryCode = resolveRecipientPayoutCountry(row)

  let dbRow: ReturnType<typeof findNoahRate> = null
  if (sourceBalanceCurrency !== receiveCurrency) {
    const dbRates = await listNoahRates(admin, {
      destinations: [receiveCurrency],
      status: "active",
    })
    dbRow = findNoahRate(dbRates, sourceBalanceCurrency, receiveCurrency)
  }

  let providerRate = 1
  let noahMid: number | undefined
  if (sourceBalanceCurrency !== receiveCurrency) {
    if (dbRow) {
      providerRate = dbRow.rate
      noahMid = dbRow.noah_mid
    } else {
      throw new Error(
        `Exchange rate for ${sourceBalanceCurrency} → ${receiveCurrency} is unavailable. Try again shortly.`,
      )
    }
  }

  const quoteReceiveAmount = normalizeGlobalPayoutQuoteReceiveAmount({
    amountEntryMode,
    receiveFiatAmount: receiveAmountRaw,
    sendBudget,
    customerRate: providerRate,
    receiveCurrency,
    normalizeReceive: normalizePayoutReceiveAmountForCurrency,
  })

  const marginCaptureMode = getGlobalPayoutMarginCaptureMode()
  const paymentMethodKey = resolveNoahOfframpPaymentMethodKey({
    bankName: row.bank_name,
    mobileProvider: row.mobile_provider,
  })

  const provisionalCrypto = roundUsdc(quoteReceiveAmount / providerRate)
  const scheduleFee =
    sourceBalanceCurrency !== receiveCurrency
      ? computeNoahOfframpScheduleFee({
          currency: receiveCurrency,
          countryCode: countryCode ?? undefined,
          paymentMethodKey,
          basisAmount: provisionalCrypto,
        })
      : null

  const paddedFloor =
    scheduleFee != null
      ? roundUsdc(provisionalCrypto + scheduleFee)
      : roundUsdc(provisionalCrypto * 1.01)

  const payoutRail = recipientPayoutRail(row)
  const processingFeeBps =
    countryCode && receiveCurrency
      ? await quoteFiatProcessingFeeBps(
          admin,
          { countryCode, currencyCode: receiveCurrency, rail: payoutRail },
          "pay_out",
          { userId: input.userId },
        )
      : undefined
  const sameCurrencyProcessingFee = computePayoutProcessingFeeBps(quoteReceiveAmount, {
    bps: processingFeeBps,
  })
  const pricing =
    sourceBalanceCurrency === receiveCurrency
      ? {
          customerPrincipal: quoteReceiveAmount,
          midNotional: quoteReceiveAmount,
          marginAmount: 0,
          channelCost: 0,
          processingFee: sameCurrencyProcessingFee,
          displayChannelCost: 0,
          totalDebited: roundUsdc(quoteReceiveAmount + sameCurrencyProcessingFee),
          noahSendAmount: quoteReceiveAmount,
          triggerAmount: quoteReceiveAmount,
          marginCaptureMode,
          receiveAmount: quoteReceiveAmount,
          customerRate: 1,
          noahMid: 1,
          noahFloor: quoteReceiveAmount,
        }
      : computeGlobalPayoutPricing({
          receiveAmount: quoteReceiveAmount,
          customerRate: providerRate,
          noahMid: noahMid!,
          noahFloor: paddedFloor,
          marginCaptureMode,
          processingFeeBps,
          ...(scheduleFee != null ? { prepareChannelFee: scheduleFee } : {}),
        })

  const quoteKey = buildPayoutQuoteKey({
    recipientId: String(input.recipientId || ""),
    sourceBalanceCurrency: input.sourceBalanceCurrency,
    amountEntryMode,
    receiveAmount: quoteReceiveAmount,
    sendBudget,
    note: input.prepareOverrides?.note,
    paymentPurpose: input.prepareOverrides?.paymentPurpose,
  })
  const sequenceId = `noah_preview_${randomUUID()}`
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS).toISOString()

  const easner = buildEasnerSlice({
    sourceAmount: pricing.customerPrincipal,
    sourceCurrency: sourceBalanceCurrency,
    destinationCurrency: receiveCurrency,
    receiveAmount: quoteReceiveAmount,
    providerRate,
    marginAmount: pricing.marginAmount,
    channelCost: pricing.channelCost,
  })

  const effectiveRate =
    pricing.totalDebited > 0 ? quoteReceiveAmount / pricing.totalDebited : providerRate

  const settlement: PayoutSettlementLeg = {
    totalFee: scheduleFee ?? pricing.channelCost,
    feeCurrency: sourceBalanceCurrency,
    cryptoAuthorizedAmount: String(pricing.noahFloor),
    cryptoFloor: String(pricing.noahFloor),
    cryptoSendAmount: String(pricing.noahSendAmount),
    cryptoCurrency,
    sessionId: sequenceId,
    customerRate: providerRate,
    ...(noahMid != null && noahMid > 0 ? { providerMid: noahMid } : {}),
    effectiveRate,
    marginCaptureMode,
    channelCost: pricing.channelCost,
    marginAmount: pricing.marginAmount,
    customerPrincipal: pricing.customerPrincipal,
  }

  return {
    receiveAmount: quoteReceiveAmount,
    receiveCurrency,
    customerPrincipal: pricing.customerPrincipal,
    sendAmount: pricing.noahSendAmount,
    sendCurrency: sourceBalanceCurrency,
    totalDebited: pricing.totalDebited,
    channelCost: pricing.channelCost,
    marginAmount: pricing.marginAmount,
    processingFee: pricing.processingFee,
    displayChannelCost: pricing.displayChannelCost,
    settlement,
    noah: buildLegacyNoahSettlementFromLeg(settlement, {
      ...(scheduleFee != null ? { scheduleFee } : {}),
      ...(noahMid != null && noahMid > 0 ? { quoteNoahMid: noahMid } : {}),
    }),
    displayProcessingFee: computePayoutQuoteDisplayProcessingFee({
      processingFee: pricing.processingFee,
      displayChannelCost: pricing.displayChannelCost,
      channelCost: pricing.channelCost,
    }),
    easner: { ...easner, quoteId: sequenceId, expiresAt },
    pricingQuoteId: sequenceId,
    expiresAt,
    executionModel: "turnkey_workflow",
    provider: "noah",
    quotePhase: "preview",
    requiresConfirm: true,
    quoteKey,
  }
}

/**
 * Lock Noah balance payout: one prepare call (used from `/confirm` only).
 */
export async function lockNoahBalancePayoutQuote(input: {
  userId: string
  businessId?: string | null
  noahCustomerId: string
  recipientId?: string
  recipient: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  prepareOverrides?: SellPrepareOverrides
}): Promise<PayoutQuoteResult> {
  const receiveAmountRaw = normalizePayoutReceiveAmount(Number(input.receiveFiatAmount))
  if (!Number.isFinite(receiveAmountRaw) || receiveAmountRaw <= 0) {
    throw new Error("receiveFiatAmount must be positive.")
  }

  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const sendBudget =
    input.sendBudget != null && Number.isFinite(input.sendBudget) && input.sendBudget > 0
      ? input.sendBudget
      : undefined

  const sourceBalanceCurrency = input.sourceBalanceCurrency.trim().toUpperCase()
  if (sourceBalanceCurrency !== "USD" && sourceBalanceCurrency !== "EUR") {
    throw new Error("sourceBalanceCurrency must be USD or EUR.")
  }

  const admin = createSupabaseAdmin()
  const row = input.recipient

  const receiveCurrency = String(row.currency || "").trim().toUpperCase()
  const cryptoCurrency = settlementCryptoForBalance(sourceBalanceCurrency)

  const countryCode = resolveRecipientPayoutCountry(row)
  if (countryCode) {
    try {
      const provider = await selectProviderForCorridor(admin, {
        countryCode,
        currencyCode: receiveCurrency,
        rail:
          row.mobile_provider || String(row.bank_name || "").toLowerCase().includes("mobile money")
            ? "mobile_money"
            : "bank_transfer",
        mobileProvider: row.mobile_provider,
        bankName: row.bank_name,
        businessId: input.businessId,
        userId: input.userId,
      })
      if (provider.id !== "noah") {
        throw new Error(`Payout provider "${provider.id}" must use its own confirm path.`)
      }
    } catch (e) {
      if (e instanceof NoProviderForCorridorError) {
        throw new Error(
          "Payouts to this country and currency are not available on configured providers yet.",
        )
      }
      throw e
    }
  }

  const runPrepare = (fiatAmount: number) =>
    prepareSellFromRecipientRow({
      row,
      fiatAmount,
      cryptoCurrency,
      noahCustomerId: input.noahCustomerId,
      overrides: input.prepareOverrides,
    })

  let dbRow: ReturnType<typeof findNoahRate> = null
  if (sourceBalanceCurrency !== receiveCurrency) {
    const dbRates = await listNoahRates(admin, {
      destinations: [receiveCurrency],
      status: "active",
    })
    dbRow = findNoahRate(dbRates, sourceBalanceCurrency, receiveCurrency)
  }

  let providerRate = 1
  let noahMid: number | undefined
  if (sourceBalanceCurrency !== receiveCurrency) {
    if (dbRow) {
      providerRate = dbRow.rate
      noahMid = dbRow.noah_mid
    } else {
      throw new Error(
        `Exchange rate for ${sourceBalanceCurrency} → ${receiveCurrency} is unavailable. Try again shortly.`,
      )
    }
  }

  const quoteReceiveAmount = normalizeGlobalPayoutQuoteReceiveAmount({
    amountEntryMode,
    receiveFiatAmount: receiveAmountRaw,
    sendBudget,
    customerRate: providerRate,
    receiveCurrency,
    normalizeReceive: normalizePayoutReceiveAmountForCurrency,
  })

  let prep: Awaited<ReturnType<typeof prepareSellFromRecipientRow>>["prep"]
  let channelId: string | undefined

  const executePrepare = async (fiatAmount: number) => {
    try {
      const prepared = await runPrepare(fiatAmount)
      return prepared
    } catch (e) {
      logNoahPayoutFailure("payout_quote_prepare", e, {
        recipientId: input.recipientId ?? null,
        receiveCurrency,
        countryCode: countryCode ?? null,
        accountSuffix: String(row.account_number ?? "").slice(-4) || null,
        bankName: row.bank_name ?? null,
      })
      const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase()
      const expired =
        msg.includes("formsession") || (msg.includes("session") && msg.includes("expired"))
      if (expired) {
        try {
          return await runPrepare(fiatAmount)
        } catch (retryErr) {
          throw new Error(mapNoahPrepareError(retryErr))
        }
      }
      throw new Error(mapNoahPrepareError(e))
    }
  }

  try {
    const prepared = await executePrepare(quoteReceiveAmount)
    prep = prepared.prep
    channelId = prepared.channelId
  } catch (e) {
    throw e instanceof Error ? e : new Error(mapNoahPrepareError(e))
  }

  const formSessionId = String(prep.formSessionId || "").trim()
  const cryptoAuthorizedAmount = String(prep.cryptoAuthorizedAmount || "").trim()
  if (!formSessionId || !cryptoAuthorizedAmount) {
    throw new Error("Noah prepare did not return a form session or crypto authorization.")
  }

  const noahFloor = Number.parseFloat(cryptoAuthorizedAmount)
  if (!Number.isFinite(noahFloor) || noahFloor <= 0) {
    throw new Error("Invalid crypto authorized amount from Noah prepare.")
  }

  const noahFee = Number.parseFloat(String(prep.totalFee || "0")) || 0
  const marginCaptureMode = getGlobalPayoutMarginCaptureMode()

  let pricingMid = noahMid!
  if (sourceBalanceCurrency !== receiveCurrency && noahMid != null) {
    try {
      const ticketMid = await noahImpliedProviderRate({
        sourceCurrency: sourceBalanceCurrency,
        destinationCurrency: receiveCurrency,
        sourceAmount: noahFloor,
        country: countryCode ?? undefined,
      })
      if (Number.isFinite(ticketMid) && ticketMid > 0) {
        pricingMid = ticketMid
      }
    } catch (e) {
      console.warn("[noah_payout_quote] ticket_mid_fetch_failed", {
        receiveCurrency,
        noahFloor,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const paymentMethodKey = resolveNoahOfframpPaymentMethodKey({
    bankName: row.bank_name,
    mobileProvider: row.mobile_provider,
  })
  const scheduleFee =
    sourceBalanceCurrency !== receiveCurrency
      ? computeNoahOfframpScheduleFee({
          currency: receiveCurrency,
          countryCode: countryCode ?? undefined,
          paymentMethodKey,
          basisAmount: noahFloor,
        })
      : null

  const payoutRail = recipientPayoutRail(row)
  const processingFeeBps =
    countryCode && receiveCurrency
      ? await quoteFiatProcessingFeeBps(
          admin,
          { countryCode, currencyCode: receiveCurrency, rail: payoutRail },
          "pay_out",
          { userId: input.userId },
        )
      : undefined
  const sameCurrencyProcessingFee = computePayoutProcessingFeeBps(quoteReceiveAmount, {
    bps: processingFeeBps,
  })
  const pricing =
    sourceBalanceCurrency === receiveCurrency
      ? {
          customerPrincipal: quoteReceiveAmount,
          midNotional: quoteReceiveAmount,
          marginAmount: 0,
          channelCost: 0,
          processingFee: sameCurrencyProcessingFee,
          displayChannelCost: Math.max(
            0,
            Math.round((noahFloor - quoteReceiveAmount) * 1_000_000) / 1_000_000,
          ),
          totalDebited: Math.round((noahFloor + sameCurrencyProcessingFee) * 1_000_000) / 1_000_000,
          noahSendAmount: noahFloor,
          triggerAmount: noahFloor,
          marginCaptureMode,
          receiveAmount: quoteReceiveAmount,
          customerRate: 1,
          noahMid: 1,
          noahFloor,
        }
      : computeGlobalPayoutPricing({
          receiveAmount: quoteReceiveAmount,
          customerRate: providerRate,
          noahMid: pricingMid,
          noahFloor,
          marginCaptureMode,
          processingFeeBps,
          ...(prep.channelFee != null ? { prepareChannelFee: prep.channelFee } : {}),
          ...(prep.remaining != null ? { prepareRemaining: prep.remaining } : {}),
        })

  if (sourceBalanceCurrency !== receiveCurrency && prep.channelFee == null) {
    const bundledResidual = pricing.noahFloor - pricing.midNotional
    console.info("[noah_payout_quote] channel_cost_fallback", {
      receiveCurrency,
      receiveAmount: quoteReceiveAmount,
      noahFloor,
      channelCost: pricing.channelCost,
      marginAmount: pricing.marginAmount,
      bundledResidual,
      pricingMid,
    })
    if (
      scheduleFee != null &&
      Math.abs(pricing.channelCost - scheduleFee) > NOAH_OFFRAMP_SCHEDULE_FEE_TOLERANCE_USD
    ) {
      console.warn("[noah_payout_quote] channel_cost_fallback_vs_schedule", {
        receiveCurrency,
        channelCost: pricing.channelCost,
        scheduleFee,
        delta: pricing.channelCost - scheduleFee,
      })
    }
  }

  if (
    scheduleFee != null &&
    sourceBalanceCurrency !== receiveCurrency
  ) {
    const delta = noahOfframpScheduleFeeDelta(pricing.channelCost, scheduleFee)
    if (delta != null && Math.abs(delta) > NOAH_OFFRAMP_SCHEDULE_FEE_TOLERANCE_USD) {
      console.info("[noah_payout_quote] channel_cost_vs_schedule", {
        receiveCurrency,
        receiveAmount: quoteReceiveAmount,
        noahFloor,
        channelCost: pricing.channelCost,
        scheduleFee,
        delta,
        prepareChannelFee: prep.channelFee ?? null,
        pricingMid,
        dbNoahMid: noahMid ?? null,
      })
    }
  }

  const easner = buildEasnerSlice({
    sourceAmount: pricing.customerPrincipal,
    sourceCurrency: sourceBalanceCurrency,
    destinationCurrency: receiveCurrency,
    receiveAmount: quoteReceiveAmount,
    providerRate,
    marginAmount: pricing.marginAmount,
    channelCost: pricing.channelCost,
  })

  const effectiveRate =
    pricing.totalDebited > 0 ? quoteReceiveAmount / pricing.totalDebited : providerRate

  const settlement: PayoutSettlementLeg = {
    totalFee: noahFee,
    feeCurrency: sourceBalanceCurrency,
    cryptoAuthorizedAmount,
    cryptoFloor: cryptoAuthorizedAmount,
    cryptoSendAmount: String(pricing.noahSendAmount),
    cryptoCurrency,
    sessionId: formSessionId,
    customerRate: providerRate,
    ...(noahMid != null && noahMid > 0 ? { providerMid: noahMid } : {}),
    effectiveRate,
    marginCaptureMode,
    channelCost: pricing.channelCost,
    marginAmount: pricing.marginAmount,
    customerPrincipal: pricing.customerPrincipal,
  }

  return {
    receiveAmount: quoteReceiveAmount,
    receiveCurrency,
    customerPrincipal: pricing.customerPrincipal,
    sendAmount: pricing.noahSendAmount,
    sendCurrency: sourceBalanceCurrency,
    totalDebited: pricing.totalDebited,
    channelCost: pricing.channelCost,
    marginAmount: pricing.marginAmount,
    processingFee: pricing.processingFee,
    displayChannelCost: pricing.displayChannelCost,
    channelId,
    settlement,
    noah: buildLegacyNoahSettlementFromLeg(settlement, {
      ...(scheduleFee != null ? { scheduleFee } : {}),
      ...(prep.channelFee != null ? { prepareChannelFee: prep.channelFee } : {}),
      ...(prep.remaining != null ? { prepareRemaining: prep.remaining } : {}),
      ...(pricingMid > 0 ? { quoteNoahMid: pricingMid } : {}),
    }),
    displayProcessingFee: computePayoutQuoteDisplayProcessingFee({
      processingFee: pricing.processingFee,
      displayChannelCost: pricing.displayChannelCost,
      channelCost: pricing.channelCost,
    }),
    easner,
    pricingQuoteId: formSessionId,
    expiresAt: easner.expiresAt,
    executionModel: "turnkey_workflow",
    provider: "noah",
    quotePhase: "preview",
    requiresConfirm: true,
    quoteKey: buildPayoutQuoteKey({
      recipientId: String(input.recipientId || ""),
      sourceBalanceCurrency: input.sourceBalanceCurrency,
      amountEntryMode,
      receiveAmount: quoteReceiveAmount,
      sendBudget,
      note: input.prepareOverrides?.note,
      paymentPurpose: input.prepareOverrides?.paymentPurpose,
    }),
  }
}

/** Route by corridor provider; Noah/YC/Grid previews are DB-only (lock on `/confirm`). */
export async function buildPayoutQuote(input: {
  userId: string
  businessId?: string | null
  noahCustomerId: string
  recipientId?: string
  recipient: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  /** When user entered send-side principal (USD/EUR). */
  sendBudget?: number
  prepareOverrides?: SellPrepareOverrides
}): Promise<PayoutQuoteResult> {
  const receiveAmountRaw = normalizePayoutReceiveAmount(Number(input.receiveFiatAmount))
  if (!Number.isFinite(receiveAmountRaw) || receiveAmountRaw <= 0) {
    throw new Error("receiveFiatAmount must be positive.")
  }

  const sourceBalanceCurrency = input.sourceBalanceCurrency.trim().toUpperCase()
  if (sourceBalanceCurrency !== "USD" && sourceBalanceCurrency !== "EUR") {
    throw new Error("sourceBalanceCurrency must be USD or EUR.")
  }

  const admin = createSupabaseAdmin()
  const row = input.recipient

  const receiveCurrency = String(row.currency || "").trim().toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(row)
  if (countryCode) {
    try {
      const provider = await selectProviderForCorridor(admin, {
        countryCode,
        currencyCode: receiveCurrency,
        rail:
          row.mobile_provider || String(row.bank_name || "").toLowerCase().includes("mobile money")
            ? "mobile_money"
            : "bank_transfer",
        mobileProvider: row.mobile_provider,
        bankName: row.bank_name,
        businessId: input.businessId,
        userId: input.userId,
      })
      if (provider.id === "yellowcard") {
        return buildYellowcardBalancePayoutQuoteFromRow({
          admin,
          userId: input.userId,
          noahCustomerId: input.noahCustomerId,
          recipientId: input.recipientId,
          row,
          receiveFiatAmount: input.receiveFiatAmount,
          sourceBalanceCurrency: input.sourceBalanceCurrency,
          amountEntryMode: input.amountEntryMode,
          sendBudget: input.sendBudget,
          paymentPurpose: input.prepareOverrides?.paymentPurpose,
        })
      }
      if (provider.id === "grid") {
        return buildGridBalancePayoutQuoteFromRow({
          admin,
          userId: input.userId,
          businessId: input.businessId,
          recipientId: input.recipientId,
          row,
          receiveFiatAmount: input.receiveFiatAmount,
          sourceBalanceCurrency: input.sourceBalanceCurrency,
          amountEntryMode: input.amountEntryMode,
          sendBudget: input.sendBudget,
          paymentPurpose: input.prepareOverrides?.paymentPurpose,
        })
      }
      if (provider.id !== "noah") {
        throw new Error(`Payout provider "${provider.id}" is not wired for quotes yet.`)
      }
    } catch (e) {
      if (e instanceof NoProviderForCorridorError) {
        throw new Error(
          "Payouts to this country and currency are not available on configured providers yet.",
        )
      }
      throw e
    }
  }

  return buildNoahBalancePayoutPreview(input)
}
