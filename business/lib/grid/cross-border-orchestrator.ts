import type { SupabaseClient } from "@supabase/supabase-js"
import { computeYcCrossBorderPricing } from "@easner/shared"
import { generateTransactionId } from "@/lib/transaction-id"
import { buildCrossBorderQuoteSummary } from "@/lib/yellowcard/build-yc-quote-response"
import { ensureGridCustomer, type GridPersonProfile } from "./ensure-grid-customer"
import { createGridExternalAccount } from "./external-account"
import { loadGridRecipientBankCandidates } from "./grid-bank-candidates"
import { buildGridIdempotencyKey } from "./idempotency"
import { buildGridCrossBorderQuoteBody } from "./quote-request"
import { gridFetch } from "./http"
import { gridMinorUnits } from "./external-account"
import {
  findGridBalancePayoutRate,
  findGridCrossRate,
  findGridPayInRate,
  listGridRates,
} from "@/lib/fx/grid-rates"
import { getGridQuoteTtlMs } from "./config"
import type { GridQuote } from "./types"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"
import { isGridLocalPayInEnabledForCorridor } from "./grid-receive-gate"
import { validateFundBalancePayInAmountLimits } from "@/lib/pay-in-limit-check"
import { quoteFiatProcessingFeeBps, recipientPayoutRail } from "@/lib/processing-fee/quote-processing-fee-bps"

export type GridCrossBorderTransferInput = {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  sourceCountry: string
  sourceCurrency: string
  recipient: RecipientSellPrepareRow
  receiveAmount: number
  profile: GridPersonProfile
  payInRail?: "bank_transfer" | "mobile_money"
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
}

export type GridCrossBorderQuoteResult = {
  quoteId: string
  transferId: string
  sequenceId: string
  customerId: string
  externalAccountId: string
  sourceCurrency: string
  destinationCurrency: string
  sourceAmount: number
  receiveAmount: number
  customerRate: number
  paymentInstructions?: GridQuote["paymentInstructions"]
  expiresAt: string
  easnerTransactionId: string
}

async function prepareGridCrossBorderQuote(input: GridCrossBorderTransferInput) {
  if (input.payInRail === "mobile_money") {
    const phone = String(input.sourcePhone ?? "").trim()
    const netId = String(input.sourceNetworkId ?? "").trim()
    if (!phone || !netId) {
      throw new Error("Mobile number and network are required for mobile_money pay-in")
    }
  }

  const sourceCurrency = input.sourceCurrency.trim().toUpperCase()
  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const sourceCountry = input.sourceCountry.trim().toUpperCase()
  const destCountry = resolveRecipientPayoutCountry(input.recipient)?.toUpperCase()
  if (!destCountry) throw new Error("Recipient country is required.")
  if (sourceCurrency === receiveCurrency) {
    throw new Error("Through Local Currency requires cross-currency corridors")
  }

  const payInRail = input.payInRail === "mobile_money" ? "mobile_money" : "bank_transfer"

  const sourceEnabled = await isGridLocalPayInEnabledForCorridor(input.admin, {
    countryCode: sourceCountry,
    currencyCode: sourceCurrency,
    rail: payInRail,
  })
  if (!sourceEnabled) {
    throw new Error("grid_cross_border_source_disabled")
  }

  const rates = await listGridRates(input.admin, {
    destinations: [sourceCurrency, receiveCurrency],
    status: "active",
  })
  const crossRate = findGridCrossRate(rates, sourceCurrency, receiveCurrency)
  const customerRate = crossRate?.rate ?? 0
  if (!customerRate || customerRate <= 0) {
    throw new Error("grid_cross_border_rate_unavailable")
  }

  const fromLeg = findGridPayInRate(rates, sourceCurrency)
  const toLeg = findGridBalancePayoutRate(rates, receiveCurrency)
  const payInSellFrom = Number(fromLeg?.rate ?? fromLeg?.grid_mid ?? 0)
  const receiveAmount = Number(input.receiveAmount)
  const processingFeeBps = await quoteFiatProcessingFeeBps(
    input.admin,
    {
      countryCode: destCountry,
      currencyCode: receiveCurrency,
      rail: recipientPayoutRail(input.recipient),
    },
    "cross_border",
    { userId: input.userId, businessId: input.businessId },
  )
  const pricing = computeYcCrossBorderPricing({
    receiveAmount,
    customerRate,
    ycSellFrom: Number(fromLeg?.grid_mid ?? crossRate.grid_mid ?? 0),
    ycBuyTo: Number(toLeg?.grid_mid ?? 0),
    receiveLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    sendLeg: { cryptoAmountUsd: 0, networkFeeAmountUsd: 0, serviceFeeAmountUsd: 0 },
    processingFeeBps,
  })

  const payInLimitCheck = await validateFundBalancePayInAmountLimits({
    admin: input.admin,
    countryCode: sourceCountry,
    currencyCode: sourceCurrency,
    rail: payInRail,
    localPayIn: pricing.localPayIn,
  })
  if (!payInLimitCheck.ok) {
    throw new Error(payInLimitCheck.message)
  }

  return {
    sourceCurrency,
    receiveCurrency,
    sourceCountry,
    destCountry,
    payInRail,
    crossRate,
    customerRate,
    payInSellFrom,
    pricing,
    receiveAmount,
    sourceAmount: pricing.localPayIn,
  }
}

