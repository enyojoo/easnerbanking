import { relayQuoteV2 } from "./client"
import { relayQuoteFeeParams } from "./config"
import {
  compileRelaySolanaStepTxHexForTurnkey,
  extractPreSerializedRelaySolanaTxHex,
  type RelaySolanaStepData,
} from "./compile-solana-step-tx"
import type { RelayQuoteV2Request, RelayQuoteV2Response, RelayTradeType } from "./types"
import type { WalletSendTokenRef } from "./token-map"

export type RelayQuoteParams = {
  user: string
  recipient: string
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  amountRaw: string
  tradeType: RelayTradeType
  useDepositAddress?: boolean
  slippageTolerance?: string
  referrer?: string
  refundTo?: string
}

export function buildRelayQuoteRequest(input: RelayQuoteParams): RelayQuoteV2Request {
  return {
    user: input.user,
    recipient: input.recipient,
    originChainId: input.source.chainId,
    destinationChainId: input.dest.chainId,
    originCurrency: input.source.address,
    destinationCurrency: input.dest.address,
    amount: input.amountRaw,
    tradeType: input.tradeType,
    useDepositAddress: input.useDepositAddress,
    slippageTolerance: input.slippageTolerance,
    referrer: input.referrer,
    refundTo: input.refundTo,
    ...relayQuoteFeeParams(),
  }
}

export async function relayQuote(input: RelayQuoteParams): Promise<RelayQuoteV2Response> {
  return relayQuoteV2(buildRelayQuoteRequest(input))
}

/** Extract request id from quote response (steps or top-level). */
export function extractRelayRequestId(quote: RelayQuoteV2Response): string | undefined {
  const top = String(quote.requestId ?? quote.id ?? "").trim()
  if (top) return top
  for (const step of quote.steps ?? []) {
    const stepId = String(step.requestId ?? step.id ?? "").trim()
    if (stepId) return stepId
  }
  return undefined
}

/** Parse origin input amount (raw units) from quote details. */
export function parseRelayFromAmountRaw(quote: RelayQuoteV2Response): string {
  const fromDetails = String(quote.details?.currencyIn?.amount ?? "").trim()
  if (fromDetails) return fromDetails
  throw new Error("relay_quote_missing_from_amount")
}

/** Parse destination output amount in human units. */
export function parseRelayToAmountHuman(quote: RelayQuoteV2Response, destDecimals: number): number {
  const raw = String(quote.details?.currencyOut?.amount ?? "").trim()
  if (raw) {
    const n = Number(raw) / 10 ** destDecimals
    if (Number.isFinite(n)) return n
  }
  const formatted = Number(quote.details?.currencyOut?.amountFormatted ?? NaN)
  if (Number.isFinite(formatted)) return formatted
  throw new Error("relay_quote_missing_to_amount")
}

function relaySolanaStepDataFromQuote(quote: RelayQuoteV2Response): RelaySolanaStepData | null {
  for (const step of quote.steps ?? []) {
    for (const item of step.items ?? []) {
      const data = item.data
      if (!data || typeof data !== "object") continue
      return data as RelaySolanaStepData
    }
  }
  return null
}

/** Extract pre-serialized Solana tx from quote steps (legacy Relay wire/base64/hex). */
export function extractRelaySolanaUnsignedTx(quote: RelayQuoteV2Response): string {
  const stepData = relaySolanaStepDataFromQuote(quote)
  if (!stepData) throw new Error("relay_missing_solana_transaction")
  const preSerialized = extractPreSerializedRelaySolanaTxHex(stepData)
  if (preSerialized) return preSerialized
  throw new Error("relay_missing_solana_transaction")
}

/** Build Turnkey-ready hex wire bytes from Relay quote (supports instruction + LUT steps). */
export async function resolveRelaySolanaUnsignedTxHexForTurnkey(input: {
  quote: RelayQuoteV2Response
  feePayer: string
  recentBlockhash?: string
}): Promise<string> {
  const stepData = relaySolanaStepDataFromQuote(input.quote)
  if (!stepData) throw new Error("relay_missing_solana_transaction")
  return compileRelaySolanaStepTxHexForTurnkey({
    stepData,
    feePayer: input.feePayer,
    recentBlockhash: input.recentBlockhash,
  })
}

/** Open deposit address from quote (Tron inbound provision). */
export function extractRelayDepositAddress(quote: RelayQuoteV2Response): string | undefined {
  for (const step of quote.steps ?? []) {
    const stepLevel = String((step as { depositAddress?: string }).depositAddress ?? "").trim()
    if (stepLevel) return stepLevel
    for (const item of step.items ?? []) {
      const data = item.data
      if (!data || typeof data !== "object") continue
      const addr = String(
        (data as { depositAddress?: string }).depositAddress ??
          (data as { address?: string }).address ??
          "",
      ).trim()
      if (addr) return addr
    }
  }
  return undefined
}

export function parseRelayNetworkFeeUsd(quote: RelayQuoteV2Response): number {
  const fees = quote.fees as Record<string, unknown> | undefined
  if (!fees) return 0
  const gas = Number((fees as { gas?: { amountUsd?: string } }).gas?.amountUsd ?? NaN)
  const relayer = Number((fees as { relayer?: { amountUsd?: string } }).relayer?.amountUsd ?? NaN)
  let total = 0
  if (Number.isFinite(gas) && gas > 0) total += gas
  if (Number.isFinite(relayer) && relayer > 0) total += relayer
  return Math.round(total * 100) / 100
}
