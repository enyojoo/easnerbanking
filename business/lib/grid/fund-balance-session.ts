import type { SupabaseClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"
import { generateTransactionId } from "@/lib/transaction-id"
import { ensureGridCustomer, type GridPersonProfile } from "./ensure-grid-customer"
import {
  buildGridFundBalanceQuoteBody,
  gridQuoteFeesUsd,
  gridQuoteReceivingAmountMajor,
  gridQuoteSendingAmountMajor,
  resolveGridCustomerInternalAccountId,
} from "./quote-request"
import { gridFetch } from "./http"
import { gridMinorUnits } from "./external-account"
import { findGridPayInRate, listGridRates } from "@/lib/fx/grid-rates"
import { validateFundBalancePayInAmountLimits } from "@/lib/pay-in-limit-check"
import { isGridLocalPayInEnabledForCorridor } from "./grid-receive-gate"
import { getGridQuoteTtlMs } from "./config"
import type { GridQuote } from "./types"
import { computeYcFundBalancePricingBeforeReceive } from "@easner/shared"

export type GridFundBalanceSessionResult = {
  sequenceId: string
  quoteId: string
  customerId: string
  localPayIn: number
  localCurrency: string
  usdCredit: number
  customerRate: number
  processingFee: number
  gridFeesUsd?: number
  paymentInstructions: GridQuote["paymentInstructions"]
  expiresAt: string
  transactionId: string
  easnerTransactionId: string
}

export type GridFundBalancePreviewResult = {
  localPayIn: number
  localCurrency: string
  usdCredit: number
  customerRate: number
  processingFee: number
  displayProcessingFee: number
}

export async function previewGridFundBalanceQuote(input: {
  admin: SupabaseClient
  country: string
  currency: string
  rail: "bank_transfer" | "mobile_money"
  usdCredit?: number
  localPayIn?: number
}): Promise<GridFundBalancePreviewResult> {
  const country = input.country.trim().toUpperCase()
  const currency = input.currency.trim().toUpperCase()

  const enabled = await isGridLocalPayInEnabledForCorridor(input.admin, {
    countryCode: country,
    currencyCode: currency,
    rail: input.rail,
  })
  if (!enabled) throw new Error("grid_corridor_disabled")

  const rates = await listGridRates(input.admin, { destinations: [currency], status: "active" })
  const payInRate = findGridPayInRate(rates, currency)
  const customerRate = payInRate?.rate ?? 0
  if (!customerRate || customerRate <= 0) throw new Error("grid_rate_unavailable")

  let localPayIn = Number(input.localPayIn ?? 0)
  let usdCredit = Number(input.usdCredit ?? 0)
  if (localPayIn > 0) {
    usdCredit = Math.round((localPayIn / customerRate) * 100) / 100
  } else if (usdCredit > 0) {
    localPayIn = Math.round(usdCredit * customerRate * 100) / 100
  } else {
    throw new Error("grid_fund_balance_amount_required")
  }

  const provisional = computeYcFundBalancePricingBeforeReceive({
    usdCredit,
    localPayIn,
    customerSellRate: customerRate,
    ycSellRate: payInRate?.grid_mid ?? customerRate,
    rail: input.rail,
  })

  const limitCheck = await validateFundBalancePayInAmountLimits({
    admin: input.admin,
    countryCode: country,
    currencyCode: currency,
    rail: input.rail,
    localPayIn: provisional.localPayIn,
  })
  if (!limitCheck.ok) {
    throw new Error(limitCheck.message)
  }

  return {
    localPayIn,
    localCurrency: currency,
    usdCredit,
    customerRate,
    processingFee: provisional.processingFee,
    displayProcessingFee: provisional.processingFee,
  }
}

export async function createGridFundBalanceSession(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  country: string
  currency: string
  rail: "bank_transfer" | "mobile_money"
  usdCredit?: number
  localPayIn?: number
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
  profile: GridPersonProfile
}): Promise<GridFundBalanceSessionResult> {
  const country = input.country.trim().toUpperCase()
  const currency = input.currency.trim().toUpperCase()

  const preview = await previewGridFundBalanceQuote({
    admin: input.admin,
    country,
    currency,
    rail: input.rail,
    usdCredit: input.usdCredit,
    localPayIn: input.localPayIn,
  })

  const { customerId } = await ensureGridCustomer({
    admin: input.admin,
    userId: input.userId,
    businessId: input.businessId,
    profile: input.profile,
  })

  const usdInternalAccountId = await resolveGridCustomerInternalAccountId({
    customerId,
    currency: "USD",
  })
  if (!usdInternalAccountId) {
    throw new Error("Grid USD internal account is not ready for this customer yet.")
  }

  const quote = await gridFetch<GridQuote>({
    method: "POST",
    path: "/quotes",
    json: buildGridFundBalanceQuoteBody({
      customerId,
      sourceCurrency: currency,
      destinationInternalAccountId: usdInternalAccountId,
      lockedSendMinor: gridMinorUnits(preview.localPayIn, 2),
    }),
    idempotencyKey: `grid_fund_${customerId}_${currency}_${preview.localPayIn}`,
  })

  const gridFeesUsd = gridQuoteFeesUsd(quote)
  const lockedLocalPayIn = gridQuoteSendingAmountMajor(quote) ?? preview.localPayIn
  const lockedUsdCredit = gridQuoteReceivingAmountMajor(quote) ?? preview.usdCredit
  const lockedCustomerRate =
    quote.exchangeRate != null && quote.exchangeRate > 0
      ? quote.exchangeRate
      : preview.customerRate
  const processingFee = Math.round((preview.processingFee + gridFeesUsd) * 100) / 100

  const sequenceId = `grid_fund_${String(quote.id).replace(/[^a-zA-Z0-9:_-]/g, "")}`
  const easnerTransactionId = generateTransactionId()
  const expiresAt = quote.expiresAt ?? new Date(Date.now() + getGridQuoteTtlMs()).toISOString()

  const { data: tx } = await input.admin
    .from("transactions")
    .insert({
      user_id: input.userId,
      business_id: input.businessId,
      provider: "grid",
      provider_transaction_id: String(quote.id),
      easner_transaction_id: easnerTransactionId,
      type: "deposit",
      direction: "in",
      status: "pending",
      amount: lockedUsdCredit,
      currency: "USD",
      metadata: {
        pay_in_provider: "grid",
        pay_in_rail: input.rail,
        grid_quote_id: quote.id,
        grid_sequence_id: sequenceId,
        local_pay_in: lockedLocalPayIn,
        local_currency: currency,
        country_code: country,
        customer_rate: lockedCustomerRate,
        grid_fees_usd: gridFeesUsd,
        processing_fee: processingFee,
        payment_instructions: quote.paymentInstructions,
        ...(input.sourcePhone ? { source_phone: input.sourcePhone } : {}),
        ...(input.sourceNetworkId ? { source_network_id: input.sourceNetworkId } : {}),
        ...(input.sourceNetworkName ? { source_network_name: input.sourceNetworkName } : {}),
      },
    })
    .select("id")
    .maybeSingle()

  await input.admin.from("grid_transfers").insert({
    transaction_id: tx?.id ?? null,
    user_id: input.userId,
    business_id: input.businessId,
    mode: "fund_balance",
    status: "pending",
    pay_in_currency: currency,
    receive_currency: "USD",
    quoted_pay_in: lockedLocalPayIn,
    quoted_receive: lockedUsdCredit,
    customer_rate: lockedCustomerRate,
    grid_quote_id: String(quote.id),
    grid_customer_id: customerId,
    settlement_info: { paymentInstructions: quote.paymentInstructions },
    expires_at: expiresAt,
    metadata: {
      easner_transaction_id: easnerTransactionId,
      sequence_id: sequenceId,
      pay_in_rail: input.rail,
      ...(input.sourcePhone ? { source_phone: input.sourcePhone } : {}),
      ...(input.sourceNetworkId ? { source_network_id: input.sourceNetworkId } : {}),
      ...(input.sourceNetworkName ? { source_network_name: input.sourceNetworkName } : {}),
    },
  })

  return {
    sequenceId,
    quoteId: String(quote.id),
    customerId,
    localPayIn: lockedLocalPayIn,
    localCurrency: currency,
    usdCredit: lockedUsdCredit,
    customerRate: lockedCustomerRate,
    processingFee,
    gridFeesUsd,
    paymentInstructions: quote.paymentInstructions,
    expiresAt,
    transactionId: String(tx?.id ?? randomUUID()),
    easnerTransactionId,
  }
}
