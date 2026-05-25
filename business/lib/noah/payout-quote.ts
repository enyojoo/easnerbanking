import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"
import { findNoahRate, isNoahRateFresh, listNoahRates } from "@/lib/fx/noah-rates"
import { normalizePayoutReceiveAmount } from "@easner/shared"
import {
  prepareSellFromRecipientRow,
  resolveRecipientPayoutCountry,
  type RecipientSellPrepareRow,
  type SellPrepareOverrides,
} from "@/lib/terminal/recipient-sell-prepare"
import { NoProviderForCorridorError, selectProviderForCorridor } from "@/lib/payout-providers"
import { mapNoahPrepareError } from "@/lib/noah/noah-prepare-errors"
import {
  resolvePrepareForSendEntry,
  seedQuoteReceiveForSendBudget,
} from "@/lib/noah/payout-quote-send-budget"

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
  sendAmount: number
  sendCurrency: string
  totalDebited: number
  channelId?: string
  noah: {
    totalFee: number
    /** Fiat destination currency for TotalFee from Noah prepare. */
    feeCurrency: string
    cryptoAuthorizedAmount: string
    cryptoCurrency: string
    formSessionId: string
    /** Customer-facing destination per 1 source (`noah_rates.rate`, margin-applied). */
    rate?: number
    /** Raw Noah mid from sync (`noah_rates.noah_mid`). */
    noahMid?: number
    /** All-in destination per 1 source at this ticket (`receive / totalDebited`). */
    effectiveRate?: number
  }
  easner: EasnerPayoutQuoteSlice
  /** Empty when no persisted Easner quote (apply/validate not used). */
  pricingQuoteId: string
  expiresAt: string
  /** Execute path for balance sends (Standard Model). Quote FormSessionID is not durable. */
  executionModel: "turnkey_workflow"
}

const QUOTE_TTL_MS = 15 * 60 * 1000

function buildEasnerSlice(params: {
  sourceAmount: number
  sourceCurrency: string
  destinationCurrency: string
  receiveAmount: number
  providerRate: number
}): EasnerPayoutQuoteSlice {
  const { sourceAmount, sourceCurrency, destinationCurrency, receiveAmount, providerRate } = params
  const effectiveRate = providerRate > 0 ? providerRate : 1
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS).toISOString()
  return {
    quoteId: "",
    expiresAt,
    providerRate: effectiveRate,
    effectiveRate,
    destinationAmount: sourceAmount * effectiveRate,
    fxMarkupBps: 0,
    payinFeeAmount: 0,
    payoutFeeAmount: 0,
    totalFeeAmount: 0,
    sourceAmount,
    sourceCurrency,
    destinationCurrency,
    pricingTotals: {
      total_easner_fee: 0,
      total_user_fee: 0,
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
  /** When user entered send-side principal (USD/EUR); Noah total debited may exceed this. */
  sendBudget?: number
  /** Note → Reference (US/EUR); CA PaymentPurpose; Africa optional reference. */
  prepareOverrides?: SellPrepareOverrides
}): Promise<PayoutQuoteResult> {
  const receiveAmount = normalizePayoutReceiveAmount(Number(input.receiveFiatAmount))
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveFiatAmount must be positive.")
  }

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

  let quoteReceiveAmount = receiveAmount
  if (sendBudget != null) {
    quoteReceiveAmount = seedQuoteReceiveForSendBudget({
      sendBudget,
      sourceCurrency: sourceBalanceCurrency,
      receiveCurrency,
      clientReceiveAmount: receiveAmount,
      dbRate: dbRow && isNoahRateFresh(dbRow) ? dbRow.rate : null,
    })
  }

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

  const runPrepareWithSessionRetry = async (fiatAmount: number) => {
    try {
      return await runPrepare(fiatAmount)
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase()
      const expired =
        msg.includes("formsession") || (msg.includes("session") && msg.includes("expired"))
      if (expired) {
        return await runPrepare(fiatAmount)
      }
      throw e
    }
  }

  try {
    if (sendBudget != null) {
      const resolved = await resolvePrepareForSendEntry({
        initialReceive: quoteReceiveAmount,
        runPrepare: runPrepareWithSessionRetry,
      })
      quoteReceiveAmount = resolved.receiveAmount
      prep = resolved.prepared.prep
      channelId = resolved.prepared.channelId
    } else {
      const prepared = await executePrepare(quoteReceiveAmount)
      prep = prepared.prep
      channelId = prepared.channelId
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error(mapNoahPrepareError(e))
  }

  const formSessionId = String(prep.formSessionId || "").trim()
  const cryptoAuthorizedAmount = String(prep.cryptoAuthorizedAmount || "").trim()
  if (!formSessionId || !cryptoAuthorizedAmount) {
    throw new Error("Noah prepare did not return a form session or crypto authorization.")
  }

  const sendAmount = Number.parseFloat(cryptoAuthorizedAmount)
  if (!Number.isFinite(sendAmount) || sendAmount <= 0) {
    throw new Error("Invalid crypto authorized amount from Noah prepare.")
  }

  const noahFee = Number.parseFloat(String(prep.totalFee || "0")) || 0

  let providerRate = 1
  let noahMid: number | undefined
  if (sourceBalanceCurrency !== receiveCurrency) {
    if (dbRow && isNoahRateFresh(dbRow)) {
      providerRate = dbRow.rate
      noahMid = dbRow.noah_mid
    } else if (sendAmount > 0) {
      providerRate = quoteReceiveAmount / sendAmount
    } else {
      throw new Error(
        `Exchange rate for ${sourceBalanceCurrency} → ${receiveCurrency} is unavailable. Try again shortly.`,
      )
    }
  }

  const easner = buildEasnerSlice({
    sourceAmount: sendAmount,
    sourceCurrency: sourceBalanceCurrency,
    destinationCurrency: receiveCurrency,
    receiveAmount: quoteReceiveAmount,
    providerRate,
  })

  const effectiveRate = sendAmount > 0 ? quoteReceiveAmount / sendAmount : providerRate

  return {
    receiveAmount: quoteReceiveAmount,
    receiveCurrency,
    sendAmount,
    sendCurrency: sourceBalanceCurrency,
    totalDebited: sendAmount,
    channelId,
    noah: {
      totalFee: noahFee,
      feeCurrency: sourceBalanceCurrency,
      cryptoAuthorizedAmount,
      cryptoCurrency,
      formSessionId,
      rate: providerRate,
      ...(noahMid != null && noahMid > 0 ? { noahMid } : {}),
      effectiveRate,
    },
    easner,
    pricingQuoteId: "",
    expiresAt: easner.expiresAt,
    executionModel: "turnkey_workflow",
  }
}
