"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BALANCE_CONVERT_MIN_SOURCE_AMOUNT } from "@easner/shared"
import { fetchBalanceConvertQuote } from "@/lib/convert-quote-client"
import { isQuoteFresh, resolveMoveQuoteRate, type MoveQuoteState } from "@/lib/move-quote-state"

const DEBOUNCE_MS = 400

export function useMoveQuote(input: {
  direction: "usd_to_eur" | "eur_to_usd"
  sourceAmount: number
  enabled: boolean
  seedOnOpen?: boolean
  accountScopeHeaders?: Record<string, string>
}) {
  const [quote, setQuote] = useState<MoveQuoteState | null>(null)
  const [indicativeRate, setIndicativeRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [pendingQuote, setPendingQuote] = useState(false)
  const [seedLoading, setSeedLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0)
  const seedRequestRef = useRef(0)

  const applyIndicativeRate = useCallback((next: MoveQuoteState) => {
    const rate = resolveMoveQuoteRate(next)
    if (rate > 0) setIndicativeRate(rate)
  }, [])

  const runQuote = useCallback(async () => {
    if (!input.enabled || !Number.isFinite(input.sourceAmount) || input.sourceAmount <= 0) {
      setQuote(null)
      setError(null)
      setLoading(false)
      setPendingQuote(false)
      return null
    }
    const requestId = ++requestRef.current
    setLoading(true)
    setPendingQuote(false)
    setError(null)
    try {
      const next = await fetchBalanceConvertQuote({
        direction: input.direction,
        sourceAmount: input.sourceAmount,
        accountScopeHeaders: input.accountScopeHeaders,
      })
      if (requestId !== requestRef.current) return null
      setQuote(next)
      applyIndicativeRate(next)
      return next
    } catch (e) {
      if (requestId !== requestRef.current) return null
      setQuote(null)
      setError(e instanceof Error ? e.message : "quote_failed")
      return null
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [
    applyIndicativeRate,
    input.accountScopeHeaders,
    input.direction,
    input.enabled,
    input.sourceAmount,
  ])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!input.enabled) {
      setQuote(null)
      setIndicativeRate(null)
      setError(null)
      setLoading(false)
      setPendingQuote(false)
      return
    }
    if (input.sourceAmount <= 0) {
      setPendingQuote(false)
      return
    }
    setPendingQuote(true)
    setError(null)
    timerRef.current = setTimeout(() => {
      void runQuote()
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [input.enabled, input.direction, input.sourceAmount, runQuote])

  useEffect(() => {
    if (!input.seedOnOpen) {
      setSeedLoading(false)
      return
    }
    const requestId = ++seedRequestRef.current
    setSeedLoading(true)
    void fetchBalanceConvertQuote({
      direction: input.direction,
      sourceAmount: BALANCE_CONVERT_MIN_SOURCE_AMOUNT,
      accountScopeHeaders: input.accountScopeHeaders,
    })
      .then((next) => {
        if (requestId !== seedRequestRef.current) return
        applyIndicativeRate(next)
      })
      .catch(() => {
        // Amount-step quote errors surface when the user enters an amount.
      })
      .finally(() => {
        if (requestId === seedRequestRef.current) setSeedLoading(false)
      })
    return () => {
      seedRequestRef.current += 1
    }
  }, [
    applyIndicativeRate,
    input.accountScopeHeaders,
    input.direction,
    input.seedOnOpen,
  ])

  const ensureFreshQuote = useCallback(async () => {
    if (isQuoteFresh(quote) && quote && Math.abs(quote.sourceAmount - input.sourceAmount) < 0.005) {
      return quote
    }
    return runQuote()
  }, [input.sourceAmount, quote, runQuote])

  const rateLoading =
    seedLoading ||
    (input.sourceAmount > 0 &&
      !indicativeRate &&
      (pendingQuote || loading))

  return {
    quote,
    indicativeRate,
    loading,
    rateLoading,
    pendingQuote,
    error,
    isFresh: isQuoteFresh(quote),
    ensureFreshQuote,
    resetQuote: () => {
      requestRef.current += 1
      seedRequestRef.current += 1
      setQuote(null)
      setIndicativeRate(null)
      setError(null)
      setLoading(false)
      setPendingQuote(false)
      setSeedLoading(false)
    },
  }
}
