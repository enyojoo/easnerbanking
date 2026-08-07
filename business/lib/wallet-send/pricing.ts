import { parseWalletSendMarginFromEnv } from "@easner/rate-sync"
import type { RelayQuoteV2Response } from "@/lib/relay/types"
import {
  computeCryptoSendPricing,
  computeDirectTurnkeyWalletSendPricing,
  parseWalletSendProcessingFeeBpsFromEnv,
  parseWalletSendProcessingFeeCapFromEnv,
  resolveBridgeTicketPricingInput,
  type CryptoSendPricing,
} from "@easner/shared"
import { parseRelayFromAmountRaw, parseRelayNetworkFeeUsd } from "@/lib/relay/quote"

export function pricingFromRelayQuote(input: {
  receiveAmount: number
  customerRate: number
  bridgeMid: number
  quote: RelayQuoteV2Response
  sourceDecimals: number
  processingFeeBps?: number
}): CryptoSendPricing {
  const fromRaw = parseRelayFromAmountRaw(input.quote)
  const relayFloor = Number(fromRaw) / 10 ** input.sourceDecimals
  const { customerRate, lifiMid } = resolveBridgeTicketPricingInput({
    receiveAmount: input.receiveAmount,
    planningCustomerRate: input.customerRate,
    planningLifiMid: input.bridgeMid,
    lifiFloor: relayFloor,
    margin: parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN),
  })

  return computeCryptoSendPricing({
    receiveAmount: input.receiveAmount,
    customerRate,
    lifiMid,
    lifiFloor: relayFloor,
    networkFee: parseRelayNetworkFeeUsd(input.quote),
    processingFeeBps:
      input.processingFeeBps ??
      parseWalletSendProcessingFeeBpsFromEnv(process.env.WALLET_SEND_PROCESSING_FEE_BPS),
  })
}

export function pricingFromDirectTurnkey(input: {
  receiveAmount: number
  processingFeeBps?: number
}): CryptoSendPricing {
  return computeDirectTurnkeyWalletSendPricing({
    receiveAmount: input.receiveAmount,
    feeBps:
      input.processingFeeBps ??
      parseWalletSendProcessingFeeBpsFromEnv(process.env.WALLET_SEND_PROCESSING_FEE_BPS),
    feeCap: parseWalletSendProcessingFeeCapFromEnv(process.env.WALLET_SEND_PROCESSING_FEE_CAP),
  })
}