/** Indicative cross-border pricing from `grid_rates` — no Grid API calls. */
export async function previewGridCrossBorderQuote(input: GridCrossBorderTransferInput) {
  const prepared = await prepareGridCrossBorderQuote(input)
  const expiresAt = new Date(Date.now() + getGridQuoteTtlMs()).toISOString()
  const quoteSummary = buildCrossBorderQuoteSummary({
    pricing: prepared.pricing,
    payInCurrency: prepared.sourceCurrency,
    receiveCurrency: prepared.receiveCurrency,
    customerRate: prepared.customerRate,
    rail: input.payInRail === "mobile_money" ? "mobile_money" : "bank_transfer",
    expiresAt,
    transactionId: "",
    transferId: "",
    bankInfo: null,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
    easnerSellFrom: prepared.payInSellFrom > 0 ? prepared.payInSellFrom : prepared.customerRate,
  })

  return {
    ok: true as const,
    provider: "grid" as const,
    quotePhase: "preview" as const,
    requiresConfirm: true,
    localPayIn: prepared.pricing.localPayIn,
    customerRate: prepared.customerRate,
    processingFee: prepared.pricing.processingFee,
    ycLegFeesUsd: prepared.pricing.ycLegFeesUsd,
    displayProcessingFee: quoteSummary.displayProcessingFee,
    displayProcessingFeeLocal: quoteSummary.displayProcessingFeeLocal ?? 0,
    displayProcessingFeeCurrency: prepared.sourceCurrency,
    provisionalPayIn: prepared.pricing.provisionalPayIn,
    receiveAmount: prepared.receiveAmount,
    receiveCurrency: prepared.receiveCurrency,
    expiresAt,
    payInRail: input.payInRail === "mobile_money" ? ("mobile_money" as const) : ("bank_transfer" as const),
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
  }
}

/**
 * Lock Grid cross-border quote: customer + external account + POST /quotes + grid_transfers row.
 */
