import { resolveEffectiveWalletSendMin } from "@easner/shared"
import { lifiQuote, type LifiQuoteResponse } from "@/lib/lifi/client"
import type { WalletSendTokenRef } from "@/lib/lifi/token-map"
import {
  estimateLifiFromAmountRaw,
  lifiFromAmountRawForSendBudget,
  lifiMinFromAmountRaw,
  parseLifiToAmountHuman,
} from "./lifi-from-amount"

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

function lifiQuoteErrorMessage(err: unknown, input: {
  receiveAsset: string
  receiveNetwork: string
  minReceive: number
}): string {
  if (isLifiNoQuotesError(err)) {
    return (
      `No LI.FI route for ${input.receiveAsset} on ${input.receiveNetwork} at this amount. ` +
      `Try at least ${input.minReceive} ${input.receiveAsset} (bridge minimum ~${getLifiBridgeMinSourceUsdc()} USDC).`
    )
  }
  return err instanceof Error ? err.message : "lifi_quote_failed"
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
  const minReceive = resolveEffectiveWalletSendMin({
    receiveCurrency: input.dest.asset,
    receiveNetwork: input.dest.network,
    customerRate: input.customerRate,
    minSourceUsdc: getLifiBridgeMinSourceUsdc(),
  })

  if (input.amountEntryMode === "receive" && input.receiveAmount < minReceive) {
    throw new Error(
      `Minimum receive amount for ${input.dest.asset} on ${input.dest.network} is ${minReceive} ${input.dest.asset}.`,
    )
  }

  let fromAmountRaw =
    input.amountEntryMode === "send" && input.sendBudget != null && input.sendBudget > 0
      ? lifiFromAmountRawForSendBudget(input.sendBudget, input.source.decimals)
      : estimateLifiFromAmountRaw({
          receiveAmount: input.receiveAmount,
          customerRate: input.customerRate,
          lifiMid: input.lifiMid,
          sourceDecimals: input.source.decimals,
          slippage,
          minSourceHuman: getLifiBridgeMinSourceUsdc(),
        })

  fromAmountRaw = lifiMinFromAmountRaw(fromAmountRaw, input.source.decimals, getLifiBridgeMinSourceUsdc())

  const params = {
    fromChain: input.source.chainId,
    toChain: input.dest.chainId,
    fromToken: input.source.address,
    toToken: input.dest.address,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    fee: 0 as const,
    slippage,
  }

  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const quote = await lifiQuote({ ...params, fromAmount: fromAmountRaw })
      const toHuman = parseLifiToAmountHuman(quote, input.dest.decimals)
      const target =
        input.amountEntryMode === "receive"
          ? input.receiveAmount
          : input.sendBudget != null && input.sendBudget > 0
            ? input.sendBudget * input.customerRate
            : input.receiveAmount

      if (target > 0 && toHuman + 1e-9 < target * (1 - slippage)) {
        const scale = Math.max(1.15, target / Math.max(toHuman, 1e-12))
        const bumped = Math.ceil(Number(fromAmountRaw) * scale)
        fromAmountRaw = String(Math.max(bumped, Number(lifiMinFromAmountRaw("1", input.source.decimals, getLifiBridgeMinSourceUsdc()))))
        continue
      }
      return quote
    } catch (e) {
      lastErr = e
      if (isLifiNoQuotesError(e) && attempt < 3) {
        const bumped = Math.ceil(Number(fromAmountRaw) * 1.5)
        fromAmountRaw = String(Math.max(bumped, Number(lifiMinFromAmountRaw("1", input.source.decimals, getLifiBridgeMinSourceUsdc()))))
        continue
      }
      break
    }
  }

  throw new Error(
    lifiQuoteErrorMessage(lastErr, {
      receiveAsset: input.dest.asset,
      receiveNetwork: input.dest.network,
      minReceive,
    }),
  )
}
