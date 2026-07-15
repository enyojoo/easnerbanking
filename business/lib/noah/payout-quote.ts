import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getNoahEurCryptoTicker, getNoahSettlementCryptoCurrency } from "@/lib/noah/config"
import { findNoahRate, listNoahRates } from "@/lib/fx/noah-rates"
import {
  computeGlobalPayoutPricing,
  computePayoutProcessingFeeBps,
  normalizeGlobalPayoutQuoteReceiveAmount,
  normalizePayoutReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
} from "@easner/shared"
import {
  prepareSellFromRecipientRow,
  resolveRecipientPayoutCountry,
  type RecipientSellPrepareRow,
  type SellPrepareOverrides,
} from "@/lib/terminal/recipient-sell-prepare"
import { NoProviderForCorridorError, selectProviderForCorridor } from "@/lib/payout-providers"
import { mapNoahPrepareError } from "@/lib/noah/noah-prepare-errors"
import { logNoahPayoutFailure } from "@/lib/noah/log-noah-payout-failure"
import { getGlobalPayoutMarginCaptureMode } from "@/lib/noah/margin-capture-mode"
import { noahImpliedProviderRate } from "@/lib/noah/fx-prices"
import {
  computeNoahOfframpScheduleFee,
  noahOfframpScheduleFeeDelta,
  NOAH_OFFRAMP_SCHEDULE_FEE_TOLERANCE_USD,
  resolveNoahOfframpPaymentMethodKey,
} from "@/lib/noah/noah-offramp-fee-schedule"

/** Easner fee slice on payout quotes (Noah prepare is authoritative; no DB pricing engine). */
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
    marginCaptureMode: "surplus_send" | "split_debit"
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
  provider?: "noah" | "yellowcard"
  /** Yellowcard-specific locked send fields (balance_payout). */
  yc?: {
    sequenceId: string
    sendId?: string
    channelId: string
    cryptoAmount: number
    walletAddress?: string
  }
}

const QUOTE_TTL_MS = 15 * 60 * 1000

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

export async function buildPayoutQuote(input: {
  userId: string
  noahCustomerId: string
  recipientId?: string
  recipient?: RecipientSellPrepareRow
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
  let row = input.recipient
  if (input.recipientId) {
    const { data, error } = await admin
      .from("recipients")
      .select("*")
      .eq("id", input.recipientId)
      .eq("user_id", input.userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error("Recipient not found.")
    row = data as RecipientSellPrepareRow
  }

  if (!row) {
    throw new Error("recipientId or recipient row is required.")
  }

  const receiveCurrency = String(row.currency || "").trim().toUpperCase()
  const cryptoCurrency = settlementCryptoForBalance(sourceBalanceCurrency)

  const countryCode = resolveRecipientPayoutCountry(row)
  let selectedProviderId = "noah"
  if (countryCode) {
    try {
      const provider = await selectProviderForCorridor(admin, {
        countryCode,
        currencyCode: receiveCurrency,
        mobileProvider: row.mobile_provider,
        bankName: row.bank_name,
      })
      selectedProviderId = provider.id
      if (provider.id === "yellowcard") {
        const { buildYcPayoutQuote } = await import("@/lib/yellowcard/payout-quote")
        const { data: userRow } = await admin
          .from("users")
          .select(
            "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
          )
          .eq("id", input.userId)
          .maybeSingle()
        const { getWalletOwnerId } = await import("@/lib/wallet/resolve-wallet-owner")
        const walletOwnerId = await getWalletOwnerId(admin, "individual", input.userId)
        const { data: walletRow } = walletOwnerId
          ? await admin
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
          recipient: row,
          receiveFiatAmount: input.receiveFiatAmount,
          sourceBalanceCurrency: input.sourceBalanceCurrency,
          amountEntryMode: input.amountEntryMode,
          sendBudget: input.sendBudget,
          userTurnkeyAddress: turnkeyAddr,
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
  void selectedProviderId

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

  const sameCurrencyProcessingFee = computePayoutProcessingFeeBps(quoteReceiveAmount)
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
    noah: {
      totalFee: noahFee,
      feeCurrency: sourceBalanceCurrency,
      cryptoAuthorizedAmount,
      noahFloor: cryptoAuthorizedAmount,
      noahSendAmount: String(pricing.noahSendAmount),
      cryptoCurrency,
      formSessionId,
      rate: providerRate,
      ...(noahMid != null && noahMid > 0 ? { noahMid } : {}),
      ...(pricingMid > 0 ? { quoteNoahMid: pricingMid } : {}),
      effectiveRate,
      marginCaptureMode,
      channelCost: pricing.channelCost,
      marginAmount: pricing.marginAmount,
      customerPrincipal: pricing.customerPrincipal,
      ...(scheduleFee != null ? { scheduleFee } : {}),
      ...(prep.channelFee != null ? { prepareChannelFee: prep.channelFee } : {}),
      ...(prep.remaining != null ? { prepareRemaining: prep.remaining } : {}),
    },
    easner,
    pricingQuoteId: "",
    expiresAt: easner.expiresAt,
    executionModel: "turnkey_workflow",
  }
}
