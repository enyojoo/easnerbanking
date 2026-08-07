import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { applyCryptoCustomerRate, parseWalletSendMarginFromEnv } from "@easner/rate-sync"
import {
  normalizeCryptoSendQuoteReceiveAmount,
  normalizeDirectTurnkeyWalletSendReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
  parseWalletSendProcessingFeeBpsFromEnv,
  parseWalletSendProcessingFeeCapFromEnv,
  resolveEffectiveWalletSendMin,
  validateWalletSendReceiveAmount,
} from "@easner/shared"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/relay/token-map"
import { isRelayWalletSendEnabled, requireCryptoRatesProbeSolAddress, requireRelayApiKey } from "@/lib/relay/config"
import { findCryptoRate, listCryptoRates } from "@/lib/fx/crypto-rates"
import { resolveWalletSendExecutionModel } from "./routing"
import { pricingFromDirectTurnkey, pricingFromRelayQuote } from "./pricing"
import { coerceWalletRecipientRow } from "./coerce-recipient"
import { quoteRelayWalletBridge } from "./relay-wallet-quote"
import { parseRelayToAmountHumanFromQuote } from "./relay-from-amount"
import { extractRelayRequestId, parseRelayFromAmountRaw } from "@/lib/relay/quote"
import {
  validateWalletRecipientForSend,
  walletDestinationAddress,
  walletReceiveAsset,
  walletReceiveNetwork,
  type WalletRecipientRow,
} from "./validate-recipient"
import { createWalletSendSession, WALLET_SEND_QUOTE_TTL_MS } from "./wallet-send-session"
import { assertWalletSendFeeSolanaAddressConfigured } from "./fee-address"
import { quoteCryptoProcessingFeeBps } from "@/lib/processing-fee/quote-processing-fee-bps"

export type WalletSendQuoteResult = {
  receiveAmount: number
  receiveCurrency: string
  receiveNetwork: string
  sendAmount: number
  sendCurrency: string
  totalDebited: number
  marginAmount: number
  channelCost: number
  /** Explicit Easner 1% processing fee leg (uncapped), collected to the fee wallet. */
  processingFee: number
  /** Channel/route component shown in the combined Processing fee row (foots with total). */
  displayChannelCost: number
  networkFee: number
  rate: number
  customerRate: number
  lifiMid: number
  expiresAt: string
  formSessionId: string
  pricingQuoteId: string
  executionModel: "direct_turnkey" | "relay_bridge"
  relayMid?: number
  relayFloor?: string
  quotePhase?: "preview" | "locked"
  wallet: {
    cryptoAuthorizedAmount: string
    lifiFloor: string
    tokenIconUrl?: string
    networkIconUrl?: string
  }
}

function roundReceive(asset: string, amount: number): number {
  return normalizePayoutReceiveAmountForCurrency(asset, amount)
}

