import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"
import { findNoahRate, isNoahRateFresh, listNoahRates } from "@/lib/fx/noah-rates"
import {
  computeGlobalPayoutPricing,
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
import { getGlobalPayoutMarginCaptureMode } from "@/lib/noah/margin-capture-mode"

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
  }
  easner: EasnerPayoutQuoteSlice
  pricingQuoteId: string
  expiresAt: string
  executionModel: "turnkey_workflow"
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
    : getNoahUsdCryptoTicker()
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
  if (countryCode) {
    try {
      const provider = await selectProviderForCorridor(admin, {
        countryCode,
        currencyCode: receiveCurrency,
        mobileProvider: row.mobile_provider,
        bankName: row.bank_name,
      })
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
    if (dbRow && isNoahRateFresh(dbRow)) {
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

  const pricing =
    sourceBalanceCurrency === receiveCurrency
      ? {
          customerPrincipal: quoteReceiveAmount,
          midNotional: quoteReceiveAmount,
          marginAmount: 0,
          channelCost: 0,
          totalDebited: noahFloor,
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
          noahMid: noahMid!,
          noahFloor,
          marginCaptureMode,
        })

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
      effectiveRate,
      marginCaptureMode,
      channelCost: pricing.channelCost,
      marginAmount: pricing.marginAmount,
      customerPrincipal: pricing.customerPrincipal,
    },
    easner,
    pricingQuoteId: "",
    expiresAt: easner.expiresAt,
    executionModel: "turnkey_workflow",
  }
}
