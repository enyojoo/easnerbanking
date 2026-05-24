import { useEffect, useRef } from "react"
import {
  computeEnteredAmountForReceiveMin,
  computePayoutReceiveAmount,
  PAYOUT_MIN_ENFORCE_DEBOUNCE_MS,
} from "../payout-min-enforcement"

export function usePayoutMinEnforcement(input: {
  enabled: boolean
  /** When this changes (recipient, rail, pay source), min is applied immediately. */
  seedKey: string | null
  minReceive: number | null
  amountEntryMode: "send" | "receive"
  enteredAmount: number
  sendCurrency: string
  receiveCurrency: string
  rateMap: Record<string, number>
  manualQuote?: { sendAmount: number; receiveAmount: number } | null
  useManualQuote?: boolean
  onApplyEnteredAmount: (amount: number) => void
  debounceMs?: number
}): void {
  const debounceMs = input.debounceMs ?? PAYOUT_MIN_ENFORCE_DEBOUNCE_MS
  const onApplyRef = useRef(input.onApplyEnteredAmount)
  onApplyRef.current = input.onApplyEnteredAmount

  const applyMin = (minReceive: number) => {
    const next = computeEnteredAmountForReceiveMin({
      minReceive,
      amountEntryMode: input.amountEntryMode,
      sendCurrency: input.sendCurrency,
      receiveCurrency: input.receiveCurrency,
      rateMap: input.rateMap,
    })
    onApplyRef.current(next)
  }

  const lastSeedKey = useRef<string | null>(null)

  useEffect(() => {
    if (!input.enabled || input.minReceive == null || !input.seedKey) return
    if (lastSeedKey.current === input.seedKey) return
    lastSeedKey.current = input.seedKey
    applyMin(input.minReceive)
  }, [
    input.enabled,
    input.minReceive,
    input.seedKey,
    input.amountEntryMode,
    input.sendCurrency,
    input.receiveCurrency,
    input.rateMap,
  ])

  useEffect(() => {
    if (!input.enabled || input.minReceive == null) return

    const currentReceive = computePayoutReceiveAmount({
      amountEntryMode: input.amountEntryMode,
      enteredAmount: input.enteredAmount,
      sendCurrency: input.sendCurrency,
      receiveCurrency: input.receiveCurrency,
      rateMap: input.rateMap,
      manualQuote: input.manualQuote,
      useManualQuote: input.useManualQuote,
    })

    if (currentReceive > 0 && currentReceive >= input.minReceive) return

    const timer = setTimeout(() => {
      const latestReceive = computePayoutReceiveAmount({
        amountEntryMode: input.amountEntryMode,
        enteredAmount: input.enteredAmount,
        sendCurrency: input.sendCurrency,
        receiveCurrency: input.receiveCurrency,
        rateMap: input.rateMap,
        manualQuote: input.manualQuote,
        useManualQuote: input.useManualQuote,
      })
      if (input.minReceive != null && latestReceive > 0 && latestReceive >= input.minReceive) {
        return
      }
      if (input.minReceive != null) {
        applyMin(input.minReceive)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [
    input.enabled,
    input.minReceive,
    input.enteredAmount,
    input.amountEntryMode,
    input.sendCurrency,
    input.receiveCurrency,
    input.rateMap,
    input.manualQuote,
    input.useManualQuote,
    debounceMs,
  ])
}
