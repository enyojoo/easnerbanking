"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchBalanceConvertQuote } from "@/lib/convert-quote-client"
import { isQuoteFresh, type MoveQuoteState } from "@/lib/move-quote-state"

const DEBOUNCE_MS = 400

export function useMoveQuote(input: {
  direction: "usd_to_eur" | "eur_to_usd"
  sourceAmount: number
  enabled: boolean
  accountScopeHeaders?: Record<string, string>
}) {
  const [quote, setQuote] = useState<MoveQuoteState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0)

  const runQuote = useCallback(async () => {
    if (!input.enabled || !Number.isFinite(input.sourceAmount) || input.sourceAmount <= 0) {
      setQuote(null)
      setError(null)
      setLoading(false)
      return null
    }
    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const next = await fetchBalanceConvertQuote({
        direction: input.direction,
        sourceAmount: input.sourceAmount,
        accountScopeHeaders: input.accountScopeHeaders,
      })
      if (requestId !== requestRef.current) return null
      setQuote(next)
      return next
    } catch (e) {
      if (requestId !== requestRef.current) return null
      setQuote(null)
      setError(e instanceof Error ? e.message : "quote_failed")
      return null
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [input.accountScopeHeaders, input.direction, input.enabled, input.sourceAmount])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!input.enabled) {
      setQuote(null)
      setError(null)
      setLoading(false)
      return
    }
    timerRef.current = setTimeout(() => {
      void runQuote()
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [input.enabled, input.direction, input.sourceAmount, runQuote])

  const ensureFreshQuote = useCallback(async () => {
    if (isQuoteFresh(quote)) return quote
    return runQuote()
  }, [quote, runQuote])

  return {
    quote,
    loading,
    error,
    isFresh: isQuoteFresh(quote),
    ensureFreshQuote,
    resetQuote: () => {
      requestRef.current += 1
      setQuote(null)
      setError(null)
      setLoading(false)
    },
  }
}
