"use client"

import { useEffect, useRef } from "react"
import { PAYOUT_MIN_ENFORCE_DEBOUNCE_MS } from "../payout-min-enforcement"
import { nextExpressDepositsUsdCredit } from "../express-deposits-limits"

/** Same timing as send: rewrite the amount field to min (up) or EU max (down). */
export function useExpressDepositsAmountLimits(input: {
  enabled: boolean
  usdCredit: number
  youPay: number | null
  sourceCurrency: string
  onApplyUsdCredit: (amount: number) => void
  debounceMs?: number
}): void {
  const debounceMs = input.debounceMs ?? PAYOUT_MIN_ENFORCE_DEBOUNCE_MS
  const onApplyRef = useRef(input.onApplyUsdCredit)
  onApplyRef.current = input.onApplyUsdCredit
  const lastSource = useRef<string | null>(null)

  const apply = (usdCredit: number, youPay: number | null, sourceCurrency: string) => {
    const next = nextExpressDepositsUsdCredit({ usdCredit, youPay, sourceCurrency })
    if (next != null && next !== usdCredit) onApplyRef.current(next)
  }

  useEffect(() => {
    if (!input.enabled) return
    const source = String(input.sourceCurrency || "").trim().toUpperCase()
    if (!source || lastSource.current === source) return
    lastSource.current = source
    apply(input.usdCredit, input.youPay, source)
  }, [input.enabled, input.sourceCurrency, input.usdCredit, input.youPay])

  useEffect(() => {
    if (!input.enabled || !(input.usdCredit > 0)) return
    const timer = setTimeout(() => {
      apply(input.usdCredit, input.youPay, input.sourceCurrency)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [input.enabled, input.usdCredit, input.youPay, input.sourceCurrency, debounceMs])
}