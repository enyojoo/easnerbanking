import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { applyCryptoCustomerRate, parseWalletSendMarginFromEnv } from "@easner/rate-sync"
import {
  normalizeCryptoSendQuoteReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
} from "@easner/shared"
import { lifiQuote } from "@/lib/lifi/client"
import { resolveWalletSendToken, sourceSolVaultToken } from "@/lib/lifi/token-map"
import { findCryptoRate, listCryptoRates } from "@/lib/fx/crypto-rates"
import { resolveWalletSendExecutionModel } from "./routing"
import { pricingFromDirectTurnkey, pricingFromLifiQuote } from "./pricing"
import { coerceWalletRecipientRow } from "./coerce-recipient"
import {
  validateWalletRecipientForSend,
  walletDestinationAddress,
  walletReceiveAsset,
  walletReceiveNetwork,
  type WalletRecipientRow,
} from "./validate-recipient"
import { createWalletSendSession, WALLET_SEND_QUOTE_TTL_MS } from "./wallet-send-session"

export type WalletSendQuoteResult = {
  receiveAmount: number
  receiveCurrency: string
  receiveNetwork: string
  sendAmount: number
  sendCurrency: string
  totalDebited: number
  marginAmount: number
  channelCost: number
  networkFee: number
  rate: number
  customerRate: number
  lifiMid: number
  expiresAt: string
  formSessionId: string
  pricingQuoteId: string
  executionModel: "direct_turnkey" | "lifi_bridge"
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

  const rates = await listCryptoRates(input.admin, { destinations: [receiveAsset] })
  const rateRow =
    findCryptoRate(rates, sourceBalanceCurrency, receiveAsset, receiveNetwork) ??
    ({
      lifi_mid: 1,
      rate: applyCryptoCustomerRate(1, parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN)),
    } as { lifi_mid: number; rate: number })

  const customerRate = rateRow.rate
  const lifiMid = rateRow.lifi_mid

  let receiveAmount = normalizeCryptoSendQuoteReceiveAmount({
    amountEntryMode,
    receiveAmount: Number(input.receiveAmount ?? 0),
    sendBudget: input.sendAmount,
    customerRate,
  })
  receiveAmount = Math.round(receiveAmount * 1_000_000) / 1_000_000

  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("Amount must be positive.")
  }

  const executionModel = resolveWalletSendExecutionModel(receiveAsset, receiveNetwork)
  const margin = parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN)

  let pricing
  let lifiQuoteId: string | undefined
  let lifiFloorStr: string

  if (executionModel === "direct_turnkey") {
    pricing = pricingFromDirectTurnkey({ receiveAmount, customerRate })
    lifiFloorStr = pricing.lifiFloor.toFixed(6)
  } else {
    const probeFrom =
      input.probeFromAddress ||
      String(process.env.CRYPTO_RATES_PROBE_SOL_ADDRESS || "").trim()
    if (!probeFrom) throw new Error("Source Solana vault address not configured for LI.FI quote.")

    const source = sourceSolVaultToken(sourceBalanceCurrency as "USD" | "EUR")
    const dest = resolveWalletSendToken(receiveAsset, receiveNetwork)
    if (!dest) throw new Error("Unsupported receive asset/network.")

    const toAmountRaw = Math.round(receiveAmount * 10 ** dest.decimals).toString()
    const quote = await lifiQuote({
      fromChain: source.chainId,
      toChain: dest.chainId,
      fromToken: source.address,
      toToken: dest.address,
      fromAddress: probeFrom,
      toAddress: destinationAddress,
      toAmount: toAmountRaw,
      fee: 0,
    })

    lifiQuoteId = quote.id
    pricing = pricingFromLifiQuote({
      receiveAmount,
      customerRate,
      lifiMid,
      quote,
      sourceDecimals: source.decimals,
    })
    lifiFloorStr = pricing.lifiFloor.toFixed(6)
  }

  const formSessionId = randomUUID()
  const pricingQuoteId = randomUUID()
  const expiresAt = new Date(Date.now() + WALLET_SEND_QUOTE_TTL_MS).toISOString()

  await createWalletSendSession(input.admin, {
    formSessionId,
    userId: recipient.user_id,
    recipientId: recipient.id,
    sourceBalanceCurrency,
    receiveAsset,
    receiveNetwork,
    destinationAddress,
    receiveAmount,
    customerRate,
    lifiMid,
    lifiFloor: pricing.lifiFloor,
    totalDebited: pricing.totalDebited,
    marginAmount: pricing.marginAmount,
    executionModel,
    lifiQuoteId,
    expiresAt,
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
    networkFee: pricing.networkFee,
    rate: customerRate,
    customerRate,
    lifiMid,
    expiresAt,
    formSessionId,
    pricingQuoteId,
    executionModel,
    wallet: {
      cryptoAuthorizedAmount: pricing.totalDebited.toFixed(6),
      lifiFloor: lifiFloorStr,
    },
  }
}
