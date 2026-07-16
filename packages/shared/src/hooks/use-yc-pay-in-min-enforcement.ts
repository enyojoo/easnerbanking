"use client"

import { useEffect, useRef } from "react"
import {
  YC_PAY_IN_MIN_ENFORCE_DEBOUNCE_MS,
  computeEnteredAmountForLocalPayInMin,
  computePreviewLocalPayIn,
  localPayInMeetsMin,
} from "../yc-pay-in-limits"

export function useYcPayInMinEnforcement(input: {
  enabled: boolean
  /** When this changes (corridor/rail/mode), min may be applied immediately. */
  seedKey: string | null
  minLocalPayIn: number | null
  amountEntryMode: "usd" | "local"
  enteredAmount: number
  customerSellRate: number | null
  onApplyEnteredAmount: (amount: number) => void
  debounceMs?: number
}): void {
  const debounceMs = input.debounceMs ?? YC_PAY_IN_MIN_ENFORCE_DEBOUNCE_MS
  const onApplyRef = useRef(input.onApplyEnteredAmount)
  onApplyRef.current = input.onApplyEnteredAmount

  const applyMin = (minLocalPayIn: number) => {
    const rate = input.customerSellRate
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return
    const next = computeEnteredAmountForLocalPayInMin({
      minLocalPayIn,
      amountEntryMode: input.amountEntryMode,
      customerSellRate: rate,
    })
    if (next > 0) {
      onApplyRef.current(next)
    }
  }

  const previewLocalPayIn = (enteredAmount: number) => {
    const rate = input.customerSellRate
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return 0
    return computePreviewLocalPayIn({
      amountEntryMode: input.amountEntryMode,
      enteredAmount,
      customerSellRate: rate,
    })
  }

  const lastSeedKey = useRef<string | null>(null)

  useEffect(() => {
    const minLocalPayIn = input.minLocalPayIn
    if (!input.enabled || minLocalPayIn == null || !input.seedKey) return
    if (lastSeedKey.current === input.seedKey) return
    lastSeedKey.current = input.seedKey

    if (input.enteredAmount <= 0) {
      applyMin(minLocalPayIn)
      return
    }

    if (
      localPayInMeetsMin({
        previewLocalPayIn: previewLocalPayIn(input.enteredAmount),
        minLocalPayIn,
      })
    ) {
      return
    }

    applyMin(minLocalPayIn)
  }, [
    input.enabled,
    input.minLocalPayIn,
    input.seedKey,
    input.enteredAmount,
    input.amountEntryMode,
    input.customerSellRate,
  ])

  useEffect(() => {
    const minLocalPayIn = input.minLocalPayIn
    if (!input.enabled || minLocalPayIn == null) return
    if (input.enteredAmount <= 0) return

    if (
      localPayInMeetsMin({
        previewLocalPayIn: previewLocalPayIn(input.enteredAmount),
        minLocalPayIn,
      })
    ) {
      return
    }

    const timer = setTimeout(() => {
      if (
        localPayInMeetsMin({
          previewLocalPayIn: previewLocalPayIn(input.enteredAmount),
          minLocalPayIn,
        })
      ) {
        return
      }
      applyMin(minLocalPayIn)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [
    input.enabled,
    input.minLocalPayIn,
    input.enteredAmount,
    input.amountEntryMode,
    input.customerSellRate,
    debounceMs,
  ])
}
