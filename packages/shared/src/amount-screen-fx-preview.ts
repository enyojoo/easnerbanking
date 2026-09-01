/**
 * Amount-screen counterparts (pay-in / payout / TLC / wallet send-out).
 *
 * Layer 1: cached Easner rate + estimated fees (instant).
 * Layer 2: matching provider quote overlay (already-prefetched).
 *
 * The typed amount stays the API anchor. The counterpart is the all-in other side.
 */

import { computePayoutProcessingFeeBps } from "./payout-processing-fee"
import { estimateWalletSendTotalDebited } from "./direct-turnkey-wallet-send-pricing"
import type { YcFundBalanceAmountPreview } from "./yc-pricing"

export type AmountScreenFxSource = "rate" | "quote"

function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}

export function amountsMatchForAmountScreen(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return roundCents(a) === roundCents(b)
}

export type AmountScreenPayInQuoteSlice = {
  localPayIn: number
  usdCredit: number
  customerRate?: number
}

export type AmountScreenPayInDisplay = {
  usdCredit: number
  /** Fee-inclusive local (amount-screen counterpart / toggle seed). */
  localPayIn: number
  /** Rate-only principal (deposit-amount row / limits fallback). */
  principalLocal: number
  customerRate: number
  feeInclusive: boolean
  source: AmountScreenFxSource
}

export function payInQuoteMatchesEntered(input: {
  amountEntryMode: "usd" | "local"
  enteredAmount: number
  rateUsdCredit: number
  quote: AmountScreenPayInQuoteSlice | null | undefined
}): boolean {
  const quote = input.quote
  if (!quote || !(quote.localPayIn > 0) || !(quote.usdCredit > 0)) return false
  if (input.amountEntryMode === "usd") {
    return amountsMatchForAmountScreen(quote.usdCredit, input.enteredAmount)
  }
  return (
    amountsMatchForAmountScreen(quote.localPayIn, input.enteredAmount) ||
    amountsMatchForAmountScreen(quote.usdCredit, input.rateUsdCredit)
  )
}

export function resolveAmountScreenPayInPreview(input: {
  amountEntryMode: "usd" | "local"
  enteredAmount: number
  customerRate: number | null | undefined
  ratePreview: YcFundBalanceAmountPreview | null | undefined
  quote?: AmountScreenPayInQuoteSlice | null
}): AmountScreenPayInDisplay {
  const rate = Number(input.customerRate)
  const principalLocal =
    input.ratePreview && input.ratePreview.localPayIn > 0
      ? input.ratePreview.localPayIn
      : 0
  const estimatedLocal =
    input.ratePreview && input.ratePreview.estimatedTotalLocalPayIn > 0
      ? input.ratePreview.estimatedTotalLocalPayIn
      : principalLocal
  const rateUsd =
    input.ratePreview && input.ratePreview.usdCredit > 0 ? input.ratePreview.usdCredit : 0

  if (
    payInQuoteMatchesEntered({
      amountEntryMode: input.amountEntryMode,
      enteredAmount: input.enteredAmount,
      rateUsdCredit: rateUsd,
      quote: input.quote,
    }) &&
    input.quote
  ) {
    return {
      usdCredit: input.quote.usdCredit,
      localPayIn: input.quote.localPayIn,
      principalLocal: principalLocal > 0 ? principalLocal : input.quote.localPayIn,
      customerRate: input.quote.customerRate && input.quote.customerRate > 0 ? input.quote.customerRate : rate,
      feeInclusive: true,
      source: "quote",
    }
  }

  return {
    usdCredit: rateUsd,
    localPayIn: estimatedLocal,
    principalLocal,
    customerRate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    feeInclusive: estimatedLocal > 0 && estimatedLocal >= principalLocal,
    source: "rate",
  }
}

export type AmountScreenPayoutQuoteSlice = {
  totalDebited: number
  youSendAmount: number
  recipientGetsAmount: number
  customerRate?: number
}

export type AmountScreenPayoutDisplay = {
  /** Receive-mode counterpart / debit estimate (all-in). */
  totalDebited: number
  /** API send principal – toggle seed when switching to send entry. */
  youSendAmount: number
  receiveAmount: number
  customerRate: number
  feeInclusive: boolean
  source: AmountScreenFxSource
}

export function payoutQuoteMatchesEntered(input: {
  amountEntryMode: "send" | "receive"
  principalSend: number
  principalReceive: number
  quote: AmountScreenPayoutQuoteSlice | null | undefined
}): boolean {
  const quote = input.quote
  if (!quote || !(quote.totalDebited > 0) || !(quote.youSendAmount > 0) || !(quote.recipientGetsAmount > 0)) {
    return false
  }
  if (input.amountEntryMode === "send") {
    return amountsMatchForAmountScreen(quote.youSendAmount, input.principalSend)
  }
  return amountsMatchForAmountScreen(quote.recipientGetsAmount, input.principalReceive)
}

