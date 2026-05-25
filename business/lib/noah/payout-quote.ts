import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"
import { noahImpliedProviderRate } from "@/lib/noah/fx-prices"
import {
  prepareSellFromRecipientRow,
  resolveRecipientPayoutCountry,
  type RecipientSellPrepareRow,
  type SellPrepareOverrides,
} from "@/lib/terminal/recipient-sell-prepare"
import { NoProviderForCorridorError, selectProviderForCorridor } from "@/lib/payout-providers"
import { mapNoahPrepareError } from "@/lib/noah/noah-prepare-errors"

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
    rate?: number
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
  /** Note → Reference (US/EUR); CA PaymentPurpose; Africa optional reference. */
  prepareOverrides?: SellPrepareOverrides
}): Promise<PayoutQuoteResult> {
  const receiveAmount = Number(input.receiveFiatAmount)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveFiatAmount must be positive.")
  }

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

  const runPrepare = () =>
    prepareSellFromRecipientRow({
      row,
      fiatAmount: receiveAmount,
      cryptoCurrency,
      noahCustomerId: input.noahCustomerId,
      overrides: input.prepareOverrides,
    })

  let prep: Awaited<ReturnType<typeof prepareSellFromRecipientRow>>["prep"]
  let channelId: string | undefined
  try {
    const prepared = await runPrepare()
    prep = prepared.prep
    channelId = prepared.channelId
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase()
    const expired =
      msg.includes("formsession") || (msg.includes("session") && msg.includes("expired"))
    if (expired) {
      try {
        const prepared = await runPrepare()
        prep = prepared.prep
        channelId = prepared.channelId
      } catch (retryErr) {
        throw new Error(mapNoahPrepareError(retryErr))
      }
    } else {
      throw new Error(mapNoahPrepareError(e))
    }
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
  const country = String(row.country_code || "").trim().toUpperCase() || undefined

  let providerRate = 1
  try {
    providerRate = await noahImpliedProviderRate({
      sourceCurrency: sourceBalanceCurrency,
      destinationCurrency: receiveCurrency,
      sourceAmount: sendAmount,
      country,
    })
  } catch {
    providerRate = sourceBalanceCurrency === receiveCurrency ? 1 : 1
  }

  const easner = buildEasnerSlice({
    sourceAmount: sendAmount,
    sourceCurrency: sourceBalanceCurrency,
    destinationCurrency: receiveCurrency,
    receiveAmount,
    providerRate,
  })

  return {
    receiveAmount,
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
    },
    easner,
    pricingQuoteId: "",
    expiresAt: easner.expiresAt,
    executionModel: "turnkey_workflow",
  }
}