export async function createGridCrossBorderQuote(
  input: GridCrossBorderTransferInput,
): Promise<GridCrossBorderQuoteResult> {
  const prepared = await prepareGridCrossBorderQuote(input)
  const {
    sourceCurrency,
    receiveCurrency,
    sourceCountry,
    destCountry,
    payInRail,
    customerRate,
    receiveAmount,
    sourceAmount,
  } = prepared

  const payoutRail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)

  const { customerId } = await ensureGridCustomer({
    admin: input.admin,
    userId: input.userId,
    businessId: input.businessId,
    profile: input.profile,
  })

  const gridCandidates = await loadGridRecipientBankCandidates(input.admin, {
    countryCode: destCountry,
    currencyCode: receiveCurrency,
    rail: payoutRail,
  })

  const externalAccount = await createGridExternalAccount({
    customerId,
    recipient: input.recipient,
    profile: input.profile,
    rail: payoutRail,
    gridBankCandidates: gridCandidates.bankNames,
    gridMomoCandidates: gridCandidates.momoProviders,
  })

  const quoteBody = buildGridCrossBorderQuoteBody({
    customerId,
    sourceCurrency,
    externalAccountId: externalAccount.id,
    lockedReceiveMinor: gridMinorUnits(receiveAmount, 2),
  })
  const quote = await gridFetch<GridQuote>({
    method: "POST",
    path: "/quotes",
    json: quoteBody,
    idempotencyKey: buildGridIdempotencyKey(`grid_xb_${customerId}`, quoteBody),
  })

  const sequenceId = `grid_xb_${String(quote.id).replace(/[^a-zA-Z0-9:_-]/g, "")}`
  const expiresAt = quote.expiresAt ?? new Date(Date.now() + getGridQuoteTtlMs()).toISOString()
  const easnerTransactionId = generateTransactionId()

  const { data: inserted, error: insertError } = await input.admin
    .from("grid_transfers")
    .insert({
      user_id: input.userId,
      business_id: input.businessId,
      mode: "cross_border_send",
      status: "pending",
      pay_in_currency: sourceCurrency,
      receive_currency: receiveCurrency,
      quoted_pay_in: sourceAmount,
      quoted_receive: receiveAmount,
      customer_rate: Number(quote.exchangeRate ?? customerRate),
      grid_quote_id: String(quote.id),
      grid_customer_id: customerId,
      external_account_id: externalAccount.id,
      settlement_info: { paymentInstructions: quote.paymentInstructions },
      expires_at: expiresAt,
      metadata: {
        easner_transaction_id: easnerTransactionId,
        sequence_id: sequenceId,
        pay_in_rail: payInRail,
        ...(input.sourcePhone ? { source_phone: input.sourcePhone } : {}),
        ...(input.sourceNetworkId ? { source_network_id: input.sourceNetworkId } : {}),
        ...(input.sourceNetworkName ? { source_network_name: input.sourceNetworkName } : {}),
      },
    })
    .select("id")
    .single()

  if (insertError) {
    throw new Error(insertError.message || "grid_cross_border_transfer_insert_failed")
  }

  return {
    quoteId: String(quote.id),
    transferId: String(inserted?.id ?? ""),
    sequenceId,
    customerId,
    externalAccountId: externalAccount.id,
    sourceCurrency,
    destinationCurrency: receiveCurrency,
    sourceAmount,
    receiveAmount,
    customerRate: Number(quote.exchangeRate ?? customerRate),
    paymentInstructions: quote.paymentInstructions,
    expiresAt,
    easnerTransactionId,
  }
}

