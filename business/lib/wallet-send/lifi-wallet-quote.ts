import { lifiQuote, type LifiQuoteResponse } from "@/lib/lifi/client"
import type { WalletSendTokenRef } from "@/lib/lifi/token-map"
import {
  estimateLifiFromAmountRaw,
  lifiFromAmountRawForSendBudget,
  lifiMinFromAmountRaw,
} from "./lifi-from-amount"
import {
  findMinLifiFromAmountRaw,
  maxLifiReceiveSearchSourceHuman,
} from "./lifi-receive-search"

const DEFAULT_LIFI_BRIDGE_MIN_SOURCE_USDC = 7

export function getLifiBridgeMinSourceUsdc(): number {
  const parsed = Number.parseFloat(String(process.env.LIFI_BRIDGE_MIN_FROM_USDC || ""))
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return DEFAULT_LIFI_BRIDGE_MIN_SOURCE_USDC
}

/** Minimum receive (in destination asset) implied by LI.FI bridge floor + customer rate. */
export function minReceiveForLifiBridge(
  customerRate: number,
  minSourceUsdc = getLifiBridgeMinSourceUsdc(),
): number {
  const rate = customerRate > 0 ? customerRate : 1
  return Math.ceil((minSourceUsdc / rate) * 100) / 100
}

function isLifiNoQuotesError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("lifi_quote_failed:404") || msg.includes("No available quotes")
}

function lifiQuoteErrorMessage(
  err: unknown,
  input: {
    receiveAsset: string
    receiveNetwork: string
    minReceive: number
  },
): string {
  if (err instanceof Error && err.message === "lifi_receive_target_not_met") {
    return (
      `No LI.FI route for ${input.receiveAsset} on ${input.receiveNetwork} at this amount. ` +
      `Try a larger amount or a different network.`
    )
  }
  if (isLifiNoQuotesError(err)) {
    return (
      `No LI.FI route for ${input.receiveAsset} on ${input.receiveNetwork} at this amount. ` +
      `Try at least ${input.minReceive} ${input.receiveAsset} (bridge minimum ~${getLifiBridgeMinSourceUsdc()} USDC).`
    )
  }
  return err instanceof Error ? err.message : "lifi_quote_failed"
}

type BridgeQuoteParams = {
  fromChain: number | string
  toChain: number | string
  fromToken: string
  toToken: string
  fromAddress: string
  toAddress: string
  slippage: number
}

function bridgeQuoteParams(input: {
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  fromAddress: string
  toAddress: string
  slippage: number
}): BridgeQuoteParams {
  return {
    fromChain: input.source.chainId,
    toChain: input.dest.chainId,
    fromToken: input.source.address,
    toToken: input.dest.address,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    slippage: input.slippage,
  }
}

/** Send mode: fixed fromAmount = sendBudget; accept live toAmount (no slippage bump). */
async function quoteLifiWalletBridgeSend(input: {
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  fromAddress: string
  toAddress: string
  sendBudget: number
  slippage: number
}): Promise<LifiQuoteResponse> {
  const fromAmountRaw = lifiFromAmountRawForSendBudget(input.sendBudget, input.source.decimals)
  const params = bridgeQuoteParams(input)

  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await lifiQuote({ ...params, fromAmount: fromAmountRaw, fee: 0 })
    } catch (e) {
      lastErr = e
      if (!isLifiNoQuotesError(e) || attempt >= 3) break
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("lifi_quote_failed")
}

/** Receive mode: binary search minimum fromAmount for target receive. */
async function quoteLifiWalletBridgeReceive(input: {
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  fromAddress: string
  toAddress: string
  receiveAmount: number
  customerRate: number
  lifiMid: number
  slippage: number
}): Promise<LifiQuoteResponse> {
  const minSourceHuman = getLifiBridgeMinSourceUsdc()
  const maxSourceHuman = maxLifiReceiveSearchSourceHuman({
    receiveAmount: input.receiveAmount,
    lifiMid: input.lifiMid,
    minSourceHuman,
  })
  const initialHighRaw = lifiMinFromAmountRaw(
    estimateLifiFromAmountRaw({
      receiveAmount: input.receiveAmount,
      customerRate: input.customerRate,
      lifiMid: input.lifiMid,
      sourceDecimals: input.source.decimals,
      slippage: input.slippage,
      minSourceHuman,
    }),
    input.source.decimals,
    minSourceHuman,
  )
  const params = bridgeQuoteParams(input)

  const { quote } = await findMinLifiFromAmountRaw({
    receiveAmount: input.receiveAmount,
    lifiMid: input.lifiMid,
    sourceDecimals: input.source.decimals,
    destDecimals: input.dest.decimals,
    slippage: input.slippage,
    minSourceHuman,
    maxSourceHuman,
    initialHighRaw,
    quoteFn: (fromAmountRaw) => lifiQuote({ ...params, fromAmount: fromAmountRaw, fee: 0 }),
  })

  return quote
}

/** Single LI.FI quote at a known fromAmount (execute re-quote after quote-time binary search). */
export async function quoteLifiWalletBridgeFromAmountRaw(input: {
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  fromAddress: string
  toAddress: string
  fromAmountRaw: string
  slippage?: number
}): Promise<LifiQuoteResponse> {
  const fromAmountRaw = String(input.fromAmountRaw || "").trim()
  if (!fromAmountRaw || fromAmountRaw === "0") {
    throw new Error("lifi_from_amount_raw_required")
  }
  const params = bridgeQuoteParams({
    source: input.source,
    dest: input.dest,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    slippage: input.slippage ?? 0.03,
  })
  return lifiQuote({ ...params, fromAmount: fromAmountRaw, fee: 0 })
}

export async function quoteLifiWalletBridge(input: {
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  fromAddress: string
  toAddress: string
  amountEntryMode: "send" | "receive"
  receiveAmount: number
  sendBudget?: number
  customerRate: number
  lifiMid: number
  slippage?: number
}): Promise<LifiQuoteResponse> {
  const slippage = input.slippage ?? 0.03
  const minReceive = minReceiveForLifiBridge(input.customerRate)

  if (input.amountEntryMode === "receive" && input.receiveAmount < minReceive) {
    throw new Error(
      `Minimum receive amount for ${input.dest.asset} on ${input.dest.network} is ${minReceive} ${input.dest.asset}.`,
    )
  }

  try {
    if (input.amountEntryMode === "send") {
      const sendBudget = input.sendBudget
      if (sendBudget == null || sendBudget <= 0) {
        throw new Error("sendBudget must be positive for send mode.")
      }
      return await quoteLifiWalletBridgeSend({
        source: input.source,
        dest: input.dest,
        fromAddress: input.fromAddress,
        toAddress: input.toAddress,
        sendBudget,
        slippage,
      })
    }

    return await quoteLifiWalletBridgeReceive({
      source: input.source,
      dest: input.dest,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      receiveAmount: input.receiveAmount,
      customerRate: input.customerRate,
      lifiMid: input.lifiMid,
      slippage,
    })
  } catch (e) {
    throw new Error(
      lifiQuoteErrorMessage(e, {
        receiveAsset: input.dest.asset,
        receiveNetwork: input.dest.network,
        minReceive,
      }),
    )
  }
}
