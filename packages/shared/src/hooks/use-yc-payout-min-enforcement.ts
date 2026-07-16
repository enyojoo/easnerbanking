"use client"

import { useEffect, useRef } from "react"
import {
  YC_PAYOUT_MIN_ENFORCE_DEBOUNCE_MS,
  computeEnteredAmountForYcPayoutMin,
  ycPayoutReceiveMeetsMin,
} from "../yc-payout-limits"
import { computePayoutReceiveAmount } from "../payout-min-enforcement"

export function useYcPayoutMinEnforcement(input: {
  enabled: boolean
  seedKey: string | null
  minReceive: number | null
  minSendUsd: number
  amountEntryMode: "send" | "receive"
  enteredAmount: number
  sendCurrency: string
  receiveCurrency: string
  customerRate: number | null
  rateMap: Record<string, number>
  onApplyEnteredAmount: (amount: number) => void
  debounceMs?: number
}): void {
  const debounceMs = input.debounceMs ?? YC_PAYOUT_MIN_ENFORCE_DEBOUNCE_MS
  const onApplyRef = useRef(input.onApplyEnteredAmount)
  onApplyRef.current = input.onApplyEnteredAmount

  const applyMin = (minReceive: number) => {
    const rate = input.customerRate
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return
    const next = computeEnteredAmountForYcPayoutMin({
      minReceive,
      amountEntryMode: input.amountEntryMode,
      customerRate: rate,
      receiveCurrency: input.receiveCurrency,
      minSendUsd: input.minSendUsd,
    })
    if (next > 0) onApplyRef.current(next)
  }

  const currentReceive = () =>
    computePayoutReceiveAmount({
      amountEntryMode: input.amountEntryMode,
      enteredAmount: input.enteredAmount,
      sendCurrency: input.sendCurrency,
      receiveCurrency: input.receiveCurrency,
      rateMap: input.rateMap,
    })

  const lastSeedKey = useRef<string | null>(null)

  useEffect(() => {
    const minReceive = input.minReceive
    if (!input.enabled || minReceive == null || !input.seedKey) return
    if (lastSeedKey.current === input.seedKey) return
    lastSeedKey.current = input.seedKey

    if (input.enteredAmount <= 0) {
      applyMin(minReceive)
      return
    }

    if (
      ycPayoutReceiveMeetsMin({
        receiveAmount: currentReceive(),
        minReceive,
        receiveCurrency: input.receiveCurrency,
      })
    ) {
      return
    }

    applyMin(minReceive)
  }, [
    input.enabled,
    input.minReceive,
    input.seedKey,
    input.enteredAmount,
    input.amountEntryMode,
    input.customerRate,
    input.receiveCurrency,
    input.sendCurrency,
    input.rateMap,
    input.minSendUsd,
  ])

  useEffect(() => {
    const minReceive = input.minReceive
    if (!input.enabled || minReceive == null) return
    if (input.enteredAmount <= 0) return

    if (
      ycPayoutReceiveMeetsMin({
        receiveAmount: currentReceive(),
        minReceive,
        receiveCurrency: input.receiveCurrency,
      })
    ) {
      return
    }

    const timer = setTimeout(() => {
      if (
        ycPayoutReceiveMeetsMin({
          receiveAmount: currentReceive(),
          minReceive,
          receiveCurrency: input.receiveCurrency,
        })
      ) {
        return
      }
      applyMin(minReceive)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [
    input.enabled,
    input.minReceive,
    input.enteredAmount,
    input.amountEntryMode,
    input.customerRate,
    input.receiveCurrency,
    input.sendCurrency,
    input.rateMap,
    input.minSendUsd,
    debounceMs,
  ])
}
