"use client"

import { useEffect, useRef } from "react"
import { PAYOUT_MIN_ENFORCE_DEBOUNCE_MS } from "../payout-min-enforcement"
import {
  nextExpressDepositsEnteredAmount,
  parseExpressDepositsAmountEntryMode,
  type ExpressDepositsAmountEntryMode,
} from "../express-deposits-limits"

/** Same timing as send: rewrite the amount field to min (up) or EU max (down). */
export function useExpressDepositsAmountLimits(input: {
  enabled: boolean
  amountEntryMode?: ExpressDepositsAmountEntryMode | string | null
  enteredAmount: number
  usdCredit: number
  youPay: number | null
  sourceCurrency: string
  onApplyEnteredAmount: (amount: number) => void
  debounceMs?: number
}): void {
  const debounceMs = input.debounceMs ?? PAYOUT_MIN_ENFORCE_DEBOUNCE_MS
  const onApplyRef = useRef(input.onApplyEnteredAmount)
  onApplyRef.current = input.onApplyEnteredAmount
  const lastSource = useRef<string | null>(null)

  const apply = (
    amountEntryMode: ExpressDepositsAmountEntryMode,
    enteredAmount: number,
    usdCredit: number,
    youPay: number | null,
    sourceCurrency: string,
  ) => {
    const next = nextExpressDepositsEnteredAmount({
      amountEntryMode,
      enteredAmount,
      usdCredit,
      youPay,
      sourceCurrency,
    })
    if (next != null && next !== enteredAmount) onApplyRef.current(next)
  }

  useEffect(() => {
    if (!input.enabled) return
    const source = String(input.sourceCurrency || "").trim().toUpperCase()
    if (!source || lastSource.current === source) return
    lastSource.current = source
    apply(
      parseExpressDepositsAmountEntryMode(input.amountEntryMode),
      input.enteredAmount,
      input.usdCredit,
      input.youPay,
      source,
    )
  }, [input.enabled, input.sourceCurrency, input.amountEntryMode, input.enteredAmount, input.usdCredit, input.youPay])

  useEffect(() => {
    if (!input.enabled || !(input.enteredAmount > 0)) return
    const timer = setTimeout(() => {
      apply(
        parseExpressDepositsAmountEntryMode(input.amountEntryMode),
        input.enteredAmount,
        input.usdCredit,
        input.youPay,
        input.sourceCurrency,
      )
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [
    input.enabled,
    input.amountEntryMode,
    input.enteredAmount,
    input.usdCredit,
    input.youPay,
    input.sourceCurrency,
    debounceMs,
  ])
}