export function resolveAmountScreenPayoutPreview(input: {
  amountEntryMode: "send" | "receive"
  principalSend: number
  principalReceive: number
  customerRate: number
  processingFeeBps?: number
  quote?: AmountScreenPayoutQuoteSlice | null
}): AmountScreenPayoutDisplay {
  const quote = input.quote
  if (
    payoutQuoteMatchesEntered({
      amountEntryMode: input.amountEntryMode,
      principalSend: input.principalSend,
      principalReceive: input.principalReceive,
      quote,
    }) &&
    quote
  ) {
    return {
      totalDebited: quote.totalDebited,
      youSendAmount: quote.youSendAmount,
      receiveAmount: quote.recipientGetsAmount,
      customerRate:
        quote.customerRate && quote.customerRate > 0 ? quote.customerRate : input.customerRate,
      feeInclusive: true,
      source: "quote",
    }
  }

  const principal = Number(input.principalSend)
  const fee = computePayoutProcessingFeeBps(principal, { bps: input.processingFeeBps })
  const estimatedDebit = principal > 0 ? roundCents(principal + fee) : 0
  return {
    totalDebited: estimatedDebit,
    youSendAmount: principal > 0 ? principal : 0,
    receiveAmount: input.principalReceive > 0 ? input.principalReceive : 0,
    customerRate: input.customerRate,
    feeInclusive: estimatedDebit > principal,
    source: "rate",
  }
}

export type AmountScreenTlcQuoteSlice = {
  localPayIn: number
  receiveAmount?: number
  customerRate?: number
}

export type AmountScreenTlcDisplay = {
  /** Fee-inclusive local pay-in (amount-screen counterpart / toggle seed). */
  localPayIn: number
  principalLocal: number
  receiveAmount: number
  customerRate: number
  feeInclusive: boolean
  source: AmountScreenFxSource
}

export function resolveAmountScreenTlcPreview(input: {
  receiveAmount: number
  principalLocal: number
  customerRate: number
  processingFeeBps?: number
  quote?: AmountScreenTlcQuoteSlice | null
}): AmountScreenTlcDisplay {
  const quote = input.quote
  const receive = Number(input.receiveAmount)
  if (quote && quote.localPayIn > 0) {
    const quoteReceive =
      quote.receiveAmount && quote.receiveAmount > 0 ? quote.receiveAmount : receive
    if (receive <= 0 || amountsMatchForAmountScreen(quoteReceive, receive)) {
      return {
        localPayIn: quote.localPayIn,
        principalLocal: input.principalLocal > 0 ? input.principalLocal : quote.localPayIn,
        receiveAmount: quoteReceive,
        customerRate:
          quote.customerRate && quote.customerRate > 0 ? quote.customerRate : input.customerRate,
        feeInclusive: true,
        source: "quote",
      }
    }
  }

  const principal = Number(input.principalLocal)
  const fee = computePayoutProcessingFeeBps(principal, { bps: input.processingFeeBps })
  const estimatedLocal = principal > 0 ? roundCents(principal + fee) : 0
  return {
    localPayIn: estimatedLocal,
    principalLocal: principal > 0 ? principal : 0,
    receiveAmount: receive > 0 ? receive : 0,
    customerRate: input.customerRate,
    feeInclusive: estimatedLocal > principal,
    source: "rate",
  }
}

/**
 * Wallet send-out (USDC/EURC): same two layers as pay-in / fiat payout.
 * Instant 1% processing estimate, then the matching provider quote.
 */
export function resolveAmountScreenWalletPreview(input: {
  receiveAmount: number
  quote?: { totalDebited: number; receiveAmount: number; youSendAmount?: number } | null
}): AmountScreenPayoutDisplay {
  const receive = Number(input.receiveAmount)
  const quote = input.quote
  if (
    quote &&
    quote.totalDebited > 0 &&
    quote.receiveAmount > 0 &&
    receive > 0 &&
    amountsMatchForAmountScreen(quote.receiveAmount, receive)
  ) {
    return {
      totalDebited: quote.totalDebited,
      youSendAmount: quote.youSendAmount && quote.youSendAmount > 0 ? quote.youSendAmount : quote.totalDebited,
      receiveAmount: quote.receiveAmount,
      customerRate: 1,
      feeInclusive: true,
      source: "quote",
    }
  }
  const estimated = estimateWalletSendTotalDebited(receive)
  return {
    totalDebited: estimated,
    youSendAmount: receive > 0 ? receive : 0,
    receiveAmount: receive > 0 ? receive : 0,
    customerRate: 1,
    feeInclusive: estimated > receive,
    source: "rate",
  }
}
