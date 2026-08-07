/** 1:1 direct Turnkey USDC/EURC · Solana wallet send with explicit processing fee. */

import type { CryptoSendPricing } from "./crypto-send-pricing"

export const DEFAULT_WALLET_SEND_PROCESSING_FEE_BPS = 100
/** Processing fee is uncapped (Easner 1% applies to the full principal). */
export const DEFAULT_WALLET_SEND_PROCESSING_FEE_CAP = Number.POSITIVE_INFINITY

function roundStablecoin(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

export type WalletSendProcessingFeeOpts = {
  feeBps?: number
  feeCap?: number
}

export function parseWalletSendProcessingFeeBpsFromEnv(raw: string | undefined): number {
  const parsed = Number.parseInt(String(raw ?? "").trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_WALLET_SEND_PROCESSING_FEE_BPS
  return parsed
}

export function parseWalletSendProcessingFeeCapFromEnv(raw: string | undefined): number {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return DEFAULT_WALLET_SEND_PROCESSING_FEE_CAP
  const parsed = Number.parseFloat(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_WALLET_SEND_PROCESSING_FEE_CAP
  return parsed
}

/** Processing fee in stablecoin units: min(R × bps/10000, cap). */
export function computeWalletSendProcessingFee(
  receiveAmount: number,
  opts?: WalletSendProcessingFeeOpts,
): number {
  const R = roundStablecoin(receiveAmount)
  if (!Number.isFinite(R) || R <= 0) return 0
  const bps = opts?.feeBps ?? DEFAULT_WALLET_SEND_PROCESSING_FEE_BPS
  const cap = opts?.feeCap ?? DEFAULT_WALLET_SEND_PROCESSING_FEE_CAP
  const rate = bps / 10_000
  return roundStablecoin(Math.min(R * rate, cap))
}

export function computeDirectTurnkeyWalletSendPricing(input: {
  receiveAmount: number
  feeBps?: number
  feeCap?: number
}): CryptoSendPricing {
  const receiveAmount = roundStablecoin(input.receiveAmount)
  if (!Number.isFinite(receiveAmount) || receiveAmount <= 0) {
    throw new Error("receiveAmount must be positive")
  }
  const marginAmount = computeWalletSendProcessingFee(receiveAmount, {
    feeBps: input.feeBps,
    feeCap: input.feeCap,
  })
  const totalDebited = roundStablecoin(receiveAmount + marginAmount)
  return {
    receiveAmount,
    customerRate: 1,
    bridgeMid: 1,
    customerPrincipal: receiveAmount,
    midNotional: receiveAmount,
    marginAmount,
    bridgeFloor: receiveAmount,
    routeCost: 0,
    // Direct Turnkey has no FX margin — the fee IS the explicit processing fee.
    processingFee: marginAmount,
    displayChannelCost: 0,
    networkFee: 0,
    totalDebited,
  }
}

function feeRateFromBps(bps: number): number {
  return bps / 10_000
}

/**
 * Send-mode: user budget B leaves balance; find R such that R + fee(R) = B.
 */
export function receiveAmountFromDirectTurnkeySendBudget(input: {
  sendBudget: number
  feeBps?: number
  feeCap?: number
}): number {
  const B = roundStablecoin(input.sendBudget)
  if (!Number.isFinite(B) || B <= 0) throw new Error("sendBudget must be positive")

  const bps = input.feeBps ?? DEFAULT_WALLET_SEND_PROCESSING_FEE_BPS
  const cap = input.feeCap ?? DEFAULT_WALLET_SEND_PROCESSING_FEE_CAP
  const rate = feeRateFromBps(bps)

  const R0 = roundStablecoin(B / (1 + rate))
  const fee0 = computeWalletSendProcessingFee(R0, { feeBps: bps, feeCap: cap })
  if (Math.abs(R0 + fee0 - B) < 1e-6) return R0

  const Rcapped = roundStablecoin(B - cap)
  if (Rcapped <= 0) throw new Error("sendBudget too small for processing fee cap")
  const feeCapped = computeWalletSendProcessingFee(Rcapped, { feeBps: bps, feeCap: cap })
  if (feeCapped >= cap - 1e-9 && Math.abs(Rcapped + feeCapped - B) < 1e-6) return Rcapped

  return R0
}

export function normalizeDirectTurnkeyWalletSendReceiveAmount(input: {
  amountEntryMode: "send" | "receive"
  receiveAmount: number
  sendBudget?: number
  feeBps?: number
  feeCap?: number
}): number {
  if (
    input.amountEntryMode === "send" &&
    input.sendBudget != null &&
    input.sendBudget > 0
  ) {
    return receiveAmountFromDirectTurnkeySendBudget({
      sendBudget: input.sendBudget,
      feeBps: input.feeBps,
      feeCap: input.feeCap,
    })
  }
  return roundStablecoin(input.receiveAmount)
}
