import { getRelayBridgeMinSourceUsdc as readRelayBridgeMinSourceUsdc, isRelayWalletSendEnabled } from "@/lib/relay/config"
import { relayQuote, type RelayQuoteV2Response } from "@/lib/relay/quote"
import type { WalletSendTokenRef } from "@/lib/relay/token-map"
import {
  estimateRelayFromAmountRaw,
  relayFromAmountRawForSendBudget,
  relayMinFromAmountRaw,
} from "./relay-from-amount"
import {
  findMinRelayFromAmountRaw,
  maxRelayReceiveSearchSourceHuman,
} from "./relay-receive-search"

export { readRelayBridgeMinSourceUsdc as getRelayBridgeMinSourceUsdc }

export function minReceiveForRelayBridge(
  customerRate: number,
  minSourceUsdc = readRelayBridgeMinSourceUsdc(),
): number {
  const rate = customerRate > 0 ? customerRate : 1
  return Math.ceil((minSourceUsdc / rate) * 100) / 100
}

function isRelayNoQuotesError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("relay_http_failed:404") || msg.includes("No available quotes")
}

function relayQuoteErrorMessage(
  err: unknown,
  input: { receiveAsset: string; receiveNetwork: string; minReceive: number },
): string {
  if (err instanceof Error && err.message === "relay_receive_target_not_met") {
    return (
      `No Relay route for ${input.receiveAsset} on ${input.receiveNetwork} at this amount. ` +
      `Try a larger amount or a different network.`
    )
  }
  if (isRelayNoQuotesError(err)) {
    return (
      `No Relay route for ${input.receiveAsset} on ${input.receiveNetwork} at this amount. ` +
      `Try at least ${input.minReceive} ${input.receiveAsset} (bridge minimum ~${readRelayBridgeMinSourceUsdc()} USDC).`
    )
  }
  return err instanceof Error ? err.message : "relay_quote_failed"
}

type BridgeQuoteParams = {
  user: string
  recipient: string
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  slippageTolerance?: string
}

function quoteRelayExactInput(input: BridgeQuoteParams & { amountRaw: string }): Promise<RelayQuoteV2Response> {
  return relayQuote({
    user: input.user,
    recipient: input.recipient,
    source: input.source,
    dest: input.dest,
    amountRaw: input.amountRaw,
    tradeType: "EXACT_INPUT",
    slippageTolerance: input.slippageTolerance,
  })
}

async function quoteRelayWalletBridgeSend(input: {
  user: string
  recipient: string
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  sendBudget: number
  slippageTolerance?: string
}): Promise<RelayQuoteV2Response> {
  const fromAmountRaw = relayFromAmountRawForSendBudget(input.sendBudget, input.source.decimals)
  const params = {
    user: input.user,
    recipient: input.recipient,
    source: input.source,
    dest: input.dest,
    slippageTolerance: input.slippageTolerance,
  }

  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await quoteRelayExactInput({ ...params, amountRaw: fromAmountRaw })
    } catch (e) {
      lastErr = e
      if (!isRelayNoQuotesError(e) || attempt >= 3) break
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("relay_quote_failed")
}

async function quoteRelayWalletBridgeReceive(input: {
  user: string
  recipient: string
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  receiveAmount: number
  customerRate: number
  bridgeMid: number
  slippage: number
  slippageTolerance?: string
}): Promise<RelayQuoteV2Response> {
  const minSourceHuman = readRelayBridgeMinSourceUsdc()
  const maxSourceHuman = maxRelayReceiveSearchSourceHuman({
    receiveAmount: input.receiveAmount,
    bridgeMid: input.bridgeMid,
    minSourceHuman,
  })
  const initialHighRaw = relayMinFromAmountRaw(
    estimateRelayFromAmountRaw({
      receiveAmount: input.receiveAmount,
      customerRate: input.customerRate,
      bridgeMid: input.bridgeMid,
      sourceDecimals: input.source.decimals,
      slippage: input.slippage,
      minSourceHuman,
    }),
    input.source.decimals,
    minSourceHuman,
  )

  const { quote } = await findMinRelayFromAmountRaw({
    receiveAmount: input.receiveAmount,
    bridgeMid: input.bridgeMid,
    sourceDecimals: input.source.decimals,
    destDecimals: input.dest.decimals,
    slippage: input.slippage,
    minSourceHuman,
    maxSourceHuman,
    initialHighRaw,
    quoteFn: (fromAmountRaw) =>
      quoteRelayExactInput({
        user: input.user,
        recipient: input.recipient,
        source: input.source,
        dest: input.dest,
        amountRaw: fromAmountRaw,
        slippageTolerance: input.slippageTolerance,
      }),
  })

  return quote
}

export async function quoteRelayWalletBridgeFromAmountRaw(input: {
  user: string
  recipient: string
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  fromAmountRaw: string
  slippageTolerance?: string
}): Promise<RelayQuoteV2Response> {
  const fromAmountRaw = String(input.fromAmountRaw || "").trim()
  if (!fromAmountRaw || fromAmountRaw === "0") {
    throw new Error("relay_from_amount_raw_required")
  }
  return quoteRelayExactInput({
    user: input.user,
    recipient: input.recipient,
    source: input.source,
    dest: input.dest,
    amountRaw: fromAmountRaw,
    slippageTolerance: input.slippageTolerance,
  })
}

export async function quoteRelayWalletBridge(input: {
  user: string
  recipient: string
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  fromAddress: string
  toAddress: string
  amountEntryMode: "send" | "receive"
  receiveAmount: number
  sendBudget?: number
  customerRate: number
  bridgeMid: number
  slippage?: number
}): Promise<RelayQuoteV2Response> {
  if (!isRelayWalletSendEnabled()) {
    throw new Error("relay_wallet_send_disabled")
  }

  const slippage = input.slippage ?? 0.03
  const slippageTolerance = String(Math.round(slippage * 10_000))
  const bridgeMid = input.bridgeMid > 0 ? input.bridgeMid : 1
  const minReceive = minReceiveForRelayBridge(input.customerRate)
  const user = String(input.fromAddress || input.user || "").trim()
  const recipient = String(input.toAddress || input.recipient || "").trim()

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
      return await quoteRelayWalletBridgeSend({
        user,
        recipient,
        source: input.source,
        dest: input.dest,
        sendBudget,
        slippageTolerance,
      })
    }

    return await quoteRelayWalletBridgeReceive({
      user,
      recipient,
      source: input.source,
      dest: input.dest,
      receiveAmount: input.receiveAmount,
      customerRate: input.customerRate,
      bridgeMid,
      slippage,
      slippageTolerance,
    })
  } catch (e) {
    throw new Error(
      relayQuoteErrorMessage(e, {
        receiveAsset: input.dest.asset,
        receiveNetwork: input.dest.network,
        minReceive,
      }),
    )
  }
}

/** EXACT_OUTPUT quote for a fixed receive amount (used by execute guard). */
export async function quoteRelayWalletBridgeExactOutput(input: {
  user: string
  recipient: string
  source: WalletSendTokenRef
  dest: WalletSendTokenRef
  receiveAmountRaw: string
  slippageTolerance?: string
}): Promise<RelayQuoteV2Response> {
  return relayQuote({
    user: input.user,
    recipient: input.recipient,
    source: input.source,
    dest: input.dest,
    amountRaw: input.receiveAmountRaw,
    tradeType: "EXACT_OUTPUT",
    slippageTolerance: input.slippageTolerance,
  })
}
