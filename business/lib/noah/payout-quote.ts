import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { createQuote, type QuoteResult } from "@/lib/pricing/evaluator"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "@/lib/noah/config"
import { noahImpliedProviderRate } from "@/lib/noah/fx-prices"
import {
  prepareSellFromRecipientRow,
  type RecipientSellPrepareRow,
} from "@/lib/terminal/recipient-sell-prepare"

export type PayoutQuoteResult = {
  receiveAmount: number
  receiveCurrency: string
  sendAmount: number
  sendCurrency: string
  totalDebited: number
  noah: {
    totalFee: number
    cryptoAuthorizedAmount: string
    cryptoCurrency: string
    formSessionId: string
    rate?: number
  }
  easner: QuoteResult
  pricingQuoteId: string
  expiresAt: string
}

function settlementCryptoForBalance(balanceCurrency: string): string {
  return balanceCurrency.trim().toUpperCase() === "EUR"
    ? getNoahEurCryptoTicker()
    : getNoahUsdCryptoTicker()
}

function inferPayoutMethod(row: RecipientSellPrepareRow): string {
  if (row.mobile_provider?.trim() || /^mobile money/i.test(row.bank_name || "")) {
    return "mobile_money"
  }
  return "bank_transfer"
}

export async function buildPayoutQuote(input: {
  userId: string
  noahCustomerId: string
  recipientId?: string
  recipient?: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
}): Promise<PayoutQuoteResult> {
  const receiveAmount = Number(input.receiveFiatAmount)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveFiatAmount must be positive.")
  }

  const sourceBalanceCurrency = input.sourceBalanceCurrency.trim().toUpperCase()
  if (sourceBalanceCurrency !== "USD" && sourceBalanceCurrency !== "EUR") {
    throw new Error("sourceBalanceCurrency must be USD or EUR.")
  }

  let row = input.recipient
  if (input.recipientId) {
    const admin = createSupabaseAdmin()
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

  const { prep } = await prepareSellFromRecipientRow({
    row,
    fiatAmount: receiveAmount,
    cryptoCurrency,
    noahCustomerId: input.noahCustomerId,
  })

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

  let providerRate: number | undefined
  try {
    providerRate = await noahImpliedProviderRate({
      sourceCurrency: sourceBalanceCurrency,
      destinationCurrency: receiveCurrency,
      sourceAmount: sendAmount,
      country,
    })
  } catch {
    providerRate = undefined
  }

  const easner = await createQuote({
    userId: input.userId,
    sourceCurrency: sourceBalanceCurrency,
    destinationCurrency: receiveCurrency,
    sourceAmount: sendAmount,
    rail: "wallet",
    countryCode: country,
    payoutCountry: country,
    payoutMethod: inferPayoutMethod(row),
    providerRate,
    routeType: "fiat",
    provider: "noah",
  })

  const easnerFee =
    easner.pricingTotals?.total_easner_fee ??
    easner.layeredFees?.easner_core_transfer_fee ??
    easner.totalFeeAmount
  const totalDebited = sendAmount + easnerFee

  return {
    receiveAmount,
    receiveCurrency,
    sendAmount,
    sendCurrency: sourceBalanceCurrency,
    totalDebited,
    noah: {
      totalFee: noahFee,
      cryptoAuthorizedAmount,
      cryptoCurrency,
      formSessionId,
      rate: providerRate,
    },
    easner,
    pricingQuoteId: easner.quoteId,
    expiresAt: easner.expiresAt,
  }
}
