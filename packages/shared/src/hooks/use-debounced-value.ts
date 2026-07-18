"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Pause after typing before background server quote prefetch (Wise/Revolut-style). */
export const QUOTE_PREFETCH_DEBOUNCE_MS = 450

export type DebouncedValueControls = {
  /** Apply the latest value immediately (e.g. on Continue). */
  flush: () => void
  /** Drop a pending debounced update. */
  cancel: () => void
}

export function useDebouncedValue<T>(
  value: T,
  delayMs = QUOTE_PREFETCH_DEBOUNCE_MS,
): [T, DebouncedValueControls] {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const flush = useCallback(() => {
    cancel()
    setDebounced(valueRef.current)
  }, [cancel])

  useEffect(() => {
    cancel()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setDebounced(value)
    }, delayMs)
    return cancel
  }, [value, delayMs, cancel])

  return [debounced, { flush, cancel }]
}
