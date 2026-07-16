"use client"

import { useEffect, useRef } from "react"
import {
  YC_PAY_IN_MIN_ENFORCE_DEBOUNCE_MS,
  computeCrossBorderSendEnteredAmountForMin,
  computeCrossBorderSendLocalPayIn,
  crossBorderSendLocalPayInMeetsMin,
} from "../yc-pay-in-limits"

export function useYcCrossBorderSendMinEnforcement(input: {
  enabled: boolean
  seedKey: string | null
  minLocalPayIn: number | null
  amountEntryMode: "send" | "receive"
  enteredAmount: number
  customerRate: number | null
  onApplyEnteredAmount: (amount: number) => void
  debounceMs?: number
}): void {
  const debounceMs = input.debounceMs ?? YC_PAY_IN_MIN_ENFORCE_DEBOUNCE_MS
  const onApplyRef = useRef(input.onApplyEnteredAmount)
  onApplyRef.current = input.onApplyEnteredAmount

  const applyMin = (minLocalPayIn: number) => {
    const rate = input.customerRate
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return
    const next = computeCrossBorderSendEnteredAmountForMin({
      minLocalPayIn,
      amountEntryMode: input.amountEntryMode,
      customerRate: rate,
    })
    if (next > 0) {
      onApplyRef.current(next)
    }
  }

  const previewLocalPayIn = (enteredAmount: number) => {
    const rate = input.customerRate
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return 0
    return computeCrossBorderSendLocalPayIn({
      amountEntryMode: input.amountEntryMode,
      enteredAmount,
      customerRate: rate,
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
      crossBorderSendLocalPayInMeetsMin({
        amountEntryMode: input.amountEntryMode,
        enteredAmount: input.enteredAmount,
        customerRate: input.customerRate ?? 0,
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
    input.customerRate,
  ])

  useEffect(() => {
    const minLocalPayIn = input.minLocalPayIn
    if (!input.enabled || minLocalPayIn == null) return
    if (input.enteredAmount <= 0) return

    if (
      crossBorderSendLocalPayInMeetsMin({
        amountEntryMode: input.amountEntryMode,
        enteredAmount: input.enteredAmount,
        customerRate: input.customerRate ?? 0,
        minLocalPayIn,
      })
    ) {
      return
    }

    const timer = setTimeout(() => {
      if (
        crossBorderSendLocalPayInMeetsMin({
          amountEntryMode: input.amountEntryMode,
          enteredAmount: input.enteredAmount,
          customerRate: input.customerRate ?? 0,
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
    input.customerRate,
    debounceMs,
  ])
}