export async function buildWalletSendQuote(input: {
  admin: SupabaseClient
  recipient: WalletRecipientRow
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  receiveAmount?: number
  sendAmount?: number
  probeFromAddress?: string
  destinationRef?: string
  sessionUserId?: string
  businessId?: string | null
}): Promise<WalletSendQuoteResult> {
  const recipient = coerceWalletRecipientRow(input.recipient)
  const gate = validateWalletRecipientForSend(recipient)
  if (!gate.ok) throw new Error(gate.error)

  const sourceBalanceCurrency = input.sourceBalanceCurrency.trim().toUpperCase()
  if (sourceBalanceCurrency !== "USD" && sourceBalanceCurrency !== "EUR") {
    throw new Error("sourceBalanceCurrency must be USD or EUR.")
  }

  const receiveAsset = walletReceiveAsset(recipient)
  const receiveNetwork = walletReceiveNetwork(recipient)
  const destinationAddress = walletDestinationAddress(recipient)
  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const executionModel = resolveWalletSendExecutionModel(receiveAsset, receiveNetwork)
  assertWalletSendFeeSolanaAddressConfigured(sourceBalanceCurrency as "USD" | "EUR")

  const feeSubjectUserId = input.sessionUserId ?? recipient.user_id ?? undefined
  const scheduledFeeBps = await quoteCryptoProcessingFeeBps(
    input.admin,
    receiveAsset,
    "pay_out",
    feeSubjectUserId
      ? { userId: feeSubjectUserId, businessId: input.businessId ?? null }
      : undefined,
  )
  const feeBps = scheduledFeeBps
  const feeCap = parseWalletSendProcessingFeeCapFromEnv(process.env.WALLET_SEND_PROCESSING_FEE_CAP)

  let customerRate = 1
  let lifiMid = 1
  let receiveAmount: number
  const sendBudget =
    amountEntryMode === "send" && input.sendAmount != null && input.sendAmount > 0
      ? input.sendAmount
      : undefined

  if (executionModel === "direct_turnkey") {
    receiveAmount = normalizeDirectTurnkeyWalletSendReceiveAmount({
      amountEntryMode,
      receiveAmount: Number(input.receiveAmount ?? 0),
      sendBudget: input.sendAmount,
      feeBps,
      feeCap,
    })
    receiveAmount = roundReceive(receiveAsset, receiveAmount)
  } else {
    const rates = await listCryptoRates(input.admin, { destinations: [receiveAsset] })
    const rateRow =
      findCryptoRate(rates, sourceBalanceCurrency, receiveAsset, receiveNetwork) ??
      ({
        lifi_mid: 1,
        rate: applyCryptoCustomerRate(1, parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN)),
      } as { lifi_mid: number; rate: number })

    customerRate = rateRow.rate
    lifiMid = rateRow.lifi_mid

    if (amountEntryMode === "send" && sendBudget != null) {
      if (!Number.isFinite(sendBudget) || sendBudget <= 0) {
        throw new Error("Amount must be positive.")
      }
      receiveAmount = 0
    } else {
      receiveAmount = normalizeCryptoSendQuoteReceiveAmount({
        amountEntryMode,
        receiveAmount: Number(input.receiveAmount ?? 0),
        sendBudget: input.sendAmount,
        customerRate,
      })
      receiveAmount = Math.round(receiveAmount * 1_000_000) / 1_000_000
    }
  }

  if (executionModel === "direct_turnkey") {
    if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
      throw new Error("Amount must be positive.")
    }
  } else if (amountEntryMode !== "send") {
    if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
      throw new Error("Amount must be positive.")
    }
  }

  const minReceive = resolveEffectiveWalletSendMin({
    receiveCurrency: receiveAsset,
    receiveNetwork,
    customerRate: executionModel === "direct_turnkey" ? 1 : customerRate,
  })

  if (executionModel === "direct_turnkey") {
    const minCheck = validateWalletSendReceiveAmount(receiveAmount, receiveAsset, { minReceive })
    if (!minCheck.ok) throw new Error(minCheck.message)
  } else if (amountEntryMode !== "send") {
    const minCheck = validateWalletSendReceiveAmount(receiveAmount, receiveAsset, { minReceive })
    if (!minCheck.ok) throw new Error(minCheck.message)
  }

  let pricing
  let relayQuoteId: string | undefined
  let relayFromAmountRaw: string | undefined
  let bridgeFloorStr: string

  if (executionModel === "direct_turnkey") {
    pricing = pricingFromDirectTurnkey({ receiveAmount, processingFeeBps: feeBps })
    bridgeFloorStr = pricing.lifiFloor.toFixed(6)
    customerRate = 1
    lifiMid = 1
  } else {
    const probeFrom =
      input.probeFromAddress || requireCryptoRatesProbeSolAddress()

    const source = sourceSolVaultToken(sourceBalanceCurrency as "USD" | "EUR")
    const dest = resolveWalletSendToken(receiveAsset, receiveNetwork)
    if (!dest) throw new Error("Unsupported receive asset/network.")
    if (!isRelayWalletSendEnabled()) {
      throw new Error("Relay wallet send is not configured.")
    }
    requireRelayApiKey()

    const quote = await quoteRelayWalletBridge({
      source,
      dest,
      fromAddress: probeFrom,
      toAddress: destinationAddress,
      amountEntryMode,
      receiveAmount: amountEntryMode === "send" ? 0 : receiveAmount,
      sendBudget,
      customerRate,
      bridgeMid: lifiMid,
    })

    if (amountEntryMode === "send") {
      receiveAmount = roundReceive(
        receiveAsset,
        parseRelayToAmountHumanFromQuote(quote, dest.decimals),
      )
      if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
        throw new Error("Relay quote returned an invalid receive amount.")
      }
      const minCheck = validateWalletSendReceiveAmount(receiveAmount, receiveAsset, { minReceive })
      if (!minCheck.ok) throw new Error(minCheck.message)
    }

    relayQuoteId = extractRelayRequestId(quote)
    relayFromAmountRaw = parseRelayFromAmountRaw(quote)
    pricing = pricingFromRelayQuote({
      receiveAmount,
      customerRate,
      bridgeMid: lifiMid,
      quote,
      sourceDecimals: source.decimals,
      processingFeeBps: feeBps,
    })

    customerRate = pricing.customerRate
    lifiMid = pricing.lifiMid
    bridgeFloorStr = pricing.lifiFloor.toFixed(6)
  }

  const formSessionId = randomUUID()
  const pricingQuoteId = randomUUID()
  const expiresAt = new Date(Date.now() + WALLET_SEND_QUOTE_TTL_MS).toISOString()

  await createWalletSendSession(input.admin, {
    form_session_id: formSessionId,
    user_id: input.sessionUserId || recipient.user_id,
    recipient_id: input.destinationRef?.startsWith("payroll_method:") ? null : recipient.id,
    destination_ref: input.destinationRef || `recipient:${recipient.id}`,
    source_balance_currency: sourceBalanceCurrency,
    receive_asset: receiveAsset,
    receive_network: receiveNetwork,
    destination_address: destinationAddress,
    receive_amount: receiveAmount,
    customer_rate: customerRate,
    lifi_mid: lifiMid,
    lifi_floor: pricing.lifiFloor,
    relay_mid: lifiMid,
    relay_floor: pricing.lifiFloor,
    total_debited: pricing.totalDebited,
    margin_amount: pricing.marginAmount,
    execution_model: executionModel,
    lifi_quote_id: relayQuoteId ?? null,
    lifi_from_amount_raw: relayFromAmountRaw ?? null,
    relay_quote_id: relayQuoteId ?? null,
    relay_from_amount_raw: relayFromAmountRaw ?? null,
    expires_at: expiresAt,
  })

  return {
    receiveAmount,
    receiveCurrency: receiveAsset,
    receiveNetwork,
    sendAmount: pricing.customerPrincipal,
    sendCurrency: sourceBalanceCurrency === "EUR" ? "EURC" : "USDC",
    totalDebited: pricing.totalDebited,
    marginAmount: pricing.marginAmount,
    channelCost: pricing.routeCost,
    processingFee: pricing.processingFee,
    displayChannelCost: pricing.displayChannelCost,
    networkFee: pricing.networkFee,
    rate: customerRate,
    customerRate,
    lifiMid,
    relayMid: lifiMid,
    relayFloor: bridgeFloorStr,
    expiresAt,
    formSessionId,
    pricingQuoteId,
    executionModel,
    wallet: {
      cryptoAuthorizedAmount: pricing.totalDebited.toFixed(6),
      lifiFloor: bridgeFloorStr,
    },
  }
}