export async function confirmGridCrossBorderTransfer(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  quoteId: string
}): Promise<{
  transferId: string
  transactionId: string
  easnerTransactionId: string
  localPayIn: number
  customerRate: number
  receiveAmount: number
  receiveCurrency: string
  bankInfo: Record<string, unknown> | null
  expiresAt: string
}> {
  const quoteId = input.quoteId.trim()
  const { data: transfer } = await input.admin
    .from("grid_transfers")
    .select("*")
    .eq("user_id", input.userId)
    .eq("mode", "cross_border_send")
    .eq("grid_quote_id", quoteId)
    .eq("status", "pending")
    .maybeSingle()

  if (!transfer) throw new Error("Grid cross-border quote not found")

  const metadata = (transfer.metadata ?? {}) as Record<string, unknown>
  const easnerTransactionId = String(metadata.easner_transaction_id ?? generateTransactionId())
  const settlement = (transfer.settlement_info ?? {}) as {
    paymentInstructions?: { accountOrWalletInfo?: Record<string, unknown> }
  }
  const now = new Date().toISOString()

  const { data: tx, error: txErr } = await input.admin
    .from("transactions")
    .insert({
      user_id: input.userId,
      business_id: input.businessId,
      provider: "grid",
      provider_transaction_id: quoteId,
      easner_transaction_id: easnerTransactionId,
      type: "transfer",
      direction: "out",
      status: "pending",
      amount: Number(transfer.quoted_pay_in ?? 0),
      currency: String(transfer.pay_in_currency ?? "USD"),
      metadata: {
        grid_mode: "cross_border_send",
        grid_quote_id: quoteId,
        grid_transfer_id: transfer.id,
        pay_in_provider: "grid",
        local_pay_in: transfer.quoted_pay_in,
        local_currency: transfer.pay_in_currency,
        receive_amount: transfer.quoted_receive,
        receive_currency: transfer.receive_currency,
        customer_rate: transfer.customer_rate,
        payment_instructions: settlement.paymentInstructions,
        quote_locked_at: now,
        ...(metadata.pay_in_rail ? { pay_in_rail: metadata.pay_in_rail } : {}),
        ...(metadata.source_phone ? { source_phone: metadata.source_phone } : {}),
        ...(metadata.source_network_id ? { source_network_id: metadata.source_network_id } : {}),
        ...(metadata.source_network_name ? { source_network_name: metadata.source_network_name } : {}),
      },
    })
    .select("id")
    .maybeSingle()

  if (txErr) throw new Error(txErr.message || "grid_cross_border_tx_insert_failed")

  await input.admin
    .from("grid_transfers")
    .update({
      transaction_id: tx?.id ?? null,
      status: "awaiting_pay_in",
      updated_at: now,
      metadata: { ...metadata, easner_transaction_id: easnerTransactionId },
    })
    .eq("id", transfer.id)

  return {
    transferId: String(transfer.id),
    transactionId: String(tx?.id ?? ""),
    easnerTransactionId,
    localPayIn: Number(transfer.quoted_pay_in ?? 0),
    customerRate: Number(transfer.customer_rate ?? 0),
    receiveAmount: Number(transfer.quoted_receive ?? 0),
    receiveCurrency: String(transfer.receive_currency ?? ""),
    bankInfo: settlement.paymentInstructions?.accountOrWalletInfo ?? null,
    expiresAt: String(transfer.expires_at ?? now),
  }
}

/** Lock with Grid POST /quotes, then promote grid_transfers to awaiting_pay_in. */
export async function lockAndConfirmGridCrossBorderOrder(
  input: GridCrossBorderTransferInput,
): Promise<
  Awaited<ReturnType<typeof confirmGridCrossBorderTransfer>> & {
    leg2DraftId: string
    quotePhase: "locked"
    provider: "grid"
    ok: true
    bankInfo: Record<string, unknown> | null
  }
> {
  const locked = await createGridCrossBorderQuote(input)
  const confirmed = await confirmGridCrossBorderTransfer({
    admin: input.admin,
    userId: input.userId,
    businessId: input.businessId,
    quoteId: locked.quoteId,
  })
  return {
    ok: true,
    provider: "grid",
    quotePhase: "locked",
    leg2DraftId: locked.quoteId,
    ...confirmed,
    bankInfo: confirmed.bankInfo,
  }
}

/** Office routing: prefer Grid cross-border when destination corridor metadata selects Grid. */
export async function shouldUseGridCrossBorder(
  admin: SupabaseClient,
  input: {
    sourceCountry: string
    sourceCurrency: string
    destCountry: string
    destCurrency: string
    rail?: "bank_transfer" | "mobile_money"
  },
): Promise<boolean> {
  const { resolveCrossBorderProviderForDestination } = await import("@/lib/cross-border/routing")
  const provider = await resolveCrossBorderProviderForDestination(admin, {
    countryCode: input.destCountry,
    currencyCode: input.destCurrency,
    rail: input.rail,
  })
  if (provider !== "grid") return false
  return isGridLocalPayInEnabledForCorridor(admin, {
    countryCode: input.sourceCountry,
    currencyCode: input.sourceCurrency,
    rail: input.rail,
  })
}
