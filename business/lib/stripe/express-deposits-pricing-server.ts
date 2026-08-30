import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildExpressDepositsPricing,
  expressDepositsOnrampQuoteLock,
  parseExpressDepositsAmountEntryMode,
  pickExpressSolanaUsdcQuote,
  type ExpressDepositsAmountEntryMode,
  type ExpressDepositsPricingBreakdown,
} from "@easner/shared"
import { quoteExpressDepositsProcessingFeeBps } from "@/lib/processing-fee/quote-processing-fee-bps"
import { stripeOnramp } from "@/lib/stripe/onramp-client"

export async function quoteExpressDepositsPricing(input: {
  admin: SupabaseClient
  usdCredit: number
  youPay?: number | null
  amountEntryMode?: ExpressDepositsAmountEntryMode | string | null
  sourceCurrency: string
  paymentMethod: string
  walletAddress: string
  oauthToken?: string | null
  userId: string
  businessId: string | null
}): Promise<{ pricing: ExpressDepositsPricingBreakdown; rawQuote: unknown } | null> {
  const usdCredit = Number(input.usdCredit)
  const amountEntryMode = parseExpressDepositsAmountEntryMode(input.amountEntryMode)
  const lock = expressDepositsOnrampQuoteLock({
    amountEntryMode,
    usdCredit,
    youPay: input.youPay,
  })
  if (!lock) return null

  const quote = await stripeOnramp.quotes(
    {
      destination_currencies: ["usdc"],
      destination_networks: ["solana"],
      ...lock,
      source_currency: input.sourceCurrency,
      payment_method: input.paymentMethod === "ach" ? "ach" : "debit_card",
      wallet_addresses: input.walletAddress ? { solana: input.walletAddress } : undefined,
    },
    input.oauthToken || undefined,
  )

  const raw = quote as {
    rate_fetched_at?: number
    destination_network_quotes?: Record<string, unknown>
  }
  const stripeQuote = pickExpressSolanaUsdcQuote(quote)
  const payInBps = await quoteExpressDepositsProcessingFeeBps(input.admin, {
    userId: input.userId,
    businessId: input.businessId,
  })
  const pricing = buildExpressDepositsPricing({
    usdCredit,
    sourceCurrency: input.sourceCurrency,
    stripeQuote,
    payInBps,
    rateFetchedAt: raw.rate_fetched_at ?? null,
    amountEntryMode,
    quotedAmount: amountEntryMode === "pay" ? Number(input.youPay) : usdCredit,
  })
  if (!pricing) return null
  return { pricing, rawQuote: quote }
}
